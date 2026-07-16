// Review-theme analysis: what are the 1-3★ reviews actually complaining
// about? Turns the rating-health number ("14% negative") into an action
// ("the complaints are OTP failures and KYC delays"). One Anthropic call
// per run, so it only ever runs from an explicit button click and the
// result is cached (see store.ts loadReviewThemes) until the next click.
import Anthropic from '@anthropic-ai/sdk';
import { fetchRecentReviews } from '../aso/fetch';
import { saveReviewThemesEntry } from './store';
import type { ReviewTheme, ReviewThemesEntry, TrackedApp } from './types';

const MAX_REVIEWS_ANALYSED = 60;

export async function analyzeReviewThemes(app: TrackedApp, userId?: string): Promise<ReviewThemesEntry> {
  if (app.store !== 'play') throw new Error('Review analysis is Google Play only for now.');
  const apiKey = process.env.ANTHROPIC_API_KEY || import.meta.env?.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('AI analysis is not configured on this deployment (missing API key).');

  // Wider fetch than the daily rating point: themes need TEXT, and most
  // ratings are star-taps with no written review, so cast a bigger net.
  const { reviews, windowDays } = await fetchRecentReviews(app.appId, app.lang, app.country, 60, 90, 300);
  const negative = reviews.filter((r) => r.score <= 3 && r.text && r.text.length >= 10).slice(0, MAX_REVIEWS_ANALYSED);
  if (negative.length < 5) {
    throw new Error(`Only ${negative.length} written negative review(s) found in the last ${windowDays} days — not enough to extract reliable themes.`);
  }

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 900,
    messages: [{
      role: 'user',
      content: `These are recent negative (1-3 star) Google Play reviews for the app "${app.title}". Group them into the 3-5 most common complaint themes.

Reviews:
${negative.map((r, i) => `${i + 1}. [${r.score}★] ${r.text}`).join('\n')}

Return ONLY a JSON array, no commentary: [{"theme": "short label (2-5 words)", "count": <how many of these reviews mention it>, "example": "<one short verbatim quote from the reviews above>"}]. Order by count descending. Counts must not exceed ${negative.length} total mentions across overlapping themes is fine, but each count must reflect these reviews only.`,
    }],
  });
  const raw = message.content[0]?.type === 'text' ? message.content[0].text : '';
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('AI analysis returned an unexpected format — try again.');
  let themes: ReviewTheme[];
  try {
    themes = (JSON.parse(m[0]) as unknown[])
      .map((t) => {
        const o = t as Record<string, unknown>;
        return {
          theme: String(o.theme || '').slice(0, 60),
          count: Math.max(0, Math.min(negative.length, Number(o.count) || 0)),
          example: String(o.example || '').slice(0, 220),
        };
      })
      .filter((t) => t.theme && t.count > 0)
      .slice(0, 5);
  } catch {
    throw new Error('AI analysis returned an unexpected format — try again.');
  }
  if (!themes.length) throw new Error('No clear complaint themes came back — try again in a bit.');

  const entry: ReviewThemesEntry = {
    checkedAt: new Date().toISOString(),
    windowDays,
    totalReviews: reviews.length,
    negativeAnalysed: negative.length,
    themes,
  };
  saveReviewThemesEntry(app.key, entry, userId);
  return entry;
}
