import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { z } from 'zod';
import { C2S, START_COUNTDOWN_MS, Register, UpdateMe, Username, type Role } from '@kr/shared';
import * as db from './db.ts';
import {
  type Game, GameError, capture, createGame, endNow, join, leave, lobbyView, ping, say, start,
  tick, updatePosition, view,
} from './game.ts';
import { addBots, moveBots, sendStray, trainingCatch } from './bots.ts';

const PORT = Number(process.env.PORT ?? 3000);
const TRAINING_GRACE_MS = 2 * 60_000;

// ---------- Logs ----------
// Une ligne par événement : « 2026-10-28T22:10:00.000Z [partie] lancée code=TACO42 joueurs=5 ».
// Pas de positions (trop de bruit) ni de contenu radio (vie privée).
function log(tag: string, msg: string, fields: Record<string, unknown> = {}) {
  const kv = Object.entries(fields).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`${new Date().toISOString()} [${tag}] ${msg}${kv ? ' ' + kv : ''}`);
}

/** IP réelle du client derrière NPMPlus (X-Forwarded-For / X-Real-IP), sinon l'adresse TCP. */
function clientIp(headers: IncomingMessage['headers'], fallback?: string) {
  const fwd = headers['x-forwarded-for'];
  return (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0].trim() || (headers['x-real-ip'] as string | undefined) || fallback || '?';
}

const at = (u: { username: string }) => `@${u.username}`;

// ---------- HTTP : santé + comptes ----------

async function body(req: IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new Error('too large');
  }
  return JSON.parse(raw || '{}');
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data));
}

/** Version servie par /health et /version : permet de vérifier qu'une mise à jour est bien déployée. */
const VERSION = {
  version: JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version as string,
  commit: process.env.COMMIT || 'dev',      // injecté au build de l'image Docker
  builtAt: process.env.BUILT_AT || null,
  startedAt: new Date().toISOString(),
};

const bearer = (req: IncomingMessage) => req.headers.authorization?.replace(/^Bearer /, '') ?? '';

const http = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, ...VERSION });
    if (req.method === 'GET' && url.pathname === '/version') return send(res, 200, VERSION);

    const m = url.pathname.match(/^\/username\/([^/]+)$/);
    if (req.method === 'GET' && m) {
      const u = Username.safeParse(m[1]);
      return send(res, 200, { available: u.success && !db.usernameTaken(u.data) });
    }

    if (req.method === 'POST' && url.pathname === '/auth/register') {
      const p = Register.safeParse(await body(req));
      if (!p.success) return send(res, 400, { error: 'Nom ou username invalide.' });
      const r = db.createUser(p.data.name, p.data.username);
      log('compte', r ? 'inscription' : 'inscription refusée (pseudo pris)', { user: '@' + p.data.username, ip: clientIp(req.headers, req.socket.remoteAddress) });
      return r ? send(res, 201, r) : send(res, 409, { error: 'Ce nom d’utilisateur est déjà pris.' });
    }

    if (url.pathname === '/me') {
      const user = db.userByToken(bearer(req));
      if (!user) return send(res, 401, { error: 'Non connecté.' });
      if (req.method === 'GET') return send(res, 200, user);
      if (req.method === 'PATCH') {
        const p = UpdateMe.safeParse(await body(req));
        if (!p.success) return send(res, 400, { error: 'Valeur invalide.' });
        if (!db.updateUser(user.id, p.data)) return send(res, 409, { error: 'Ce nom d’utilisateur est déjà pris.' });
        log('compte', 'profil modifié', { user: at(user), nom: p.data.name, pseudo: p.data.username && '@' + p.data.username });
        return send(res, 200, { ...user, ...p.data });
      }
    }
    if (!url.pathname.startsWith('/socket.io')) log('http', 'introuvable', { status: 404, method: req.method, path: url.pathname, ip: clientIp(req.headers, req.socket.remoteAddress) });
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    log('http', 'requête invalide', { status: 400, method: req.method, path: req.url, ip: clientIp(req.headers, req.socket.remoteAddress), erreur: (e as Error).message });
    send(res, 400, { error: 'Requête invalide.' });
  }
});

