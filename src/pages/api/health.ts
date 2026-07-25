// Deployment diagnostic. Answers the one question that has cost the most time:
// "does the running server actually see a database?" Exposes no credentials —
// only whether a connection string was resolved, which host it points at, and
// whether a real query succeeds.
import type { APIRoute } from 'astro';
import { dbEnabled, dbDiagnostic, query } from '../../lib/db';

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d, null, 2), {
    status: s,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export const GET: APIRoute = async () => {
  const db = dbDiagnostic();

  if (!dbEnabled) {
    return json(
      {
        ok: false,
        accounts: 'disabled',
        db,
        fix: 'Set DATABASE_URL on the app service. On Railway: app service → Variables → New Variable → Add Reference → select the Postgres service → DATABASE_URL, then redeploy.',
      },
      503,
    );
  }

  try {
    const r = await query<{ n: string }>('SELECT count(*)::text AS n FROM users');
    return json({ ok: true, accounts: 'enabled', db, users: Number(r.rows[0]?.n ?? 0) });
  } catch (err: any) {
    return json(
      {
        ok: false,
        accounts: 'configured but unreachable',
        db,
        error: String(err?.message || err).slice(0, 300),
      },
      503,
    );
  }
};
