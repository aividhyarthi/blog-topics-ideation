// Parsing for the four SEMrush AI-visibility export shapes the WBR consumes:
//
//   brand_topics_<site>.csv  name,country,visibility,difficulty,mentions,
//                            volume,volume_trend,intents
//   gap_topics_<site>.csv    ...as above + gap_mentions (per-competitor breakdown)
//   sources_<site>.csv  /    url,country,prompts_count
//   citedpages-sources_<site>.csv
//
// File TYPE and BRAND are inferred from the filename so the user can just drop
// the weekly export bundle in without labelling anything.

export type FileType = 'brand_topics' | 'gap_topics' | 'sources' | 'unknown';

export interface TopicRow {
  name: string;
  visibility: number;
  difficulty: number;
  mentions: number;
  volume: number;
  // parsed "amazon.in:7;myntra.com:32;..." (gap files only)
  gapMentions?: Record<string, number>;
  intents?: Record<string, number>;
}

export interface SourceRow {
  url: string;
  promptsCount: number;
}

export interface ParsedFile {
  fileName: string;
  type: FileType;
  brand: string; // canonical: nykaa | amazon | myntra | tira | flipkart | <host>
  topics?: TopicRow[];
  sources?: SourceRow[];
}

// ---- minimal RFC-4180-ish CSV parser (handles quotes, commas, newlines) -----
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function num(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(String(s).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parseKv(s: string | undefined): Record<string, number> | undefined {
  if (!s) return undefined;
  const out: Record<string, number> = {};
  for (const part of s.split(';')) {
    const idx = part.lastIndexOf(':');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = num(part.slice(idx + 1));
  }
  return out;
}

// nykaa.com / nykaafashion.com / amazon.in / myntra.com / tirabeauty.com -> short name
export function brandFromName(s: string): string {
  const l = s.toLowerCase();
  if (l.includes('nykaafashion')) return 'nykaa';
  if (l.includes('nykaa')) return 'nykaa';
  if (l.includes('amazon')) return 'amazon';
  if (l.includes('myntra')) return 'myntra';
  if (l.includes('tira')) return 'tira';
  if (l.includes('flipkart')) return 'flipkart';
  if (l.includes('ajio')) return 'ajio';
  const m = l.match(/([a-z0-9-]+)\.(com|in)/);
  return m ? m[1] : l.replace(/\.[a-z]+$/, '');
}

export function typeFromName(s: string): FileType {
  const l = s.toLowerCase();
  if (l.includes('gap')) return 'gap_topics';
  if (l.includes('brand_topic') || l.includes('topics')) return 'brand_topics';
  if (l.includes('source') || l.includes('citedpage') || l.includes('cited')) return 'sources';
  return 'unknown';
}

// Header-driven so column re-ordering by SEMrush won't break us.
function indexer(header: string[]) {
  const map = new Map<string, number>();
  header.forEach((h, i) => map.set(h.trim().toLowerCase(), i));
  return (name: string) => map.get(name);
}

export function parseFile(fileName: string, text: string): ParsedFile {
  const rows = parseCsv(text).filter((r) => r.length && r.some((c) => c !== ''));
  const out: ParsedFile = {
    fileName,
    type: typeFromName(fileName),
    brand: brandFromName(fileName),
  };
  if (rows.length < 2) return out;

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const at = indexer(header);
  const body = rows.slice(1);

  // sources file: url,country,prompts_count
  if (at('url') !== undefined) {
    out.type = out.type === 'unknown' ? 'sources' : out.type;
    const uI = at('url')!;
    const pI = at('prompts_count') ?? at('prompts') ?? header.length - 1;
    out.sources = body
      .filter((r) => r[uI])
      .map((r) => ({ url: r[uI], promptsCount: num(r[pI]) }));
    return out;
  }

  // topics file: name,...,visibility,mentions,volume[,gap_mentions]
  const nI = at('name');
  if (nI !== undefined) {
    const vI = at('visibility'), dI = at('difficulty'), mI = at('mentions');
    const volI = at('volume'), gI = at('gap_mentions'), iI = at('intents');
    if (gI !== undefined && out.type === 'unknown') out.type = 'gap_topics';
    if (out.type === 'unknown') out.type = 'brand_topics';
    out.topics = body
      .filter((r) => r[nI])
      .map((r) => ({
        name: r[nI],
        visibility: num(vI !== undefined ? r[vI] : undefined),
        difficulty: num(dI !== undefined ? r[dI] : undefined),
        mentions: num(mI !== undefined ? r[mI] : undefined),
        volume: num(volI !== undefined ? r[volI] : undefined),
        gapMentions: gI !== undefined ? parseKv(r[gI]) : undefined,
        intents: iI !== undefined ? parseKv(r[iI]) : undefined,
      }));
  }
  return out;
}
