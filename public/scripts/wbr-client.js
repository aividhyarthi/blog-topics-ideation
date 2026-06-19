// WBR Builder client: upload SEMrush CSVs -> POST /api/wbr -> render + export.

const $ = (id) => document.getElementById(id);
const files = new Map(); // name -> File (SEMrush CSVs)
let trackerFile = null;  // optional master tracker .xlsx
let lastTracking = null; // parsed cross-brand tracker data

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
let lastNotes = { semrush: '', tracking: '' };

// A notes/instructions panel from the user's free text (escaped).
function notesHtml(text) {
  if (!text || !text.trim()) return '';
  return `<div class="notesbox"><div class="nb-h">📝 Notes</div>${esc(text.trim())}</div>`;
}

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
        notes.push(`Weekly tracker: ${lastTracking.themes.length} topics × ${lastTracking.brands.length} brands × ${lastTracking.weeks.length} weeks (${lastTracking.sheetName}).`);
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

    // Per-tab notes the user typed
    lastNotes = { semrush: $('notesSemrush').value || '', tracking: $('notesTracking').value || '' };
    $('reportSemrush').insertAdjacentHTML('afterbegin', notesHtml(lastNotes.semrush));

    // Weekly Tracking pane (cross-brand + WoW + since-go-live, all from the tracker)
    const tHtml = lastTracking
      ? renderTracking(lastTracking)
      : '<p class="sub">No master tracker uploaded — add your tracker .xlsx to see Weekly Tracking.</p>';
    $('reportTracking').innerHTML = notesHtml(lastNotes.tracking) + tHtml;

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

  // Executive summary — the Nykaa story and the competitor story
  if (rep.nykaaStory || rep.competitorStory) {
    out.push(`<div class="sec stories">
      <h3>Executive Summary</h3>
      <div class="storygrid">
        <div class="story story-nykaa"><div class="story-h">📈 The Nykaa story</div><p>${esc(rep.nykaaStory)}</p></div>
        <div class="story story-comp"><div class="story-h">🎯 The competitor story</div><p>${esc(rep.competitorStory)}</p></div>
      </div>
    </div>`);
  }

  // Key highlights (supporting bullets)
  if (rep.highlights && rep.highlights.length) {
    out.push(`<div class="sec highlights"><h3>Key Highlights</h3>
      <ul class="hl">${rep.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>`);
  }

  // Week-over-week trends
  if (lastTrends) out.push(renderTrends(lastTrends));

  const N = rep.tableNotes || {};

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
      { numCols: brands.map((_, i) => i + 1) }), N.summary));

  // Category scorecard
  out.push(section('Section A — Category Scorecard', 'How many topics Nykaa owns per category, with the current category leader.',
    tbl(['Category', 'Topics', 'Avg vis', 'Avg mentions', 'Search volume', 'Signal'],
      rep.categoryScorecard.map((c) => {
        const row = [esc(c.category), fmt(c.topics), r1(c.avgVisibility), r1(c.avgMentions), fmt(c.totalVolume),
          `<span class="${statusClass(c.signal)}">${esc(c.signal)}</span>`];
        return row;
      }),
      { numCols: [1, 2, 3, 4] }), N.category));

  // Protect
  out.push(section('Section B — Top Topics to Protect', 'Highest-volume Nykaa topics and their current status.',
    tbl(['Category', 'Topic', 'Visibility', 'Mentions', 'Search volume', 'Status'],
      rep.protect.map((t) => [esc(t.category), esc(t.topic), fmt(t.visibility), fmt(t.mentions), fmt(t.volume),
        `<span class="${statusClass(t.status)}">${esc(t.status)}</span>`]),
      { numCols: [2, 3, 4] }), N.protect));

  // Gaps
  const compBrands = ['amazon', 'myntra', 'tira', 'flipkart'].filter((b) =>
    rep.gaps.some((g2) => g2.competitors[cap(b)] !== undefined));
  out.push(section('Section C — Gap Analysis', 'Topics where Nykaa = 0 visibility but competitors rank. Numbers = competitor AI mentions.',
    tbl(['Priority', 'Category', 'Topic (Nykaa = 0)', ...compBrands.map(cap), 'Search volume'],
      rep.gaps.map((gp) => [
        `<span class="prio-${gp.priority}">${esc(gp.priority)}</span>`, esc(gp.category), esc(gp.topic),
        ...compBrands.map((b) => fmt(gp.competitors[cap(b)] ?? 0)), fmt(gp.volume),
      ]),
      { numCols: [...compBrands.map((_, i) => i + 3), compBrands.length + 3] }), N.gaps));

  // Beauty Brands — Nykaa vs competitors
  if (rep.beautyBrands && rep.beautyBrands.length) {
    const bbBrands = ['Nykaa', 'Amazon', 'Myntra', 'Tira', 'Flipkart'].filter((b) =>
      rep.beautyBrands.some((r2) => r2.competitors[b] !== undefined));
    out.push(section('Beauty Brands — Nykaa vs Competitors',
      'Beauty-brand topics where competitors are being mentioned in AI answers. Numbers = AI mentions per brand. Target content / PDP / AEO on the ones Nykaa trails.',
      tbl(['Beauty brand topic', 'Category', ...bbBrands, 'Status'],
        rep.beautyBrands.map((r2) => [esc(r2.topic), esc(r2.category),
          ...bbBrands.map((b) => fmt(r2.competitors[b] ?? 0)),
          `<span class="${statusClass(r2.status)}">${esc(r2.status)}</span>`]),
        { numCols: bbBrands.map((_, i) => i + 2) }), N.beautyBrands));
  }

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
      { numCols: brands.map((_, i) => i + 1) }), N.brandComparison));

  // Source mix
  if (rep.sourceAnalysis.length) {
    const sBrands = brands.filter((b) => rep.sourceAnalysis.some((s) => s.count[b] !== undefined));
    out.push(section('Cited-Source Mix', 'Page types AI engines cite, per brand (from the sources export). Healthy = low homepage share, high blog/PDP.',
      tbl(['Page type', ...sBrands.map(cap)],
        rep.sourceAnalysis.map((s) => [esc(s.pageType), ...sBrands.map((b) => fmt(s.count[b] ?? 0))]),
        { numCols: sBrands.map((_, i) => i + 1) }), N.sourceAnalysis));
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
  const hasTrack = !!lastTracking;
  $('tabSemrush').disabled = !lastReport;
  $('tabTracking').disabled = !hasTrack;
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

// Metric toggle inside the Weekly Tracking tab (Mentions / Source Domains / Source URLs)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.mt');
  if (!btn) return;
  const pane = btn.closest('#reportTracking');
  if (!pane) return;
  pane.querySelectorAll('.mt').forEach((b) => b.classList.toggle('active', b === btn));
  pane.querySelectorAll('.metric-block').forEach((blk) => {
    blk.style.display = blk.dataset.metric === btn.dataset.metric ? 'block' : 'none';
  });
});

