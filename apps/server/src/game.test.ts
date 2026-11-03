import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DisplayName, defaultRules, MIN, zoneRadius } from '@kr/shared';
import { type Game, GameError, capture, createGame, join, leave, loadGame, lobbyView, qrFor, saveGame, say, start, tick, updatePosition, view } from './game.ts';
import { addBots, moveBots, sendStray, trainingCatch } from './bots.ts';

const C = { lat: 45.9, lng: 4.6 };

function setup(): Game {
  const g = createGame('ABCD12', { id: 'h', name: 'Hugo', username: 'hugo' }, defaultRules(C));
  join(g, { id: 'f', name: 'Fanny', username: 'fanny' });
  g.players.get('h')!.choice = 'hunter';
  g.players.get('f')!.choice = 'fugitive';
  ready(g);
  start(g);
  return g;
}

const ready = (g: Game) => { for (const p of g.players.values()) p.ready = true; };

test('ping : les chasseurs voient la position du fugitif 1 min avant', () => {
  const g = setup();
  updatePosition(g, 'h', C);
  // le fugitif bouge pendant l'avance (3 min)
  for (let s = 0; s < 3 * 60; s += 10) {
    updatePosition(g, 'f', { lat: C.lat + s * 1e-6, lng: C.lng, acc: 8.4 });
    tick(g, 10_000);
  }
  // 1er ping à la fin de l'avance (clock = 180 s) → position à t = 120 s
  const v = view(g, 'h')!;
  assert.equal(v.phase, 'hunt');
  assert.equal(v.ping!.players.length, 1);
  assert.equal(v.ping!.players[0].t, 120_000);
  assert.equal(v.ping!.players[0].acc, 8); // précision GPS transmise (arrondie)
  assert.ok(Math.abs(v.ping!.players[0].lat - (C.lat + 120e-6)) < 1e-9);
  // le fugitif, lui, voit le chasseur en direct
  assert.equal(view(g, 'f')!.ping!.players[0].id, g.players.get('h')!.sid);
  // les chasseurs ne voient pas les fugitifs hors ping
  assert.equal(v.team.every(p => p.role === 'hunter'), true);
});

test('ping : un fugitif hors zone est exposé sans délai', () => {
  const g = setup();
  updatePosition(g, 'f', C);
  tick(g, 2.5 * MIN);
  updatePosition(g, 'f', { lat: C.lat + 0.01, lng: C.lng }); // ~1,1 km
  tick(g, 0.5 * MIN);
  const p = view(g, 'h')!.ping!.players[0];
  assert.equal(p.exposed, true);
  assert.ok(view(g, 'f')!.me.outOfZone);
  // Hors ping aussi : le chasseur le voit en direct.
  updatePosition(g, 'f', { lat: C.lat + 0.011, lng: C.lng });
  tick(g, 10_000);
  assert.equal(view(g, 'h')!.outOfZone[0].lat, C.lat + 0.011);
  updatePosition(g, 'f', C); // revenu dans la zone : plus visible
  assert.equal(view(g, 'h')!.outOfZone.length, 0);
});

test('zone : la précision GPS donne le bénéfice du doute, plafonné à 40 m', () => {
  const g = setup();
  tick(g, 2.5 * MIN);
  const edge = (m: number) => ({ lat: C.lat + (zoneRadius(g.rules, g.clock) + m) / 111_320, lng: C.lng });
  updatePosition(g, 'f', { ...edge(25), acc: 30 });
  assert.equal(view(g, 'f')!.me.outOfZone, false);
  updatePosition(g, 'f', { ...edge(60), acc: 500 }); // une précision énorme ne protège pas
  assert.equal(view(g, 'f')!.me.outOfZone, true);
});

test('zone : 420 m → 150 m par paliers de 5 min, finale à 5 min de la fin', () => {
  const r = defaultRules(C);
  assert.equal(zoneRadius(r, 0), 420);
  assert.equal(zoneRadius(r, 3 * MIN + 4 * MIN), 420);
  assert.equal(zoneRadius(r, 3 * MIN + 5 * MIN), 420 - 270 / 5);
  assert.equal(zoneRadius(r, 3 * MIN + 25 * MIN), 150);
  assert.equal(zoneRadius(r, 3 * MIN + 30 * MIN), 150);
});

