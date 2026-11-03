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
const MAX_SAMPLES = 400;

interface Sample { t: number; lat: number; lng: number; acc?: number }

export interface Player {
  id: string;
  /** Identifiant court montré aux autres joueurs (états, radio) : plus léger, et l'identifiant du compte reste privé. */
  sid: string;
  /** Clé du dernier ping envoyé à ce joueur : inutile de le renvoyer tant qu'il ne change pas. */
  sentPing?: string;
  name: string;
  username: string;
  choice: RoleChoice;
  role: Role | null;
  isBot: boolean;
  caughtAt: number | null;
  secret: string;
  history: Sample[];
  target?: LatLng; // bots
  /** Bot envoyé hors zone par les contrôles d'entraînement. */
  stray?: boolean;
  /** A quitté la partie en cours de manche. */
  left?: boolean;
  /** Prêt à jouer (salon). Remis à zéro quand l'hôte change les règles. */
  ready?: boolean;
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
  /** Bots bavards : dernier ping commenté à la radio. */
  botsPingAt?: number;
  /** Heure réelle (Date.now) du vrai départ : avant, décompte de lancement et horloge figée. */
  startAt?: number;
  /** Joueurs retirés du salon par l'hôte : ils ne peuvent plus revenir. */
  banned: string[];
  /** Nombre de pings depuis le lancement (chasseurs montrés aux fugitifs un ping sur N). */
  pings?: number;
}

export interface UserRef { id: string; name: string; username: string }

export class GameError extends Error {}

export function createGame(code: string, host: UserRef, rules: Rules, training = false): Game {
  const g: Game = {
    code, hostId: host.id, rules, training, speed: 1, phase: 'lobby', clock: 0,
    nextPingAt: null, lastPing: null, winner: null, fugitivesTotal: 0, players: new Map(),
    chat: { hunter: [], fugitive: [], all: [] }, outbox: [], seq: 0, banned: [],
  };
  join(g, host);
  return g;
}

export function join(g: Game, u: UserRef, opts: { isBot?: boolean; choice?: RoleChoice } = {}): Player {
  const existing = g.players.get(u.id);
  if (existing) return existing;
  if (g.phase !== 'lobby') throw new GameError('La partie a déjà commencé.');
  if (g.banned.includes(u.id)) throw new GameError("L'hôte t'a fermé l'accès à ce salon.");
  if (g.players.size >= MAX_PLAYERS) throw new GameError('Le salon est plein.');
  const p: Player = {
    ...u, sid: (++g.seq).toString(36), choice: opts.choice ?? 'random', role: null, isBot: !!opts.isBot,
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
    if (hidden(g)) { /* Dispersion : pas encore d'équipes, rien à conclure */ }
    else if (!aliveFugitives(g).length) end(g, 'hunter');
    else if (![...g.players.values()].some(q => q.role === 'hunter' && !q.left)) end(g, 'fugitive');
  }
  if (g.hostId === id) g.hostId = [...g.players.values()].find(q => !q.isBot && !q.left)?.id ?? '';
}

export const huntStart = (g: Game) => g.rules.headStartMin * MIN;
export const huntEnd = (g: Game) => huntStart(g) + g.rules.durationMin * MIN;

