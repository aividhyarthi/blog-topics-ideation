// Thin Postgres layer for CiteRank accounts + saved audits.
//
// Design rule: EVERYTHING degrades gracefully. If DATABASE_URL is not set, the
// whole app runs exactly as before — anonymous, nothing saved — so the tool
// never breaks just because the database hasn't been provisioned yet.

import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || (import.meta as any).env?.DATABASE_URL;

export const dbEnabled = Boolean(DATABASE_URL);

let pool: pg.Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const isLocal = /localhost|127\.0\.0\.1/.test(DATABASE_URL || '');
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      // Railway/managed Postgres needs SSL; local does not.
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

// Idempotent schema bootstrap — runs once per process, no migration tooling.
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const p = getPool();
      await p.query(`
        CREATE TABLE IF NOT EXISTS users (
          id           BIGSERIAL PRIMARY KEY,
          email        TEXT UNIQUE NOT NULL,
          password     TEXT NOT NULL,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token        TEXT PRIMARY KEY,
          user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          expires_at   TIMESTAMPTZ NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audits (
          id           BIGSERIAL PRIMARY KEY,
          user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          url          TEXT,
          host         TEXT,
          page_type    TEXT,
          overall      INTEGER,
          grade        TEXT,
          report       JSONB NOT NULL,
          meta         JSONB NOT NULL,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS audits_user_idx ON audits(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

        ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;
        -- Every signup is auto-subscribed to the newsletter (DEFAULT true applies
        -- to existing rows too). No unsubscribe UI yet — add one before sending
        -- real newsletters so this stays compliant.
        ALTER TABLE users ADD COLUMN IF NOT EXISTS newsletter_opt_in BOOLEAN NOT NULL DEFAULT true;

        -- Every URL check (LLM Access Check or full audit), used to enforce the
        -- monthly plan limit — independent of whether a full report gets saved.
        CREATE TABLE IF NOT EXISTS usage_events (
          id           BIGSERIAL PRIMARY KEY,
          user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          tool         TEXT NOT NULL,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS usage_events_user_idx ON usage_events(user_id, created_at DESC);

        -- Manual UPI payment claims (stopgap until Razorpay subscriptions land).
        -- A user pays via UPI, submits the transaction ref, and an admin approves it.
        CREATE TABLE IF NOT EXISTS payment_claims (
          id           BIGSERIAL PRIMARY KEY,
          email        TEXT NOT NULL,
          utr          TEXT NOT NULL,
          amount       TEXT,
          note         TEXT,
          status       TEXT NOT NULL DEFAULT 'pending',
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          reviewed_at  TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS payment_claims_status_idx ON payment_claims(status, created_at DESC);
      `);
    })().catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

// Run a query, ensuring the schema exists first. Throws if DB is not configured.
export async function query<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []): Promise<pg.QueryResult<T>> {
  if (!dbEnabled) throw new Error('Database is not configured (DATABASE_URL is not set).');
  await ensureSchema();
  return getPool().query<T>(text, params as any[]);
}
