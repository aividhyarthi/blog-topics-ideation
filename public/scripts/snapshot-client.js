// AI Visibility Snapshot client: upload a prospect's SEMrush CSV(s) ->
// POST /api/snapshot -> render a one-page, prospect-facing sales snapshot.

const $ = (id) => document.getElementById(id);
const files = new Map(); // name -> File
let logoDataUrl = null;

// Escape uploaded-file-derived values before they hit innerHTML.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (typeof n === 'number' ? Math.round(n).toLocaleString('en-IN') : esc(n ?? '-'));

function detect(name) {
  const l = name.toLowerCase();
  let type = 'unknown';
  if (l.includes('gap')) type = 'gap_topics';
  else if (l.includes('source') || l.includes('cited')) type = 'sources';
  else if (l.includes('topic') || l.includes('brand')) type = 'brand_topics';
  return { type };
}

function renderFileList() {
  const el = $('filelist');
  el.innerHTML = '';
  for (const [name, f] of files) {
    const { type } = detect(name);
    const warn = type === 'unknown' || type === 'sources' ? ' warn' : '';
    const div = document.createElement('div');
    div.className = 'fileitem';
    div.innerHTML = `<span class="tag${warn}">${esc(type)}</span>
      <span style="color:var(--muted)">${esc(name)}</span>
      <span style="margin-left:auto;color:var(--muted)">${(f.size / 1024).toFixed(0)} KB</span>
      <button class="ghost" data-rm="${esc(name)}" style="padding:3px 9px">✕</button>`;
    el.appendChild(div);
  }
  el.querySelectorAll('[data-rm]').forEach((b) =>
    b.addEventListener('click', () => { files.delete(b.dataset.rm); renderFileList(); }));
}

function addFiles(list) {
  const skipped = [];
  for (const f of list) {
    if (f.name.toLowerCase().endsWith('.csv')) files.set(f.name, f);
    else skipped.push(f.name);
  }
  if (skipped.length) showErr(`Only SEMrush .csv exports are supported here: ${skipped.join(', ')}`);
  else hideErr();
  renderFileList();
}

function showErr(msg) { const e = $('errBox'); e.textContent = msg; e.style.display = 'block'; }
function hideErr() { $('errBox').style.display = 'none'; }
function showInfo(msg) { const e = $('infoBox'); e.innerHTML = msg; e.style.display = msg ? 'block' : 'none'; }

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}

// ---- upload wiring ----
const drop = $('drop');
const fileInput = $('fileInput');
drop.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => addFiles(e.target.files));
['dragenter', 'dragover'].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

$('logoInput').addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (!f) { logoDataUrl = null; return; }
  const reader = new FileReader();
  reader.onload = () => { logoDataUrl = reader.result; };
  reader.readAsDataURL(f);
});

// ---- generate ----
$('genBtn').addEventListener('click', generate);

