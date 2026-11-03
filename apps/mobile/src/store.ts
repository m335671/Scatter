// État global minimal : un objet, des abonnés, un hook. Pas besoin de lib.
import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { Channel, ChatMessage, GameView, Lobby } from '@kr/shared';
import type { PaletteId } from './theme';

export interface User { id: string; name: string; username: string }
export interface Settings {
  appearance: 'system' | 'light' | 'dark';
  palette: PaletteId;
  /** Couleur en partie : la palette suit le mode joué (salon compris) ou le rôle (une fois tiré). */
  dynamicColors: { enabled: boolean; by: 'mode' | 'role'; classic: PaletteId; zombie: PaletteId; hunter: PaletteId; fugitive: PaletteId };
  /** Couleur des notifications (celle de la partie en cours comprise). */
  notifPalette: PaletteId;
  units: 'km' | 'mi';
  /** Tutoriel vu au moins une fois (affiché automatiquement après l'installation). */
  tutorialSeen: boolean;
}

export interface DialogAction { label: string; kind?: 'primary' | 'danger' | 'cancel'; onPress?: () => void }
export interface Dialog { title: string; message?: string; actions?: DialogAction[] }

export interface State {
  ready: boolean;
  token: string | null;
  user: User | null;
  settings: Settings;
  connected: boolean;
  lobby: Lobby | null;
  game: GameView | null;
  chat: ChatMessage[];
  unread: Record<Channel, number>;
  dialog: Dialog | null;
  /** Écran des permissions déjà montré depuis le lancement de l'app. */
  permsChecked: boolean;
}

// Défini au build (EXPO_PUBLIC_SERVER_URL). En dev : `adb reverse tcp:3000 tcp:3000` relie le téléphone au PC.
export const DEFAULT_SERVER = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://localhost:3000';

let state: State = {
  ready: false, token: null, user: null, connected: false, lobby: null, game: null, chat: [], unread: { team: 0, all: 0 }, dialog: null, permsChecked: false,
  settings: {
    appearance: 'system', palette: 'foret', dynamicColors: { enabled: false, by: 'mode', classic: 'braise', zombie: 'foret', hunter: 'braise', fugitive: 'ocean' }, notifPalette: 'foret',
    units: 'km', tutorialSeen: false,
  },
};
const listeners = new Set<() => void>();

export const getState = () => state;

export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  listeners.forEach(l => l());
  if ('token' in p || 'user' in p || 'settings' in p) persist();
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => selector(state),
  );
}

const KEY = 'keeprunnin';

function persist() {
  const { token, user, settings } = state;
  SecureStore.setItemAsync(KEY, JSON.stringify({ token, user, settings })).catch(() => {});
}

export async function loadPersisted() {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // Réglages imbriqués fusionnés aussi : une ancienne sauvegarde n'a pas les champs ajoutés depuis.
      const settings = { ...state.settings, ...saved.settings, dynamicColors: { ...state.settings.dynamicColors, ...saved.settings?.dynamicColors } };
      state = { ...state, token: saved.token, user: saved.user, settings };
    }
  } finally {
    setState({ ready: true });
  }
}