// title/sub may contain caller-escaped dynamic parts, so they are NOT re-escaped
// here; `note` is plain data, so it is escaped.
function section(title, sub, table, note) {
  const callout = note ? `<p class="callout">💡 <strong>Key call-out:</strong> ${esc(note)}</p>` : '';
  return `<div class="sec"><h3>${title}</h3><p class="sub">${sub}</p>${table}${callout}</div>`;
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

// ---- master tracker (.xlsx) — vertical brand blocks, parsed in the browser ----
// The weekly sheet stacks brands in row blocks: a header row whose first cell is
// the brand name (Nykaa / Amazon / Myntra / Tira) and which carries the week
// labels, then 2 sub-header rows, then the theme rows. Same week columns repeat
// for each brand block. We read every block so all 4 brands get WoW + growth.
const BRAND_RE = /(nykaa|amazon|myntra|tira|flipkart|ajio)/i;
const MONTHS = /(20\d\d|before|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
const MONTH_IDX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function brandFromLabel(s) {
  const m = String(s || '').toLowerCase().match(BRAND_RE);
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : null;
}
const toNum = (v) => {
  const s = String(v).replace(/[, ]/g, '').trim();
  if (s === '' || /^na$/i.test(s)) return null; // blank or NA = no reading (NOT zero)
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const metricScore = (row) => row.filter((c) => /^(mentions|source domains|source urls)$/i.test(String(c).trim())).length;
function findMetricRow(rows, start, span = 4) {
  let idx = -1, best = 0;
  for (let i = start; i < Math.min(rows.length, start + span); i++) {
    const s = metricScore(rows[i]);
    if (s > best) { best = s; idx = i; }
  }
  return idx;
}
function monthCount(row) {
  return row.filter((c) => MONTHS.test(String(c)) && !/growth/i.test(String(c))).length;
}
// "Before - May 7th 2026" / "June 17th 2026" -> Date
function weekToDate(label) {
  const m = String(label).toLowerCase().match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})/);
  if (!m) return null;
  const yr = (String(label).match(/20\d\d/) || ['2026'])[0];
  return new Date(Number(yr), MONTH_IDX[m[1]], Number(m[2]));
}
// "Apr W4" / "Jun W3" -> Date (week-of-month -> approx day)
function goliveToDate(s) {
  const m = String(s).toLowerCase().match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*w\s*(\d)/);
  if (!m) return null;
  return new Date(2026, MONTH_IDX[m[1]], (Number(m[2]) - 1) * 7 + 1);
}

