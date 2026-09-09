// Saved LLM Access Check persistence — mirrors audits.ts. Best-effort: a save
// failure must never break the check response itself.

import { query, dbEnabled } from './db';

export interface CheckSummary {
  id: string; url: string | null; host: string | null;
  verdict: string | null; verdictLabel: string | null; createdAt: string;
}

export async function saveCheck(userId: string, report: any): Promise<string | null> {
  if (!dbEnabled) return null;
  try {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO checks (user_id, url, host, verdict, verdict_label, report)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, report?.url ?? null, report?.host ?? null,
        report?.overall?.level ?? null, report?.overall?.label ?? null, JSON.stringify(report)],
    );
    return String(rows[0].id);
  } catch { return null; }
}

export async function countChecksSince(userId: string, sinceIso: string): Promise<number> {
  if (!dbEnabled) return 0;
  try {
    const { rows } = await query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM checks WHERE user_id = $1 AND created_at >= $2', [userId, sinceIso],
    );
    return Number(rows[0]?.n ?? 0);
  } catch { return 0; }
}

export async function lastCheck(userId: string): Promise<CheckSummary | null> {
  if (!dbEnabled) return null;
  try {
    const { rows } = await query<any>(
      `SELECT id, url, host, verdict, verdict_label, created_at FROM checks
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [userId],
    );
    const r = rows[0];
    return r ? { id: String(r.id), url: r.url, host: r.host, verdict: r.verdict, verdictLabel: r.verdict_label, createdAt: r.created_at } : null;
  } catch { return null; }
}
