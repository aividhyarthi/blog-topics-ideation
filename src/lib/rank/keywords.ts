// Keyword-list parsing — pure, no network (see scripts/validate-rank.ts).

export interface ParsedKeywords { keywords: string[]; volumes: Record<string, number> }

/**
 * One keyword per line (back-compat: also accepts comma-separated keywords
 * on one line). A line can additionally carry a search volume pasted right
 * next to the keyword — either TAB-separated (how Google Sheets/Excel paste
 * a row) or "keyword, 1234" — so a keyword-research spreadsheet can be
 * pasted in as-is instead of needing the volume column stripped out first.
 */
export function parseKeywordsWithVolumes(blob: unknown, max: number): ParsedKeywords {
  const keywords: string[] = [];
  const volumes: Record<string, number> = {};
  const seen = new Set<string>();

  const add = (raw: string, vol?: number) => {
    const kw = raw.trim().toLowerCase();
    if (!kw || seen.has(kw) || keywords.length >= max) return;
    seen.add(kw);
    keywords.push(kw);
    if (vol != null && Number.isFinite(vol)) volumes[kw] = vol;
  };
  // Handles plain numbers ("5400", "1,200") and abbreviated ones ("40K",
  // "1.2M", "2b") — many keyword-research exports report high-volume terms
  // this way, and silently dropping the volume for those (vs a plain
  // 5-digit number) would be a confusing, data-dependent gap.
  const SUFFIX_MULT: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };
  const parseNum = (s: string): number | undefined => {
    const m = s.trim().match(/^(\d[\d,]*(?:\.\d+)?)\s*([kKmMbB]?)$/);
    if (!m) return undefined;
    const base = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(base)) return undefined;
    const mult = m[2] ? SUFFIX_MULT[m[2].toLowerCase()] : 1;
    return Math.round(base * mult);
  };

  for (const rawLine of String(blob || '').split(/\r?\n/)) {
    if (keywords.length >= max) break;
    const line = rawLine.trim();
    if (!line) continue;

    // Spreadsheet paste: "keyword<TAB>volume".
    const tabParts = line.split('\t').map((s) => s.trim()).filter(Boolean);
    if (tabParts.length >= 2) { add(tabParts[0], parseNum(tabParts[1])); continue; }

    // "keyword, 1234", "keyword, 1,234" (comma-grouped), or "keyword, 40K"
    // (abbreviated). Matched with a non-greedy prefix so it locks onto the
    // FIRST comma in the line — otherwise a comma-grouped number's internal
    // comma (e.g. "1,200") would itself look like a second keyword/volume
    // split.
    const kwVol = line.match(/^(.+?),\s*(\d[\d,]*(?:\.\d+)?[kKmMbB]?)\s*$/);
    if (kwVol) { add(kwVol[1], parseNum(kwVol[2])); continue; }

    // Back-compat: comma-separated multiple keywords on one line, no volume.
    for (const part of line.split(',').map((s) => s.trim()).filter(Boolean)) add(part);
  }
  return { keywords, volumes };
}