// Condensed client-side category guesser (to group like the PDF).
function trackCategory(name, vertical) {
  const h = ' ' + String(name).toLowerCase() + ' ';
  const has = (arr) => arr.some((k) => h.includes(k));
  if (vertical === 'fashion') {
    if (has(['saree', 'kurta', 'kurti', 'salwar', 'lehenga', 'ethnic', 'blouse', 'dupatta', 'anarkali'])) return 'Indian Wear';
    if (has(['shoe', 'sneaker', 'sandal', 'slipper', 'footwear', 'heel', 'boot', 'crocs'])) return 'Footwear';
    if (has(['bag', 'handbag', 'backpack', 'luggage', 'wallet', 'clutch'])) return 'Bags';
    if (has(['jewellery', 'jewelry', 'earring', 'necklace', 'bracelet', 'bangle', 'ring'])) return 'Jewellery';
    if (has(['bra', 'lingerie', 'innerwear', 'panties', 'nightwear', 'shapewear'])) return 'Lingerie';
    if (has(["men", 'shirt', 't-shirt', 'tshirt', 'jacket', 'suit'])) return 'Men Fashion';
    if (has(['dress', 'jean', 'top', 'skirt', 'trouser', 'pant', 'short', 'western', 'gown'])) return 'Western Wear';
    return 'Other Fashion';
  }
  if (has(['lip', 'lipstick', 'gloss', 'lip liner', 'lip tint', 'lip crayon', 'lip plumper'])) return 'Lips';
  if (has(['eye', 'kajal', 'mascara', 'eyeliner', 'eyeshadow', 'eyebrow', 'brow', 'lash'])) return 'Eye Makeup';
  if (has(['foundation', 'concealer', 'blush', 'highlighter', 'compact', 'primer', 'powder', 'bb cream', 'contour', 'bronzer'])) return 'Face Makeup';
  if (has(['nail'])) return 'Nail';
  if (has(['perfume', 'fragrance', 'deodorant', 'deo', 'parfum', 'mist', 'attar', 'cologne', 'eau de'])) return 'Fragrance';
  if (has(['shampoo', 'conditioner', 'hair'])) return 'Hair Care';
  if (has(['body', 'soap', 'shower', 'bath', 'sanitary', 'wax', 'hand cream', 'foot', 'intimate', 'hygiene', 'talc'])) return 'Body Care';
  if (has(['skin', 'serum', 'moisturizer', 'moisturiser', 'sunscreen', 'spf', 'cleanser', 'toner', 'face wash', 'cream', 'gel', 'mask', 'scrub', 'sun care'])) return 'Skincare';
  return 'Other Beauty';
}
const BEAUTY_CATS = ['Skincare', 'Lips', 'Hair Care', 'Fragrance', 'Eye Makeup', 'Face Makeup', 'Body Care', 'Nail', 'Other Beauty'];
const FASHION_CATS = ['Indian Wear', 'Western Wear', 'Men Fashion', 'Bags', 'Lingerie', 'Footwear', 'Jewellery', 'Accessories', 'Other Fashion'];