export function start(g: Game, rng = Math.random) {
  if (g.phase !== 'lobby') throw new GameError('Déjà lancée.');
  const ps = [...g.players.values()];
  const waiting = ps.filter(p => !isReady(g, p));
  if (waiting.length) throw new GameError(waiting.length === 1 ? `${waiting[0].name} n'est pas prêt.` : `${waiting.length} joueurs ne sont pas prêts.`);
  if ((g.rules.hunters ?? 0) >= ps.length) throw new GameError(`Trop de chasseurs pour ${ps.length} joueurs : il faut au moins un fugitif.`);
  const dispersion = !!g.rules.dispersion && g.rules.headStartMin > 0;
  // Dispersion : tout le monde part du même côté, les rôles tombent à la fin de l'avance (reveal).
  if (dispersion) for (const p of ps) p.role = 'fugitive';
  else assignRoles(g, ps, rng);
  if (ps.length < 2 || (!dispersion && (!ps.some(p => p.role === 'hunter') || !ps.some(p => p.role === 'fugitive')))) {
    for (const p of ps) p.role = null;
    throw new GameError('Il faut au moins un chasseur et un fugitif.');
  }
  for (const p of ps) p.secret = randomBytes(12).toString('hex');
  g.fugitivesTotal = ps.filter(p => p.role === 'fugitive').length;
  g.phase = g.rules.headStartMin > 0 ? 'headstart' : 'hunt';
  g.clock = 0;
  g.nextPingAt = huntStart(g);
  if (dispersion) {
    system(g, 'fugitive', `Dispersion : éparpillez-vous ! Les rôles tombent dans ${g.rules.headStartMin} min.`);
    return;
  }
  system(g, 'fugitive', `Tu as ${g.rules.headStartMin} min d'avance. Cache-toi !`);
  system(g, 'hunter', `Les fugitifs ont ${g.rules.headStartMin} min d'avance. Patience.`);
  const hunters = ps.filter(p => p.role === 'hunter');
  system(g, 'all', !isZombie(g) ? 'La partie commence. Bonne chance à tous !'
    : hunters.length === 1 ? `Mode zombie : ${hunters[0].name} est le seul chasseur. Chaque fugitif attrapé le rejoint.`
    : `Mode zombie : ${hunters.length} chasseurs au départ. Chaque fugitif attrapé les rejoint.`);
}

