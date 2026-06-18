// WBR generator endpoint. Accepts the weekly SEMrush CSV bundle (multipart),
// classifies every topic (rules + optional Claude fallback for leftovers), and
// returns the computed report as JSON for the page to render and export.
import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { parseFile, type ParsedFile } from '../../lib/wbr/parse';
import { buildReport } from '../../lib/wbr/report';
import { classifyTopic, BEAUTY_CATEGORIES, FASHION_CATEGORIES, type Vertical } from '../../lib/wbr/categorize';

export const prerender = false;

type Override = { vertical: Vertical; category: string };

// Ask Claude to place the topics the rules could not confidently classify.
async function claudeClassify(
  topics: string[], vertical: 'beauty' | 'fashion',
): Promise<Record<string, Override>> {
  const key = import.meta.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!key || topics.length === 0) return {};
  const cats = vertical === 'beauty' ? BEAUTY_CATEGORIES : FASHION_CATEGORIES;
  const batch = topics.slice(0, 400); // cap cost
  const client = new Anthropic({ apiKey: key });
  const prompt = `You are auditing SEMrush AI-visibility topics for a ${vertical} retailer report.
For each topic, output the best category from this exact list, or "noise" if it is corporate/marketplace/irrelevant (IPO, careers, coupons, exam prep, electronics, generic brand-only names with no product, other-vertical products).

Allowed ${vertical} categories: ${cats.join(', ')}

Return ONLY a JSON object mapping each topic string to {"vertical":"${vertical}"|"noise","category":"<one of the list or 'Irrelevant / Other'>"}. No prose.

Topics:
${batch.map((t) => `- ${t}`).join('\n')}`;

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('');
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const raw = JSON.parse(json) as Record<string, Override>;
    const out: Record<string, Override> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v && (v.vertical === vertical || v.vertical === 'noise') && v.category) out[k] = v;
    }
    return out;
  } catch (e) {
    console.error('Claude classify failed:', e);
    return {};
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const form = await request.formData();
    const vertical = (form.get('vertical') as string) === 'fashion' ? 'fashion' : 'beauty';
    const useClaude = form.get('useClaude') === 'true';

    const parsed: ParsedFile[] = [];
    for (const entry of form.getAll('files')) {
      if (entry instanceof File) {
        const text = await entry.text();
        parsed.push(parseFile(entry.name, text));
      }
    }
    if (parsed.length === 0) {
      return json({ error: 'No CSV files received.' }, 400);
    }

    // Collect rule-unmatched primary-brand topics for optional Claude pass.
    let overrides: Record<string, Override> = {};
    let claudeCount = 0;
    if (useClaude) {
      const unmatched = new Set<string>();
      for (const f of parsed) {
        if (f.brand !== 'nykaa') continue;
        for (const t of f.topics ?? []) {
          if (!classifyTopic(t.name, { vertical }).matched) unmatched.add(t.name);
        }
      }
      overrides = await claudeClassify([...unmatched], vertical);
      claudeCount = Object.keys(overrides).length;
    }

    const report = buildReport(parsed, { vertical, overrides });
    return json({
      report,
      meta: {
        filesParsed: parsed.map((f) => ({ name: f.fileName, brand: f.brand, type: f.type, rows: f.topics?.length ?? f.sources?.length ?? 0 })),
        claudeClassified: claudeCount,
        claudeAvailable: Boolean(import.meta.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY),
      },
    });
  } catch (e: any) {
    return json({ error: e?.message ?? 'Failed to build report.' }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
