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
  const parseNum = (s: string): number | undefined => {
    const n = Number(s.replace(/[,\s]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  };

  for (const rawLine of String(blob || '').split(/\r?\n/)) {
    if (keywords.length >= max) break;
    const line = rawLine.trim();
    if (!line) continue;

    // Spreadsheet paste: "keyword<TAB>volume".
    const tabParts = line.split('\t').map((s) => s.trim()).filter(Boolean);
    if (tabParts.length >= 2) { add(tabParts[0], parseNum(tabParts[1])); continue; }

    // "keyword, 1234" or "keyword, 1,234" (comma-grouped volume). Matched
    // with a non-greedy prefix so it locks onto the FIRST comma in the line
    // — otherwise a comma-grouped number's internal comma (e.g. "1,200")
    // would itself look like a second keyword/volume split.
    const kwVol = line.match(/^(.+?),\s*(\d{1,3}(?:,\d{3})*|\d+)\s*$/);
    if (kwVol) { add(kwVol[1], parseNum(kwVol[2])); continue; }

    // Back-compat: comma-separated multiple keywords on one line, no volume.
    for (const part of line.split(',').map((s) => s.trim()).filter(Boolean)) add(part);
  }
  return { keywords, volumes };
}
