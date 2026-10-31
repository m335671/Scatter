// Tests de bout en bout : un vrai serveur, de vrais sockets, comme des téléphones. Couvre ce que game.test.ts ne voit pas
// (index.ts : arrivées, lancement, radio, inscriptions).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { defaultRules } from '@kr/shared';

const PORT = 20_000 + Math.floor(Math.random() * 20_000);
const BASE = `http://localhost:${PORT}`;
const DATA = mkdtempSync(join(tmpdir(), 'scatter-test-'));
const C = { lat: 45.9, lng: 4.6 };
let server: ChildProcess;
const sockets: Socket[] = [];
let n = 0;

before(async () => {
  server = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', new URL('./index.ts', import.meta.url).pathname], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA }, stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    if (await fetch(`${BASE}/health`).then(r => r.ok, () => false)) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('serveur pas démarré');
});

after(async () => {
  for (const s of sockets) s.close();
  const exited = new Promise(r => server.once('exit', r));
  server.kill(); // SIGTERM : le serveur écrit sa sauvegarde avant de sortir
  await exited;
  rmSync(DATA, { recursive: true, force: true });
});

const register = (name = `j${++n}`) => fetch(`${BASE}/auth/register`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, username: `${name}_${PORT}` }),
});

/** Un « téléphone » connecté avec un compte neuf. */
async function phone(): Promise<Socket> {
  const { token } = await (await register()).json();
  const s = io(BASE, { auth: { token }, transports: ['websocket'] });
  sockets.push(s);
  await new Promise(r => s.once('connect', r));
  return s;
}

const ask = (s: Socket, ev: string, data: object = {}) => new Promise<any>(r => s.emit(ev, data, r));
// Après le décompte de lancement (4 s), un état par seconde : 7 s sans rien = le joueur ne reçoit plus sa partie.
const nextState = (s: Socket) => new Promise<any>((r, no) => {
  s.once('state', r);
  setTimeout(() => no(new Error('aucun état reçu')), 7000).unref();
});

/** Salon de deux joueurs prêts, lancé. */
async function running(center?: typeof C) {
  const [host, guest] = await Promise.all([phone(), phone()]);
  const { code } = await ask(host, 'create', { rules: defaultRules(C) });
  assert.deepEqual(await ask(guest, 'join', { code }), { ok: true, code });
  await ask(guest, 'ready', { ready: true });
  assert.deepEqual(await ask(host, 'start', { center }), { ok: true });
  return { host, guest, code };
}

test('arrivée refusée (partie lancée) : on reste dans sa partie en cours', async () => {
  const a = await running();
  const b = await running();
  const r = await ask(a.guest, 'join', { code: b.code });
  assert.match(r.error, /commencé/);
  assert.equal((await nextState(a.guest)).code, a.code);
});

test('lancement : la zone se recale sur la position fraîche de l\'hôte', async () => {
  const fresh = { lat: 45.91, lng: 4.61 };
  const { guest } = await running(fresh);
  assert.deepEqual((await nextState(guest)).zone.center, fresh);
});

test('radio : un message toutes les 0,5 s au plus', async () => {
  const { guest } = await running();
  assert.deepEqual(await ask(guest, 'chat', { text: 'a', channel: 'all' }), { ok: true });
  assert.match((await ask(guest, 'chat', { text: 'b', channel: 'all' })).error, /Doucement/);
  await new Promise(r => setTimeout(r, 550));
  assert.deepEqual(await ask(guest, 'chat', { text: 'c', channel: 'all' }), { ok: true });
});

test("rôles : libres, chacun le sien ; coupés, seul l'hôte choisit pour tous", async () => {
  const [host, guest] = await Promise.all([phone(), phone()]);
  const { code } = await ask(host, 'create', { rules: defaultRules(C) });
  const lobby = new Promise<any>(r => host.on('lobby', l => l.players.length === 2 && r(l)));
  await ask(guest, 'join', { code });
  const guestId = (await lobby).players.find((p: any) => !p.host).id;
  assert.deepEqual(await ask(guest, 'role', { role: 'hunter' }), { ok: true });
  assert.match((await ask(host, 'role', { role: 'fugitive', id: guestId })).error, /Coupe/);
  await ask(host, 'rules', { ...defaultRules(C), freeRoles: false });
  assert.match((await ask(guest, 'role', { role: 'fugitive' })).error, /hôte/);
  const changed = new Promise<any>(r => guest.on('lobby', l => l.players.some((p: any) => p.id === guestId && p.choice === 'fugitive') && r(l)));
  assert.deepEqual(await ask(host, 'role', { role: 'fugitive', id: guestId }), { ok: true });
  await changed;
});

// En dernier : épuise la réserve d'inscriptions du serveur.
test('inscriptions : plafond global, une réserve puis un refus clair', async () => {
  let refused: Response | undefined;
  for (let i = 0; i < 120 && !refused; i++) {
    const r = await register();
    if (r.status === 429) refused = r;
  }
  assert.ok(refused, 'aucun refus après 120 inscriptions');
  assert.match((await refused.json()).error, /réessaie/);
});
