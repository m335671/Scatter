// Moteur de jeu : logique pure sur l'horloge de jeu, aucun réseau ici.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  type Channel, type ChatMessage, type GameView, type LatLng, type Lobby, type Phase, type Role, type RoleChoice,
  type Rules, type SeenPlayer, distanceM, MIN, nextShrinkAt, PING_DELAY_MS, zoneRadius,
} from '@kr/shared';

const HISTORY_MS = 3 * MIN;
const MAX_PLAYERS = 20;
const CHAT_KEEP = 200;

interface Sample { t: number; lat: number; lng: number; acc?: number }

export interface Player {
  id: string;
  name: string;
  username: string;
  choice: RoleChoice;
  role: Role | null;
  isBot: boolean;
  caughtAt: number | null;
  secret: string;
  history: Sample[];
  target?: LatLng; // bots
}

export interface Game {
  code: string;
  hostId: string;
  rules: Rules;
  training: boolean;
  speed: number;
  phase: Phase;
  clock: number;
  nextPingAt: number | null;
  lastPing: { at: number; forHunters: SeenPlayer[]; forFugitives: SeenPlayer[] } | null;
  winner: Role | null;
  players: Map<string, Player>;
  chat: Record<Role | 'all', ChatMessage[]>;
  /** Messages créés depuis le dernier drain, à diffuser par le serveur. */
  outbox: { team: Role | 'all'; msg: ChatMessage }[];
  seq: number;
}

export interface UserRef { id: string; name: string; username: string }

export class GameError extends Error {}

export function createGame(code: string, host: UserRef, rules: Rules, training = false): Game {
  const g: Game = {
    code, hostId: host.id, rules, training, speed: 1, phase: 'lobby', clock: 0,
    nextPingAt: null, lastPing: null, winner: null, players: new Map(),
    chat: { hunter: [], fugitive: [], all: [] }, outbox: [], seq: 0,
  };
  join(g, host);
  return g;
}

export function join(g: Game, u: UserRef, opts: { isBot?: boolean; choice?: RoleChoice } = {}): Player {
  const existing = g.players.get(u.id);
  if (existing) return existing;
  if (g.phase !== 'lobby') throw new GameError('La partie a déjà commencé.');
  if (g.players.size >= MAX_PLAYERS) throw new GameError('Le salon est plein.');
  const p: Player = {
    ...u, choice: opts.choice ?? 'random', role: null, isBot: !!opts.isBot,
    caughtAt: null, secret: '', history: [],
  };
  g.players.set(u.id, p);
  return p;
}

export function leave(g: Game, id: string) {
  // Pendant une manche, on garde le joueur (ses positions servent encore aux autres). Avant ou après, il part vraiment.
  if (g.phase === 'lobby' || g.phase === 'ended') g.players.delete(id);
  if (g.hostId === id) g.hostId = [...g.players.values()].find(p => !p.isBot)?.id ?? '';
}

export const huntStart = (g: Game) => g.rules.headStartMin * MIN;
export const huntEnd = (g: Game) => huntStart(g) + g.rules.durationMin * MIN;

export function start(g: Game, rng = Math.random) {
  if (g.phase !== 'lobby') throw new GameError('Déjà lancée.');
  const ps = [...g.players.values()];
  const randoms = ps.filter(p => p.choice === 'random').sort(() => rng() - 0.5);
  for (const p of ps) if (p.choice !== 'random') p.role = p.choice;
  const wantedHunters = Math.max(1, Math.round(ps.length / 3));
  for (const p of randoms) {
    const hunters = ps.filter(q => q.role === 'hunter').length;
    const fugitives = ps.filter(q => q.role === 'fugitive').length;
    // Priorité : au moins un de chaque, puis ~1/3 de chasseurs.
    p.role = fugitives === 0 && hunters > 0 ? 'fugitive' : hunters < wantedHunters ? 'hunter' : 'fugitive';
  }
  if (!ps.some(p => p.role === 'hunter') || !ps.some(p => p.role === 'fugitive')) {
    for (const p of ps) p.role = null;
    throw new GameError('Il faut au moins un chasseur et un fugitif.');
  }
  for (const p of ps) p.secret = randomBytes(12).toString('hex');
  g.phase = g.rules.headStartMin > 0 ? 'headstart' : 'hunt';
  g.clock = 0;
  g.nextPingAt = huntStart(g);
  system(g, 'fugitive', `Tu as ${g.rules.headStartMin} min d'avance. Cache-toi !`);
  system(g, 'hunter', `Les fugitifs ont ${g.rules.headStartMin} min d'avance. Patience.`);
  system(g, 'all', 'La partie commence. Bonne chance à tous !');
}

// ---------- Positions ----------

