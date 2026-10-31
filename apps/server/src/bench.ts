// Mesure de charge : coût CPU d'une seconde de jeu pour N parties de 10 joueurs.
// node src/bench.ts [parties]
import { defaultRules } from '@kr/shared';
import { createGame, join, start, tick, updatePosition, view } from './game.ts';

const N = Number(process.argv[2] ?? 1000);
const center = { lat: 46.0384, lng: 4.2139 };
const games = Array.from({ length: N }, (_, i) => {
  const g = createGame(`G${i}`, { id: `${i}-0`, name: 'P0', username: 'p0' }, defaultRules(center));
  for (let k = 1; k < 10; k++) join(g, { id: `${i}-${k}`, name: `P${k}`, username: `p${k}` }, { choice: k < 3 ? 'hunter' : 'fugitive' });
  g.players.get(`${i}-0`)!.choice = 'hunter';
  for (const p of g.players.values()) p.ready = true;
  start(g);
  return g;
});
const jitter = () => (Math.random() - 0.5) * 0.004;

let bytes = 0;
const secs = 30;
const t0 = performance.now();
for (let s = 0; s < secs; s++) {
  for (const g of games) {
    // Un GPS toutes les 2 s par joueur.
    if (s % 2 === 0) for (const p of g.players.values()) updatePosition(g, p.id, { lat: center.lat + jitter(), lng: center.lng + jitter(), acc: 8 });
    tick(g, 1000 * 20); // ×20 : on traverse pings et rétrécissements
    for (const p of g.players.values()) bytes += JSON.stringify(view(g, p.id)).length;
    g.outbox.length = 0;
  }
}
const ms = (performance.now() - t0) / secs;
console.log(`${N} parties, ${N * 10} joueurs : ${ms.toFixed(1)} ms CPU par seconde de jeu (${(ms / 10).toFixed(1)} % d'un cœur), ${(bytes / secs / 1e6).toFixed(1)} Mo/s émis, ${(bytes / secs / N / 10 / 1024).toFixed(1)} Ko par état`);