async function generate() {
  if (files.size === 0) { showErr('Add at least the prospect’s gap_topics (or brand_topics) CSV.'); return; }
  hideErr();
  const btn = $('genBtn');
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Building snapshot…';

  const fd = new FormData();
  for (const f of files.values()) fd.append('files', f);
  fd.append('vertical', $('vertical').value);
  fd.append('prospectName', $('prospectName').value || '');
  fd.append('primaryBrand', $('primaryBrand').value || '');

  try {
    const res = await fetch('/api/snapshot', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
    render(data);
    $('snap').scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    showErr(e.message || 'Failed to build snapshot.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

function render(data) {
  const r = data.report;
  const accent = $('accent').value || '#6366f1';
  document.documentElement.style.setProperty('--accent', accent);

  const verticalCap = r.vertical.charAt(0).toUpperCase() + r.vertical.slice(1);
  const date = new Date(r.generatedAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

  const logo = logoDataUrl
    ? `<img class="plogo" src="${logoDataUrl}" alt="logo" />`
    : `<div class="plogo">${esc((r.prospectName || '?').trim().charAt(0).toUpperCase())}</div>`;

  // KPIs (only those we can compute).
  const kpis = [];
  if (r.primary) {
    kpis.push(kpi(fmt(r.primary.topicsInVertical), `${verticalCap} topics you appear for`));
    kpis.push(kpi(fmt(r.primary.totalMentions), 'Total AI mentions today'));
    kpis.push(kpi(r.primary.avgVisibility, 'Avg AI visibility (0–100)'));
  }
  kpis.push(kpi(fmt(r.gapCount), 'High-intent topics you’re missing'));
  kpis.push(kpi(fmt(r.totalGapVolume), 'Monthly searches at stake'));

  // Gap reel.
  const gapRows = r.gaps.map((g) => `
    <tr>
      <td>${esc(g.topic)}</td>
      <td>${esc(g.category)}</td>
      <td class="num">${fmt(g.volume)}</td>
      <td><span class="comp-name">${esc(g.topCompetitor)}</span></td>
      <td class="num">${fmt(g.topCompetitorMentions)}</td>
    </tr>`).join('');
  const gapSection = r.gaps.length ? `
    <div class="snap-sec">
      <h4>Where ${esc(r.prospectName)} is invisible — and who's cited instead</h4>
      <p class="sub">High-volume ${esc(r.vertical)} topics where ${esc(r.prospectName)} has zero AI visibility but a competitor is being mentioned. Top ${r.gaps.length} by search volume${r.gapCount > r.gaps.length ? ` of ${fmt(r.gapCount)} total` : ''}.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Topic</th><th>Category</th><th class="num">Monthly searches</th><th>Competitor cited</th><th class="num">Their mentions</th></tr></thead>
          <tbody>${gapRows}</tbody>
        </table>
      </div>
    </div>` : '';

  // Category exposure.
  const catRows = r.categoryExposure.map((c) => `
    <tr>
      <td>${esc(c.category)}</td>
      <td class="num">${fmt(c.gapCount)}</td>
      <td class="num">${fmt(c.missedVolume)}</td>
      <td><span class="comp-name">${esc(c.topCompetitor)}</span></td>
    </tr>`).join('');
  const catSection = r.categoryExposure.length ? `
    <div class="snap-sec">
      <h4>Category exposure</h4>
      <p class="sub">Which ${esc(r.vertical)} categories are bleeding the most addressable search volume to competitors in AI answers.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Category</th><th class="num">Gap topics</th><th class="num">Missed monthly searches</th><th>Led by</th></tr></thead>
          <tbody>${catRows}</tbody>
        </table>
      </div>
    </div>` : '';

  // Competitor leaderboard with bars.
  const maxComp = Math.max(1, ...r.competitors.map((c) => c.mentions));
  const compRows = r.competitors.map((c) => `
    <tr class="bars">
      <td>${esc(c.brand)}</td>
      <td class="num">${fmt(c.mentions)}</td>
      <td class="num">${fmt(c.topics)}</td>
      <td><div class="compbar"><span style="width:${Math.round((c.mentions / maxComp) * 100)}%"></span></div></td>
    </tr>`).join('');
  const compSection = r.competitors.length ? `
    <div class="snap-sec">
      <h4>Who's winning your category in AI answers</h4>
      <p class="sub">Competitors cited across the topics where ${esc(r.prospectName)} is absent, ranked by total AI mentions.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Competitor</th><th class="num">Mentions on your gaps</th><th class="num">Topics</th><th>Share</th></tr></thead>
          <tbody>${compRows}</tbody>
        </table>
      </div>
    </div>` : '';

  const warnHtml = (r.warnings && r.warnings.length)
    ? `<div class="alert info" style="display:block">${r.warnings.map(esc).join('<br>')}</div>`
    : '';

  $('snapsheet').innerHTML = `
    <div class="snap-hd">
      ${logo}
      <div class="ht">
        <div class="eyebrow">AI Search Visibility Snapshot · ${esc(verticalCap)}</div>
        <h2>${esc(r.prospectName)}</h2>
        <div class="date">Generated ${esc(date)} · Source: SEMrush AI Visibility</div>
      </div>
    </div>

    <div class="verdict">
      <div class="vh">${esc(r.headline)}</div>
      ${r.subhead ? `<div class="vs">${esc(r.subhead)}</div>` : ''}
    </div>

    <div class="kpis">${kpis.join('')}</div>

    ${gapSection}
    ${catSection}
    ${compSection}

    <div class="cta">
      <h4>What a CiteRank engagement adds</h4>
      <p>This snapshot is a single pull. A weekly engagement turns it into a system:</p>
      <ul>
        <li>Weekly tracking of every gap, by category, with week-over-week and since-go-live movement.</li>
        <li>A prioritised content/PDP/AEO roadmap to win back the highest-volume gaps first.</li>
        <li>Brand-vs-competitor scorecards and cited-source analysis across ChatGPT, Gemini, Perplexity & AI Overviews.</li>
        <li>A client-ready report delivered to your inbox every week — no dashboard to learn.</li>
      </ul>
    </div>

    ${warnHtml}
  `;

  $('snap').style.display = 'block';
  showInfo(`Detected brand key: <strong>${esc(data.meta.primaryBrand || '—')}</strong>. Files parsed: ${data.meta.filesParsed.map((f) => `${esc(f.type)} (${fmt(f.rows)} rows)`).join(', ')}.`);
  toast('Snapshot ready');
}

function kpi(value, label) {
  return `<div class="kpi"><div class="v">${esc(value)}</div><div class="l">${esc(label)}</div></div>`;
}

$('pdfBtn').addEventListener('click', () => window.print());
