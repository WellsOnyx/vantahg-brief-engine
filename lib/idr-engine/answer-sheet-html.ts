import { FACTORS } from './factors';
import { dliSentence } from './rationale';
import type { AnswerSheet } from './types';

/**
 * THE MIRROR FORM (primary output): an exact replica of the SFFlexSuite
 * portal screens, IN ORDER, every field pre-filled with the engine's
 * values and every checkbox rendered in the state it should be clicked to.
 * The reviewer reads the mirror top-to-bottom and reproduces it on the
 * real portal — the mirror looks like the screen they're filling, not a
 * report about it.
 *
 * A copy-to-clipboard button sits on every text field (the ONLY JavaScript
 * on the page — a tiny inline handler, no libraries, no network, no data
 * leaving the page). Everything analytical stays BELOW A FOLD (native
 * <details>), unchanged from the card.
 *
 * Eligibility-objection letters still LEAD (field intel §3): check the
 * staff notes, no ruling → send back, before any screen replica.
 *
 * Guardrails unchanged: internal work product; no submit control anywhere;
 * DLI numbers and attestation values are human-only (rendered as blanks).
 */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function money(v: number | null | undefined): string {
  return v === null || v === undefined ? '<span class="gap">—</span>' : `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// The one script on the page: copy a field's value to the clipboard.
const COPY_JS = `
function idrCopy(btn){
  var v = btn.getAttribute('data-copy') || '';
  function done(){ var t=btn.textContent; btn.textContent='✓ copied'; setTimeout(function(){btn.textContent=t;},1200); }
  if (navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(v).then(done,function(){fallback();}); }
  else { fallback(); }
  function fallback(){ var ta=document.createElement('textarea'); ta.value=v; document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); }catch(e){} document.body.removeChild(ta); done(); }
}`.trim();

const CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1a2233; margin: 0; background: #dfe4ec; }
  main { max-width: 940px; margin: 0 auto; padding: 16px 20px 60px; }
  .banner { background: #7a1f1f; color: #fff; font-weight: 700; text-align: center; padding: 10px 14px; letter-spacing: .02em; }
  .banner.foot { margin-top: 28px; }
  .objection { background: #a12020; color: #fff; padding: 16px 18px; margin: 16px 0; font-size: 16px; font-weight: 700; border: 4px double #fff; }
  h1 { font-size: 20px; margin: 18px 0 4px; }
  .meta { color: #5a6478; font-size: 13px; margin-bottom: 8px; }
  .hint { color: #5a6478; font-size: 12px; margin: 2px 0 14px; }
  /* A replica portal screen */
  .screen { background: #fff; border: 1px solid #b7c0d2; border-radius: 4px; margin: 18px 0; box-shadow: 0 1px 2px rgba(20,40,80,.08); }
  .screen > .titlebar { background: #24486f; color: #fff; font-weight: 600; padding: 8px 14px; border-radius: 4px 4px 0 0; font-size: 14px; }
  .screen > .titlebar .step { opacity: .7; font-weight: 400; font-size: 12px; margin-left: 6px; }
  .screen > .body { padding: 12px 14px; }
  .field { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; border-bottom: 1px dotted #d6dceb; }
  .field:last-child { border-bottom: 0; }
  .field > label { flex: 0 0 210px; font-weight: 600; color: #33415c; padding-top: 5px; }
  .field > .val { flex: 1; }
  .field input[type=text], .field textarea { width: 100%; font: inherit; padding: 5px 7px; border: 1px solid #9fb0cc; border-radius: 3px; background: #fbfdff; }
  .field textarea { min-height: 150px; }
  .copybtn { flex: 0 0 auto; font: 12px inherit; padding: 5px 9px; border: 1px solid #24486f; background: #eaf1fb; color: #24486f; border-radius: 3px; cursor: pointer; white-space: nowrap; }
  .copybtn:hover { background: #dbe7f8; }
  .cb { font-family: monospace; font-size: 16px; }
  .cb.on { color: #1a7a1a; font-weight: 700; }
  .cb.off { color: #97a1b5; }
  .factorrow { display: flex; align-items: center; gap: 10px; padding: 5px 0; border-bottom: 1px dotted #d6dceb; }
  .factorrow .num { flex: 0 0 20px; color: #5a6478; }
  .factorrow .name { flex: 1; }
  .factorrow .box { flex: 0 0 92px; text-align: center; }
  .factorrow .box small { display:block; color:#5a6478; font-size:11px; }
  .dropdown { display: inline-block; border: 1px solid #9fb0cc; border-radius: 3px; padding: 3px 22px 3px 8px; background: #fbfdff url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M0 0l5 6 5-6z' fill='%2355657f'/></svg>") no-repeat right 7px center; }
  .human { background: #fff4d6; border: 1px solid #d9a520; border-radius: 3px; padding: 2px 8px; font-weight: 600; color: #7a5600; }
  .flags { background: #fff7e6; border: 2px solid #d9822b; padding: 10px 14px; margin: 14px 0; }
  .flags .block { color: #a12020; font-weight: 700; }
  .gap { color: #a12020; font-weight: 600; }
  .rec-flag { color: #a12020; font-weight: 700; }
  .noop { color: #3c5a7a; font-weight: 700; }
  .evidence { background: #fff; border-left: 4px solid #8ea3c2; margin: 6px 0; padding: 6px 10px; font-size: 13px; }
  .evidence .cite { color: #5a6478; }
  .note { color: #5a6478; font-size: 13px; }
  details.fold { margin-top: 30px; border-top: 3px double #b7c0d2; padding-top: 8px; }
  details.fold > summary { cursor: pointer; font-weight: 700; font-size: 15px; padding: 8px 0; color: #24486f; }
  h2 { font-size: 15px; margin: 22px 0 6px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; background: #fff; }
  th, td { border: 1px solid #c6cede; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: #e8ecf3; font-weight: 600; }
`;

