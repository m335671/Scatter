import { io, type Socket } from 'socket.io-client';
import type { ChatMessage, GameView, Lobby } from '@kr/shared';
import { DEFAULT_SERVER, getState, loadPersisted, setState, type User } from './store';
import { trackPosition } from './stats';

const base = () => (getState().settings.serverUrl || DEFAULT_SERVER).replace(/\/$/, '');

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getState().token;
  const res = await fetch(base() + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
  return data as T;
}

export const usernameAvailable = (u: string) =>
  http<{ available: boolean }>(`/username/${encodeURIComponent(u)}`).then(r => r.available);

export async function register(name: string, username: string) {
  const r = await http<{ user: User; token: string }>('/auth/register', { method: 'POST', body: JSON.stringify({ name, username }) });
  setState({ token: r.token, user: r.user });
  connect();
}

export async function updateMe(patch: { name?: string; username?: string }) {
  const user = await http<User>('/me', { method: 'PATCH', body: JSON.stringify(patch) });
  setState({ user });
}

// ---------- Temps réel ----------

let socket: Socket | null = null;

export function connect() {
  socket?.close();
  const { token } = getState();
  if (!token) return;
  socket = io(base(), { auth: { token }, transports: ['websocket'] });
  // Le serveur renvoie la partie en cours juste après la connexion : on repart de son état, pas d'un état périmé.
  socket.on('connect', () => setState({ connected: true, lobby: null, game: null, chat: [], unread: { team: 0, all: 0 } }));
  socket.on('disconnect', () => setState({ connected: false }));
  socket.on('connect_error', (e) => {
    if (e.message === 'unauthorized') { socket?.close(); setState({ token: null, user: null }); }
  });
  socket.on('lobby', (lobby: Lobby) => setState(s =>
    s.game && s.game.code !== lobby.code ? { lobby, game: null, chat: [], unread: { team: 0, all: 0 } } : { lobby }));
  // Seule la partie du salon actuel compte : un état d'une partie quittée (serveur pas à jour, message en retard) est ignoré.
  socket.on('state', (game: GameView) => setState(s => (s.lobby?.code === game.code ? { game } : {})));
  socket.on('chat:history', (chat: ChatMessage[]) => setState({ chat }));
  socket.on('chat', (m: ChatMessage) => setState(s => ({ chat: [...s.chat, m].slice(-400), unread: { ...s.unread, [m.channel ?? 'team']: s.unread[m.channel ?? 'team'] + 1 } })));
}

/** Émet un événement et attend l'accusé du serveur. Lève une Error avec le message serveur. */
export function emit<T = object>(ev: string, data: unknown = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('Pas de connexion au serveur.'));
    socket.timeout(8000).emit(ev, data, (err: Error | null, r: { error?: string } & T) => {
      if (err) return reject(new Error('Le serveur ne répond pas.'));
      if (r.error) return reject(new Error(r.error));
      resolve(r);
    });
  });
}

/** Tâche GPS relancée sans interface : recharge le jeton et rouvre la connexion. */
export async function ensureConnected() {
  if (socket) return;
  await loadPersisted();
  connect();
}

/** Envoi sans accusé, utilisé par la tâche GPS. `volatile` : hors connexion, la position est jetée au lieu d'être
 *  mise en file, sinon le serveur recevrait d'un coup des positions périmées horodatées à la reconnexion. */
export function sendPosition(lat: number, lng: number, acc?: number) {
  socket?.volatile.emit('pos', { lat, lng, acc });
  const g = getState().game;
  if (g && (g.phase === 'headstart' || g.phase === 'hunt')) trackPosition(g.code, { lat, lng }, acc);
}

export async function leaveGame() {
  await emit('leave').catch(() => {});
  setState({ lobby: null, game: null, chat: [], unread: { team: 0, all: 0 } });
}