function shuffle<T>(list: T[], rng: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Tirage des rôles. Nombre de chasseurs fixé ou Dispersion : au sort, choix ignorés. Sinon, les choix d'abord. */
function assignRoles(g: Game, ps: Player[], rng: () => number) {
  const fixed = g.rules.hunters ?? 0;
  const k = Math.min(ps.length - 1, fixed || (isZombie(g) ? 1 : g.rules.dispersion ? Math.max(1, Math.round(ps.length / 3)) : 0));
  if (k > 0) {
    const mix = shuffle(ps, rng);
    // Zombie sans nombre fixé : le premier chasseur est tiré parmi les volontaires (tri stable, l'ordre reste aléatoire).
    if (isZombie(g) && !fixed && !g.rules.dispersion) mix.sort((a, b) => +(b.choice === 'hunter') - +(a.choice === 'hunter'));
    mix.forEach((p, i) => { p.role = i < k ? 'hunter' : 'fugitive'; });
    return;
  }
  const randoms = shuffle(ps.filter(p => p.choice === 'random'), rng);
  for (const p of ps) if (p.choice !== 'random') p.role = p.choice;
  const wantedHunters = Math.max(1, Math.round(ps.length / 3));
  for (const p of randoms) {
    const hunters = ps.filter(q => q.role === 'hunter').length;
    const fugitives = ps.filter(q => q.role === 'fugitive').length;
    // Priorité : au moins un de chaque, puis ~1/3 de chasseurs.
    p.role = fugitives === 0 && hunters > 0 ? 'fugitive' : hunters < wantedHunters ? 'hunter' : 'fugitive';
  }
}

/** Dispersion, fin de l'avance : les rôles tombent parmi les joueurs encore en jeu. */
function reveal(g: Game) {
  const ps = [...g.players.values()].filter(p => !p.left && p.caughtAt === null);
  if (ps.length < 2) return end(g, 'fugitive');
  assignRoles(g, ps, Math.random);
  for (const p of ps) if (p.role === 'hunter') p.outSince = null;
  g.fugitivesTotal = ps.filter(p => p.role === 'fugitive').length;
  const h = ps.length - g.fugitivesTotal;
  system(g, 'hunter', h > 1 ? `Les rôles sont tombés : tu es chasseur, avec ${h - 1} coéquipier${h > 2 ? 's' : ''}. À la chasse !` : 'Les rôles sont tombés : tu es le seul chasseur. À la chasse !');
  system(g, 'fugitive', 'Les rôles sont tombés : tu es fugitif. Les chasseurs sont lâchés, cache-toi !');
  system(g, 'all', `Rôles tirés : ${h} chasseur${h > 1 ? 's' : ''}, ${g.fugitivesTotal} fugitif${g.fugitivesTotal > 1 ? 's' : ''}.`);
}

export const isZombie = (g: Game) => g.rules.mode === 'zombie';
/** Dispersion pendant l'avance : rôles pas encore tirés. */
export const hidden = (g: Game) => !!g.rules.dispersion && g.phase === 'headstart';
/** L'hôte est prêt en lançant, les bots toujours. */
export const isReady = (g: Game, p: Player) => p.isBot || p.id === g.hostId || !!p.ready;

// ---------- Positions ----------

export function updatePosition(g: Game, id: string, pos: LatLng & { acc?: number }) {
  const p = g.players.get(id);
  if (!p) return;
  // Arrondi à ~1 m (5 décimales) : le GPS n'est pas plus précis, et chaque état envoyé en est plus léger.
  p.history.push({ t: g.clock, lat: Math.round(pos.lat * 1e5) / 1e5, lng: Math.round(pos.lng * 1e5) / 1e5, acc: pos.acc });
  // On garde le dernier échantillon antérieur à la fenêtre pour pouvoir répondre à positionAt(clock - 3 min).
  // Plafond contre un client qui inonderait de positions (un téléphone en envoie ~90 en 3 min).
  if (p.history.length > MAX_SAMPLES) p.history.shift();
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
    if (g.rules.dispersion) reveal(g);
    else {
      system(g, 'fugitive', 'Les chasseurs sont lâchés !');
      system(g, 'hunter', "C'est parti, à la chasse !");
    }
    if (g.phase === 'ended') return;
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
  // Chasseurs montrés un ping sur N : entre-temps, les fugitifs gardent la dernière position vue (avec son âge).
  g.pings = (g.pings ?? 0) + 1;
  const showEvery = g.rules.huntersShownEvery ?? 1;
  const shown = showEvery > 0 && (g.pings - 1) % showEvery === 0;
  const forFugitives = shown
    ? ps.flatMap(p => {
      const s = p.role === 'hunter' ? current(p) : null;
      return s ? [seen(p, s)] : [];
    })
    : g.lastPing?.forFugitives ?? [];
  g.lastPing = { at: g.clock, forHunters, forFugitives };
  const every = g.rules.pingEveryMin * MIN;
  // Si l'horloge a sauté plusieurs pings (avance rapide), un seul ping puis on recale.
  const k = Math.floor((g.clock - huntStart(g)) / every) + 1;
  g.nextPingAt = Math.max(huntStart(g), huntStart(g) + k * every);
  const n = forHunters.length;
  system(g, 'hunter', n ? `Ping ! ${n} fugitif${n > 1 ? 's viennent' : ' vient'} d'apparaître sur la carte.` : 'Ping ! Aucun fugitif repéré pour l\'instant.');
  system(g, 'fugitive', showEvery === 1 ? 'Ping ! Les chasseurs savent où tu étais il y a 1 min.'
    : shown ? 'Ping ! Les chasseurs savent où tu étais il y a 1 min, et eux apparaissent sur ta carte.'
    : 'Ping ! Les chasseurs savent où tu étais il y a 1 min. Eux restent cachés.');
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

// Identifiant court dans le QR : quiconque le scanne ou le photographie ne voit pas l'identifiant du compte.
export const qrFor = (g: Game, p: Player) => `KR1:${g.code}:${p.sid}:${p.secret}`;

export function capture(g: Game, hunterId: string, qr: string) {
  const hunter = g.players.get(hunterId);
  if (hunter?.role !== 'hunter') throw new GameError("Seuls les chasseurs peuvent attraper.");
  if (g.phase !== 'hunt') throw new GameError("Pas encore, les fugitifs ont de l'avance.");
  const [tag, code, sid, secret] = qr.split(':');
  const target = [...g.players.values()].find(p => p.sid === sid);
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
  push(g, channel === 'all' ? 'all' : p.role, { id: `${g.code}-${++g.seq}`, at: g.clock, from: p.sid, fromName: p.name, text, system: false });
}

// ---------- Sauvegarde ----------

/** Partie sérialisable en JSON (les Map deviennent des tableaux), pour la reprise après un redémarrage. */
export type SavedGame = Omit<Game, 'players'> & { players: Player[] };
export const saveGame = (g: Game): SavedGame => ({ ...g, players: [...g.players.values()] });
export function loadGame(s: SavedGame): Game {
  for (const p of s.players) p.sid ??= (++s.seq).toString(36); // sauvegarde d'avant les identifiants courts
  return { ...s, banned: s.banned ?? [], players: new Map(s.players.map(p => [p.id, p])) };
}

// ---------- Vues ----------

export function lobbyView(g: Game): Lobby {
  return {
    code: g.code, rules: g.rules, training: g.training,
    players: [...g.players.values()].map(p => ({
      id: p.id, name: p.name, username: p.username, choice: p.choice, isBot: p.isBot, host: p.id === g.hostId, ready: isReady(g, p),
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
  // Les joueurs sont repérés en interne par leur compte ; le client ne voit que leur identifiant court.
  const out = (list: SeenPlayer[]) => list.map(s => ({ ...s, id: g.players.get(s.id)!.sid }));
  // Règle dure : un fugitif hors zone est visible en direct par les chasseurs tant qu'il y reste.
  const outOfZone = me.role === 'hunter' && g.phase === 'hunt'
    ? fugitives.flatMap(p => { const s = p.caughtAt === null && isOutOfZone(g, p) ? current(p) : null; return s ? [seen(p, s, true)] : []; })
    : [];
  return {
    startsInMs: g.startAt ? Math.max(0, g.startAt - Date.now()) : 0,
    code: g.code, phase: g.phase, mode: isZombie(g) ? 'zombie' : 'classic', training: g.training, hidden: hidden(g), speed: g.speed, clock: g.clock,
    huntStart: huntStart(g), huntEnd: huntEnd(g), nextPingAt: g.nextPingAt,
    zone: {
      enabled: g.rules.zone.enabled, center: g.rules.zone.center,
      radiusM: zoneRadius(g.rules, g.clock), nextShrinkAt: nextShrinkAt(g.rules, g.clock),
    },
    me: {
      id: me.sid, role: me.role, caught: me.caughtAt !== null, caughtAt: me.caughtAt, eliminated: !!me.eliminated, captures: me.captures ?? 0,
      outOfZone: me.role === 'fugitive' && me.caughtAt === null && isOutOfZone(g, me),
      eliminateAt: me.role === 'fugitive' && me.outSince != null ? me.outSince + OUT_OF_ZONE_LIMIT_MS : null,
      zoneAlert: g.phase === 'headstart' || g.phase === 'hunt' ? zoneAlert(g, me) : null,
      qr: me.role === 'fugitive' && me.caughtAt === null && !hidden(g) ? qrFor(g, me) : null,
    },
    fugitivesLeft: fugitives.filter(p => p.caughtAt === null).length,
    fugitivesTotal: g.fugitivesTotal,
    team: out(team),
    // Un joueur attrapé (ou passé chez les chasseurs, en zombie) depuis le ping disparaît de la carte adverse.
    ping: g.lastPing && {
      at: g.lastPing.at,
      players: out((me.role === 'hunter' ? g.lastPing.forHunters : g.lastPing.forFugitives).filter(p => {
        const q = g.players.get(p.id);
        return q?.caughtAt === null && q.role !== me.role;
      })),
    },
    spectating: out(spectating),
    outOfZone: out(outOfZone),
    winner: g.winner,
  };
}
