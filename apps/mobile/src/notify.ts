// Notifications locales, sans serveur de push : la radio et l'état de la partie quand l'app est en arrière-plan.
// Le suivi GPS garde l'app vivante pendant une partie, la connexion au serveur reste ouverte.
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { ChatMessage, GameView } from '@kr/shared';
import { fmtClock } from './ui';
import { getState } from './store';
import { notifColor } from './theme';

const CHANNEL = 'game';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Partie en cours', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 150, 250],
  }).catch(() => {});
}

/** `id` : une notification du même id remplace la précédente (zone) au lieu de s'empiler. */
function notify(title: string, body: string, id?: string) {
  if (AppState.currentState === 'active') return; // à l'écran, le HUD et la radio suffisent
  Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title, body, color: notifColor(getState().settings.notifPalette) },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
  }).catch(() => {});
}

export function notifyChat(m: ChatMessage, myId: string | undefined) {
  if (m.from === myId) return;
  notify(m.system ? 'Scatter' : `${m.fromName}${m.channel === 'all' ? ' · radio globale' : ''}`, m.text);
}

let lastEdgeAt = 0;

/** Alertes de zone du joueur : sortie (compte à rebours), rétrécissement qui va le laisser dehors, bord proche. */
export function notifyState(prev: GameView | null, next: GameView) {
  if (prev?.code !== next.code) return;
  const { me } = next;
  if (me.eliminateAt !== null) {
    const left = me.eliminateAt - next.clock;
    const before = prev.me.eliminateAt === null ? Infinity : prev.me.eliminateAt - prev.clock;
    if (before === Infinity) notify('Tu es hors zone !', `Reviens dans la zone : tu seras éliminé dans ${fmtClock(left)}. Les chasseurs te voient en direct.`, 'zone');
    else if (before > 30_000 && left <= 30_000) notify('Plus que 30 s hors zone', 'Reviens tout de suite dans la zone, sinon tu es éliminé.', 'zone');
    return;
  }
  const kind = me.zoneAlert?.kind;
  if (!kind || kind === prev.me.zoneAlert?.kind) return;
  if (kind === 'shrink' && next.zone.nextShrinkAt !== null) {
    notify('La zone va rétrécir', `Dans ${fmtClock(next.zone.nextShrinkAt - next.clock)}, tu seras dehors. Rapproche-toi du centre d'au moins ${me.zoneAlert!.m} m.`, 'zone');
  } else if (kind === 'edge' && Date.now() - lastEdgeAt > 60_000) {
    lastEdgeAt = Date.now(); // un joueur qui longe le bord ne reçoit pas une notification toutes les 5 s
    notify('Bord de la zone', `Plus que ${me.zoneAlert!.m} m avant d'en sortir.`, 'zone');
  }
}
