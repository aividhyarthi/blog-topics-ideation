// Thin Postgres layer for CiteRank accounts + saved audits.
//
// Design rule: the tool FAILS CLOSED. If no database is configured, nobody can
// sign up, so nobody can log in, so the tool must be locked — not open to
// everyone. (It used to degrade to anonymous access, which meant a missing
// DATABASE_URL silently unlocked the entire paid product.)

import pg from 'pg';

// Railway/Render/Heroku/Supabase all name this differently, and Railway's
// Postgres plugin also injects the discrete PG* vars. Accept every common
// spelling so the app doesn't sit there "unconfigured" next to a live database.
function resolveDatabaseUrl(): string | null {
  const env: Record<string, string | undefined> = {
    ...((import.meta as any).env || {}),
    ...process.env,
  };
  const direct =
    env.DATABASE_URL ||
    env.POSTGRES_URL ||
    env.POSTGRESQL_URL ||
    env.PG_URL ||
    env.DATABASE_PRIVATE_URL ||
    env.DATABASE_PUBLIC_URL;
  if (direct && direct.trim()) return direct.trim();

  // Fall back to assembling one from the discrete parts.
  const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT } = env;
  if (PGHOST && PGUSER && PGDATABASE) {
    const auth = PGPASSWORD
      ? `${encodeURIComponent(PGUSER)}:${encodeURIComponent(PGPASSWORD)}`
      : encodeURIComponent(PGUSER);
    return `postgresql://${auth}@${PGHOST}:${PGPORT || 5432}/${PGDATABASE}`;
  }
  return null;
}

const DATABASE_URL = resolveDatabaseUrl();

export const dbEnabled = Boolean(DATABASE_URL);

// Say so loudly at boot. Without a database the entire product is disabled, and
// the only place an operator can see why is the deploy log — so print the
// diagnosis there rather than making them guess from a locked page. Env var
// NAMES only; never values.
if (!dbEnabled) {
  const seen = Object.keys(process.env)
    .filter((k) => /^(PG|DATABASE|POSTGRES|RAILWAY)/i.test(k))
    .sort();
  console.error(
    [
      '',
      '='.repeat(64),
      'CiteRank: NO DATABASE CONFIGURED — accounts, payments and all',
      'checks are DISABLED. The site will show "Accounts are temporarily',
      'unavailable" to every visitor until this is fixed.',
      '',
      'Looked for: DATABASE_URL, POSTGRES_URL, POSTGRESQL_URL, PG_URL,',
      '            DATABASE_PRIVATE_URL, DATABASE_PUBLIC_URL,',
      '            or PGHOST + PGUSER + PGDATABASE',
      '',
      seen.length
        ? `Database-ish variables this container CAN see: ${seen.join(', ')}`
        : 'This container can see NO database-related variables at all.',
      '',
      'Fix on Railway: open the APP service (not the database) →',
      'Variables → New Variable → Add Reference → pick the Postgres',
      'service → DATABASE_URL → Add → redeploy.',
      'Adding Postgres to the project does NOT set this by itself.',
      '',
      'Verify afterwards at /api/health',
      '='.repeat(64),
      '',
    ].join('\n'),
  );
} else {
  let where = 'unknown host';
  try { where = new URL(DATABASE_URL!).host; } catch { /* ignore */ }
  console.log(`CiteRank: database configured (${where}) — accounts enabled.`);
}

/** Non-secret diagnostic for /api/health — never exposes credentials. */
export function dbDiagnostic() {
  let host: string | null = null;
  if (DATABASE_URL) {
    try {
      host = new URL(DATABASE_URL).host;
    } catch {
      host = 'unparseable';
    }
  }
  return {
    configured: dbEnabled,
    host,
    checkedVars: [
      'DATABASE_URL',
      'POSTGRES_URL',
      'POSTGRESQL_URL',
      'PG_URL',
      'DATABASE_PRIVATE_URL',
      'DATABASE_PUBLIC_URL',
      'PGHOST+PGUSER+PGDATABASE',
    ],
  };
}

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
        -- One free trial check per account (lifetime, not monthly) + a balance
        -- of purchased one-time check credits that never expire.
        ALTER TABLE users ADD COLUMN IF NOT EXISTS free_check_used BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 0;
        -- A payment claim is either a monthly-plan payment or a one-time credit
        -- pack purchase; 'credits' records how many checks to grant on approval.
        ALTER TABLE payment_claims ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'subscription';
        ALTER TABLE payment_claims ADD COLUMN IF NOT EXISTS credits INTEGER;

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

        -- Password reset tokens. Single-use, short-lived; the row is deleted on
        -- use so a leaked link can't be replayed.
        CREATE TABLE IF NOT EXISTS password_resets (
          token        TEXT PRIMARY KEY,
          user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at   TIMESTAMPTZ NOT NULL,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets(user_id);
      `);

      // One UTR = one claim. Without this the same payment reference can be
      // submitted repeatedly and approved more than once, minting free credits.
      // Existing duplicates are collapsed first so the index can be created on
      // databases that already have them.
      try {
        await p.query(`
          DELETE FROM payment_claims a USING payment_claims b
          WHERE a.id > b.id AND lower(trim(a.utr)) = lower(trim(b.utr));
        `);
        await p.query(`CREATE UNIQUE INDEX IF NOT EXISTS payment_claims_utr_uniq ON payment_claims (lower(trim(utr)));`);
      } catch { /* non-fatal: createClaim also checks explicitly */ }
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
