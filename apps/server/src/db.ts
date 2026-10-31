import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { randomBytes, randomUUID, createHash } from 'node:crypto';

const dir = process.env.DATA_DIR ?? './data';
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(`${dir}/keeprunnin.db`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  );
`);
// WAL : les lectures (connexion de chaque joueur) ne sont jamais bloquées par une écriture.
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');

// Requêtes préparées une seule fois.
const q = {
  count: db.prepare('SELECT COUNT(*) AS n FROM users'),
  taken: db.prepare('SELECT 1 FROM users WHERE username = ?'),
  insert: db.prepare('INSERT INTO users (id, name, username, token_hash, created_at) VALUES (?, ?, ?, ?, ?)'),
  byToken: db.prepare('SELECT id, name, username FROM users WHERE token_hash = ?'),
  update: db.prepare('UPDATE users SET name = COALESCE(?, name), username = COALESCE(?, username) WHERE id = ?'),
};

export interface User { id: string; name: string; username: string }

// On ne stocke que le hash du jeton : une fuite de la base ne permet pas d'usurper un compte.
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export const userCount = () => (q.count.get() as { n: number }).n;

export function usernameTaken(username: string): boolean {
  return !!q.taken.get(username);
}

export function createUser(name: string, username: string): { user: User; token: string } | null {
  const user = { id: randomUUID(), name, username };
  const token = randomBytes(32).toString('base64url');
  try {
    q.insert.run(user.id, name, username, hash(token), Date.now());
  } catch {
    return null; // username déjà pris (contrainte UNIQUE)
  }
  return { user, token };
}

export function userByToken(token: string): User | null {
  return (q.byToken.get(hash(token)) as User | undefined) ?? null;
}

/** Renvoie false si le username est déjà pris. */
export function updateUser(id: string, patch: { name?: string; username?: string }): boolean {
  try {
    q.update.run(patch.name ?? null, patch.username ?? null, id);
    return true;
  } catch {
    return false;
  }
}
