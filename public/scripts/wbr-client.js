// WBR Builder client: upload SEMrush CSVs -> POST /api/wbr -> render + export.

const $ = (id) => document.getElementById(id);
const files = new Map(); // name -> File (SEMrush CSVs)
let trackerFile = null;  // optional master tracker .xlsx
let lastTracking = null; // parsed tracker data

// Escape any value that originates from an uploaded file before it goes into
// innerHTML, so a crafted topic/theme/brand name can't inject markup/script.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => (s ? esc(s.charAt(0).toUpperCase() + s.slice(1)) : esc(s));
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-IN') : esc(n ?? '-'));
const r1 = (n) => (typeof n === 'number' ? n.toFixed(1) : esc(n ?? '-'));

function detect(name) {
  const l = name.toLowerCase();
  let brand = 'other';
  if (l.includes('nykaa')) brand = 'nykaa';
  else if (l.includes('amazon')) brand = 'amazon';
  else if (l.includes('myntra')) brand = 'myntra';
  else if (l.includes('tira')) brand = 'tira';
  else if (l.includes('flipkart')) brand = 'flipkart';
  let type = 'unknown';
  if (l.includes('gap')) type = 'gap_topics';
  else if (l.includes('source') || l.includes('cited')) type = 'sources';
  else if (l.includes('topic') || l.includes('brand')) type = 'brand_topics';
  return { brand, type };
}

function renderFileList() {
  const el = $('filelist');
  el.innerHTML = '';
  if (trackerFile) {
    const div = document.createElement('div');
    div.className = 'fileitem';
    div.innerHTML = `<span class="b">Master tracker</span><span class="tag">xlsx · weekly tracking</span>
      <span style="color:var(--muted)">${esc(trackerFile.name)}</span>
      <span style="margin-left:auto;color:var(--muted)">${(trackerFile.size / 1024).toFixed(0)} KB</span>
      <button class="ghost" data-rmtracker="1" style="padding:3px 9px">✕</button>`;
    el.appendChild(div);
  }
  for (const [name, f] of files) {
    const { brand, type } = detect(name);
    const div = document.createElement('div');
    div.className = 'fileitem';
    const warn = type === 'unknown' ? ' warn' : '';
    div.innerHTML = `<span class="b">${cap(brand)}</span>
      <span class="tag${warn}">${esc(type)}</span>
      <span style="color:var(--muted)">${esc(name)}</span>
      <span style="margin-left:auto;color:var(--muted)">${(f.size / 1024).toFixed(0)} KB</span>
      <button class="ghost" data-rm="${esc(name)}" style="padding:3px 9px">✕</button>`;
    el.appendChild(div);
  }
  el.querySelectorAll('[data-rm]').forEach((b) =>
    b.addEventListener('click', () => { files.delete(b.dataset.rm); renderFileList(); }));
  const rmt = el.querySelector('[data-rmtracker]');
  if (rmt) rmt.addEventListener('click', () => { trackerFile = null; renderFileList(); });
}

function addFiles(list) {
  for (const f of list) {
    const n = f.name.toLowerCase();
    if (n.endsWith('.csv')) files.set(f.name, f);
    else if (n.endsWith('.xlsx') || n.endsWith('.xls')) trackerFile = f;
  }
  renderFileList();
}

// ---- upload wiring ----
const drop = $('drop'), fileInput = $('fileInput');
drop.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => addFiles(e.target.files));
['dragenter', 'dragover'].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

// ---- generate ----
let lastReport = null;
let lastTrends = null;
let lastGlossary = [];
let lastLabel = '';

// default the week date to today
const _today = new Date().toISOString().slice(0, 10);
if ($('weekKey')) $('weekKey').value = _today;