// go-live group keyword -> sheet-group matcher (to read its date)
const GOLIVE_MAP = {
  beauty: [
    { re: /moistur|^.*cream|lotion/, sheet: /moisturizer/i },
    { re: /sunscreen|sun ?care|spf/, sheet: /suncare|sun ?care/i },
    { re: /toner|serum/, sheet: /toner|serum/i },
    { re: /lip|foundation|conceal|blush|highlight|eye|kajal|mascara|brow|lash|makeup|primer|compact|powder/, sheet: /makeup/i },
    { re: /shampoo|conditioner|hair/, sheet: /^hair/i },
  ],
  fashion: [
    { re: /western|dress|top|jean|trouser|pant|t-?shirt|skirt|shirt|gown/, sheet: /western/i },
    { re: /saree|kurta|kurti|salwar|lehenga|ethnic|blouse|indian/, sheet: /indian/i },
  ],
};

function parseGoLive(wb) {
  const sh = wb.SheetNames.find((n) => /go ?live/i.test(n));
  if (!sh) return [];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sh], { header: 1, blankrows: false, defval: '' });
  const out = [];
  for (const r of rows.slice(1)) {
    const group = String(r[0] || '').trim();
    if (!group) continue;
    const actual = String(r[2] || '').trim();
    const eta = String(r[1] || '').trim();
    const date = goliveToDate(actual) || goliveToDate(eta);
    if (date) out.push({ group, date, label: actual || eta });
  }
  return out;
}

async function parseTracker(file, vertical) {
  if (!window.XLSX) throw new Error('Excel reader not loaded yet — retry in a moment.');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const isFashion = (n) => /fashion/i.test(n);

  // Pick the weekly sheet for this vertical (most brand-block headers).
  let pick = null;
  for (const name of wb.SheetNames) {
    if (/go ?live/i.test(name)) continue;
    if (vertical === 'beauty' ? isFashion(name) : !isFashion(name)) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: '' });
    const headers = rows.filter((r) => brandFromLabel(r[0]) && monthCount(r) >= 2).length;
    if (headers >= 1 && headers > (pick?.headers ?? 0)) pick = { name, rows, headers };
  }
  if (!pick) throw new Error(`No weekly brand-block sheet found for ${vertical}.`);
  const { name: sheetName, rows } = pick;

  // Brand-block section starts
  const starts = [];
  rows.forEach((r, i) => { if (brandFromLabel(r[0]) && monthCount(r) >= 2) starts.push(i); });

  const series = {}; // theme -> brand -> [{m,sd,su} per week]
  let weeks = null;
  const brands = [];
  const themeOrder = [];
  for (let s = 0; s < starts.length; s++) {
    const hi = starts[s];
    const brand = brandFromLabel(rows[hi][0]);
    const mi = findMetricRow(rows, hi, 4);
    if (mi < 0) continue;
    const headerRow = rows[hi], metricRow = rows[mi];
    const blocks = [];
    headerRow.forEach((v, col) => {
      const label = String(v || '').trim();
      if (col >= 1 && label && MONTHS.test(label) && !/growth/i.test(label)) {
        const end = col + 4;
        const find = (re) => { for (let k = col; k < end; k++) if (re.test(String(metricRow[k]))) return k; return -1; };
        blocks.push({ week: label.replace(BRAND_RE, '').replace(/[-–]/g, ' ').replace(/\s+/g, ' ').trim(), m: find(/mention/i), sd: find(/source\s*domain/i), su: find(/source\s*url/i) });
      }
    });
    if (!blocks.length) continue;
    if (!weeks) weeks = blocks.map((b) => ({ label: b.week, date: weekToDate(b.week) }));
    if (!brands.includes(brand)) brands.push(brand);
    const dataEnd = s + 1 < starts.length ? starts[s + 1] : rows.length;
    for (let r = mi + 1; r < dataEnd; r++) {
      const theme = String(rows[r][0] || '').trim();
      if (!theme) continue;
      const arr = blocks.map((b) => ({
        m: b.m >= 0 ? toNum(rows[r][b.m]) : null,
        sd: b.sd >= 0 ? toNum(rows[r][b.sd]) : null,
        su: b.su >= 0 ? toNum(rows[r][b.su]) : null,
      }));
      if (arr.every((x) => x.m == null && x.sd == null && x.su == null)) continue;
      (series[theme] = series[theme] || {})[brand] = arr;
      if (!themeOrder.includes(theme)) themeOrder.push(theme);
    }
  }
  if (!brands.length) throw new Error('No brand blocks parsed from the weekly sheet.');

  // Map each theme -> go-live week index (nearest week on/after its group's date)
  const goLiveList = parseGoLive(wb);
  const groups = GOLIVE_MAP[vertical] || [];
  const goLiveIdx = {};
  for (const theme of themeOrder) {
    const h = ' ' + theme.toLowerCase() + ' ';
    const g = groups.find((gr) => gr.re.test(h));
    if (!g) { goLiveIdx[theme] = null; continue; }
    const row = goLiveList.find((x) => g.sheet.test(x.group));
    if (!row || !row.date) { goLiveIdx[theme] = null; continue; }
    let idx = weeks.findIndex((w) => w.date && w.date >= row.date);
    if (idx < 0) idx = weeks.length - 1; // go-live after all tracked weeks
    goLiveIdx[theme] = idx;
  }

  return { sheetName, vertical, brands, weeks, themes: themeOrder, series, goLiveIdx };
}

