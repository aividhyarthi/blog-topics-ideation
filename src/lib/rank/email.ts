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

  <a href="${SITE_URL}/rank" style="display:inline-block;background:#16181d;color:#fff;text-decoration:none;font-weight:700;font-size:13.5px;padding:10px 16px;border-radius:8px;margin-top:6px;">Open full dashboard →</a>
  <div style="font-size:11.5px;color:#9ca3af;margin-top:24px;">You're receiving this because your email is on this app's report list in ${esc(BRAND)}. Remove it any time from the app's settings.</div>
</div>`.trim();

  return { subject: `${app.title} — daily rank report (${dateLabel})`, html };
}

/**
 * Rank-drop alert: sent by the nightly check ONLY when a daily-tracked
 * keyword that was inside the app's alertTopN yesterday is outside it
 * today. Deliberately short and single-purpose — an alert that looks like
 * yet another report gets skimmed; one that names exactly what broke gets
 * acted on.
 */
export function buildRankAlertEmail(
  app: TrackedApp,
  drops: KeywordTrend[],
  topN: number,
): { subject: string; html: string } {
  const rows = drops.map((t) =>
    `<tr><td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-weight:600;">${esc(t.keyword)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;">#${t.prevPosition} → ${t.position != null ? `#${t.position}` : 'out of results'}</td></tr>`).join('');
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#16181d;">
  <div style="font-size:13px;color:#c0392b;font-weight:700;margin-bottom:4px;">⚠ ${esc(BRAND)} rank alert</div>
  <h1 style="font-size:19px;margin:0 0 12px;letter-spacing:-0.01em;">${esc(app.title)}: ${drops.length} keyword${drops.length === 1 ? '' : 's'} dropped out of the top ${topN}</h1>
  <table style="border-collapse:collapse;width:100%;margin-bottom:18px;font-size:13.5px;">
    <tr><th style="text-align:left;padding:7px 10px;border-bottom:2px solid #e5e7eb;font-size:11px;text-transform:uppercase;color:#6b7280;">Keyword</th>
        <th style="text-align:left;padding:7px 10px;border-bottom:2px solid #e5e7eb;font-size:11px;text-transform:uppercase;color:#6b7280;">Yesterday → today</th></tr>
    ${rows}
  </table>
  <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">A one-day dip can be normal store noise — but if the same keyword is still down tomorrow, it's a real move worth investigating (listing change, competitor push, or review-score slide).</div>
  <a href="${SITE_URL}/rank" style="display:inline-block;background:#16181d;color:#fff;text-decoration:none;font-weight:700;font-size:13.5px;padding:10px 16px;border-radius:8px;">See the full picture →</a>
  <div style="font-size:11.5px;color:#9ca3af;margin-top:24px;">Alerts use the same recipient list as this app's daily report — manage both in the app's settings in ${esc(BRAND)}.</div>