// ---------- Temps réel ----------

const io = new Server(http, { cors: { origin: '*' } });
// ponytail: parties en mémoire, un redémarrage tue les parties en cours → persister/Redis si besoin multi-instance.
const games = new Map<string, Game>();
const userGame = new Map<string, string>(); // userId → code
const endedAt = new Map<string, number>();  // code → Date.now() de fin

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function newCode(): string {
  for (;;) {
    const c = Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('')
      + String(Math.floor(Math.random() * 90) + 10);
    if (!games.has(c)) return c;
  }
}

const humans = (g: Game, team?: Role) =>
  [...g.players.values()].filter(p => !p.isBot && !p.left && (!team || p.role === team));

function broadcastLobby(g: Game) {
  for (const p of humans(g)) io.to(`u:${p.id}`).emit('lobby', lobbyView(g));
}

function broadcastState(g: Game) {
  for (const { team, msg } of g.outbox.splice(0)) {
    for (const p of humans(g, team === 'all' ? undefined : team)) io.to(`u:${p.id}`).emit('chat', msg);
  }
  for (const p of humans(g)) {
    const v = view(g, p.id);
    if (v) io.to(`u:${p.id}`).emit('state', v);
  }
}

/** Historique radio d'un joueur : son équipe + la radio globale, dans l'ordre. */
const history = (g: Game, role: Role) => [...g.chat[role], ...g.chat.all].sort((a, b) => a.at - b.at);

function sendEverything(socket: Socket, g: Game, userId: string) {
  socket.emit('lobby', lobbyView(g));
  const role = g.players.get(userId)?.role;
  if (role) socket.emit('chat:history', history(g, role));
  const v = view(g, userId);
  if (v) socket.emit('state', v);
}

function leaveCurrent(userId: string) {
  const code = userGame.get(userId);
  const g = code && games.get(code);
  userGame.delete(userId);
  if (!g) return;
  const leaver = g.players.get(userId);
  leave(g, userId);
  log('partie', 'joueur parti', { code: g.code, user: leaver ? at(leaver) : userId, phase: g.phase });
  if (!humans(g).length || g.training) {
    games.delete(g.code);
    lastSeen.delete(g.code);
    log('partie', 'supprimée (plus de joueurs)', { code: g.code });
  } else broadcastLobby(g);
}

type Ack = (r: object) => void;

io.use((socket, next) => {
  const user = db.userByToken(String(socket.handshake.auth?.token ?? ''));
  if (!user) {
    log('connexion', 'refusée (jeton inconnu)', { ip: clientIp(socket.handshake.headers, socket.handshake.address) });
    return next(new Error('unauthorized'));
  }
  socket.data.user = user;
  next();
});