// ---- tracker rendering ----
function pctCell(prev, last) {
  if (prev == null || last == null) return '<span class="sub">—</span>';
  if (prev === 0) return last ? '<span class="st-ok">▲ new</span>' : '<span class="sub">—</span>';
  const p = ((last - prev) / prev) * 100;
  const cls = p > 0 ? 'st-ok' : p < 0 ? 'st-bad' : '';
  const a = p > 0 ? '▲' : p < 0 ? '▼' : '';
  return `<span class="${cls}">${a} ${p > 0 ? '+' : ''}${p.toFixed(0)}%</span>`;
}
const METRICS = [['m', 'Mentions'], ['sd', 'Source Domains'], ['su', 'Source URLs']];

function renderTracking(t) {
  const brands = t.brands;
  const ser = (theme, brand) => (t.series[theme] && t.series[theme][brand]) || [];
  const lastNN = (arr, key) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] && arr[i][key] != null) return { i, v: arr[i][key] }; return null; };
  const prevNN = (arr, key, before) => { for (let i = before - 1; i >= 0; i--) if (arr[i] && arr[i][key] != null) return { i, v: arr[i][key] }; return null; };
  const atGoLive = (arr, key, idx) => {
    if (idx == null) return null;
    for (let i = idx; i < arr.length; i++) if (arr[i] && arr[i][key] != null) return { i, v: arr[i][key] };
    for (let i = idx - 1; i >= 0; i--) if (arr[i] && arr[i][key] != null) return { i, v: arr[i][key] };
    return null;
  };
  const totLatest = (brand, key) => t.themes.reduce((s, th) => { const l = lastNN(ser(th, brand), key); return s + (l ? l.v : 0); }, 0);
  const latestWeek = (() => { for (let i = t.weeks.length - 1; i >= 0; i--) { if (t.themes.some((th) => brands.some((b) => ser(th, b)[i] && ser(th, b)[i].m != null))) return t.weeks[i].label; } return t.weeks[t.weeks.length - 1]?.label; })();

  const parts = [];

  // Summary
  const ranked = [...brands].sort((a, b) => totLatest(b, 'm') - totLatest(a, 'm'));
  const lead = ranked[0];
  // Nykaa WoW total (mentions)
  let nykPrev = 0, nykLast = 0;
  for (const th of t.themes) { const a = ser(th, 'Nykaa'); const l = lastNN(a, 'm'); if (!l) continue; const p = prevNN(a, 'm', l.i); nykLast += l.v; if (p) nykPrev += p.v; }
  const nykWoW = nykPrev ? Math.round(((nykLast - nykPrev) / nykPrev) * 100) : 0;
  parts.push(`<div class="sec stories"><h3>Weekly Tracking — Summary</h3><div class="storygrid">
    <div class="story story-nykaa"><div class="story-h">📈 Nykaa</div><p>Across ${t.themes.length} tracked ${t.vertical} topics, Nykaa has ${fmt(totLatest('Nykaa', 'm'))} brand mentions (latest week ${esc(latestWeek)}), ${nykWoW >= 0 ? '+' : ''}${nykWoW}% week-over-week. Source URLs: ${fmt(totLatest('Nykaa', 'su'))}.</p></div>
    <div class="story story-comp"><div class="story-h">🎯 Competitors</div><p>${brands.filter((b) => b !== 'Nykaa').map((b) => `${esc(b)} ${fmt(totLatest(b, 'm'))}`).join(', ')} mentions. ${lead === 'Nykaa' ? 'Nykaa leads on mentions.' : `${esc(lead)} currently leads on mentions.`} Use the metric toggle and the WoW / Since-go-live tables below to see who is moving.</p></div>
  </div></div>`);

  // Hero cards (latest mentions)
  const maxM = Math.max(1, ...brands.map((b) => totLatest(b, 'm')));
  const card = (b) => {
    const m = totLatest(b, 'm'); const win = m === maxM; const w = Math.round((m / maxM) * 100);
    return '<div class="brandcard' + (win ? ' win' : '') + '">'
      + '<div class="bc-name">' + esc(b) + (win ? ' 🏆' : '') + '</div>'
      + '<div class="bc-num">' + fmt(m) + '</div><div class="bc-cap">mentions (latest week)</div>'
      + '<div class="bar"><span style="width:' + w + '%"></span></div>'
      + '<div class="bc-sub">Src Domains ' + fmt(totLatest(b, 'sd')) + ' · Src URLs ' + fmt(totLatest(b, 'su')) + '</div></div>';
  };
  parts.push('<div class="brandcards">' + brands.map(card).join('') + '</div>');

  // Metric toggle + one block per metric
  parts.push(`<div class="metric-toggle">${METRICS.map(([k, l], i) => `<button class="mt${i === 0 ? ' active' : ''}" data-metric="${k}">${l}</button>`).join('')}<span class="mt-hint">switch metric — applies to every table below</span></div>`);

  const cats = (t.vertical === 'fashion' ? FASHION_CATS : BEAUTY_CATS);
  const blocks = METRICS.map(([key, label], mi) => {
    const p = [];
    // group themes by category
    const grouped = {};
    for (const th of t.themes) { const c = trackCategory(th, t.vertical); (grouped[c] = grouped[c] || []).push(th); }

    // 1) Latest cross-brand comparison (by category, subtotals + grand total)
    const gtot = Object.fromEntries(brands.map((b) => [b, 0]));
    for (const cat of cats) {
      const ths = grouped[cat]; if (!ths || !ths.length) continue;
      const rows = ths.map((th) => {
        const vals = brands.map((b) => { const l = lastNN(ser(th, b), key); return l ? l.v : 0; });
        const mx = Math.max(...vals);
        return [esc(th), ...vals.map((v) => (v === mx && mx > 0) ? `<span class="win">${fmt(v)}</span>` : fmt(v))];
      });
      const sub = ['SUBTOTAL', ...brands.map((b) => { const s = ths.reduce((a, th) => { const l = lastNN(ser(th, b), key); return a + (l ? l.v : 0); }, 0); gtot[b] += s; return fmt(s); })];
      sub._cls = 'subtotal-row';
      rows.push(sub);
      p.push(section(`${cat} — ${label} (latest week)`, '', tbl(['Topic', ...brands], rows, { numCols: brands.map((_, i) => i + 1) })));
    }
    const gt = ['GRAND TOTAL', ...brands.map((b) => fmt(gtot[b]))]; gt._cls = 'grand-row';
    p.push(tbl(['Total', ...brands], [gt], { numCols: brands.map((_, i) => i + 1) }));

    // 2) Week-over-week % (all brands)
    const wowRows = t.themes.map((th) => {
      const cells = brands.map((b) => { const a = ser(th, b); const l = lastNN(a, key); if (!l) return '<span class="sub">—</span>'; const pr = prevNN(a, key, l.i); return pr ? pctCell(pr.v, l.v) : '<span class="sub">—</span>'; });
      return { th, cells, sortv: (lastNN(ser(th, 'Nykaa'), key) || {}).v || 0 };
    }).sort((a, b) => b.sortv - a.sortv).map((r) => [esc(r.th), ...r.cells]);
    p.push(section(`Week-over-Week growth — ${label}`, 'Latest filled week vs the previous, per brand.', tbl(['Topic', ...brands], wowRows, { numCols: [] })));

    // 3) Since go-live % (all brands)
    const glRows = t.themes.map((th) => {
      const idx = t.goLiveIdx[th];
      const cells = brands.map((b) => { const a = ser(th, b); const l = lastNN(a, key); const base = atGoLive(a, key, idx); return (l && base) ? pctCell(base.v, l.v) : '<span class="sub">—</span>'; });
      return { th, cells, has: idx != null, sortv: (lastNN(ser(th, 'Nykaa'), key) || {}).v || 0 };
    }).filter((r) => r.has).sort((a, b) => b.sortv - a.sortv).map((r) => [esc(r.th), ...r.cells]);
    if (glRows.length) p.push(section(`Since go-live growth — ${label}`, 'Latest week vs the week your changes went live (from the Go Live Dates sheet).', tbl(['Topic', ...brands], glRows, { numCols: [] })));

    return `<div class="metric-block" data-metric="${key}"${mi ? ' style="display:none"' : ''}>${p.join('')}</div>`;
  });
  parts.push(blocks.join(''));

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

