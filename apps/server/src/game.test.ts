import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultRules, MIN, zoneRadius } from '@kr/shared';
import { type Game, GameError, capture, createGame, join, qrFor, say, start, tick, updatePosition, view } from './game.ts';
import { addBots, moveBots } from './bots.ts';

const C = { lat: 45.9, lng: 4.6 };

function setup(): Game {
  const g = createGame('ABCD12', { id: 'h', name: 'Hugo', username: 'hugo' }, defaultRules(C));
  join(g, { id: 'f', name: 'Fanny', username: 'fanny' });
  g.players.get('h')!.choice = 'hunter';
  g.players.get('f')!.choice = 'fugitive';
  start(g);
  return g;
}

test('ping : les chasseurs voient la position du fugitif 1 min avant', () => {
  const g = setup();
  updatePosition(g, 'h', C);
  // le fugitif bouge pendant l'avance (3 min)
  for (let s = 0; s < 3 * 60; s += 10) {
    updatePosition(g, 'f', { lat: C.lat + s * 1e-6, lng: C.lng });
    tick(g, 10_000);
  }
  // 1er ping à la fin de l'avance (clock = 180 s) → position à t = 120 s
  const v = view(g, 'h')!;
  assert.equal(v.phase, 'hunt');
  assert.equal(v.ping!.players.length, 1);
  assert.equal(v.ping!.players[0].t, 120_000);
  assert.ok(Math.abs(v.ping!.players[0].lat - (C.lat + 120e-6)) < 1e-9);
  // le fugitif, lui, voit le chasseur en direct
  assert.equal(view(g, 'f')!.ping!.players[0].id, 'h');
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
  assert.throws(() => capture(g, 'h', qrFor(g, f)), GameError); // encore l'avance
  tick(g, 3 * MIN);
  assert.throws(() => capture(g, 'h', `KR1:ABCD12:f:${'0'.repeat(24)}`), /invalide/);
  assert.throws(() => capture(g, 'f', qrFor(g, f)), GameError);
  capture(g, 'h', qrFor(g, f));
  assert.equal(g.phase, 'ended');
  assert.equal(g.winner, 'hunter');
});

test('fin au temps écoulé : victoire des fugitifs', () => {
  const g = setup();
  tick(g, 33 * MIN);
  assert.equal(g.winner, 'fugitive');
});

test('radio : chat par équipe, chasseurs muets si la règle le dit', () => {
  const g = setup();
  g.outbox.length = 0;
  say(g, 'h', 'Je prends le stade');
  assert.equal(g.chat.hunter.at(-1)!.text, 'Je prends le stade');
  assert.ok(!g.chat.fugitive.some(m => m.text === 'Je prends le stade'));
  g.rules.huntersCanTalk = false;
  assert.throws(() => say(g, 'h', 'test'), GameError);
});

test('rôles : au hasard complète l\'équipe vide, erreur si impossible', () => {
  const g = createGame('ZZZZ99', { id: 'a', name: 'A', username: 'a' }, defaultRules(C));
  join(g, { id: 'b', name: 'B', username: 'b' });
  g.players.get('a')!.choice = 'hunter';
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
  const bot = g.players.get('bot-1')!;
  const before = bot.history.at(-1)!;
  tick(g, 10_000);
  moveBots(g, 10_000);
  assert.notDeepEqual(bot.history.at(-1), before);
  assert.equal(view(g, 'me')!.fugitivesTotal, 4);
});
