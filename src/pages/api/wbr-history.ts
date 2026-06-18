// Manage the saved week-over-week history: list saved weeks, or delete one
// (e.g. to remove a test/mistaken upload).
import type { APIRoute } from 'astro';
import { listSnapshots, deleteSnapshot } from '../../lib/wbr/store';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = ({ url }) => {
  const vertical = url.searchParams.get('vertical') === 'fashion' ? 'fashion' : 'beauty';
  try {
    return json({ history: listSnapshots(vertical) });
  } catch (e: any) {
    return json({ history: [], error: e?.message ?? 'History store unavailable.' });
  }
};

export const DELETE: APIRoute = ({ url }) => {
  const vertical = url.searchParams.get('vertical') === 'fashion' ? 'fashion' : 'beauty';
  const weekKey = url.searchParams.get('weekKey') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) return json({ error: 'Invalid weekKey.' }, 400);
  try {
    return json({ deleted: deleteSnapshot(vertical, weekKey) });
  } catch (e: any) {
    return json({ error: e?.message ?? 'Delete failed.' }, 500);
  }
};
