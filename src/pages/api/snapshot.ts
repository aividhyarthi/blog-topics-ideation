// AI Visibility Snapshot endpoint — the sales wedge.
//
// Accepts a prospect's SEMrush AI-visibility exports (brand_topics and/or
// gap_topics) plus the prospect's brand name + vertical, and returns a tight,
// prospect-facing snapshot the operator can present in cold outreach / a first
// call. Deterministic (rules-only) so it can be produced instantly and cheaply.
import type { APIRoute } from 'astro';
import { parseFile, brandFromName, type ParsedFile } from '../../lib/wbr/parse';
import { buildSnapshot } from '../../lib/snapshot';

export const prerender = false;

// Derive a clean canonical brand key from a SEMrush export filename. The shared
// parser keys files via brandFromName(whole filename), which works for the WBR
// (Nykaa is hardcoded) but mis-keys arbitrary prospects whose filename leads
// with the export type, e.g. "gap_topics_sugarcosmetics.csv". We strip the type
// tokens first so any prospect resolves to a stable key (e.g. "sugarcosmetics").
function inferBrandKey(fileName: string): string {
  const stripped = fileName
    .toLowerCase()
    .replace(/\.(csv|xlsx?|numbers)$/i, '')
    .replace(/(gap_topics|brand_topics|citedpages?[-_]?sources|cited[-_]?pages|sources?|topics)/g, ' ')
    .replace(/[-_]+/g, ' ')
    .trim();
  return brandFromName(stripped || fileName);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const form = await request.formData();
    const vertical = (form.get('vertical') as string) === 'fashion' ? 'fashion' : 'beauty';
    const prospectName = ((form.get('prospectName') as string) || '').trim() || 'This brand';
    // Optional explicit canonical brand; otherwise inferred from the filenames.
    let primaryBrand = ((form.get('primaryBrand') as string) || '').trim().toLowerCase();

    const parsed: ParsedFile[] = [];
    for (const entry of form.getAll('files')) {
      if (entry instanceof File) {
        const text = await entry.text();
        const pf = parseFile(entry.name, text);
        // Re-key with the cleaned brand so prospect files match the primary
        // brand regardless of how the export type is positioned in the filename.
        pf.brand = inferBrandKey(entry.name);
        parsed.push(pf);
      }
    }
    if (parsed.length === 0) {
      return json({ error: 'No CSV files received. Upload the prospect’s brand_topics and/or gap_topics export.' }, 400);
    }

    // If the operator didn't name the brand, infer it: prefer the brand on a
    // gap_topics file (that's the prospect whose gaps we're analysing), else the
    // most common brand across the uploads.
    if (!primaryBrand) {
      const gap = parsed.find((f) => f.type === 'gap_topics');
      if (gap) primaryBrand = gap.brand;
      else {
        const counts = new Map<string, number>();
        for (const f of parsed) counts.set(f.brand, (counts.get(f.brand) ?? 0) + 1);
        primaryBrand = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      }
    } else {
      // Normalise a pasted domain/name to the same canonical form parse.ts uses.
      primaryBrand = brandFromName(primaryBrand);
    }

    const report = buildSnapshot(parsed, { vertical, primaryBrand, prospectName });

    return json({
      report,
      meta: {
        primaryBrand,
        filesParsed: parsed.map((f) => ({
          name: f.fileName, brand: f.brand, type: f.type,
          rows: f.topics?.length ?? f.sources?.length ?? 0,
        })),
      },
    });
  } catch (e: any) {
    return json({ error: e?.message ?? 'Failed to build snapshot.' }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
