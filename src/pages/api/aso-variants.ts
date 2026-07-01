import type { APIRoute } from 'astro';
import { parseAppId, fetchListingVariants, type Market } from '../../lib/aso/fetch';
import { diffVariants, type AppVariants } from '../../lib/aso/variants';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// A small, telling spread: same language across countries (country targeting) and
// a different language in the same country (language targeting).
const DEFAULT_MARKETS: Market[] = [
  { country: 'us', lang: 'en' },
  { country: 'in', lang: 'en' },
  { country: 'in', lang: 'hi' },
  { country: 'gb', lang: 'en' },
];

export const POST: APIRoute = async ({ request }) => {
  let body: { appIds?: string[]; markets?: Market[] };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const appIds = (body.appIds || [])
    .map((s) => parseAppId(String(s)))
    .filter((v): v is string => Boolean(v))
    .slice(0, 6); // bound the number of fetches
  if (!appIds.length) return json({ error: 'No valid app ids to check.' }, 400);

  const markets = (Array.isArray(body.markets) && body.markets.length ? body.markets : DEFAULT_MARKETS)
    .filter((m) => m && m.country && m.lang).slice(0, 5);

  const apps: AppVariants[] = [];
  for (const appId of appIds) {
    try {
      const listings = await fetchListingVariants(appId, markets);
      apps.push(diffVariants(appId, listings));
    } catch (e) {
      apps.push({ appId, title: appId, baseline: null, markets: [], hasVariants: false });
    }
  }

  return json({ apps, markets });
};