// Weekly Tracking tab -> its own workbook (full weekly series per brand + metric)
$('xlsxTrackBtn').addEventListener('click', () => {
  if (!lastTracking || !window.XLSX) return;
  const t = lastTracking, brands = t.brands;
  const wb = XLSX.utils.book_new();
  if (lastNotes.tracking && lastNotes.tracking.trim())
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Notes'], [lastNotes.tracking]]), 'Notes');
  const ser = (theme, brand) => (t.series[theme] && t.series[theme][brand]) || [];

  // One sheet per metric: Topic | Brand | <each week> ... full series.
  for (const [key, label] of [['m', 'Mentions'], ['sd', 'Source Domains'], ['su', 'Source URLs']]) {
    const head = ['Topic', 'Brand', ...t.weeks.map((w) => w.label), 'Go-live week'];
    const aoa = [head];
    for (const th of t.themes) {
      for (const b of brands) {
        const arr = ser(th, b);
        if (!arr.length || !arr.some((x) => x && x[key] != null)) continue;
        const gl = t.goLiveIdx[th];
        aoa.push([th, b, ...t.weeks.map((_, i) => (arr[i] && arr[i][key] != null ? arr[i][key] : '')), gl != null ? (t.weeks[gl]?.label || '') : '']);
      }
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), label.slice(0, 31));
  }
  saveWb(wb, '_Tracking');
});