io.on('connection', (socket) => {
  const user = socket.data.user as db.User;
  socket.join(`u:${user.id}`);

  const resume = games.get(userGame.get(user.id) ?? '');
  // Le client garde son état pendant une coupure : on lui dit explicitement s'il n'a plus de partie.
  if (resume) sendEverything(socket, resume, user.id); else socket.emit('nogame');
  log('connexion', 'connecté', { user: at(user), ip: clientIp(socket.handshake.headers, socket.handshake.address), reprise: resume?.code });
  socket.on('disconnect', reason => {
    log('connexion', 'déconnecté', { user: at(user), raison: reason, partie: userGame.get(user.id) });
    // Un entraînement n'a qu'un joueur : s'il ne revient pas (app fermée), on le supprime.
    // Délai de grâce pour une simple coupure réseau (tunnel, mode avion).
    const code = userGame.get(user.id);
    if (!games.get(code ?? '')?.training) return;
    setTimeout(() => {
      if (userGame.get(user.id) === code && !io.sockets.adapter.rooms.get(`u:${user.id}`)?.size) leaveCurrent(user.id);
    }, TRAINING_GRACE_MS).unref();
  });

  /** Valide l'entrée avec zod, convertit les GameError en { error } pour le client. */
  function on<S extends z.ZodType>(ev: string, schema: S, fn: (data: z.infer<S>, g: Game | undefined) => object | void) {
    socket.on(ev, (raw: unknown, ack?: Ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const p = schema.safeParse(raw ?? {});
      if (!p.success) return reply({ error: 'Données invalides.' });
      try {
        reply({ ok: true, ...(fn(p.data, games.get(userGame.get(user.id) ?? '')) ?? {}) });
      } catch (e) {
        if (e instanceof GameError) {
          log('refus', e.message, { user: at(user), action: ev });
          return reply({ error: e.message });
        }
        log('erreur', (e as Error).message, { user: at(user), action: ev });
        console.error(e);
        reply({ error: 'Erreur serveur.' });
      }
    });
  }

  const need = (g: Game | undefined): Game => { if (!g) throw new GameError("Tu n'es dans aucune partie."); return g; };
  const host = (g: Game | undefined): Game => {
    const x = need(g);
    if (x.hostId !== user.id) throw new GameError("Seul l'hôte peut faire ça.");
    return x;
  };

  on('create', C2S.create, ({ rules, training }) => {
    leaveCurrent(user.id);
    const g = createGame(newCode(), user, rules, training);
    games.set(g.code, g);
    userGame.set(user.id, g.code);
    broadcastLobby(g);
    log('partie', training ? 'entraînement créé' : 'salon créé', { code: g.code, hote: at(user) });
    return { code: g.code };
  });

  on('join', C2S.join, ({ code }) => {
    const g = games.get(code);
    if (!g || g.training) throw new GameError('Aucune partie avec ce code.');
    if (userGame.get(user.id) !== code) leaveCurrent(user.id);
    join(g, user);
    userGame.set(user.id, code);
    log('partie', 'joueur arrivé', { code, user: at(user), joueurs: humans(g).length });
    broadcastLobby(g);
    sendEverything(socket, g, user.id);
    return { code };
  });

  socket.on('leave', (_: unknown, ack?: Ack) => { leaveCurrent(user.id); ack?.({ ok: true }); });

  on('rules', C2S.rules, (rules, g) => {
    const x = host(g);
    if (x.phase !== 'lobby') throw new GameError('La partie a déjà commencé.');
    x.rules = rules;
    broadcastLobby(x);
  });

  on('role', C2S.role, ({ role }, g) => {
    const x = need(g);
    if (x.phase !== 'lobby') throw new GameError('La partie a déjà commencé.');
    x.players.get(user.id)!.choice = role;
    broadcastLobby(x);
  });

  on('start', C2S.empty, (_, g) => {
    const x = host(g);
    if (x.training) addBots(x);
    start(x);
    x.startAt = Date.now() + START_COUNTDOWN_MS;
    lastSeen.set(x.code, { phase: x.phase, pingAt: null });
    const team = (r: Role) => [...x.players.values()].filter(p => p.role === r).map(p => (p.isBot ? p.name : at(p))).join(',');
    log('partie', x.training ? 'entraînement lancé' : 'lancée', {
      code: x.code, chasseurs: team('hunter'), fugitifs: team('fugitive'), duree: `${x.rules.durationMin}min`,
      mode: x.rules.mode, avance: `${x.rules.headStartMin}min`, pings: `${x.rules.pingEveryMin}min`, zone: x.rules.zone.enabled ? `${x.rules.zone.startRadiusM}m` : 'non',
    });
    broadcastLobby(x);
    for (const p of humans(x)) io.to(`u:${p.id}`).emit('chat:history', history(x, p.role!));
    x.outbox.length = 0; // déjà envoyé dans l'historique
    broadcastState(x);
  });

  on('pos', C2S.pos, (pos, g) => {
    if (g && g.phase !== 'ended') updatePosition(g, user.id, pos);
  });

  on('capture', C2S.capture, ({ qr }, g) => {
    const x = need(g);
    const target = capture(x, user.id, qr);
    log('partie', 'capture', { code: x.code, chasseur: at(user), fugitif: at(target), restants: fugitivesLeft(x) });
    broadcastState(x);
    // Zombie : le fugitif devenu chasseur reçoit la radio de sa nouvelle équipe (après le broadcast, sinon doublons).
    if (target.role === 'hunter') io.to(`u:${target.id}`).emit('chat:history', history(x, 'hunter'));
  });

  on('chat', C2S.chat, ({ text, channel }, g) => {
    const x = need(g);
    say(x, user.id, text, channel);
    broadcastState(x);
  });

  on('training', C2S.training, (cmd, g) => {
    const x = host(g);
    if (!x.training) throw new GameError("Réservé au mode entraînement.");
    if (x.phase === 'lobby' || x.phase === 'ended') throw new GameError('La manche est terminée.');
    log('entraînement', cmd.action, { code: x.code, user: at(user), vitesse: cmd.action === 'speed' ? cmd.value : undefined });
    switch (cmd.action) {
      case 'ping': ping(x); break;
      case 'advance': { const before = x.clock; tick(x, 60_000 / x.speed); moveBots(x, x.clock - before); break; }
      case 'speed': x.speed = cmd.value; break;
      case 'end': endNow(x); break;
      case 'catch': case 'caught': trainingCatch(x, user.id, cmd.action); break;
      case 'stray': sendStray(x); break;
    }
    broadcastState(x);
  });
});