</div>`.trim();
  return { subject: `⚠ ${app.title}: ${drops.length} keyword${drops.length === 1 ? '' : 's'} dropped out of the top ${topN}`, html };
}

export interface WeeklyDigestData {
  weekStartLabel: string; // e.g. "8 Jul"
  weekEndLabel: string;   // e.g. "14 Jul"
  visibilityNow: number;
  visibilityWeekAgo: number | null;
  counts: { top1: number; top10: number; top30: number; top100: number };
  countsWeekAgo: { top1: number; top10: number; top30: number; top100: number } | null;
  /** Position now vs ~7 days ago, only keywords that actually moved. */
  weeklyMovers: { keyword: string; from: number | null; to: number | null; delta: number }[];
  universeNow: number | null;
  universeWeekAgo: number | null;
}

/**
 * Weekly digest: the Monday-morning "how did the week go" story, built for
 * forwarding — an app owner's client or boss should be able to read it in
 * 20 seconds without opening the dashboard. Same recipient list as the
 * daily report; sent once per IST-Monday by the nightly check.
 */
export function buildWeeklyDigestEmail(app: TrackedApp, d: WeeklyDigestData): { subject: string; html: string } {
  const visDelta = d.visibilityWeekAgo != null ? Math.round((d.visibilityNow - d.visibilityWeekAgo) * 10) / 10 : null;
  const gainers = d.weeklyMovers.filter((m) => m.delta > 0).slice(0, 5);
  const droppers = d.weeklyMovers.filter((m) => m.delta < 0).slice(0, 5);
  const stat = (label: string, now: number, before: number | null) => `
    <td style="padding:10px 14px;background:#f8f9fb;text-align:center;">
      <div style="font-size:22px;font-weight:800;">${now}</div>
      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">${label}${before != null ? ` (${arrow(now - before)})` : ''}</div>
    </td>`;
  const moverRow = (m: WeeklyDigestData['weeklyMovers'][number]) =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${esc(m.keyword)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${m.from != null ? `#${m.from}` : '–'} → ${m.to != null ? `#${m.to}` : '–'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-weight:700;color:${m.delta > 0 ? '#0a8a5f' : '#c0392b'};">${arrow(m.delta)}</td></tr>`;

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#16181d;">
  <div style="font-size:13px;color:#6b7280;margin-bottom:4px;">${esc(BRAND)} · Weekly Digest · ${esc(d.weekStartLabel)} – ${esc(d.weekEndLabel)}</div>
  <h1 style="font-size:20px;margin:0 0 6px;letter-spacing:-0.01em;">${esc(app.title)} — the week in search</h1>
  <div style="font-size:14px;color:#6b7280;margin-bottom:18px;">
    Visibility score <b style="color:#16181d;">${d.visibilityNow}</b>${visDelta != null ? ` — ${visDelta > 0 ? 'up' : visDelta < 0 ? 'down' : 'flat'} ${Math.abs(visDelta)} vs last week` : ''}${d.universeNow != null && d.universeWeekAgo != null && d.universeNow !== d.universeWeekAgo ? ` · keyword universe ${d.universeNow > d.universeWeekAgo ? 'grew' : 'shrank'} ${d.universeWeekAgo} → ${d.universeNow}` : ''}
  </div>

  <table style="border-collapse:collapse;width:100%;margin-bottom:20px;">
    <tr>
      ${stat('Top 1', d.counts.top1, d.countsWeekAgo?.top1 ?? null)}
      ${stat('Top 10', d.counts.top10, d.countsWeekAgo?.top10 ?? null)}
      ${stat('Top 30', d.counts.top30, d.countsWeekAgo?.top30 ?? null)}
      ${stat('Top 100', d.counts.top100, d.countsWeekAgo?.top100 ?? null)}
    </tr>
  </table>

  ${gainers.length ? `
  <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#0a8a5f;margin-bottom:6px;">Up this week</div>
  <table style="border-collapse:collapse;width:100%;margin-bottom:18px;font-size:13.5px;">${gainers.map(moverRow).join('')}</table>` : ''}

  ${droppers.length ? `
  <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#c0392b;margin-bottom:6px;">Down this week</div>
  <table style="border-collapse:collapse;width:100%;margin-bottom:18px;font-size:13.5px;">${droppers.map(moverRow).join('')}</table>` : ''}

  ${!gainers.length && !droppers.length ? `<div style="font-size:13.5px;color:#6b7280;margin-bottom:18px;">No meaningful keyword movement this week — steady as she goes.</div>` : ''}

  <a href="${SITE_URL}/rank" style="display:inline-block;background:#16181d;color:#fff;text-decoration:none;font-weight:700;font-size:13.5px;padding:10px 16px;border-radius:8px;">Open the dashboard →</a>
  <div style="font-size:11.5px;color:#9ca3af;margin-top:24px;">Sent every Monday to this app's report list in ${esc(BRAND)} — manage recipients in the app's settings.</div>
</div>`.trim();

  return { subject: `${app.title} — weekly rank digest (${d.weekStartLabel} – ${d.weekEndLabel})`, html };
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