export function updatePosition(g: Game, id: string, pos: LatLng & { acc?: number }) {
  const p = g.players.get(id);
  if (!p) return;
  p.history.push({ t: g.clock, lat: pos.lat, lng: pos.lng, acc: pos.acc });
  // On garde le dernier échantillon antérieur à la fenêtre pour pouvoir répondre à positionAt(clock - 3 min).
  const cutoff = g.clock - HISTORY_MS;
  let i = 0;
  while (i + 1 < p.history.length && p.history[i + 1].t <= cutoff) i++;
  if (i) p.history.splice(0, i);
}

/** Dernière position connue à l'instant t (ou la plus ancienne si on n'a rien d'avant). */
export function positionAt(p: Player, t: number): Sample | null {
  if (!p.history.length) return null;
  let best = p.history[0];
  for (const s of p.history) if (s.t <= t) best = s; else break;
  return best;
}

const current = (p: Player) => p.history.at(-1) ?? null;

export function isOutOfZone(g: Game, p: Player): boolean {
  const pos = current(p);
  if (!g.rules.zone.enabled || !pos) return false;
  return distanceM(pos, g.rules.zone.center) > zoneRadius(g.rules, g.clock);
}

const seen = (p: Player, s: Sample, exposed?: boolean): SeenPlayer => ({
  id: p.id, name: p.name, role: p.role!, lat: s.lat, lng: s.lng, t: s.t, caught: p.caughtAt !== null,
  ...(s.acc !== undefined ? { acc: Math.round(s.acc) } : {}),
  ...(exposed ? { exposed } : {}),
});

// ---------- Horloge ----------

export function tick(g: Game, realDtMs: number) {
  if (g.phase === 'lobby' || g.phase === 'ended') return;
  g.clock += realDtMs * g.speed;
  if (g.phase === 'headstart' && g.clock >= huntStart(g)) {
    g.phase = 'hunt';
    system(g, 'fugitive', 'Les chasseurs sont lâchés !');
    system(g, 'hunter', "C'est parti, à la chasse !");
  }
  if (g.nextPingAt !== null && g.clock >= g.nextPingAt) ping(g);
  if (g.clock >= huntEnd(g)) end(g, 'fugitive');
}

export function ping(g: Game) {
  const ps = [...g.players.values()];
  const forHunters: SeenPlayer[] = [];
  for (const p of ps) {
    if (p.role !== 'fugitive' || p.caughtAt !== null) continue;
    const out = isOutOfZone(g, p);
    const s = out ? current(p) : positionAt(p, g.clock - PING_DELAY_MS);
    if (s) forHunters.push(seen(p, s, out));
  }
  const forFugitives = ps.flatMap(p => {
    const s = p.role === 'hunter' ? current(p) : null;
    return s ? [seen(p, s)] : [];
  });
  g.lastPing = { at: g.clock, forHunters, forFugitives };
  const every = g.rules.pingEveryMin * MIN;
  // Si l'horloge a sauté plusieurs pings (avance rapide), un seul ping puis on recale.
  const k = Math.floor((g.clock - huntStart(g)) / every) + 1;
  g.nextPingAt = Math.max(huntStart(g), huntStart(g) + k * every);
  const n = forHunters.length;
  system(g, 'hunter', n ? `Ping ! ${n} fugitif${n > 1 ? 's viennent' : ' vient'} d'apparaître sur la carte.` : 'Ping ! Aucun fugitif repéré pour l\'instant.');
  system(g, 'fugitive', 'Ping ! Les chasseurs savent où tu étais il y a 1 min.');
}

function end(g: Game, winner: Role) {
  if (g.phase === 'ended') return;
  g.phase = 'ended';
  g.winner = winner;
  g.nextPingAt = null;
  const msg = winner === 'hunter' ? 'Tous les fugitifs sont attrapés. Les chasseurs gagnent !' : 'Temps écoulé. Les fugitifs gagnent !';
  system(g, 'hunter', msg);
  system(g, 'fugitive', msg);
  system(g, 'all', msg);
}

export function endNow(g: Game) {
  if (g.phase === 'lobby') return;
  end(g, aliveFugitives(g).length ? 'fugitive' : 'hunter');
}

// ---------- Capture ----------

export const qrFor = (g: Game, p: Player) => `KR1:${g.code}:${p.id}:${p.secret}`;

export function capture(g: Game, hunterId: string, qr: string) {
  const hunter = g.players.get(hunterId);
  if (hunter?.role !== 'hunter') throw new GameError("Seuls les chasseurs peuvent attraper.");
  if (g.phase !== 'hunt') throw new GameError("Pas encore, les fugitifs ont de l'avance.");
  const [tag, code, id, secret] = qr.split(':');
  const target = g.players.get(id ?? '');
  const ok = tag === 'KR1' && code === g.code && target?.role === 'fugitive' && !!secret
    && secret.length === target.secret.length
    && timingSafeEqual(Buffer.from(secret), Buffer.from(target.secret));
  if (!ok || !target) throw new GameError('QR code invalide.');
  if (target.caughtAt !== null) throw new GameError(`${target.name} est déjà attrapé.`);
  catchFugitive(g, hunter, target);
}

