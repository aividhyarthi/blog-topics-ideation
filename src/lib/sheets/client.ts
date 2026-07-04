// Minimal Google Sheets v4 REST client (values.get + values:batchUpdate) —
// deliberately not the full `googleapis` SDK, just what the rank tracker needs:
// find a keyword column by header text, then write ranking columns back next to it.
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface ParsedSheetUrl { spreadsheetId: string; gid: number | null }

/** Pull the spreadsheet id + tab (gid) out of a Google Sheets URL, or accept a bare id. */
export function parseSheetUrl(input: string): ParsedSheetUrl | null {
  const raw = (input || '').trim();
  if (!raw) return null;
  const idMatch = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const spreadsheetId = idMatch ? idMatch[1] : (/^[a-zA-Z0-9-_]{20,}$/.test(raw) ? raw : null);
  if (!spreadsheetId) return null;
  const gidMatch = raw.match(/[?#&]gid=(\d+)/);
  return { spreadsheetId, gid: gidMatch ? Number(gidMatch[1]) : null };
}

async function sheetsFetch(path: string, token: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${SHEETS_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let hint = '';
    if (/has not been used|it is disabled|API has not been enabled/i.test(text)) {
      hint = ' — the Google Sheets API isn\'t enabled on this service account\'s Google Cloud project yet. Open the URL in the error below and click Enable, then wait a minute and retry.';
    } else if (res.status === 403 || res.status === 404) {
      hint = ' — make sure the sheet is shared with the service account email (Editor access).';
    }
    throw new Error(`Google Sheets API ${res.status}${hint} ${text.slice(0, 500)}`.trim());
  }
  return res.json();
}

/** Resolve a gid (tab id from the URL) to the sheet/tab title values.get needs. */
export async function resolveSheetTitle(spreadsheetId: string, gid: number | null, token: string): Promise<string> {
  const meta = await sheetsFetch(`/${spreadsheetId}?fields=sheets(properties(sheetId,title))`, token);
  const sheets: { properties: { sheetId: number; title: string } }[] = meta.sheets || [];
  if (!sheets.length) throw new Error('No tabs found in this spreadsheet.');
  if (gid != null) {
    const hit = sheets.find((s) => s.properties.sheetId === gid);
    if (hit) return hit.properties.title;
  }
  return sheets[0].properties.title;
}

function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export interface KeywordColumn {
  headerRow: number; // 1-indexed
  colIndex: number; // 1-indexed
  rows: { row: number; keyword: string }[]; // non-empty cells below the header, in sheet order
  lastCol: number; // widest row in the sheet, 1-indexed — new columns start after this
}

/**
 * Finds the header cell matching `headerLabel` (case-insensitive) and collects
 * every non-empty cell below it in that column. These trackers don't reliably
 * put the header on row 1 (section titles sit above it), so this scans every
 * row rather than assuming a fixed position.
 */
export async function findKeywordColumn(
  spreadsheetId: string, sheetTitle: string, headerLabel: string, token: string,
): Promise<KeywordColumn> {
  const data = await sheetsFetch(
    `/${spreadsheetId}/values/${encodeURIComponent(quoteSheetTitle(sheetTitle))}?valueRenderOption=UNFORMATTED_VALUE`,
    token,
  );
  const values: unknown[][] = data.values || [];
  const target = headerLabel.trim().toLowerCase();

  let headerRow = -1;
  let colIndex = -1;
  for (let r = 0; r < values.length; r++) {
    const row = values[r] || [];
    const c = row.findIndex((cell) => String(cell ?? '').trim().toLowerCase() === target);
    if (c !== -1) { headerRow = r + 1; colIndex = c + 1; break; }
  }
  if (headerRow === -1) {
    throw new Error(`Couldn't find a column headed "${headerLabel}" in this sheet's tab "${sheetTitle}".`);
  }

  const rows: { row: number; keyword: string }[] = [];
  let lastCol = 0;
  for (let r = 0; r < values.length; r++) {
    lastCol = Math.max(lastCol, (values[r] || []).length);
    if (r + 1 <= headerRow) continue;
    const cell = (values[r] || [])[colIndex - 1];
    const keyword = String(cell ?? '').trim();
    if (keyword) rows.push({ row: r + 1, keyword });
  }
  return { headerRow, colIndex, rows, lastCol };
}

export interface RankColumn {
  header: string; // e.g. "CRED rank (2026-07-04)"
  valuesByRow: Record<number, string>; // sheet row number -> cell value
}

/** Appends one new column per app, header + values aligned to the keyword rows. */
export async function writeRankColumns(
  spreadsheetId: string, sheetTitle: string, keywordCol: KeywordColumn, columns: RankColumn[], token: string,
): Promise<void> {
  if (!columns.length) return;
  const maxRow = keywordCol.rows.length ? keywordCol.rows[keywordCol.rows.length - 1].row : keywordCol.headerRow;
  const startCol = keywordCol.lastCol + 1;

  const data = columns.map((col, i) => {
    const letter = colLetter(startCol + i);
    const colValues: string[] = [col.header];
    for (let r = keywordCol.headerRow + 1; r <= maxRow; r++) colValues.push(col.valuesByRow[r] ?? '');
    return {
      range: `${quoteSheetTitle(sheetTitle)}!${letter}${keywordCol.headerRow}:${letter}${maxRow}`,
      majorDimension: 'COLUMNS',
      values: [colValues],
    };
  });

  await sheetsFetch(`/${spreadsheetId}/values:batchUpdate`, token, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data }),
  });
}
