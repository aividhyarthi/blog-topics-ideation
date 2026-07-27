// Saved-audit persistence. Best-effort: a save failure must never break the
// audit response itself — the report is returned regardless.

import { query, dbEnabled } from './db';

export interface AuditSummary {
  id: string; url: string | null; host: string | null; pageType: string | null;
  overall: number | null; grade: string | null; createdAt: string;
}

export async function saveAudit(userId: string, report: any, meta: any): Promise<string | null> {
  if (!dbEnabled) return null;
  try {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO audits (user_id, url, host, page_type, overall, grade, report, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [userId, meta?.url ?? null, meta?.host ?? null, meta?.pageTypeLabel ?? null,
        report?.overall ?? null, report?.grade ?? null, JSON.stringify(report), JSON.stringify(meta)],
    );
    return String(rows[0].id);
  } catch { return null; }
}

export async function listAudits(userId: string, limit = 25): Promise<AuditSummary[]> {
  const { rows } = await query<any>(
    `SELECT id, url, host, page_type, overall, grade, created_at
     FROM audits WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`, [userId, limit],
  );
  return rows.map((r) => ({
    id: String(r.id), url: r.url, host: r.host, pageType: r.page_type,
    overall: r.overall, grade: r.grade, createdAt: r.created_at,
  }));
}

export async function getAudit(userId: string, id: string): Promise<{ report: any; meta: any } | null> {
  const { rows } = await query<any>(
    'SELECT report, meta FROM audits WHERE id = $1 AND user_id = $2', [id, userId],
  );
  // report/meta are stored as JSON text (no native JSONB column here), so they
  // need an explicit parse back into objects on the way out.
  return rows[0] ? { report: JSON.parse(rows[0].report), meta: JSON.parse(rows[0].meta) } : null;
}