export function catchFugitive(g: Game, hunter: Player, target: Player) {
  target.caughtAt = g.clock;
  const left = aliveFugitives(g).length;
  system(g, 'hunter', `${hunter.name} a attrapé ${target.name}. Il en reste ${left}.`);
  system(g, 'fugitive', `${target.name} s'est fait attraper. Il en reste ${left}.`);
  system(g, 'all', `${target.name} est attrapé. Il reste ${left} fugitif${left > 1 ? 's' : ''}.`);
  if (left === 0) end(g, 'hunter');
}

export const aliveFugitives = (g: Game) =>
  [...g.players.values()].filter(p => p.role === 'fugitive' && p.caughtAt === null);

// ---------- Radio ----------

function push(g: Game, team: Role | 'all', msg: Omit<ChatMessage, 'channel'>) {
  const list = g.chat[team];
  const full: ChatMessage = { ...msg, channel: team === 'all' ? 'all' : 'team' };
  list.push(full);
  if (list.length > CHAT_KEEP) list.shift();
  g.outbox.push({ team, msg: full });
}

function system(g: Game, team: Role | 'all', text: string) {
  push(g, team, { id: `${g.code}-${++g.seq}`, at: g.clock, from: null, fromName: null, text, system: true });
}

/** La règle « les chasseurs peuvent parler » ne coupe que leur radio d'équipe : la radio globale reste ouverte à tous. */
export function say(g: Game, id: string, text: string, channel: Channel = 'team') {
  const p = g.players.get(id);
  if (!p?.role) throw new GameError("Tu n'es pas dans une équipe.");
  if (channel === 'team' && p.role === 'hunter' && !g.rules.huntersCanTalk) throw new GameError('Les chasseurs ne peuvent pas parler dans cette partie.');
  push(g, channel === 'all' ? 'all' : p.role, { id: `${g.code}-${++g.seq}`, at: g.clock, from: p.id, fromName: p.name, text, system: false });
}

// ---------- Vues ----------

export function lobbyView(g: Game): Lobby {
  return {
    code: g.code, rules: g.rules, training: g.training,
    players: [...g.players.values()].map(p => ({
      id: p.id, name: p.name, username: p.username, choice: p.choice, isBot: p.isBot, host: p.id === g.hostId,
    })),
  };
}

export function view(g: Game, id: string): GameView | null {
  const me = g.players.get(id);
  if (!me?.role) return null;
  const ps = [...g.players.values()];
  const team = ps.flatMap(p => {
    const s = p.role === me.role ? current(p) : null;
    return s ? [seen(p, s)] : [];
  });
  // Fin de partie : tout le monde, position actuelle. Attrapé : l'équipe adverse, avec le retard réglé.
  const spectating = g.phase === 'ended'
    ? ps.flatMap(p => {
      const s = p.id !== me.id && p.role !== me.role ? current(p) : null;
      return s ? [seen(p, s)] : [];
    })
    : me.caughtAt !== null
      ? ps.flatMap(p => {
        const s = p.role !== me.role ? positionAt(p, g.clock - g.rules.spectatorDelayMin * MIN) : null;
        return s ? [seen(p, s)] : [];
      })
      : [];
  const fugitives = ps.filter(p => p.role === 'fugitive');
  // Règle dure : un fugitif hors zone est visible en direct par les chasseurs tant qu'il y reste.
  const outOfZone = me.role === 'hunter' && g.phase === 'hunt'
    ? fugitives.flatMap(p => { const s = p.caughtAt === null && isOutOfZone(g, p) ? current(p) : null; return s ? [seen(p, s, true)] : []; })
    : [];
  return {
    code: g.code, phase: g.phase, training: g.training, speed: g.speed, clock: g.clock,
    huntStart: huntStart(g), huntEnd: huntEnd(g), nextPingAt: g.nextPingAt,
    zone: {
      enabled: g.rules.zone.enabled, center: g.rules.zone.center,
      radiusM: zoneRadius(g.rules, g.clock), nextShrinkAt: nextShrinkAt(g.rules, g.clock),
    },
    me: {
      id: me.id, role: me.role, caught: me.caughtAt !== null, outOfZone: me.role === 'fugitive' && isOutOfZone(g, me),
      qr: me.role === 'fugitive' && me.caughtAt === null ? qrFor(g, me) : null,
    },
    fugitivesLeft: fugitives.filter(p => p.caughtAt === null).length,
    fugitivesTotal: fugitives.length,
    team,
    // Un joueur attrapé depuis le ping disparaît de la carte adverse.
    ping: g.lastPing && {
      at: g.lastPing.at,
      players: (me.role === 'hunter' ? g.lastPing.forHunters : g.lastPing.forFugitives).filter(p => g.players.get(p.id)?.caughtAt === null),
    },
    spectating,
    outOfZone,
    winner: g.winner,
  };
}
