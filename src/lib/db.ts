// Self-contained SQLite persistence for CiteRank accounts, sessions, saved
// audits and payment claims. No separate database service, no connection
// string to link between two Railway boxes — the app carries its own file.
//
// Design rule: fail closed. The single thing required is DATA_DIR pointing at
// a persistent Volume; without it the app locks itself rather than silently
// running on ephemeral storage that vanishes on the next redeploy.

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

function resolveDataDir(): string | null {
  const dir = (process.env.DATA_DIR || (import.meta as any).env?.DATA_DIR || '').trim();
  return dir || null;
}

const DATA_DIR = resolveDataDir();
export const dbEnabled = Boolean(DATA_DIR);
const DB_PATH = DATA_DIR ? path.join(DATA_DIR, 'citerank.db') : '';

// Say so loudly at boot — the only place an operator can see why accounts are
// locked is the deploy log, or the /setup page, so print the diagnosis rather
// than making them guess.
if (!dbEnabled) {
  console.error(
    [
      '',
      '='.repeat(64),
      'CiteRank: NO DATA_DIR CONFIGURED — accounts, payments and all',
      'checks are DISABLED. Visitors see "Accounts are temporarily',
      'unavailable" until this is fixed.',
      '',
      'Fix on Railway (all on the ONE web service, no second service',
      'needed):',
      '  1. Open this service -> Settings -> Volumes -> New Volume.',
      '     Set the mount path to /data.',
      '  2. Open Variables -> New Variable -> DATA_DIR = /data.',
      '  3. Redeploy.',
      '',
      'Full walkthrough: /setup   |   Machine status: /api/health',
      '='.repeat(64),
      '',
    ].join('\n'),
  );
} else {
  console.log(`CiteRank: database at ${DB_PATH} — accounts enabled.`);
}

/** Non-secret diagnostic for /api/health and /setup. */
export function dbDiagnostic() {
  return { configured: dbEnabled, dataDir: DATA_DIR, dbPath: dbEnabled ? DB_PATH : null };
}

let db: Database.Database | null = null;
let schemaReady = false;

function getDb(): Database.Database {
  if (!db) {
    mkdirSync(DATA_DIR!, { recursive: true });
    const fresh = !existsSync(DB_PATH);
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    if (fresh) console.log(`CiteRank: created new database file at ${DB_PATH}`);
  }
  return db;
}

// Full current schema, created fresh — there is no pre-existing production
// data to migrate, so this is the complete shape rather than an incremental
// ALTER-TABLE history. created_at/expires_at are stored as TEXT in the exact
// same format as JS's Date#toISOString() (strftime's %f gives the fractional
// seconds), so JS-computed timestamps and SQLite's own defaults sort and
// compare correctly as plain strings — no SQL-side now()/date_trunc needed
// anywhere in this file or its callers.
const ISO_NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

function ensureSchema(): void {
  if (schemaReady) return;
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id                INTEGER PRIMARY KEY,
      email             TEXT UNIQUE NOT NULL,
      password          TEXT NOT NULL,
      plan              TEXT NOT NULL DEFAULT 'free',
      plan_expires_at   TEXT,
      newsletter_opt_in INTEGER NOT NULL DEFAULT 1,
      free_check_used   INTEGER NOT NULL DEFAULT 0,
      credits           INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL DEFAULT ${ISO_NOW}
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token       TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL DEFAULT ${ISO_NOW},
      expires_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS audits (
      id          INTEGER PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      url         TEXT,
      host        TEXT,
      page_type   TEXT,
      overall     INTEGER,
      grade       TEXT,
      report      TEXT NOT NULL,
      meta        TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT ${ISO_NOW}
    );
    CREATE INDEX IF NOT EXISTS audits_user_idx ON audits(user_id, created_at DESC);

    -- One row per check (LLM Access Check or full audit), used to enforce the
    -- monthly Pro limit independent of whether a full report gets saved.
    CREATE TABLE IF NOT EXISTS usage_events (
      id          INTEGER PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tool        TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT ${ISO_NOW}
    );
    CREATE INDEX IF NOT EXISTS usage_events_user_idx ON usage_events(user_id, created_at DESC);

    -- Manual UPI payment claims (stopgap until Razorpay subscriptions land).
    -- A user pays via UPI, submits the transaction ref, an admin approves it.
    -- One UTR = one claim: the unique index below stops the same reference
    -- being submitted and approved more than once.
    CREATE TABLE IF NOT EXISTS payment_claims (
      id           INTEGER PRIMARY KEY,
      email        TEXT NOT NULL,
      utr          TEXT NOT NULL,
      amount       TEXT,
      note         TEXT,
      kind         TEXT NOT NULL DEFAULT 'subscription',
      credits      INTEGER,
      status       TEXT NOT NULL DEFAULT 'pending',
      created_at   TEXT NOT NULL DEFAULT ${ISO_NOW},
      reviewed_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS payment_claims_status_idx ON payment_claims(status, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS payment_claims_utr_uniq ON payment_claims (lower(trim(utr)));

    -- Password reset tokens. Single-use, short-lived; the row is deleted on
    -- use so a leaked link can't be replayed.
    CREATE TABLE IF NOT EXISTS password_resets (
      token       TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at  TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT ${ISO_NOW}
    );
    CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets(user_id);
  `);
  schemaReady = true;
}

export interface QueryResult<T> { rows: T[] }

// Postgres-style `$1, $2, ...` positional placeholders become SQLite named
// parameters `@p1, @p2, ...`, bound from an object keyed the same way.
// better-sqlite3's numbered `?1, ?2` placeholders looked like the natural
// match (same binding-by-number semantics as Postgres) but throw "Too many
// parameter values were provided" in practice — verified directly against
// the library, not assumed. Named binding does not have that problem and
// — importantly — correctly re-binds a repeated `$1` to the same value
// everywhere it appears (billing.ts's usageStatus query does this), which a
// naive left-to-right `$N -> ?` rewrite would have silently broken.
function toSqlite(text: string, params: unknown[]): { sql: string; bound: Record<string, unknown> } {
  const sql = text.replace(/\$(\d+)/g, '@p$1');
  const bound: Record<string, unknown> = {};
  params.forEach((v, i) => { bound[`p${i + 1}`] = v; });
  return { sql, bound };
}

// Run a query, ensuring the schema exists first. Throws if DATA_DIR is not
// configured. Mirrors the `{ rows }` shape the rest of the app already
// expects (it was written against `pg`'s result shape). `id` columns are
// `INTEGER PRIMARY KEY`, so SQLite mints them itself on insert exactly like
// Postgres's BIGSERIAL — no special-casing needed here.
export async function query<T = any>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
  if (!dbEnabled) throw new Error('Database is not configured (DATA_DIR is not set).');
  ensureSchema();
  const { sql, bound } = toSqlite(text, params);
  const stmt = getDb().prepare(sql);
  if (stmt.reader) {
    return { rows: (params.length ? stmt.all(bound) : stmt.all()) as T[] };
  }
  if (params.length) stmt.run(bound); else stmt.run();
  return { rows: [] };
}
