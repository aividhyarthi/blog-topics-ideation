// Daily rank-report email — sent by the nightly scheduler (see nightly.ts)
// once a day, right after an app's check completes, to whatever addresses
// are saved in that app's `reportEmails` field. Sent via Resend's plain HTTP
// API (no SDK dependency) — see the comment on RESEND_API_KEY in
// src/lib/saas/plans.ts for how to turn this on.
import { BRAND, SITE_URL, RESEND_API_KEY, REPORT_FROM_EMAIL } from '../saas/plans';
import type { TrackedApp, KeywordTrend } from './types';
import type { OverviewDay } from './track';
import { countsFromBuckets } from './track';

let warnedNoKey = false;

/** Comma-separated → trimmed, deduped, plausible-looking email addresses. */
export function parseReportEmails(raw?: string): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const email = part.trim().toLowerCase();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) seen.add(email);
  }
  return [...seen];
}

const arrow = (delta: number) => (delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${-delta}` : '＝ 0');
const fmtDelta = (cur: number, prev: number | null) => (prev == null ? '' : ` (${arrow(cur - prev)})`);

/** Builds the subject + HTML body for one app's daily report. */
export function buildDailyReportEmail(
  app: TrackedApp,
  today: OverviewDay,
  yesterday: OverviewDay | null,
  trends: KeywordTrend[],
): { subject: string; html: string } {
  const dateLabel = new Date(`${today.dateKey}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const counts = countsFromBuckets(today.buckets);
  const prevCounts = yesterday ? countsFromBuckets(yesterday.buckets) : null;

  const movers = trends
    .filter((t) => t.delta != null && t.delta !== 0)
    .sort((a, b) => (b.delta as number) - (a.delta as number));
  const gainers = movers.filter((t) => (t.delta as number) > 0).slice(0, 5);
  const droppers = movers.filter((t) => (t.delta as number) < 0).slice(-5).reverse();

  const moverRow = (t: KeywordTrend) =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${esc(t.keyword)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${t.prevPosition ?? '–'} → ${t.position ?? '–'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-weight:700;color:${(t.delta as number) > 0 ? '#0a8a5f' : '#c0392b'};">${arrow(t.delta as number)}</td></tr>`;

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#16181d;">
  <div style="font-size:13px;color:#6b7280;margin-bottom:4px;">${esc(BRAND)} · Daily Rank Report · ${dateLabel}</div>
  <h1 style="font-size:20px;margin:0 0 18px;letter-spacing:-0.01em;">${esc(app.title)}</h1>

  <table style="border-collapse:collapse;width:100%;margin-bottom:20px;">
    <tr>
      <td style="padding:10px 14px;background:#f8f9fb;border-radius:10px 0 0 10px;text-align:center;">
        <div style="font-size:22px;font-weight:800;">${counts.top1}</div>
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Top 1${fmtDelta(counts.top1, prevCounts?.top1 ?? null)}</div>
      </td>
      <td style="padding:10px 14px;background:#f8f9fb;text-align:center;">
        <div style="font-size:22px;font-weight:800;">${counts.top10}</div>
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Top 10${fmtDelta(counts.top10, prevCounts?.top10 ?? null)}</div>
      </td>
      <td style="padding:10px 14px;background:#f8f9fb;text-align:center;">
        <div style="font-size:22px;font-weight:800;">${counts.top30}</div>
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Top 30${fmtDelta(counts.top30, prevCounts?.top30 ?? null)}</div>
      </td>
      <td style="padding:10px 14px;background:#f8f9fb;border-radius:0 10px 10px 0;text-align:center;">
        <div style="font-size:22px;font-weight:800;">${counts.top100}</div>
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Top 100${fmtDelta(counts.top100, prevCounts?.top100 ?? null)}</div>
      </td>
    </tr>
  </table>

  <div style="font-size:13.5px;color:#6b7280;margin-bottom:20px;">
    Search Visibility Score: <b style="color:#16181d;">${today.visibility}</b>${yesterday ? ` (${arrow(Math.round((today.visibility - yesterday.visibility) * 10) / 10)})` : ''}
    · ${today.tracked} keyword${today.tracked === 1 ? '' : 's'} tracked
  </div>

  ${gainers.length ? `
  <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#0a8a5f;margin-bottom:6px;">Biggest gains</div>
  <table style="border-collapse:collapse;width:100%;margin-bottom:18px;font-size:13.5px;">${gainers.map(moverRow).join('')}</table>` : ''}

  ${droppers.length ? `
  <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#c0392b;margin-bottom:6px;">Biggest drops</div>
  <table style="border-collapse:collapse;width:100%;margin-bottom:18px;font-size:13.5px;">${droppers.map(moverRow).join('')}</table>` : ''}

  <a href="${SITE_URL}/rank" style="display:inline-block;background:#4338ca;color:#fff;text-decoration:none;font-weight:700;font-size:13.5px;padding:10px 16px;border-radius:8px;margin-top:6px;">Open full dashboard →</a>
  <div style="font-size:11.5px;color:#9ca3af;margin-top:24px;">You're receiving this because your email is on this app's report list in ${esc(BRAND)}. Remove it any time from the app's settings.</div>
</div>`.trim();

  return { subject: `${app.title} — daily rank report (${dateLabel})`, html };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Sends via Resend. No-op (logs once) if RESEND_API_KEY isn't set. */
export async function sendReportEmail(to: string[], subject: string, html: string): Promise<void> {
  if (!to.length) return;
  if (!RESEND_API_KEY) {
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.warn('[email] RESEND_API_KEY is not set — daily rank report emails are configured but will not be sent until it is. See plans.ts.');
    }
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: REPORT_FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}
