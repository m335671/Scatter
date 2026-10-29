// Moteur de jeu : logique pure sur l'horloge de jeu, aucun réseau ici.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  type Channel, type ChatMessage, type GameView, type LatLng, type Lobby, type Phase, type Role, type RoleChoice,
  type Rules, type SeenPlayer, distanceM, EDGE_WARN_M, MIN, nextShrinkAt, OUT_OF_ZONE_LIMIT_MS, PING_DELAY_MS,
  SHRINK_WARN_MS, zoneRadius,
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
  /** A quitté la partie en cours de manche. */
  left?: boolean;
  captures?: number;
  /** Heure de jeu de la sortie de zone en cours (fugitif), null s'il est dedans. */
  outSince?: number | null;
  outAnnouncedAt?: number;
  /** Éliminé pour être resté hors zone (et non attrapé). */
  eliminated?: boolean;
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
  fugitivesTotal: number;
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
    nextPingAt: null, lastPing: null, winner: null, fugitivesTotal: 0, players: new Map(),
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
  const p = g.players.get(id);
  if (!p) return;
  if (g.phase === 'lobby' || g.phase === 'ended') g.players.delete(id);
  else if (!p.left) {
    // En pleine manche : annoncé à tous ; un fugitif qui part compte comme sorti du jeu.
    p.left = true;
    const msg = `${p.name} a quitté la partie.`;
    system(g, 'hunter', msg);
    system(g, 'fugitive', msg);
    system(g, 'all', msg);
    if (p.role === 'fugitive' && p.caughtAt === null) p.caughtAt = g.clock;
    if (!aliveFugitives(g).length) end(g, 'hunter');
    else if (![...g.players.values()].some(q => q.role === 'hunter' && !q.left)) end(g, 'fugitive');
  }
  if (g.hostId === id) g.hostId = [...g.players.values()].find(q => !q.isBot && !q.left)?.id ?? '';
}

export const huntStart = (g: Game) => g.rules.headStartMin * MIN;
export const huntEnd = (g: Game) => huntStart(g) + g.rules.durationMin * MIN;

export function start(g: Game, rng = Math.random) {
  if (g.phase !== 'lobby') throw new GameError('Déjà lancée.');
  const ps = [...g.players.values()];
  if (isZombie(g)) {
    // Un seul chasseur, tiré parmi les volontaires (choix « Chasseur »), sinon parmi tous.
    const pool = ps.filter(p => p.choice === 'hunter');
    const from = pool.length ? pool : ps;
    const first = from[Math.floor(rng() * from.length)];
    for (const p of ps) p.role = p === first ? 'hunter' : 'fugitive';
  } else {
    const randoms = ps.filter(p => p.choice === 'random').sort(() => rng() - 0.5);
    for (const p of ps) if (p.choice !== 'random') p.role = p.choice;
    const wantedHunters = Math.max(1, Math.round(ps.length / 3));
    for (const p of randoms) {
      const hunters = ps.filter(q => q.role === 'hunter').length;
      const fugitives = ps.filter(q => q.role === 'fugitive').length;
      // Priorité : au moins un de chaque, puis ~1/3 de chasseurs.
      p.role = fugitives === 0 && hunters > 0 ? 'fugitive' : hunters < wantedHunters ? 'hunter' : 'fugitive';
    }
  }
  if (!ps.some(p => p.role === 'hunter') || !ps.some(p => p.role === 'fugitive')) {
    for (const p of ps) p.role = null;
    throw new GameError('Il faut au moins un chasseur et un fugitif.');
  }
  for (const p of ps) p.secret = randomBytes(12).toString('hex');
  g.fugitivesTotal = ps.filter(p => p.role === 'fugitive').length;
  g.phase = g.rules.headStartMin > 0 ? 'headstart' : 'hunt';
  g.clock = 0;
  g.nextPingAt = huntStart(g);
  system(g, 'fugitive', `Tu as ${g.rules.headStartMin} min d'avance. Cache-toi !`);
  system(g, 'hunter', `Les fugitifs ont ${g.rules.headStartMin} min d'avance. Patience.`);
  system(g, 'all', isZombie(g)
    ? `Mode zombie : ${ps.find(p => p.role === 'hunter')!.name} est le seul chasseur. Chaque fugitif attrapé le rejoint.`
    : 'La partie commence. Bonne chance à tous !');
}

/** Pas de zombie en entraînement : les bots ne savent pas jouer un fugitif converti. */
export const isZombie = (g: Game) => g.rules.mode === 'zombie' && !g.training;

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
const ZONE_TOLERANCE_M = 40;

/** Distance au centre, précision GPS (plafonnée) déduite : bénéfice du doute, un fugitif au bord n'est pas exposé à tort. */
function zoneDistance(g: Game, p: Player): number | null {
  const pos = current(p);
  if (!g.rules.zone.enabled || !pos) return null;
  return distanceM(pos, g.rules.zone.center) - Math.min(pos.acc ?? 0, ZONE_TOLERANCE_M);
}

export function isOutOfZone(g: Game, p: Player): boolean {
  const d = zoneDistance(g, p);
  return d !== null && d > zoneRadius(g.rules, g.clock);
}