// ---------- Boucle de jeu ----------

const fugitivesLeft = (g: Game) => [...g.players.values()].filter(p => p.role === 'fugitive' && p.caughtAt === null).length;

/** Dernier état connu de chaque partie lancée, pour loguer ses changements (chasse lancée, ping, fin). */
const lastSeen = new Map<string, { phase: string; pingAt: number | null }>();

function logChanges(g: Game) {
  const prev = lastSeen.get(g.code);
  if (!prev) return;
  if (g.lastPing && g.lastPing.at !== prev.pingAt) {
    log('partie', 'ping', { code: g.code, minute: Math.round(g.clock / 60_000), fugitifs_vus: g.lastPing.forHunters.length });
  }
  if (g.phase !== prev.phase && g.phase === 'hunt') log('partie', 'chasse lancée', { code: g.code });
  if (g.phase !== prev.phase && g.phase === 'ended') {
    log('partie', 'terminée', { code: g.code, gagnant: g.winner === 'hunter' ? 'chasseurs' : 'fugitifs', duree: `${Math.round(g.clock / 60_000)}min`, fugitifs_libres: fugitivesLeft(g) });
  }
  lastSeen.set(g.code, { phase: g.phase, pingAt: g.lastPing?.at ?? null });
}

let last = performance.now();
setInterval(() => {
  const now = performance.now(), dt = now - last;
  last = now;
  for (const g of games.values()) {
    if (g.phase === 'lobby') continue;
    if (g.phase === 'ended') {
      if (!endedAt.has(g.code)) endedAt.set(g.code, Date.now());
      else if (Date.now() - endedAt.get(g.code)! > 10 * 60_000) {
        games.delete(g.code);
        endedAt.delete(g.code);
        lastSeen.delete(g.code);
        log('partie', 'nettoyée (terminée depuis 10 min)', { code: g.code });
        for (const p of humans(g)) if (userGame.get(p.id) === g.code) userGame.delete(p.id);
        continue;
      }
    }
    // Décompte de lancement : rien ne bouge, puis on ne compte que le temps écoulé après le départ.
    let step = dt;
    if (g.startAt) {
      const over = Date.now() - g.startAt;
      if (over < 0) continue;
      g.startAt = undefined;
      step = Math.min(dt, over);
    }
    const before = g.clock;
    tick(g, step);
    if (g.training) moveBots(g, g.clock - before);
    logChanges(g);
    broadcastState(g);
  }
}, 1000);

// Bilan toutes les 10 min : de quoi vérifier d'un coup d'œil que le serveur vit.
setInterval(() => {
  const list = [...games.values()];
  log('bilan', 'état', {
    connectes: io.engine.clientsCount, salons: list.filter(g => g.phase === 'lobby').length,
    parties_en_cours: list.filter(g => g.phase === 'headstart' || g.phase === 'hunt').length, comptes: db.userCount(),
  });
}, 10 * 60_000);

http.listen(PORT, () => log('serveur', 'démarré', { version: VERSION.version, commit: VERSION.commit, port: PORT, donnees: process.env.DATA_DIR ?? './data', comptes: db.userCount(), node: process.version }));