$('genBtn').addEventListener('click', async () => {
  const err = $('errBox'), info = $('infoBox');
  err.style.display = info.style.display = 'none';
  if (files.size === 0 && !trackerFile) { err.textContent = 'Add at least one CSV file (or a master tracker .xlsx).'; err.style.display = 'block'; return; }

  const btn = $('genBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Generating…';
  const notes = [];
  try {
    const vertical = $('vertical').value;

    // Parse the optional master tracker entirely in the browser (never uploaded).
    lastTracking = null;
    if (trackerFile) {
      try {
        lastTracking = await parseTracker(trackerFile, vertical);
        notes.push(`Weekly tracker: ${lastTracking.themes.length} themes across ${lastTracking.weeks.length} weeks (${lastTracking.sheetName}).`);
      } catch (e) {
        notes.push(`⚠ Couldn't read the tracker: ${e.message}`);
      }
    }

    if (files.size > 0) {
      const fd = new FormData();
      fd.set('vertical', vertical);
      fd.set('useClaude', $('useClaude').checked ? 'true' : 'false');
      fd.set('saveToHistory', $('saveToHistory').checked ? 'true' : 'false');
      if ($('weekKey').value) fd.set('weekKey', $('weekKey').value);
      fd.set('label', $('reportLabel').value.trim());
      for (const [, f] of files) fd.append('files', f);

      const res = await fetch('/api/wbr', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Request failed');

      lastReport = data.report;
      lastTrends = data.trends || null;
      lastGlossary = data.glossary || [];
      lastLabel = $('reportLabel').value.trim() || `Nykaa ${cap(data.report.vertical)} · AI Visibility`;
      renderReport(data.report, data.meta); // -> #reportSemrush

      const m = data.meta;
      notes.push(`Parsed ${m.filesParsed.length} files for week ${m.weekKey}.`);
      notes.push(data.trends ? `Compared against ${data.trends.prevWeekKey}.` : 'No earlier week saved yet — this becomes your baseline.');
      if (m.savedToHistory) notes.push('Saved to history.');
      if (m.historyError) notes.push(`⚠ History not saved: ${m.historyError}`);
      if ($('useClaude').checked) notes.push(m.claudeAvailable ? `Claude classified ${m.claudeClassified} leftover topics.` : 'Claude fallback requested but no API key configured — used rules only.');
    } else {
      lastReport = null; lastTrends = null;
      lastLabel = $('reportLabel').value.trim() || `Nykaa ${cap(vertical)} · Weekly Tracking`;
      $('reportSemrush').innerHTML = '<p class="sub">No SEMrush CSVs uploaded — add the brand_topics / gap_topics / sources exports to see the snapshot report.</p>';
    }

    // Weekly Tracking pane (separate tab)
    $('reportTracking').innerHTML = lastTracking
      ? renderTracking(lastTracking)
      : '<p class="sub">No master tracker uploaded — add your tracker .xlsx to see Weekly Theme Tracking.</p>';

    $('rTitle').textContent = lastLabel;
    setupTabs();
    $('results').style.display = 'block';
    $('results').scrollIntoView({ behavior: 'smooth' });
    info.textContent = notes.join(' '); info.style.display = 'block';
  } catch (e) {
    err.textContent = e.message; err.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Generate report';
  }
});

// ---- rendering ----
function tbl(headers, rows, opts = {}) {
  const numCols = opts.numCols || [];
  const th = headers.map((h, i) => `<th class="${numCols.includes(i) ? 'num' : ''}">${h}</th>`).join('');
  const body = rows.map((cells) =>
    `<tr class="${cells._cls || ''}">` +
    cells.map((c, i) => i === 'length' ? '' : `<td class="${numCols.includes(i) ? 'num' : ''}">${c}</td>`).join('') +
    '</tr>').join('');
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function statusClass(s) {
  if (s.includes('Protect') || s.includes('leads') || s === '✓') return 'st-ok';
  if (s.includes('Low') || s.includes('improve')) return 'st-bad';
  return 'st-warn';
}

function renderReport(rep, meta) {
  $('rTitle').textContent = lastLabel;
  const brands = rep.brandsPresent;
  const out = [];

  // KPI strip (primary brand)
  const p = rep.summary.find((s) => s.brand === 'nykaa') || rep.summary[0];
  if (p) {
    out.push(`<div class="kpis">
      <div class="kpi"><div class="v">${fmt(p.topicsInVertical)}</div><div class="l">${cap(rep.vertical)} topics in 1K</div></div>
      <div class="kpi"><div class="v">${r1(p.avgVisibility)}</div><div class="l">Avg AI visibility</div></div>
      <div class="kpi"><div class="v">${fmt(p.totalMentions)}</div><div class="l">Total mentions</div></div>
      <div class="kpi"><div class="v">${fmt(p.totalVolume)}</div><div class="l">Total search volume</div></div>
      <div class="kpi"><div class="v">${fmt(rep.vertical === 'beauty' ? p.topics80 : p.topics60)}</div><div class="l">Topics ≥ ${rep.vertical === 'beauty' ? 80 : 60} vis</div></div>
      <div class="kpi"><div class="v">${fmt(rep.gaps.length)}</div><div class="l">Actionable gaps</div></div>
    </div>`);
  }

  // Key highlights (auto-written, data-derived narrative)
  if (rep.highlights && rep.highlights.length) {
    out.push(`<div class="sec highlights"><h3>Key Highlights — what the numbers say</h3>
      <ul class="hl">${rep.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>`);
  }

  // Week-over-week trends
  if (lastTrends) out.push(renderTrends(lastTrends));

  // Summary scorecard
  out.push(section('Summary — AI Visibility at a Glance', 'One row per brand, this vertical only (noise excluded).',
    tbl(['Metric', ...brands.map(cap)],
      [
        ['Topics in their 1K', ...brands.map((b) => fmt(g(rep, b).topicsInVertical))],
        ['Avg AI visibility', ...brands.map((b) => r1(g(rep, b).avgVisibility))],
        ['Total mentions', ...brands.map((b) => fmt(g(rep, b).totalMentions))],
        ['Total search volume', ...brands.map((b) => fmt(g(rep, b).totalVolume))],
        ['Topics ≥ 60 visibility', ...brands.map((b) => fmt(g(rep, b).topics60))],
        ['Topics ≥ 80 visibility', ...brands.map((b) => fmt(g(rep, b).topics80))],
      ],
      { numCols: brands.map((_, i) => i + 1) })));

  // Category scorecard
  out.push(section('Section A — Category Scorecard', 'How many topics Nykaa owns per category, with the current category leader.',
    tbl(['Category', 'Topics', 'Avg vis', 'Avg mentions', 'Search volume', 'Signal'],
      rep.categoryScorecard.map((c) => {
        const row = [esc(c.category), fmt(c.topics), r1(c.avgVisibility), r1(c.avgMentions), fmt(c.totalVolume),
          `<span class="${statusClass(c.signal)}">${esc(c.signal)}</span>`];
        return row;
      }),
      { numCols: [1, 2, 3, 4] })));

  // Protect
  out.push(section('Section B — Top Topics to Protect', 'Highest-volume Nykaa topics and their current status.',
    tbl(['Category', 'Topic', 'Visibility', 'Mentions', 'Search volume', 'Status'],
      rep.protect.map((t) => [esc(t.category), esc(t.topic), fmt(t.visibility), fmt(t.mentions), fmt(t.volume),
        `<span class="${statusClass(t.status)}">${esc(t.status)}</span>`]),
      { numCols: [2, 3, 4] })));

  // Gaps
  const compBrands = ['amazon', 'myntra', 'tira', 'flipkart'].filter((b) =>
    rep.gaps.some((g2) => g2.competitors[cap(b)] !== undefined));
  out.push(section('Section C — Gap Analysis', 'Topics where Nykaa = 0 visibility but competitors rank. Numbers = competitor AI mentions.',
    tbl(['Priority', 'Category', 'Topic (Nykaa = 0)', ...compBrands.map(cap), 'Search volume'],
      rep.gaps.map((gp) => [
        `<span class="prio-${gp.priority}">${esc(gp.priority)}</span>`, esc(gp.category), esc(gp.topic),
        ...compBrands.map((b) => fmt(gp.competitors[cap(b)] ?? 0)), fmt(gp.volume),
      ]),
      { numCols: [...compBrands.map((_, i) => i + 3), compBrands.length + 3] })));

  // Brand comparison
  out.push(section('Brand Comparison — Mentions by Category', 'Total AI mentions per category from each brand\'s own 1K topics. Leader highlighted.',
    tbl(['Category', ...brands.map(cap)],
      rep.brandComparison.map((bc) => {
        const max = Math.max(...brands.map((b) => bc.mentions[b] ?? 0));
        const row = [esc(bc.category), ...brands.map((b) => {
          const v = bc.mentions[b];
          const lead = v !== undefined && v === max && max > 0;
          return lead ? `<strong>${fmt(v ?? 0)}</strong>` : fmt(v ?? 0);
        })];
        return row;
      }),
      { numCols: brands.map((_, i) => i + 1) })));

  // Source mix
  if (rep.sourceAnalysis.length) {
    const sBrands = brands.filter((b) => rep.sourceAnalysis.some((s) => s.count[b] !== undefined));
    out.push(section('Cited-Source Mix', 'Page types AI engines cite, per brand (from the sources export). Healthy = low homepage share, high blog/PDP.',
      tbl(['Page type', ...sBrands.map(cap)],
        rep.sourceAnalysis.map((s) => [esc(s.pageType), ...sBrands.map((b) => fmt(s.count[b] ?? 0))]),
        { numCols: sBrands.map((_, i) => i + 1) })));
  }

  // Review queue
  if (rep.reviewQueue.length) {
    out.push(`<details class="review sec"><summary>⚠ Review queue — ${rep.reviewQueue.length} topics the rules couldn't confidently categorize</summary>
      <p class="sub" style="margin-top:8px">These were treated as noise (excluded from totals). Turn on the Claude fallback or refine the keyword dictionary to recover the beauty/fashion ones.</p>
      ${tbl(['Topic', 'Assigned bucket'], rep.reviewQueue.map((q) => [esc(q.topic), esc(q.category)]))}</details>`);
  }

  // Glossary — define every heading/term
  if (lastGlossary.length) {
    out.push(`<details class="review sec" open><summary>📖 What these terms mean</summary>
      <div class="tw" style="margin-top:8px"><table><tbody>${
        lastGlossary.map((g2) => `<tr><td style="font-weight:600;white-space:normal">${g2.term}</td><td style="white-space:normal;color:var(--muted)">${g2.def}</td></tr>`).join('')
      }</tbody></table></div></details>`);
  }

  $('reportSemrush').innerHTML = out.join('');
}

// ---- tabs ----
function setupTabs() {
  $('tabSemrush').disabled = !lastReport;
  $('tabTracking').disabled = !lastTracking;
  // Default to whichever exists (prefer SEMrush report).
  activateTab(lastReport ? 'semrush' : 'tracking');
}
function activateTab(which) {
  const isSem = which === 'semrush';
  $('tabSemrush').classList.toggle('active', isSem);
  $('tabTracking').classList.toggle('active', !isSem);
  $('reportSemrush').style.display = isSem ? 'block' : 'none';
  $('reportTracking').style.display = isSem ? 'none' : 'block';
  $('actSemrush').style.display = isSem ? 'flex' : 'none';
  $('actTracking').style.display = isSem ? 'none' : 'flex';
}
$('tabSemrush').addEventListener('click', () => { if (lastReport) activateTab('semrush'); });
$('tabTracking').addEventListener('click', () => { if (lastTracking) activateTab('tracking'); });

function section(title, sub, table) {
  return `<div class="sec"><h3>${title}</h3><p class="sub">${sub}</p>${table}</div>`;
}

function deltaCell(d, isFloat) {
  const v = isFloat ? d.toFixed(1) : fmt(Math.round(d));
  const cls = d > 0 ? 'st-ok' : d < 0 ? 'st-bad' : '';
  const arrow = d > 0 ? '▲ ' : d < 0 ? '▼ ' : '';
  return `<span class="${cls}">${arrow}${d > 0 ? '+' : ''}${v}</span>`;
}

function renderTrends(t) {
  const parts = [];
  parts.push(`<div class="sec highlights"><h3>What Changed This Week — vs ${esc(t.prevLabel || t.prevWeekKey)}</h3>
    <ul class="hl">${t.narrative.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`);

  // Headline movement
  parts.push(section('Week-over-Week — Nykaa headline metrics', `This week (${esc(t.currWeekKey)}) vs last (${esc(t.prevWeekKey)}).`,
    tbl(['Metric', 'Last week', 'This week', 'Change'],
      t.summaryDeltas.map((d) => {
        const isFloat = d.label.toLowerCase().includes('visibility') && !d.label.includes('Topics');
        return [d.label, isFloat ? d.prev.toFixed(1) : fmt(d.prev), isFloat ? d.curr.toFixed(1) : fmt(d.curr), deltaCell(d.delta, isFloat)];
      }), { numCols: [1, 2, 3] })));

  // Category movement
  const moved = t.categoryDeltas.filter((d) => d.delta !== 0);
  if (moved.length) {
    parts.push(section('Week-over-Week — Mentions by category', 'Where Nykaa mentions grew or fell.',
      tbl(['Category', 'Last week', 'This week', 'Change'],
        moved.map((d) => [esc(d.label), fmt(d.prev), fmt(d.curr), deltaCell(d.delta, false)]),
        { numCols: [1, 2, 3] })));
  }

  // Movers
  if (t.visibilityGainers.length || t.visibilityLosers.length) {
    const rows = [];
    t.visibilityGainers.forEach((m) => rows.push(['▲ Gainer', esc(m.topic), m.prev, m.curr, deltaCell(m.delta, false)]));
    t.visibilityLosers.forEach((m) => rows.push(['▼ Loser', esc(m.topic), m.prev, m.curr, deltaCell(m.delta, false)]));
    parts.push(section('Week-over-Week — Topic visibility movers', 'Topics that gained or lost the most AI visibility.',
      tbl(['Move', 'Topic', 'Last', 'This', 'Change'], rows, { numCols: [2, 3, 4] })));
  }

  // Gap & roster changes
  const lists = [];
  if (t.closedGaps.length) lists.push(`<p class="sub"><strong class="st-ok">Closed gaps (${t.closedGaps.length}):</strong> ${t.closedGaps.slice(0, 20).map(esc).join(', ')}</p>`);
  if (t.newGaps.length) lists.push(`<p class="sub"><strong class="st-bad">New gaps (${t.newGaps.length}):</strong> ${t.newGaps.slice(0, 20).map(esc).join(', ')}</p>`);
  if (t.newTopics.length) lists.push(`<p class="sub"><strong>New topics this week (${t.newTopics.length}):</strong> ${t.newTopics.slice(0, 20).map(esc).join(', ')}</p>`);
  if (t.droppedTopics.length) lists.push(`<p class="sub"><strong>Dropped topics (${t.droppedTopics.length}):</strong> ${t.droppedTopics.slice(0, 20).map(esc).join(', ')}</p>`);
  if (lists.length) parts.push(`<div class="sec"><h3>Week-over-Week — Gap &amp; topic roster changes</h3>${lists.join('')}</div>`);

  return parts.join('');
}

// ---- master tracker (.xlsx) parsing — done in the browser, never uploaded ----
const MONTHS = /(20\d\d|before|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;

async function parseTracker(file, vertical) {
  if (!window.XLSX) throw new Error('Excel reader not loaded yet — retry in a moment.');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  // Pick the Core Beauty / Core Fashion sheet for this vertical.
  const want = vertical === 'fashion' ? 'fashion' : 'beauty';
  const sheetName = wb.SheetNames.find((n) => /core/i.test(n) && n.toLowerCase().includes(want))
    || wb.SheetNames.find((n) => n.toLowerCase().includes(want))
    || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: '' });

  // Find the metric-header row ("Prompt Theme" in column 0). The date labels sit
  // in a header row above it (sometimes 1, sometimes 2 rows up) — pick the row
  // above hr with the most week-like (month/year) labels.
  let hr = rows.findIndex((r) => String(r[0] || '').trim().toLowerCase() === 'prompt theme');
  if (hr < 1) throw new Error(`Couldn't find the "Prompt Theme" header in sheet "${sheetName}".`);
  let dateRow = null, bestHits = -1;
  for (let i = Math.max(0, hr - 3); i < hr; i++) {
    const hits = rows[i].filter((c) => MONTHS.test(String(c || '')) && !/growth/i.test(String(c || ''))).length;
    if (hits > bestHits) { bestHits = hits; dateRow = rows[i]; }
  }
  if (!dateRow) throw new Error('No weekly date header found in the tracker.');

  // A week block starts at every column whose date-header cell is week-like.
  // Within a block: [Mentions, Source Domains, Source URLs] in the next columns.
  const blocks = [];
  dateRow.forEach((v, c) => {
    const label = String(v || '').trim();
    if (c >= 1 && label && MONTHS.test(label) && !/growth/i.test(label)) {
      blocks.push({ col: c, label: label.replace(/nykaa\s*-?\s*/i, '').trim() });
    }
  });
  if (!blocks.length) throw new Error('No weekly date columns recognized in the tracker.');

  const num = (v) => { const n = Number(String(v).replace(/[, ]/g, '')); return Number.isFinite(n) ? n : null; };
  const themes = [];
  for (let r = hr + 1; r < rows.length; r++) {
    const theme = String(rows[r][0] || '').trim();
    if (!theme) continue;
    const series = blocks.map((b) => ({
      mentions: num(rows[r][b.col]),
      sd: num(rows[r][b.col + 1]),
      su: num(rows[r][b.col + 2]),
    }));
    if (series.every((s) => s.mentions === null && s.sd === null && s.su === null)) continue;
    themes.push({ theme, series });
  }
  return { sheetName, weeks: blocks.map((b) => b.label), themes };
}

function growth(first, last) {
  if (first === null || last === null || first === 0) return null;
  return ((last - first) / first) * 100;
}
function pctSpan(p) {
  if (p === null) return '<span class="sub">—</span>';
  const cls = p > 0 ? 'st-ok' : p < 0 ? 'st-bad' : '';
  return `<span class="${cls}">${p > 0 ? '+' : ''}${p.toFixed(1)}%</span>`;
}

// Index of a theme's last / previous NON-EMPTY reading (tracker is filled
// progressively, so themes finish different weeks — compare per theme).
function readings(series) {
  const idx = [];
  series.forEach((s, i) => { if (s.mentions !== null || s.sd !== null || s.su !== null) idx.push(i); });
  return idx;
}

function renderTracking(t) {
  const wk = t.weeks, parts = [];

  // Per-theme: last and previous readings (each theme may end on a different week).
  const enriched = t.themes.map((th) => {
    const idx = readings(th.series);
    const lastI = idx.length ? idx[idx.length - 1] : -1;
    const prevI = idx.length > 1 ? idx[idx.length - 2] : -1;
    const firstI = idx.length ? idx[0] : -1;
    return {
      theme: th.theme,
      asOf: lastI >= 0 ? wk[lastI] : '—',
      last: lastI >= 0 ? th.series[lastI] : { mentions: null, sd: null, su: null },
      prev: prevI >= 0 ? th.series[prevI] : null,
      first: firstI >= 0 ? th.series[firstI] : null,
    };
  });

  // Highlights based on each theme's own week-over-week (robust to partial weeks).
  const moved = enriched.filter((e) => e.prev && e.last.mentions !== null && e.prev.mentions !== null)
    .map((e) => ({ theme: e.theme, g: growth(e.prev.mentions, e.last.mentions), d: e.last.mentions - e.prev.mentions }))
    .filter((x) => x.g !== null);
  const up = moved.filter((m) => m.d > 0).sort((a, b) => b.g - a.g);
  const down = moved.filter((m) => m.d < 0).sort((a, b) => a.g - b.g);
  parts.push(`<div class="sec highlights"><h3>Weekly Theme Tracking — highlights</h3>
    <ul class="hl">
      <li>${t.themes.length} themes tracked across ${wk.length} weeks (${esc(wk[0])} → ${esc(wk[wk.length - 1])}). Note: the latest week is filled in progressively, so each theme is compared to its own previous reading.</li>
      <li>Week-over-week (per theme): ${up.length} themes up, ${down.length} down.</li>
      ${up[0] ? `<li>Top gainer: “${esc(up[0].theme)}” ${pctSpan(up[0].g)} mentions.</li>` : ''}
      ${down[0] ? `<li>Biggest decline: “${esc(down[0].theme)}” ${pctSpan(down[0].g)} mentions — check this.</li>` : ''}
    </ul></div>`);

  // Totals-by-week table (exposes how complete each week is).
  const totRows = wk.map((w, i) => {
    const withData = t.themes.filter((th) => th.series[i].mentions !== null).length;
    const totM = t.themes.reduce((s, th) => s + (th.series[i].mentions ?? 0), 0);
    const totSU = t.themes.reduce((s, th) => s + (th.series[i].su ?? 0), 0);
    return [esc(w), fmt(withData), fmt(totM), fmt(totSU)];
  });
  parts.push(section('Weekly Theme Tracking — totals by week',
    'Total mentions and cited Source URLs per week. “Themes with data” shows how many themes were measured that week (the newest week is usually still being filled in).',
    tbl(['Week', 'Themes with data', 'Total mentions', 'Total Source URLs'], totRows, { numCols: [1, 2, 3] })));

  // Per-theme detail, sorted by latest mentions.
  const rows = [...enriched]
    .sort((a, b) => (b.last.mentions ?? 0) - (a.last.mentions ?? 0))
    .map((e) => {
      const wow = (k) => (e.prev && e.last[k] !== null && e.prev[k] !== null) ? deltaCell(e.last[k] - e.prev[k], false) : '<span class="sub">—</span>';
      const span = e.first ? growth(e.first.mentions, e.last.mentions) : null;
      return [esc(e.theme), esc(e.asOf), fmt(e.last.mentions ?? 0), wow('mentions'), fmt(e.last.sd ?? 0), fmt(e.last.su ?? 0), wow('su'), pctSpan(span)];
    });
  parts.push(section(`Weekly Theme Tracking — by theme (${esc(t.sheetName)})`,
    'Each theme shown at its latest reading. WoW = vs that theme’s previous reading. Span = first → latest week.',
    tbl(['Prompt Theme', 'As of', 'Mentions', 'WoW', 'Source Domains', 'Source URLs', 'URLs WoW', 'Mentions growth (span)'],
      rows, { numCols: [2, 4, 5] })));

  return parts.join('');
}

// ---- history panel ----
$('histBtn').addEventListener('click', async () => {
  const panel = $('histPanel');
  if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  panel.innerHTML = 'Loading…';
  const v = $('vertical').value;
  try {
    const res = await fetch(`/api/wbr-history?vertical=${v}`);
    const data = await res.json();
    if (!data.history || !data.history.length) {
      panel.innerHTML = `<p class="hint">No saved weeks for ${cap(v)} yet${data.error ? ' (' + data.error + ')' : ''}.</p>`;
      return;
    }
    panel.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Week</th><th>Label</th><th>Saved</th><th></th></tr></thead><tbody>${
      data.history.map((h) => `<tr><td>${esc(h.weekKey)}</td><td>${esc(h.label || '-')}</td><td>${esc((h.savedAt || '').slice(0, 10))}</td>
        <td><button class="ghost" data-del="${esc(h.weekKey)}" style="padding:3px 9px">Delete</button></td></tr>`).join('')
    }</tbody></table></div>`;
    panel.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm(`Delete saved week ${b.dataset.del}?`)) return;
      await fetch(`/api/wbr-history?vertical=${v}&weekKey=${b.dataset.del}`, { method: 'DELETE' });
      $('histBtn').click(); $('histBtn').click(); // refresh
    }));
  } catch (e) {
    panel.innerHTML = `<p class="hint">Couldn't load history: ${e.message}</p>`;
  }
});
function g(rep, brand) {
  return rep.summary.find((s) => s.brand === brand) || { topicsInVertical: 0, avgVisibility: 0, totalMentions: 0, totalVolume: 0, topics60: 0, topics80: 0 };
}

// ---- exports ----
// Print: the inactive tab pane is display:none, so window.print() captures only
// the active tab — giving a per-tab PDF.
$('pdfBtn').addEventListener('click', () => window.print());
$('pdfTrackBtn').addEventListener('click', () => window.print());

function saveWb(wb, suffix) {
  const fname = (lastLabel || 'WBR').replace(/[^a-z0-9]+/gi, '_') + suffix + '.xlsx';
  XLSX.writeFile(wb, fname); toast('Excel downloaded');
}

// Weekly Tracking tab -> its own workbook
$('xlsxTrackBtn').addEventListener('click', () => {
  if (!lastTracking || !window.XLSX) return;
  const t = lastTracking;
  const wb = XLSX.utils.book_new();
  const head = ['Prompt Theme'];
  t.weeks.forEach((w) => head.push(`${w} Mentions`, `${w} Src Domains`, `${w} Src URLs`));
  const aoa = [head, ...t.themes.map((th) => {
    const row = [th.theme];
    th.series.forEach((s) => row.push(s.mentions ?? '', s.sd ?? '', s.su ?? ''));
    return row;
  })];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Weekly Theme Tracking');
  saveWb(wb, '_Tracking');
});

// SEMrush Report tab -> its own workbook
$('xlsxBtn').addEventListener('click', () => {
  if (!lastReport || !window.XLSX) return;
  const rep = lastReport, brands = rep.brandsPresent, B = brands.map(cap);
  const wb = XLSX.utils.book_new();
  const add = (name, aoa) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name.slice(0, 31));

  if (rep.highlights && rep.highlights.length)
    add('Highlights', [['Key highlights — what the numbers say'], ...rep.highlights.map((h) => [h])]);
  if (lastTrends) {
    const t = lastTrends;
    add('WoW Highlights', [[`What changed vs ${t.prevWeekKey}`], ...t.narrative.map((n) => [n])]);
    add('WoW Headline', [['Metric', 'Last week', 'This week', 'Change'],
      ...t.summaryDeltas.map((d) => [d.label, d.prev, d.curr, d.delta])]);
    add('WoW Category', [['Category', 'Last week', 'This week', 'Change'],
      ...t.categoryDeltas.map((d) => [d.label, d.prev, d.curr, d.delta])]);
    add('WoW Movers', [['Move', 'Topic', 'Last', 'This', 'Change'],
      ...t.visibilityGainers.map((m) => ['Gainer', m.topic, m.prev, m.curr, m.delta]),
      ...t.visibilityLosers.map((m) => ['Loser', m.topic, m.prev, m.curr, m.delta])]);
  }
  add('Summary', [
    ['Metric', ...B],
    ['Topics in their 1K', ...brands.map((b) => g(rep, b).topicsInVertical)],
    ['Avg AI visibility', ...brands.map((b) => g(rep, b).avgVisibility)],
    ['Total mentions', ...brands.map((b) => g(rep, b).totalMentions)],
    ['Total search volume', ...brands.map((b) => g(rep, b).totalVolume)],
    ['Topics >= 60', ...brands.map((b) => g(rep, b).topics60)],
    ['Topics >= 80', ...brands.map((b) => g(rep, b).topics80)],
  ]);
  add('Category Scorecard', [
    ['Category', 'Topics', 'Avg vis', 'Avg mentions', 'Search volume', 'Leader', 'Signal'],
    ...rep.categoryScorecard.map((c) => [c.category, c.topics, c.avgVisibility, c.avgMentions, c.totalVolume, c.leader, c.signal]),
  ]);
  add('Protect', [
    ['Category', 'Topic', 'Visibility', 'Mentions', 'Search volume', 'Status'],
    ...rep.protect.map((t) => [t.category, t.topic, t.visibility, t.mentions, t.volume, t.status]),
  ]);
  const cB = ['amazon', 'myntra', 'tira', 'flipkart'].filter((b) => rep.gaps.some((x) => x.competitors[cap(b)] !== undefined));
  add('Gap Analysis', [
    ['Priority', 'Category', 'Topic', ...cB.map(cap), 'Search volume'],
    ...rep.gaps.map((gp) => [gp.priority, gp.category, gp.topic, ...cB.map((b) => gp.competitors[cap(b)] ?? 0), gp.volume]),
  ]);
  add('Brand Comparison', [
    ['Category', ...B],
    ...rep.brandComparison.map((bc) => [bc.category, ...brands.map((b) => bc.mentions[b] ?? 0)]),
  ]);
  if (rep.sourceAnalysis.length) {
    add('Cited Sources', [
      ['Page type', ...B],
      ...rep.sourceAnalysis.map((s) => [s.pageType, ...brands.map((b) => s.count[b] ?? 0)]),
    ]);
  }
  if (rep.reviewQueue.length) {
    add('Review Queue', [['Topic', 'Assigned bucket'], ...rep.reviewQueue.map((q) => [q.topic, q.category])]);
  }
  if (lastGlossary.length) {
    add('Glossary', [['Term', 'Definition'], ...lastGlossary.map((g2) => [g2.term, g2.def])]);
  }
  saveWb(wb, '_Report');
});

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}
