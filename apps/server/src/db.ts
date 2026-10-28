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

export interface User { id: string; name: string; username: string }

// On ne stocke que le hash du jeton : une fuite de la base ne permet pas d'usurper un compte.
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export function usernameTaken(username: string): boolean {
  return !!db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
}

export function createUser(name: string, username: string): { user: User; token: string } | null {
  const user = { id: randomUUID(), name, username };
  const token = randomBytes(32).toString('base64url');
  try {
    db.prepare('INSERT INTO users (id, name, username, token_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, name, username, hash(token), Date.now());
  } catch {
    return null; // username déjà pris (contrainte UNIQUE)
  }
  return { user, token };
}

export function userByToken(token: string): User | null {
  return (db.prepare('SELECT id, name, username FROM users WHERE token_hash = ?').get(hash(token)) as User | undefined) ?? null;
}

/** Renvoie false si le username est déjà pris. */
export function updateUser(id: string, patch: { name?: string; username?: string }): boolean {
  try {
    db.prepare('UPDATE users SET name = COALESCE(?, name), username = COALESCE(?, username) WHERE id = ?')
      .run(patch.name ?? null, patch.username ?? null, id);
    return true;
  } catch {
    return false;
  }
}
