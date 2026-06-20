// Live AEO Measurement client: POST /api/measure -> render scorecard + gaps +
// sample responses. Works in demo or live mode (server decides based on key).

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (typeof n === 'number' ? Math.round(n).toLocaleString('en-IN') : esc(n ?? '-'));

function showErr(m) { const e = $('errBox'); e.textContent = m; e.style.display = 'block'; }
function hideErr() { $('errBox').style.display = 'none'; }

$('runBtn').addEventListener('click', run);

async function run() {
  const primaryLabel = $('primaryLabel').value.trim();
  if (!primaryLabel) { showErr('Enter a primary brand.'); return; }
  hideErr();
  const btn = $('runBtn');
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Querying engines…';

  const competitors = $('competitors').value.split(',').map((s) => s.trim()).filter(Boolean).map((label) => ({ label }));
  const payload = {
    primaryLabel,
    primaryDomain: $('primaryDomain').value.trim() || undefined,
    competitors,
    vertical: $('vertical').value,
    locale: $('locale').value.trim() || 'en-IN',
    runsPerPrompt: Number($('runs').value) || 3,
  };

  try {
    const res = await fetch('/api/measure', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
    render(data);
    $('out').scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    showErr(e.message || 'Measurement failed.');
  } finally {
    btn.disabled = false; btn.innerHTML = orig;
  }
}

function render(data) {
  const r = data.result;

  // Mode pill
  const live = r.mode === 'live';
  $('modePill').innerHTML = `<span class="modepill ${live ? 'live' : 'demo'}">${live ? 'LIVE · Perplexity' : 'DEMO DATA (set PERPLEXITY_API_KEY for live)'}</span>`;

  // Scorecards
  const primaryKey = data.meta.primaryKey;
  $('scorecards').innerHTML = r.scorecard.map((s) => `
    <div class="sc ${s.key === primaryKey ? 'primary' : ''}">
      <div class="nm">${esc(s.brand)}</div>
      <div class="gr">${esc(s.grade)}</div>
      <div class="scv">AEO score ${esc(s.score)}/100</div>
      <div class="cmp">
        <span>Presence <b>${esc(s.components.presence)}</b></span>
        <span>Coverage <b>${esc(s.components.coverage)}</b></span>
        <span>Citation <b>${esc(s.components.citation)}</b></span>
        <span>Prominence <b>${esc(s.components.prominence)}</b></span>
      </div>
    </div>`).join('');

  const w = r.scorecard[0]?.weights || {};
  $('scoreNote').textContent =
    `Score = Presence×${w.presence} + Coverage×${w.coverage} + Citation×${w.citation} + Prominence×${w.prominence}. ` +
    `Averaged over ${r.set.runsPerPrompt} runs × ${r.set.prompts} prompts across ${r.set.topics} topics (${esc(r.set.locale)}).`;

  // Topic-by-topic: primary visibility vs the leading brand (from live metrics).
  const keyToLabel = {};
  for (const s of r.scorecard) keyToLabel[s.key] = s.brand;
  const tb = $('gapTable').querySelector('tbody');
  let behind = 0;
  tb.innerHTML = (r.topicMetrics || []).map((m) => {
    const mine = m.perBrand[primaryKey] || { visibility: 0, mentions: 0 };
    // Leader = highest visibility among all brands on this topic.
    let leadKey = primaryKey; let leadVis = -1;
    for (const k of Object.keys(m.perBrand)) {
      if (m.perBrand[k].visibility > leadVis) { leadVis = m.perBrand[k].visibility; leadKey = k; }
    }
    const isBehind = leadKey !== primaryKey && leadVis > mine.visibility;
    if (isBehind) behind++;
    const leadCell = leadKey === primaryKey
      ? `<span style="color:var(--ok);font-weight:700">You lead</span>`
      : `<span class="comp-name">${esc(keyToLabel[leadKey] || leadKey)}</span>`;
    return `<tr>
        <td>${esc(m.topic)}</td><td>${esc(m.category)}</td>
        <td class="num">${fmt(mine.visibility)}</td>
        <td class="num">${fmt(mine.mentions)}</td>
        <td>${leadCell}</td>
        <td class="num">${fmt(leadVis)}</td>
      </tr>`;
  }).join('');
  $('gapNote').textContent = `Visibility = % of the topic's live responses that mention the brand (0–100). You trail the leader on ${behind} of ${(r.topicMetrics || []).length} topics.`;

  // Show the work
  $('responses').innerHTML = (r.sampleResponses || []).map((s) => `
    <div class="resp">
      <div class="q">${esc(s.prompt)} <span style="color:var(--muted);font-weight:400">(${esc(s.topic)})</span></div>
      <div class="a">${esc(s.text)}${s.text.length >= 600 ? '…' : ''}</div>
      ${s.citations.length ? `<div class="c">Cited: ${s.citations.map(esc).join(' · ')}</div>` : ''}
    </div>`).join('');

  $('out').style.display = 'block';
}
