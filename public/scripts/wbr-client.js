// WBR Builder client: upload SEMrush CSVs -> POST /api/wbr -> render + export.

const $ = (id) => document.getElementById(id);
const files = new Map(); // name -> File

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-IN') : n ?? '-');
const r1 = (n) => (typeof n === 'number' ? n.toFixed(1) : n ?? '-');

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
  for (const [name, f] of files) {
    const { brand, type } = detect(name);
    const div = document.createElement('div');
    div.className = 'fileitem';
    const warn = type === 'unknown' ? ' warn' : '';
    div.innerHTML = `<span class="b">${cap(brand)}</span>
      <span class="tag${warn}">${type}</span>
      <span style="color:var(--muted)">${name}</span>
      <span style="margin-left:auto;color:var(--muted)">${(f.size / 1024).toFixed(0)} KB</span>
      <button class="ghost" data-rm="${name}" style="padding:3px 9px">✕</button>`;
    el.appendChild(div);
  }
  el.querySelectorAll('[data-rm]').forEach((b) =>
    b.addEventListener('click', () => { files.delete(b.dataset.rm); renderFileList(); }));
}

function addFiles(list) {
  for (const f of list) if (f.name.toLowerCase().endsWith('.csv')) files.set(f.name, f);
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
let lastGlossary = [];
let lastLabel = '';

$('genBtn').addEventListener('click', async () => {
  const err = $('errBox'), info = $('infoBox');
  err.style.display = info.style.display = 'none';
  if (files.size === 0) { err.textContent = 'Add at least one CSV file.'; err.style.display = 'block'; return; }

  const btn = $('genBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Generating…';
  try {
    const fd = new FormData();
    fd.set('vertical', $('vertical').value);
    fd.set('useClaude', $('useClaude').checked ? 'true' : 'false');
    for (const [, f] of files) fd.append('files', f);

    const res = await fetch('/api/wbr', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Request failed');

    lastReport = data.report;
    lastGlossary = data.glossary || [];
    lastLabel = $('reportLabel').value.trim() ||
      `Nykaa ${cap(data.report.vertical)} · AI Visibility`;
    renderReport(data.report, data.meta);
    $('results').style.display = 'block';
    $('results').scrollIntoView({ behavior: 'smooth' });

    const m = data.meta;
    let note = `Parsed ${m.filesParsed.length} files.`;
    if ($('useClaude').checked) {
      note += m.claudeAvailable
        ? ` Claude classified ${m.claudeClassified} leftover topics.`
        : ' Claude fallback requested but no API key is configured on the server — used rules only.';
    }
    info.textContent = note; info.style.display = 'block';
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
      <ul class="hl">${rep.highlights.map((h) => `<li>${h}</li>`).join('')}</ul></div>`);
  }

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
        const row = [c.category, fmt(c.topics), r1(c.avgVisibility), r1(c.avgMentions), fmt(c.totalVolume),
          `<span class="${statusClass(c.signal)}">${c.signal}</span>`];
        return row;
      }),
      { numCols: [1, 2, 3, 4] })));

  // Protect
  out.push(section('Section B — Top Topics to Protect', 'Highest-volume Nykaa topics and their current status.',
    tbl(['Category', 'Topic', 'Visibility', 'Mentions', 'Search volume', 'Status'],
      rep.protect.map((t) => [t.category, t.topic, fmt(t.visibility), fmt(t.mentions), fmt(t.volume),
        `<span class="${statusClass(t.status)}">${t.status}</span>`]),
      { numCols: [2, 3, 4] })));

  // Gaps
  const compBrands = ['amazon', 'myntra', 'tira', 'flipkart'].filter((b) =>
    rep.gaps.some((g2) => g2.competitors[cap(b)] !== undefined));
  out.push(section('Section C — Gap Analysis', 'Topics where Nykaa = 0 visibility but competitors rank. Numbers = competitor AI mentions.',
    tbl(['Priority', 'Category', 'Topic (Nykaa = 0)', ...compBrands.map(cap), 'Search volume'],
      rep.gaps.map((gp) => [
        `<span class="prio-${gp.priority}">${gp.priority}</span>`, gp.category, gp.topic,
        ...compBrands.map((b) => fmt(gp.competitors[cap(b)] ?? 0)), fmt(gp.volume),
      ]),
      { numCols: [...compBrands.map((_, i) => i + 3), compBrands.length + 3] })));

  // Brand comparison
  out.push(section('Brand Comparison — Mentions by Category', 'Total AI mentions per category from each brand\'s own 1K topics. Leader highlighted.',
    tbl(['Category', ...brands.map(cap)],
      rep.brandComparison.map((bc) => {
        const max = Math.max(...brands.map((b) => bc.mentions[b] ?? 0));
        const row = [bc.category, ...brands.map((b) => {
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
        rep.sourceAnalysis.map((s) => [s.pageType, ...sBrands.map((b) => fmt(s.count[b] ?? 0))]),
        { numCols: sBrands.map((_, i) => i + 1) })));
  }

  // Review queue
  if (rep.reviewQueue.length) {
    out.push(`<details class="review sec"><summary>⚠ Review queue — ${rep.reviewQueue.length} topics the rules couldn't confidently categorize</summary>
      <p class="sub" style="margin-top:8px">These were treated as noise (excluded from totals). Turn on the Claude fallback or refine the keyword dictionary to recover the beauty/fashion ones.</p>
      ${tbl(['Topic', 'Assigned bucket'], rep.reviewQueue.map((q) => [q.topic, q.category]))}</details>`);
  }

  // Glossary — define every heading/term
  if (lastGlossary.length) {
    out.push(`<details class="review sec" open><summary>📖 What these terms mean</summary>
      <div class="tw" style="margin-top:8px"><table><tbody>${
        lastGlossary.map((g2) => `<tr><td style="font-weight:600;white-space:normal">${g2.term}</td><td style="white-space:normal;color:var(--muted)">${g2.def}</td></tr>`).join('')
      }</tbody></table></div></details>`);
  }

  $('report').innerHTML = out.join('');
}

function section(title, sub, table) {
  return `<div class="sec"><h3>${title}</h3><p class="sub">${sub}</p>${table}</div>`;
}
function g(rep, brand) {
  return rep.summary.find((s) => s.brand === brand) || { topicsInVertical: 0, avgVisibility: 0, totalMentions: 0, totalVolume: 0, topics60: 0, topics80: 0 };
}

// ---- exports ----
$('pdfBtn').addEventListener('click', () => window.print());

$('xlsxBtn').addEventListener('click', () => {
  if (!lastReport || !window.XLSX) return;
  const rep = lastReport, brands = rep.brandsPresent, B = brands.map(cap);
  const wb = XLSX.utils.book_new();
  const add = (name, aoa) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name.slice(0, 31));

  if (rep.highlights && rep.highlights.length)
    add('Highlights', [['Key highlights — what the numbers say'], ...rep.highlights.map((h) => [h])]);
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
  const fname = (lastLabel || 'WBR').replace(/[^a-z0-9]+/gi, '_') + '.xlsx';
  XLSX.writeFile(wb, fname);
  toast('Excel downloaded');
});

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}
