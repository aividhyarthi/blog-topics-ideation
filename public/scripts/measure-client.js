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

// Highlight brand names in a verbatim answer: primary green, competitors red.
function escapeReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function highlightAnswer(text, brands) {
  const map = new Map();
  const labels = [];
  for (const b of brands) {
    if (!b.label) continue;
    map.set(b.label.toLowerCase(), b.isPrimary ? 'm-primary' : 'm-comp');
    labels.push(b.label);
  }
  labels.sort((a, b) => b.length - a.length); // longest first
  let html = esc(text);
  if (!labels.length) return html;
  const re = new RegExp(`(^|[^A-Za-z0-9])(${labels.map(escapeReg).join('|')})(?=[^A-Za-z0-9]|$)`, 'gi');
  return html.replace(re, (m, p1, p2) => `${p1}<mark class="${map.get(p2.toLowerCase()) || 'm-comp'}">${p2}</mark>`);
}

function render(data) {
  const r = data.result;
  const brands = r.brands || [];

  // Mode pill
  const live = r.mode === 'live';
  const engLabel = ({ perplexity: 'Perplexity', openai: 'OpenAI', anthropic: 'Claude', gemini: 'Gemini', chatgpt: 'ChatGPT', aio: 'AI Overviews' })[r.engine] || r.engine;
  $('modePill').innerHTML = `<span class="modepill ${live ? 'live' : 'demo'}">${live ? 'LIVE · ' + esc(engLabel) : 'DEMO DATA (add an API key for live)'}</span>`;
  if (r.notice) showErr('Live engine error (so showing what came back): ' + r.notice);

  // ---- Hero number ----
  const h = r.headline || {};
  const yourP = h.primaryPresence ?? 0;
  const themP = h.topCompetitorPresence ?? 0;
  $('hero').innerHTML = `
    <div class="lead">When your buyers ask AI about ${esc(r.set.vertical)}, your brand shows up in…</div>
    <div class="big">${esc(yourP)}% <span class="them">vs ${esc(h.topCompetitor || 'top competitor')} ${esc(themP)}%</span></div>
    <div class="barwrap">
      <div class="barrow"><div class="nm">${esc(h.primaryLabel || 'You')}</div><div class="track"><span class="you" style="width:${Math.max(2, yourP)}%"></span></div><div class="pct">${esc(yourP)}%</div></div>
      ${h.topCompetitor ? `<div class="barrow"><div class="nm">${esc(h.topCompetitor)}</div><div class="track"><span class="them" style="width:${Math.max(2, themP)}%"></span></div><div class="pct">${esc(themP)}%</div></div>` : ''}
    </div>`;

  // ---- The Reveal: verbatim answers + citation forensics ----
  $('reveals').innerHTML = (r.reveals || []).map((rv) => {
    const absent = !rv.primaryPresent;
    const vp = absent
      ? `<span class="vp absent">✕ ${esc(h.primaryLabel || 'You')} not mentioned</span>`
      : `<span class="vp present">✓ ${esc(h.primaryLabel || 'You')} mentioned</span>`;
    // Citation forensics: competitor-owned + third-party sources the AI used.
    const cites = (rv.citations || []);
    const chips = cites.map((c) => {
      const own = c.brand && brands.find((b) => b.label === c.brand && b.isPrimary);
      const comp = c.brand && !own;
      const cls = own ? 'own' : (comp ? 'comp' : '');
      const who = c.brand ? `${esc(c.brand)} · ` : '';
      return `<a class="chip ${cls}" href="${esc(c.url)}" target="_blank" rel="noopener"><span class="tp">${esc(c.type)}</span><span class="hh">${who}${esc(c.host)}</span></a>`;
    }).join('');
    const winner = rv.winner && (!brands.find((b) => b.label === rv.winner && b.isPrimary));
    const forensic = absent && winner
      ? `<div class="forensic">→ <strong>${esc(rv.winner)}</strong> is recommended here and ${esc(h.primaryLabel || 'you')} isn’t. The sources below are what the AI trusted.</div>`
      : '';
    return `
      <div class="reveal">
        <div class="rh">
          <div class="q">“${esc(rv.prompt)}” <span class="topic">· ${esc(rv.topic)}</span></div>
          ${vp}
        </div>
        <div class="ans">${highlightAnswer(rv.answer || '', brands)}</div>
        ${forensic}
        ${cites.length ? `<div class="cites"><div class="ct">Sources the AI cited</div>${chips}</div>` : ''}
      </div>`;
  }).join('');

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

  $('out').style.display = 'block';
}