test('capture par QR : bon secret, mauvais secret, pendant l\'avance', () => {
  const g = setup();
  const f = g.players.get('f')!;
  updatePosition(g, 'f', C);
  assert.throws(() => capture(g, 'h', qrFor(g, f)), GameError); // encore l'avance
  tick(g, 3 * MIN);
  assert.throws(() => capture(g, 'h', `KR1:ABCD12:${f.sid}:${'0'.repeat(24)}`), /invalide/);
  assert.ok(!qrFor(g, f).includes(':f:')); // jamais l'identifiant du compte dans le QR
  assert.throws(() => capture(g, 'f', qrFor(g, f)), GameError);
  assert.equal(view(g, 'h')!.ping!.players.length, 1); // vu au ping de fin d'avance
  capture(g, 'h', qrFor(g, f));
  assert.equal(view(g, 'h')!.me.captures, 1);
  assert.equal(view(g, 'f')!.me.caughtAt, g.clock);
  assert.equal(view(g, 'h')!.ping!.players.length, 0); // attrapé : retiré du ping
  assert.equal(g.phase, 'ended');
  assert.equal(g.winner, 'hunter');
});

test('départ en pleine manche : annoncé, et le dernier fugitif qui part termine la partie', () => {
  const g = setup();
  leave(g, 'f');
  assert.ok(g.chat.all.some(m => m.text === 'Fanny a quitté la partie.'));
  assert.equal(g.winner, 'hunter');
});

test('fin au temps écoulé : victoire des fugitifs', () => {
  const g = setup();
  updatePosition(g, 'f', C);
  tick(g, 33 * MIN);
  assert.equal(g.winner, 'fugitive');
  // Fin : le chasseur voit le fugitif en position actuelle.
  assert.equal(view(g, 'h')!.spectating[0].id, g.players.get('f')!.sid);
  // Quitter une partie terminée retire vraiment le joueur.
  leave(g, 'h');
  assert.equal(g.players.has('h'), false);
});

test('radio : chat par équipe, chasseurs muets si la règle le dit', () => {
  const g = setup();
  g.outbox.length = 0;
  say(g, 'h', 'Je prends le stade');
  assert.equal(g.chat.hunter.at(-1)!.text, 'Je prends le stade');
  assert.ok(!g.chat.fugitive.some(m => m.text === 'Je prends le stade'));
  g.rules.huntersCanTalk = false;
  assert.throws(() => say(g, 'h', 'test'), GameError);
  // La radio globale reste ouverte et arrive aux deux équipes.
  say(g, 'h', 'Vous ne m\'échapperez pas', 'all');
  assert.equal(g.chat.all.at(-1)!.channel, 'all');
  assert.equal(g.outbox.at(-1)!.team, 'all');
});

test('rôles : au hasard complète l\'équipe vide, erreur si impossible', () => {
  const g = createGame('ZZZZ99', { id: 'a', name: 'A', username: 'a' }, defaultRules(C));
  join(g, { id: 'b', name: 'B', username: 'b' });
  g.players.get('a')!.choice = 'hunter';
  ready(g);
  start(g);
  assert.equal(g.players.get('b')!.role, 'fugitive');

  const solo = createGame('YYYY99', { id: 'a', name: 'A', username: 'a' }, defaultRules(C));
  assert.throws(() => start(solo), /au moins un chasseur/);
});

test('entraînement : les bots bougent dans la zone', () => {
  const g = createGame('TRAIN1', { id: 'me', name: 'Moi', username: 'moi' }, defaultRules(C), true);
  g.players.get('me')!.choice = 'hunter';
  addBots(g);
  start(g);
  const bot = g.players.get('bot-2')!; // 2 bots chasseurs puis 3 fugitifs par défaut
  const before = bot.history.at(-1)!;
  tick(g, 10_000);
  moveBots(g, 10_000);
  assert.notDeepEqual(bot.history.at(-1), before);
  assert.equal(view(g, 'me')!.fugitivesTotal, 3);
});

test('zone : éliminé après 1 min dehors, compteur remis à zéro en rentrant, chasseurs prévenus', () => {
  const g = setup();
  tick(g, 3 * MIN);
  const out = { lat: C.lat + 0.01, lng: C.lng };
  updatePosition(g, 'f', out);
  tick(g, 1000);
  assert.equal(view(g, 'f')!.me.eliminateAt, g.clock + MIN);
  assert.ok(g.chat.hunter.at(-1)!.text.includes('sorti de la zone'));
  tick(g, 40_000);
  updatePosition(g, 'f', C); // rentre à temps
  tick(g, 1000);
  assert.equal(view(g, 'f')!.me.eliminateAt, null);
  updatePosition(g, 'f', out);
  tick(g, 1000);
  tick(g, 59_000);
  assert.equal(g.players.get('f')!.caughtAt, null);
  tick(g, 1000);
  assert.equal(view(g, 'f')!.me.eliminated, true);
  assert.equal(g.winner, 'hunter');
});

