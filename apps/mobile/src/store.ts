// État global minimal : un objet, des abonnés, un hook. Pas besoin de lib.
import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { Channel, ChatMessage, GameView, Lobby } from '@kr/shared';
import type { PaletteId } from './theme';

export interface User { id: string; name: string; username: string }
export interface Settings {
  appearance: 'system' | 'light' | 'dark';
  palette: PaletteId;
  /** Couleur selon le mode : en salon ou en partie, la palette suit le mode joué. */
  dynamicColors: { enabled: boolean; classic: PaletteId; zombie: PaletteId };
  units: 'km' | 'mi';
  /** Vide = serveur compilé dans l'app. Rempli seulement si le joueur saisit sa propre adresse. */
  serverUrl: string;
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
    appearance: 'system', palette: 'foret', dynamicColors: { enabled: false, classic: 'braise', zombie: 'foret' },
    units: 'km', serverUrl: '', tutorialSeen: false,
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
      const settings = { ...state.settings, ...saved.settings };
      if (/^http:\/\/(localhost|10\.0\.2\.2):3000$/.test(settings.serverUrl)) settings.serverUrl = '';
      state = { ...state, token: saved.token, user: saved.user, settings };
    }
  } finally {
    setState({ ready: true });
  }
}