/** Fugitif encore dedans mais bientôt dehors : bord à moins de 30 m, ou dehors au rétrécissement de la minute qui vient. */
function zoneAlert(g: Game, p: Player): GameView['me']['zoneAlert'] {
  const d = zoneDistance(g, p);
  if (d === null || p.role !== 'fugitive' || p.caughtAt !== null) return null;
  const r = zoneRadius(g.rules, g.clock);
  if (d > r) return null;
  const next = nextShrinkAt(g.rules, g.clock);
  if (next !== null && next - g.clock <= SHRINK_WARN_MS) {
    const r2 = zoneRadius(g.rules, next);
    if (d > r2) return { kind: 'shrink', m: Math.ceil(d - r2) };
  }
  return r - d < EDGE_WARN_M ? { kind: 'edge', m: Math.max(0, Math.floor(r - d)) } : null;
}

/** Règle dure : un fugitif hors zone plus d'1 min est éliminé. Les chasseurs sont prévenus de chaque sortie. */
function checkZone(g: Game) {
  for (const p of aliveFugitives(g)) {
    if (!isOutOfZone(g, p)) { p.outSince = null; continue; }
    if (p.outSince == null) {
      p.outSince = g.clock;
      // Une annonce par minute au plus : un fugitif pile sur le bord ferait clignoter la radio.
      if (g.phase === 'hunt' && g.clock - (p.outAnnouncedAt ?? -Infinity) >= OUT_OF_ZONE_LIMIT_MS) {
        p.outAnnouncedAt = g.clock;
        system(g, 'hunter', `${p.name} est sorti de la zone : visible en direct sur ta carte.`);
      }
    } else if (g.clock - p.outSince >= OUT_OF_ZONE_LIMIT_MS) {
      p.caughtAt = g.clock;
      p.eliminated = true;
      p.outSince = null;
      const left = aliveFugitives(g).length;
      const msg = `${p.name} est éliminé : resté plus d'1 min hors zone. Il reste ${left} fugitif${left > 1 ? 's' : ''}.`;
      system(g, 'hunter', msg);
      system(g, 'fugitive', msg);
      system(g, 'all', msg);
      if (left === 0) end(g, 'hunter');
    }
  }
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
  checkZone(g);
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
  const msg = winner === 'hunter' ? 'Tous les fugitifs sont attrapés. Les chasseurs gagnent !'
    : g.clock < huntEnd(g) ? 'Manche terminée. Les fugitifs gagnent !' : 'Temps écoulé. Les fugitifs gagnent !';
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
  return target;
}

export function catchFugitive(g: Game, hunter: Player, target: Player) {
  hunter.captures = (hunter.captures ?? 0) + 1;
  const zombie = isZombie(g);
  // Zombie : le fugitif attrapé change d'équipe au lieu de passer spectateur.
  if (zombie) { target.role = 'hunter'; target.outSince = null; } else target.caughtAt = g.clock;
  const left = aliveFugitives(g).length;
  const s = left > 1 ? 's' : '';
  if (zombie) {
    system(g, 'hunter', `${hunter.name} a contaminé ${target.name}, qui rejoint les chasseurs. Il reste ${left} fugitif${s}.`);
    system(g, 'fugitive', `${target.name} a été contaminé : c'est un chasseur maintenant. Il en reste ${left}.`);
    system(g, 'all', `${target.name} rejoint les chasseurs. Il reste ${left} fugitif${s}.`);
  } else {
    system(g, 'hunter', `${hunter.name} a attrapé ${target.name}. Il en reste ${left}.`);
    system(g, 'fugitive', `${target.name} s'est fait attraper. Il en reste ${left}.`);
    system(g, 'all', `${target.name} est attrapé. Il reste ${left} fugitif${s}.`);
  }
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
    const s = p.role === me.role && !p.left ? current(p) : null;
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
    code: g.code, phase: g.phase, mode: isZombie(g) ? 'zombie' : 'classic', training: g.training, speed: g.speed, clock: g.clock,
    huntStart: huntStart(g), huntEnd: huntEnd(g), nextPingAt: g.nextPingAt,
    zone: {
      enabled: g.rules.zone.enabled, center: g.rules.zone.center,
      radiusM: zoneRadius(g.rules, g.clock), nextShrinkAt: nextShrinkAt(g.rules, g.clock),
    },
    me: {
      id: me.id, role: me.role, caught: me.caughtAt !== null, caughtAt: me.caughtAt, eliminated: !!me.eliminated, captures: me.captures ?? 0,
      outOfZone: me.role === 'fugitive' && me.caughtAt === null && isOutOfZone(g, me),
      eliminateAt: me.role === 'fugitive' && me.outSince != null ? me.outSince + OUT_OF_ZONE_LIMIT_MS : null,
      zoneAlert: g.phase === 'headstart' || g.phase === 'hunt' ? zoneAlert(g, me) : null,
      qr: me.role === 'fugitive' && me.caughtAt === null ? qrFor(g, me) : null,
    },
    fugitivesLeft: fugitives.filter(p => p.caughtAt === null).length,
    fugitivesTotal: g.fugitivesTotal,
    team,
    // Un joueur attrapé (ou passé chez les chasseurs, en zombie) depuis le ping disparaît de la carte adverse.
    ping: g.lastPing && {
      at: g.lastPing.at,
      players: (me.role === 'hunter' ? g.lastPing.forHunters : g.lastPing.forFugitives).filter(p => {
        const q = g.players.get(p.id);
        return q?.caughtAt === null && q.role !== me.role;
      }),
    },
    spectating,
    outOfZone,
    winner: g.winner,
  };
}