test('zone : alerte au bord et avant un rétrécissement qui laisserait dehors', () => {
  const g = setup();
  tick(g, 3 * MIN + 30_000); // 1er rétrécissement (420 → 366 m) dans 4 min 30
  const at = (m: number) => ({ lat: C.lat + m / 111_320, lng: C.lng });
  updatePosition(g, 'f', at(400));
  assert.equal(view(g, 'f')!.me.zoneAlert?.kind, 'edge');
  updatePosition(g, 'f', at(380));
  assert.equal(view(g, 'f')!.me.zoneAlert, null);
  tick(g, 4 * MIN); // plus que 30 s avant le rétrécissement
  assert.equal(view(g, 'f')!.me.zoneAlert?.kind, 'shrink');
});

test('zombie : un seul chasseur, le fugitif attrapé change d\'équipe', () => {
  const g = createGame('ZOMB11', { id: 'a', name: 'A', username: 'a' }, { ...defaultRules(C), mode: 'zombie' });
  for (const id of ['b', 'c']) join(g, { id, name: id.toUpperCase(), username: id });
  g.players.get('b')!.choice = 'hunter';
  ready(g);
  start(g);
  assert.deepEqual([...g.players.values()].map(p => p.role), ['fugitive', 'hunter', 'fugitive']);
  tick(g, 3 * MIN);
  capture(g, 'b', qrFor(g, g.players.get('a')!));
  const a = view(g, 'a')!;
  assert.equal(a.me.role, 'hunter');
  assert.equal(a.me.caught, false);
  assert.equal(a.fugitivesLeft, 1);
  assert.equal(a.fugitivesTotal, 2);
  assert.equal(a.mode, 'zombie');
  capture(g, 'a', qrFor(g, g.players.get('c')!)); // le converti chasse à son tour
  assert.equal(g.winner, 'hunter');
});

test('zombie en entraînement : un seul chasseur, le joueur attrapé passe chasseur', () => {
  const g = createGame('ZOMB22', { id: 'h', name: 'H', username: 'h' }, { ...defaultRules(C), mode: 'zombie', headStartMin: 0 }, true);
  g.players.get('h')!.choice = 'fugitive';
  addBots(g);
  start(g);
  const hunters = [...g.players.values()].filter(p => p.role === 'hunter');
  assert.deepEqual(hunters.map(p => p.id), ['bot-0']);
  updatePosition(g, 'h', g.players.get('bot-0')!.history.at(-1)!);
  moveBots(g, 1000);
  assert.equal(view(g, 'h')!.me.role, 'hunter');
  assert.equal(view(g, 'h')!.me.caught, false);
});

test('entraînement : nombre de bots, capture simulée, bot hors zone éliminé, radio des bots', () => {
  const rules = { ...defaultRules(C), headStartMin: 0, bots: { hunters: 1, fugitives: 4, smart: true, chatty: true } };
  const g = createGame('TRAIN2', { id: 'me', name: 'Moi', username: 'moi' }, rules, true);
  g.players.get('me')!.choice = 'hunter';
  addBots(g);
  addBots(g); // un lancement raté puis relancé ne double pas les bots
  start(g);
  updatePosition(g, 'me', C);
  assert.equal(g.players.size, 6);
  trainingCatch(g, 'me', 'catch');
  assert.equal(view(g, 'me')!.fugitivesLeft, 3);
  assert.throws(() => trainingCatch(g, 'me', 'caught'), /fugitifs/);
  sendStray(g);
  for (let i = 0; i < 400; i++) { tick(g, 1000); moveBots(g, 1000); }
  assert.ok([...g.players.values()].some(p => p.eliminated));
  assert.ok(g.chat.hunter.some(m => !m.system && m.fromName !== 'Moi'));
});

