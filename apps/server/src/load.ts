// Test de charge réseau : N parties de 10 vrais clients Socket.IO (création, prêt, lancement, GPS toutes les 2 s).
// node --experimental-strip-types src/load.ts http://localhost:3999 [parties] [secondes]
import { io, type Socket } from 'socket.io-client';
import { defaultRules } from '../../../packages/shared/src/index.ts'; // chemin relatif : lançable depuis un conteneur

const [url = 'http://localhost:3999', nArg = '50', sArg = '40'] = process.argv.slice(2);
const N = Number(nArg), SECS = Number(sArg), PER_GAME = 10;
const center = { lat: 46.0384, lng: 4.2139 };
const run = Math.random().toString(36).slice(2, 7);

async function register(i: number) {
  const r = await fetch(`${url}/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Charge${i}`, username: `l${run}_${i}` }),
  });
  return ((await r.json()) as { token: string }).token;
}

const connect = (token: string) => new Promise<Socket>((ok, ko) => {
  const s = io(url, { auth: { token }, transports: ['websocket'], forceNew: true });
  s.once('connect', () => ok(s));
  s.once('connect_error', ko);
});
const ask = (s: Socket, ev: string, data: unknown = {}) =>
  s.timeout(10_000).emitWithAck(ev, data).then((r: { error?: string; code?: string }) => { if (r.error) throw new Error(`${ev}: ${r.error}`); return r; });

const t0 = performance.now();
const tokens: string[] = [];
for (let i = 0; i < N * PER_GAME; i += 50) tokens.push(...await Promise.all(Array.from({ length: Math.min(50, N * PER_GAME - i) }, (_, k) => register(i + k))));
const sockets: Socket[] = [];
for (let i = 0; i < tokens.length; i += 100) sockets.push(...await Promise.all(tokens.slice(i, i + 100).map(connect)));
console.log(`${sockets.length} clients connectés en ${((performance.now() - t0) / 1000).toFixed(1)} s`);

let states = 0;
for (const s of sockets) s.on('state', () => states++);

const setup: number[] = [];
await Promise.all(Array.from({ length: N }, async (_, g) => {
  const ps = sockets.slice(g * PER_GAME, (g + 1) * PER_GAME);
  const t = performance.now();
  const { code } = await ask(ps[0], 'create', { rules: defaultRules(center) });
  for (const p of ps.slice(1)) await ask(p, 'join', { code });
  await Promise.all(ps.slice(1).map(p => ask(p, 'ready', { ready: true })));
  await ask(ps[0], 'start');
  setup.push(performance.now() - t);
}));

const rtt: number[] = [];
const jitter = () => (Math.random() - 0.5) * 0.004;
const timer = setInterval(() => {
  for (const s of sockets) {
    const t = performance.now();
    s.timeout(10_000).emitWithAck('pos', { lat: center.lat + jitter(), lng: center.lng + jitter(), acc: 8 }).then(() => rtt.push(performance.now() - t), () => rtt.push(10_000));
  }
}, 2000);
states = 0;
await new Promise(r => setTimeout(r, SECS * 1000));
clearInterval(timer);

const pct = (a: number[], p: number) => a.sort((x, y) => x - y)[Math.floor(a.length * p)]?.toFixed(0);
console.log(`${N} parties lancées (création → 10 joueurs prêts → lancement : médiane ${pct(setup, 0.5)} ms, p99 ${pct(setup, 0.99)} ms)`);
console.log(`aller-retour GPS : médiane ${pct(rtt, 0.5)} ms, p99 ${pct(rtt, 0.99)} ms, max ${pct(rtt, 0.9999)} ms`);
console.log(`états reçus : ${(states / SECS / sockets.length).toFixed(2)} par joueur et par seconde (attendu ≈ 1)`);
for (const s of sockets) s.close();
process.exit(0);
