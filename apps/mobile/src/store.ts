// État global minimal : un objet, des abonnés, un hook. Pas besoin de lib.
import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import type { ChatMessage, GameView, Lobby } from '@kr/shared';

export interface User { id: string; name: string; username: string }
export interface Settings {
  appearance: 'system' | 'light' | 'dark';
  units: 'km' | 'mi';
  serverUrl: string;
  blocked: { id: string; name: string }[];
}

export interface State {
  ready: boolean;
  token: string | null;
  user: User | null;
  settings: Settings;
  connected: boolean;
  lobby: Lobby | null;
  game: GameView | null;
  chat: ChatMessage[];
  unread: number;
}

const DEFAULT_SERVER = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://10.0.2.2:3000'; // 10.0.2.2 = PC hôte vu depuis l'émulateur Android

let state: State = {
  ready: false, token: null, user: null, connected: false, lobby: null, game: null, chat: [], unread: 0,
  settings: { appearance: 'system', units: 'km', serverUrl: DEFAULT_SERVER, blocked: [] },
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
      state = { ...state, token: saved.token, user: saved.user, settings: { ...state.settings, ...saved.settings } };
    }
  } finally {
    setState({ ready: true });
  }
}