// SEMrush Report tab -> its own workbook
$('xlsxBtn').addEventListener('click', () => {
  if (!lastReport || !window.XLSX) return;
  const rep = lastReport, brands = rep.brandsPresent, B = brands.map(cap);
  const wb = XLSX.utils.book_new();
  const add = (name, aoa) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name.slice(0, 31));

  if (lastNotes.semrush && lastNotes.semrush.trim()) add('Notes', [['Notes'], [lastNotes.semrush]]);
  add('Executive Summary', [
    ['The Nykaa story'], [rep.nykaaStory || ''], [''],
    ['The competitor story'], [rep.competitorStory || ''],
  ]);
  if (rep.highlights && rep.highlights.length)
    add('Highlights', [['Key highlights'], ...rep.highlights.map((h) => [h])]);
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
  if (rep.beautyBrands && rep.beautyBrands.length) {
    const bbB = ['Nykaa', 'Amazon', 'Myntra', 'Tira', 'Flipkart'].filter((b) => rep.beautyBrands.some((r2) => r2.competitors[b] !== undefined));
    add('Beauty Brands', [['Beauty brand topic', 'Category', ...bbB, 'Status'],
      ...rep.beautyBrands.map((r2) => [r2.topic, r2.category, ...bbB.map((b) => r2.competitors[b] ?? 0), r2.status])]);
  }
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
