// AdSense's required ads.txt, authorizing this site's ad inventory. Derived
// from ADSENSE_CLIENT (ca-pub-...) rather than a second hardcoded id, so the
// two can't drift out of sync if the publisher id ever changes.
export const prerender = true;
import type { APIRoute } from 'astro';
import { ADSENSE_CLIENT } from '../lib/saas/plans';

export const GET: APIRoute = async () => {
  const pubId = ADSENSE_CLIENT.replace(/^ca-/, '');
  const body = `google.com, ${pubId}, DIRECT, f08c47fec0942fa0\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
};