function copyField(label: string, value: string, opts: { textarea?: boolean } = {}): string {
  const control = opts.textarea
    ? `<textarea readonly>${esc(value)}</textarea>`
    : `<input type="text" readonly value="${esc(value)}">`;
  return (
    `<div class="field"><label>${esc(label)}</label>` +
    `<div class="val">${control}</div>` +
    `<button type="button" class="copybtn" data-copy="${esc(value)}" onclick="idrCopy(this)">Copy</button></div>`
  );
}

export function renderAnswerSheetHtml(sheet: AnswerSheet): string {
  const r = sheet.record;
  const H: string[] = [];
  const objection = sheet.flags.find((f) => f.code === 'ELIGIBILITY_OBJECTION');

  H.push('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">');
  H.push(`<title>Mirror form — ${esc(sheet.caseId)}</title><style>${CSS}</style><script>${COPY_JS}</script></head><body>`);
  H.push(`<div class="banner">${esc(sheet.draftBanner.replace(/█/g, '').trim())}</div>`);
  H.push('<main>');

  H.push(`<h1>Portal mirror — ${esc(r.caseId)}</h1>`);
  H.push(`<div class="meta">Generated ${esc(sheet.generatedAt)} · mode ${r.extractionMode.toUpperCase()} · dispute ${esc(r.disputeNumber ?? '—')} · ${r.batch ? `BATCH, ${r.lines.length} lines` : 'single line'}</div>`);
  H.push('<div class="hint">Each screen below mirrors the portal in order. Reproduce it exactly: checkboxes are drawn in the state to click them to; every text field has a Copy button. Yellow = human-only, type it yourself.</div>');

  if (objection) {
    H.push(`<div class="objection">⛔ ELIGIBILITY OBJECTION — the NIP filed an objection letter, not a merits brief.<br>1. CHECK THE STAFF ELIGIBILITY NOTES on the case screen.<br>2. No eligibility ruling recorded → SEND THE CASE BACK. Do not decide the merits.</div>`);
  }
  if (sheet.flags.length) {
    H.push('<div class="flags"><strong>⚑ Flags — read before filling</strong><ul>');
    for (const f of sheet.flags) {
      H.push(`<li class="${f.severity === 'block' ? 'block' : ''}">${f.severity === 'block' ? '⛔' : '⚠'} ${esc(f.code)}${f.line ? ` (line ${f.line})` : ''} — ${esc(f.message)}</li>`);
    }
    H.push('</ul></div>');
  }

  // ══ SCREEN 1 · Module 1 — Conflict of Interest ══
  H.push('<div class="screen"><div class="titlebar">Conflict of Interest<span class="step">Module 1</span></div><div class="body">');
  H.push(`<div class="factorrow"><div class="name"><strong>No To All Questions</strong></div><div class="box"><span class="cb on">☑</span></div></div>`);
  H.push('<div class="note" style="margin:6px 0">Each individual conflict question: <span class="dropdown">No</span> · text field: <em>leave empty</em>. Scan the names below for YOUR conflicts first.</div>');
  H.push(`<div class="note">${sheet.coi.namesForReview.length ? sheet.coi.namesForReview.map(esc).join(' · ') : '(no names extracted — check party names under the fold)'}</div>`);
  H.push('</div></div>');

  // ══ SCREEN 2 · Module 2b — Non-AA Questions (factor checkboxes) ══
  H.push('<div class="screen"><div class="titlebar">Non-AA Questions — Factors<span class="step">Module 2b</span></div><div class="body">');
  for (const def of FACTORS) {
    const ip = sheet.factorGrid.ip.find((f) => f.factor === def.factor)?.raised ?? false;
    const nip = sheet.factorGrid.nip.find((f) => f.factor === def.factor)?.raised ?? false;
    H.push(
      `<div class="factorrow"><div class="num">${def.factor}</div><div class="name">${esc(def.title)}</div>` +
      `<div class="box"><span class="cb ${ip ? 'on' : 'off'}">${ip ? '☑' : '☐'}</span><small>IP</small></div>` +
      `<div class="box"><span class="cb ${nip ? 'on' : 'off'}">${nip ? '☑' : '☐'}</span><small>NIP</small></div></div>`,
    );
  }
  H.push('</div></div>');

  // ══ SCREEN 3..N · Module 2b — Case Info and Final Resolution, one per line ══
  const total = sheet.recommendations.length;
  for (const rec of sheet.recommendations) {
    const line = r.lines.find((l) => l.line === rec.line);
    const ppControl =
      rec.recommended === 'FLAG'
        ? '<span class="rec-flag">⛔ FLAG — human ruling required; do not select yet</span>'
        : rec.recommended === 'NO_OP'
          ? '<span class="noop">outcome-neutral (identical offers) — select either; same amount</span>'
          : `<span class="dropdown">${rec.recommended}</span> <span class="note">(prep recommendation ${rec.confidencePct}% — your decision, entered in TWO places)</span>`;
    H.push(`<div class="screen"><div class="titlebar">Case Info and Final Resolution<span class="step">Module 2b · page ${rec.line} of ${total}</span></div><div class="body">`);
    H.push(`<div class="field"><label>Dispute Line Item Name</label><div class="val"><span class="human">DLI - ____</span> <span class="note">read the number off the portal screen and type it</span></div></div>`);
    H.push(`<div class="field"><label>Line facts</label><div class="val">CPT ${esc(line?.cpt ?? '—')} · IP ${money(line?.ipOffer)} · NIP ${money(line?.nipOffer)} · FH 50th %ile ${line?.fhBenchmark == null ? '—' : money(line.fhBenchmark)}</div></div>`);
    H.push(`<div class="field"><label>Prevailing Party (×2)</label><div class="val">${ppControl}</div></div>`);
    if (rec.line === 1 || rec.dliChainToLine === null) {
      H.push(copyField('Rationale', sheet.rationalePaste, { textarea: true }));
    } else {
      H.push(copyField(`Rationale (chains to line ${rec.dliChainToLine})`, dliSentence()));
    }
    H.push('</div></div>');
  }

  // ══ SCREEN · Module 3 — Attestation (human-only) ══
  H.push('<div class="screen"><div class="titlebar">Attestation<span class="step">Module 3</span></div><div class="body">');
  H.push('<div class="field"><label>Reviewer name</label><div class="val"><span class="human">type YOUR name</span></div></div>');
  H.push('<div class="field"><label>Date</label><div class="val"><span class="human">type TODAY’s date</span></div></div>');
  H.push('</div></div>');

  // Cases Log row (separate paste target — the Google Sheet, not the portal).
  H.push('<div class="screen"><div class="titlebar">IDR Cases Log row<span class="step">paste into the Google Sheet</span></div><div class="body">');
  H.push(copyField('Log row (TSV)', sheet.logRow, { textarea: true }));
  H.push('</div></div>');

  // ══ BELOW THE FOLD — analysis & evidence (unchanged) ══
  H.push('<details class="fold"><summary>Analysis &amp; evidence (below the fold — open when you need the why)</summary>');

  H.push('<h2>Case facts (verify against the documents)</h2>');
  H.push('<table><tr><th>IP (provider)</th><th>NIP (payer/TPA)</th><th>QPA (NIP-supplied — display only, never an anchor)</th></tr>');
  H.push(`<tr><td>${esc(r.ipName ?? '—')}</td><td>${esc(r.nipName ?? '—')}</td><td>${money(r.qpa)}</td></tr></table>`);
  H.push('<table><tr><th>Line</th><th>CPT</th><th>Date of service</th><th>IP offer</th><th>NIP offer</th><th>FH 50th %ile</th></tr>');
  for (const l of r.lines) {
    H.push(`<tr><td>${l.line}</td><td>${esc(l.cpt ?? '—')}</td><td>${esc(l.dateOfService ?? '—')}</td><td>${money(l.ipOffer)}</td><td>${money(l.nipOffer)}</td><td>${l.fhBenchmark == null ? '—' : money(l.fhBenchmark)}</td></tr>`);
  }
  H.push('</table>');
  H.push('<div class="note">FH 50th %ile = FAIR Health benchmark from the NIP brief — a neutral reference point, not an offer.</div>');

  H.push('<h2>Staff eligibility notes</h2><p><strong>READ the staff eligibility-notes grid on the case screen</strong> (username / date / note) before deciding.</p>');
  if (sheet.eligibilityNotes.length > 0) {
    H.push('<table><tr><th>User</th><th>Date</th><th>Note</th></tr>');
    for (const n of sheet.eligibilityNotes) H.push(`<tr><td>${esc(n.username ?? '—')}</td><td>${esc(n.date ?? '—')}</td><td>${esc(n.note)}</td></tr>`);
    H.push('</table>');
  } else H.push('<p class="note">(none found in the case folder — the portal grid may still have entries)</p>');

  if (sheet.priorDeterminations.length > 0) {
    H.push('<h2>Prior determinations among the exhibits</h2><ul>');
    for (const pd of sheet.priorDeterminations) H.push(`<li>${esc(pd.file)} — outcome: <strong>${pd.outcome ?? 'not stated'}</strong>${pd.date ? ` · ${esc(pd.date)}` : ''}</li>`);
    H.push('</ul>');
  }

  H.push('<h2>Evidence backing each factor check</h2>');
  for (const side of ['ip', 'nip'] as const) {
    for (const f of sheet.factorGrid[side]) {
      if (!f.raised) continue;
      H.push(`<div class="evidence"><strong>${side.toUpperCase()} · factor ${f.factor}</strong> (${esc(f.suggestedWeight ?? 'weight tbd')})${f.summary ? ` — ${esc(f.summary)}` : ''}`);
      for (const e of f.evidence) H.push(`<div>“${esc(e.quote)}” <span class="cite">— ${esc(e.file)}, p. ${e.page}</span></div>`);
      H.push('</div>');
    }
  }

  H.push('<h2>Recommendation reasoning</h2><ul>');
  for (const rec of sheet.recommendations) H.push(`<li><strong>Line ${rec.line}</strong>: ${rec.reasons.map(esc).join(' · ')}</li>`);
  H.push('</ul>');

  H.push('<h2>Documents read</h2><ul>');
  for (const d of sheet.documents) H.push(`<li>${esc(d.file)} → ${esc(d.kind)} <span class="note">(${esc(d.classificationReason)})</span></li>`);
  H.push('</ul>');

  H.push('<h2>Template fingerprints</h2><ul>');
  for (const fp of sheet.fingerprints) H.push(`<li>${esc(fp.file)} (${fp.party}): ${fp.status === 'DEVIATION' ? '🚨 <strong>DEVIATION</strong>' : fp.status} — ${esc(fp.detail)}</li>`);
  if (sheet.fingerprints.length === 0) H.push('<li>no briefs fingerprinted</li>');
  H.push('</ul>');

  H.push('</details>');
  H.push('</main>');
  H.push(`<div class="banner foot">${esc(sheet.draftBanner.replace(/█/g, '').trim())}</div>`);
  H.push('</body></html>');
  return H.join('\n');
}
