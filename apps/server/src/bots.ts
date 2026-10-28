// Bots du mode entraînement : marche aléatoire dans la zone.
import { type LatLng, distanceM, zoneRadius } from '@kr/shared';
import { type Game, type Player, aliveFugitives, catchFugitive, join, positionAt, updatePosition } from './game.ts';

const SPEED_MPS = 1.6;   // petite foulée
const CATCH_M = 15;      // un bot chasseur attrape un joueur humain à cette distance
const NAMES = ['Leo', 'Sasha', 'Teo', 'Nina', 'Adri', 'Maya', 'Yanis', 'Lou'];

/** Ajoute les bots autour du joueur humain selon son rôle choisi. */
export function addBots(g: Game, rng = Math.random) {
  const human = [...g.players.values()][0];
  if (human.choice === 'random') human.choice = rng() < 0.5 ? 'hunter' : 'fugitive';
  const roles = human.choice === 'hunter'
    ? ['hunter', 'fugitive', 'fugitive', 'fugitive', 'fugitive'] as const
    : ['hunter', 'hunter', 'fugitive', 'fugitive', 'fugitive'] as const;
  roles.forEach((role, i) => {
    const name = NAMES[i];
    const p = join(g, { id: `bot-${i}`, name, username: name.toLowerCase() }, { isBot: true, choice: role });
    updatePosition(g, p.id, randomPointIn(g.rules.zone.center, g.rules.zone.startRadiusM * 0.6, rng));
  });
}

export function randomPointIn(c: LatLng, radiusM: number, rng = Math.random): LatLng {
  const r = radiusM * Math.sqrt(rng()), a = rng() * 2 * Math.PI;
  return {
    lat: c.lat + (r * Math.cos(a)) / 111_320,
    lng: c.lng + (r * Math.sin(a)) / (111_320 * Math.cos((c.lat * Math.PI) / 180)),
  };
}

/** Déplace les bots de `gameDtMs` de temps de jeu. Appelé après tick(). */
export function moveBots(g: Game, gameDtMs: number, rng = Math.random) {
  if (g.phase !== 'headstart' && g.phase !== 'hunt') return;
  const radius = zoneRadius(g.rules, g.clock) * 0.9;
  for (const p of g.players.values()) {
    if (!p.isBot || p.caughtAt !== null) continue;
    if (p.role === 'hunter' && g.phase === 'headstart') continue; // les chasseurs attendent
    const pos = positionAt(p, g.clock);
    if (!pos) continue;
    if (!p.target || distanceM(pos, p.target) < 5 || distanceM(p.target, g.rules.zone.center) > radius) {
      p.target = randomPointIn(g.rules.zone.center, radius, rng);
    }
    const d = distanceM(pos, p.target);
    const f = Math.min(1, (SPEED_MPS * gameDtMs) / 1000 / d);
    updatePosition(g, p.id, { lat: pos.lat + (p.target.lat - pos.lat) * f, lng: pos.lng + (p.target.lng - pos.lng) * f });
  }
  if (g.phase === 'hunt') botsCatch(g);
}

function botsCatch(g: Game) {
  const hunters = [...g.players.values()].filter(p => p.isBot && p.role === 'hunter');
  for (const f of aliveFugitives(g)) {
    if (f.isBot) continue; // les bots ne s'attrapent pas entre eux : c'est au joueur de jouer
    const fp = f.history.at(-1);
    const h = fp && hunters.find(h => { const hp = h.history.at(-1); return hp && distanceM(hp, fp) < CATCH_M; });
    if (h) catchFugitive(g, h, f);
  }
}

/** Contrôle de démo : le joueur humain chasseur attrape le fugitif vivant le plus proche. */
export function catchNearest(g: Game, hunter: Player) {
  const hp = hunter.history.at(-1);
  const list = aliveFugitives(g);
  if (!list.length) return;
  const dist = (p: Player) => { const s = p.history.at(-1); return hp && s ? distanceM(hp, s) : Infinity; };
  catchFugitive(g, hunter, list.reduce((a, b) => (dist(b) < dist(a) ? b : a)));
}