test("prêt : on ne lance pas tant qu'un joueur n'est pas prêt, l'hôte l'est d'office", () => {
  const g = createGame('REDY11', { id: 'a', name: 'A', username: 'a' }, defaultRules(C));
  join(g, { id: 'b', name: 'Bea', username: 'b' });
  join(g, { id: 'c', name: 'Cid', username: 'c' });
  assert.deepEqual(lobbyView(g).players.map(p => p.ready), [true, false, false]);
  assert.throws(() => start(g), /2 joueurs ne sont pas prêts/);
  g.players.get('b')!.ready = true;
  assert.throws(() => start(g), /Cid n'est pas prêt/);
  g.players.get('c')!.ready = true;
  start(g);
  assert.equal(g.phase, 'headstart');
});

test('sauvegarde : une partie relue depuis le JSON donne la même vue', () => {
  const g = setup();
  updatePosition(g, 'h', C);
  updatePosition(g, 'f', { lat: C.lat + 0.001, lng: C.lng });
  tick(g, 4 * MIN);
  const back = loadGame(JSON.parse(JSON.stringify(saveGame(g))));
  assert.deepEqual(view(back, 'h'), view(g, 'h'));
  assert.deepEqual(view(back, 'f'), view(g, 'f'));
  tick(back, MIN); // la partie relue continue de tourner
  assert.equal(back.clock, 5 * MIN);
});

test('retirer : un joueur banni ne peut plus revenir', () => {
  const g = createGame('KICK11', { id: 'a', name: 'A', username: 'a' }, defaultRules(C));
  join(g, { id: 'b', name: 'B', username: 'b' });
  g.banned.push('b');
  leave(g, 'b');
  assert.throws(() => join(g, { id: 'b', name: 'B', username: 'b' }), /fermé l'accès/);
});

test('pseudo : emojis et accents acceptés, caractères invisibles refusés', () => {
  for (const ok of ['Zoé 🏃', '🦊', 'Élodie', '👩‍👩‍👧']) assert.ok(DisplayName.safeParse(ok).success, ok);
  for (const ko of ['\u200B', 'abc\u202Edef', '\u0007bip', '   ']) assert.ok(!DisplayName.safeParse(ko).success, JSON.stringify(ko));
});

test('positions : un client qui inonde ne fait pas grossir son historique sans fin', () => {
  const g = setup();
  for (let i = 0; i < 5000; i++) updatePosition(g, 'f', C); // horloge figée : rien n'est purgé par l'âge
  assert.ok(g.players.get('f')!.history.length <= 401);
});

/** Salon de n joueurs (« Au hasard »), règles modifiées par `rules`, lancé. */
function many(n: number, rules: Partial<ReturnType<typeof defaultRules>> = {}): Game {
  const g = createGame('ABCD12', { id: 'p0', name: 'P0', username: 'p0' }, { ...defaultRules(C), ...rules });
  for (let i = 1; i < n; i++) join(g, { id: `p${i}`, name: `P${i}`, username: `p${i}` });
  g.players.get('p1')!.choice = 'hunter'; // ignoré dès que le nombre de chasseurs est fixé
  ready(g);
  start(g);
  return g;
}
const count = (g: Game, role: string) => [...g.players.values()].filter(p => p.role === role).length;

test('nombre de chasseurs fixé : tirés au sort, choix ignorés, au moins un fugitif', () => {
  const g = many(6, { hunters: 4 });
  assert.equal(count(g, 'hunter'), 4);
  assert.equal(g.fugitivesTotal, 2);
  assert.throws(() => many(3, { hunters: 3 }), /Trop de chasseurs/);
  const z = many(6, { mode: 'zombie', hunters: 2 });
  assert.equal(count(z, 'hunter'), 2);
});

test('dispersion : tout le monde ensemble pendant l\'avance, rôles tirés à la fin', () => {
  const g = many(6, { dispersion: true, hunters: 2 });
  assert.equal(g.phase, 'headstart');
  const v = view(g, 'p0')!;
  assert.equal(v.hidden, true);
  assert.equal(v.me.qr, null); // pas de QR tant que les rôles ne sont pas tirés
  for (const p of g.players.values()) updatePosition(g, p.id, C);
  assert.equal(view(g, 'p0')!.team.length, 6); // toute la carte se voit pareil
  leave(g, 'p5'); // un départ pendant la course ne termine pas la partie
  assert.equal(g.phase, 'headstart');
  tick(g, 3 * MIN);
  assert.equal(g.phase, 'hunt');
  assert.equal(view(g, 'p0')!.hidden, false);
  assert.equal(count(g, 'hunter'), 2);
  assert.equal(g.fugitivesTotal, 3); // le joueur parti n'est pas tiré
  assert.equal(g.players.get('p5')!.role, 'fugitive');
});

test('chasseurs montrés aux fugitifs un ping sur N, ou jamais', () => {
  const g = many(2, { huntersShownEvery: 2, hunters: 1 });
  const h = [...g.players.values()].find(p => p.role === 'hunter')!;
  const f = [...g.players.values()].find(p => p.role === 'fugitive')!;
  updatePosition(g, h.id, C);
  tick(g, 3 * MIN); // ping 1 : montré
  assert.equal(view(g, f.id)!.ping!.players[0].lat, C.lat);
  updatePosition(g, h.id, { lat: 45.901, lng: C.lng });
  tick(g, 2 * MIN); // ping 2 : caché, la position précédente reste
  assert.equal(view(g, f.id)!.ping!.players[0].lat, C.lat);
  tick(g, 2 * MIN); // ping 3 : montré à jour
  assert.equal(view(g, f.id)!.ping!.players[0].lat, 45.901);
  const never = many(2, { huntersShownEvery: 0, hunters: 1 });
  for (const p of never.players.values()) updatePosition(never, p.id, C);
  tick(never, 3 * MIN);
  const fug = [...never.players.values()].find(p => p.role === 'fugitive')!;
  assert.equal(view(never, fug.id)!.ping!.players.length, 0);
});
