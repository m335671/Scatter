// Bots du mode entraînement : marche aléatoire dans la zone, ou jeu « malin » à partir des pings.
import { type LatLng, distanceM, zoneRadius } from '@kr/shared';
import { type Game, type Player, GameError, aliveFugitives, catchFugitive, join, positionAt, say, updatePosition } from './game.ts';

const SPEED_MPS = 1.6;       // petite foulée
const SMART_SPEED_MPS = 2.4; // un bot malin court
const CATCH_M = 15;          // un bot chasseur attrape un joueur humain à cette distance
const FLEE_M = 150;          // un bot fugitif malin fuit les chasseurs pingés plus près que ça
const NAMES = ['Leo', 'Sasha', 'Teo', 'Nina', 'Adri', 'Maya', 'Yanis', 'Lou', 'Iris', 'Malo', 'Zoe', 'Noam', 'Elsa', 'Remi', 'Jade'];
const CHAT = {
  hunter: ['Je fonce vers le dernier ping.', 'Je couvre le centre de la zone.', 'Je fais le tour par le bord.', 'Rien de mon côté.', 'On se resserre, la zone rétrécit.'],
  fugitive: ['Chasseur pas loin, je bouge.', "Je reste caché pour l'instant.", 'Attention, ils arrivent vers le centre.', 'Je change de coin.', 'Tout va bien ici.'],
};

const human = (g: Game) => [...g.players.values()].find(p => !p.isBot)!;
const lastPos = (p: Player) => p.history.at(-1);

/** Ajoute les bots demandés dans les règles, autour du centre de la zone. */
export function addBots(g: Game, rng = Math.random) {
  for (const p of g.players.values()) if (p.isBot) g.players.delete(p.id); // un lancement raté ne double pas les bots
  const me = human(g);
  if (me.choice === 'random') me.choice = rng() < 0.5 ? 'hunter' : 'fugitive';
  const { hunters, fugitives } = g.rules.bots;
  // Zombie : un seul chasseur au départ, le joueur s'il l'a choisi, sinon un bot.
  const roles: ('hunter' | 'fugitive')[] = g.rules.mode === 'zombie'
    ? Array.from({ length: Math.max(1, hunters + fugitives) }, (_, i) => (i === 0 && me.choice === 'fugitive' ? 'hunter' : 'fugitive'))
    : [...Array(hunters).fill('hunter'), ...Array(fugitives).fill('fugitive')];
  roles.forEach((role, i) => {
    const name = NAMES[i % NAMES.length];
    const p = join(g, { id: `bot-${i}`, name, username: name.toLowerCase() }, { isBot: true, choice: role });
    updatePosition(g, p.id, randomPointIn(g.rules.zone.center, g.rules.zone.startRadiusM * 0.6, rng));
  });
}

const offset = (c: LatLng, northM: number, eastM: number): LatLng => ({
  lat: c.lat + northM / 111_320,
  lng: c.lng + eastM / (111_320 * Math.cos((c.lat * Math.PI) / 180)),
});

export function randomPointIn(c: LatLng, radiusM: number, rng = Math.random): LatLng {
  const r = radiusM * Math.sqrt(rng()), a = rng() * 2 * Math.PI;
  return offset(c, r * Math.cos(a), r * Math.sin(a));
}

/** Bot malin : chasseur → dernier ping d'un humain ; fugitif → à l'opposé d'un chasseur pingé trop proche. */
function smartTarget(g: Game, p: Player, pos: LatLng, radius: number): LatLng | null {
  const ping = g.lastPing;
  if (!ping || g.phase !== 'hunt') return null;
  if (p.role === 'hunter') {
    const prey = ping.forHunters.filter(s => !s.caught && !g.players.get(s.id)?.isBot)
      .sort((a, b) => distanceM(pos, a) - distanceM(pos, b))[0];
    return prey ? { lat: prey.lat, lng: prey.lng } : null;
  }
  const threat = ping.forFugitives.find(s => distanceM(pos, s) < FLEE_M);
  if (!threat) return null;
  const away = { lat: pos.lat + (pos.lat - threat.lat), lng: pos.lng + (pos.lng - threat.lng) };
  return distanceM(away, g.rules.zone.center) < radius ? away : null;
}

