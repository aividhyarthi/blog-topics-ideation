// Keyword-list parsing — pure, no network (see scripts/validate-rank.ts).

export interface ParsedKeywords { keywords: string[]; volumes: Record<string, number> }
export interface ParsedKeywordsTwoVolumes { keywords: string[]; volumes: Record<string, number>; webVolumes: Record<string, number> }

// Handles plain numbers ("5400", "1,200") and abbreviated ones ("40K",
// "1.2M", "2b") — many keyword-research exports report high-volume terms
// this way, and silently dropping the volume for those (vs a plain 5-digit
// number) would be a confusing, data-dependent gap. Shared by both parsers
// below.
const SUFFIX_MULT: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };
function parseNum(s: string): number | undefined {
  const m = s.trim().match(/^(\d[\d,]*(?:\.\d+)?)\s*([kKmMbB]?)$/);
  if (!m) return undefined;
  const base = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(base)) return undefined;
  const mult = m[2] ? SUFFIX_MULT[m[2].toLowerCase()] : 1;
  return Math.round(base * mult);
}

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

/**
 * Same idea as parseKeywordsWithVolumes, but for a line that carries TWO
 * numbers: a real web search volume (e.g. SEMrush/Ahrefs) and a 0-100 app
 * search demand index, side by side. A client's own keyword research
 * routinely comes as exactly this: one spreadsheet, three columns. Making
 * them split it into two separate single-number pastes every time isn't
 * something we can ask of every client, so this reads three-column input
 * directly instead.
 *
 * "keyword<TAB>webVolume<TAB>appVolume" is the reliable format — copy three
 * columns straight out of Excel/Sheets and paste, no reformatting needed,
 * regardless of whether the numbers use thousands-commas. A plain-digit
 * comma form, "keyword, webVolume, appVolume" (e.g. "emi calculator,
 * 2740000, 100"), also works, but ONLY when the numbers themselves don't
 * use comma-grouping — a comma can't do double duty as both a thousands
 * separator and a column separator in the same line, so
 * "keyword, 2,740,000, 100" is genuinely ambiguous and falls back to the
 * single-number behavior below (everything before the last number becomes
 * the keyword). Tab-separated has no such limit.
 */
export function parseKeywordsWithTwoVolumes(blob: unknown, max: number): ParsedKeywordsTwoVolumes {
  const keywords: string[] = [];
  const volumes: Record<string, number> = {};
  const webVolumes: Record<string, number> = {};
  const seen = new Set<string>();

  const add = (raw: string, webVol?: number, appVol?: number) => {
    const kw = raw.trim().toLowerCase();
    if (!kw || seen.has(kw) || keywords.length >= max) return;
    seen.add(kw);
    keywords.push(kw);
    if (webVol != null && Number.isFinite(webVol)) webVolumes[kw] = webVol;
    if (appVol != null && Number.isFinite(appVol)) volumes[kw] = appVol;
  };

  for (const rawLine of String(blob || '').split(/\r?\n/)) {
    if (keywords.length >= max) break;
    const line = rawLine.trim();
    if (!line) continue;

    // Spreadsheet paste, 3 columns: "keyword<TAB>webVolume<TAB>appVolume".
    const tabParts = line.split('\t').map((s) => s.trim()).filter(Boolean);
    if (tabParts.length >= 3) { add(tabParts[0], parseNum(tabParts[1]), parseNum(tabParts[2])); continue; }
    // 2 columns, tab-separated: back-compat with the single-volume paste —
    // treated as the app volume, same as parseKeywordsWithVolumes always has.
    if (tabParts.length === 2) { add(tabParts[0], undefined, parseNum(tabParts[1])); continue; }

    // "keyword, webVolume, appVolume" — only safe when neither number has
    // an internal comma (see doc comment above), so this is tried first and
    // falls through cleanly to the single-number match below otherwise.
    const commaParts = line.split(',').map((s) => s.trim()).filter(Boolean);
    if (commaParts.length === 3) {
      const webVol = parseNum(commaParts[1]);
      const appVol = parseNum(commaParts[2]);
      if (webVol != null && appVol != null) { add(commaParts[0], webVol, appVol); continue; }
    }

    // "keyword, 1234" / "keyword, 1,234" (comma-grouped) / "keyword, 40K" —
    // one number, treated as the app volume (matches parseKeywordsWithVolumes).
    const kwVol = line.match(/^(.+?),\s*(\d[\d,]*(?:\.\d+)?[kKmMbB]?)\s*$/);
    if (kwVol) { add(kwVol[1], undefined, parseNum(kwVol[2])); continue; }

    // Back-compat: comma-separated multiple keywords on one line, no volume.
    for (const part of line.split(',').map((s) => s.trim()).filter(Boolean)) add(part);
  }
  return { keywords, volumes, webVolumes };
}