/** Déplace les bots de `gameDtMs` de temps de jeu. Appelé après tick(). */
export function moveBots(g: Game, gameDtMs: number, rng = Math.random) {
  if (g.phase !== 'headstart' && g.phase !== 'hunt') return;
  const { smart, chatty } = g.rules.bots;
  const radius = zoneRadius(g.rules, g.clock) * 0.9;
  for (const p of g.players.values()) {
    if (!p.isBot || p.caughtAt !== null) continue;
    const pos = positionAt(p, g.clock);
    if (!pos) continue;
    // Les chasseurs attendent pendant l'avance, mais envoient leur position comme un vrai téléphone (sinon « hors ligne »).
    if (p.role === 'hunter' && g.phase === 'headstart') { updatePosition(g, p.id, { lat: pos.lat, lng: pos.lng, acc: pos.acc }); continue; }
    if (p.role === 'hunter') p.stray = false; // converti en zombie : il revient chasser
    const goal = smart && !p.stray ? smartTarget(g, p, pos, radius) : null;
    if (goal) p.target = goal;
    else if (!p.stray && (!p.target || distanceM(pos, p.target) < 5 || distanceM(p.target, g.rules.zone.center) > radius)) {
      p.target = randomPointIn(g.rules.zone.center, radius, rng);
    }
    const target = p.target!;
    const d = distanceM(pos, target);
    const f = d < 1 ? 0 : Math.min(1, ((smart ? SMART_SPEED_MPS : SPEED_MPS) * gameDtMs) / 1000 / d);
    // Précision GPS simulée, comme un vrai téléphone en extérieur.
    updatePosition(g, p.id, { lat: pos.lat + (target.lat - pos.lat) * f, lng: pos.lng + (target.lng - pos.lng) * f, acc: 6 + rng() * 10 });
  }
  if (chatty && g.lastPing && g.botsPingAt !== g.lastPing.at) { g.botsPingAt = g.lastPing.at; botTalks(g, rng); }
  if (g.phase === 'hunt') botsCatch(g);
}

/** Après un ping, un coéquipier bot du joueur parle à la radio. */
function botTalks(g: Game, rng: () => number) {
  const role = human(g).role;
  if (!role || (role === 'hunter' && !g.rules.huntersCanTalk)) return;
  const mates = [...g.players.values()].filter(p => p.isBot && p.role === role && p.caughtAt === null);
  const bot = mates[Math.floor(rng() * mates.length)];
  if (bot) say(g, bot.id, CHAT[role][Math.floor(rng() * CHAT[role].length)]);
}

function botsCatch(g: Game) {
  const hunters = [...g.players.values()].filter(p => p.isBot && p.role === 'hunter');
  for (const f of aliveFugitives(g)) {
    if (f.isBot) continue; // les bots ne s'attrapent pas entre eux : c'est au joueur de jouer
    const fp = lastPos(f);
    const h = fp && hunters.find(h => { const hp = lastPos(h); return hp && distanceM(hp, fp) < CATCH_M; });
    if (h) catchFugitive(g, h, f);
  }
}

/** Contrôles d'entraînement : simule le scan du QR avec le bot le plus proche, dans un sens ou dans l'autre. */
export function trainingCatch(g: Game, userId: string, action: 'catch' | 'caught') {
  if (g.phase !== 'hunt') throw new GameError("Les captures commencent après l'avance.");
  const me = g.players.get(userId)!;
  const catching = action === 'catch';
  if (me.role !== (catching ? 'hunter' : 'fugitive') || me.caughtAt !== null) {
    throw new GameError(catching ? 'Réservé aux chasseurs.' : 'Réservé aux fugitifs encore libres.');
  }
  const mine = lastPos(me);
  const dist = (p: Player) => { const q = lastPos(p); return mine && q ? distanceM(mine, q) : Infinity; };
  const pool = catching ? aliveFugitives(g) : [...g.players.values()].filter(p => p.role === 'hunter');
  const other = pool.filter(p => p.isBot).sort((a, b) => dist(a) - dist(b))[0];
  if (!other) throw new GameError(catching ? 'Plus aucun bot fugitif.' : 'Aucun bot chasseur.');
  if (catching) catchFugitive(g, me, other); else catchFugitive(g, other, me);
}

/** Un bot fugitif file hors de la zone : de quoi voir l'alerte des chasseurs, le suivi en direct puis l'élimination. */
export function sendStray(g: Game) {
  if (!g.rules.zone.enabled) throw new GameError('Pas de zone dans cette partie.');
  const bot = aliveFugitives(g).find(p => p.isBot && !p.stray);
  if (!bot) throw new GameError('Plus aucun bot fugitif à envoyer.');
  const c = g.rules.zone.center, pos = lastPos(bot) ?? c;
  const r = zoneRadius(g.rules, g.clock) + 80;
  const north = (pos.lat - c.lat) * 111_320, east = (pos.lng - c.lng) * 111_320 * Math.cos((c.lat * Math.PI) / 180);
  const d = Math.hypot(north, east) || 1;
  bot.stray = true;
  bot.target = d < 1 ? offset(c, r, 0) : offset(c, (north * r) / d, (east * r) / d);
}
