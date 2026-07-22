import { FACTORS } from './factors';
import { dliSentence } from './rationale';
import type { AnswerSheet } from './types';

/**
 * THE PORTAL CARD (field intel §2 — the primary output): keystrokes and
 * paste blocks ONLY, in exact module order, so the reviewer's eyes never
 * leave the portal flow. Everything analytical — case facts, evidence,
 * fingerprints, prior determinations, document inventory — lives BELOW A
 * FOLD (a native <details> element; still zero JavaScript).
 *
 * When the NIP submission is an eligibility OBJECTION letter, the card
 * LEADS with the eligibility-first instruction: check the staff
 * eligibility notes; no recorded ruling → send the case back (§3).
 *
 * Plywood doctrine unchanged: static, self-contained, no auth, no
 * scripts, no config.
 */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function money(v: number | null | undefined): string {
  return v === null || v === undefined ? '<span class="gap">— NOT EXTRACTED —</span>' : `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1a2233; margin: 0; background: #f2f4f8; }
  main { max-width: 900px; margin: 0 auto; padding: 16px 20px 60px; }
  .banner { background: #7a1f1f; color: #fff; font-weight: 700; text-align: center; padding: 10px 14px; letter-spacing: .02em; }
  .banner.foot { margin-top: 28px; }
  .objection { background: #a12020; color: #fff; padding: 16px 18px; margin: 16px 0; font-size: 16px; font-weight: 700; border: 4px double #fff; }
  h1 { font-size: 20px; margin: 20px 0 4px; }
  h2 { font-size: 16px; margin: 26px 0 8px; padding-top: 14px; border-top: 2px solid #c6cede; }
  h2 .module { display: inline-block; background: #0c2340; color: #fff; font-size: 12px; padding: 2px 8px; border-radius: 3px; margin-right: 8px; vertical-align: 2px; }
  .meta { color: #5a6478; font-size: 13px; margin-bottom: 14px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; background: #fff; }
  th, td { border: 1px solid #c6cede; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: #e8ecf3; font-weight: 600; }
  .flags { background: #fff7e6; border: 2px solid #d9822b; padding: 10px 14px; margin: 14px 0; }
  .flags .block { color: #a12020; font-weight: 700; }
  .keys { background: #eef6ee; border: 2px solid #3c7a3c; padding: 10px 14px; font-size: 15px; }
  .check { font-family: monospace; font-size: 16px; text-align: center; width: 60px; }
  .evidence { background: #fff; border-left: 4px solid #8ea3c2; margin: 6px 0; padding: 6px 10px; font-size: 13px; }
  .evidence .cite { color: #5a6478; }
  pre.paste { background: #10233d; color: #e8eef7; padding: 14px 16px; white-space: pre-wrap; word-wrap: break-word; font-size: 13px; border-radius: 4px; }
  .rec-flag { color: #a12020; font-weight: 700; }
  .noop { color: #3c5a7a; font-weight: 700; }
  .gap { color: #a12020; font-weight: 600; }
  .note { color: #5a6478; font-size: 13px; }
  .attest { background: #fff; border: 1px dashed #8ea3c2; padding: 10px 14px; }
  details.fold { margin-top: 30px; border-top: 3px double #c6cede; padding-top: 8px; }
  details.fold > summary { cursor: pointer; font-weight: 700; font-size: 15px; padding: 8px 0; color: #0c2340; }
`;

export function renderAnswerSheetHtml(sheet: AnswerSheet): string {
  const r = sheet.record;
  const H: string[] = [];
  const objection = sheet.flags.find((f) => f.code === 'ELIGIBILITY_OBJECTION');

  H.push('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">');
  H.push(`<title>Portal card — ${esc(sheet.caseId)}</title><style>${CSS}</style></head><body>`);
  H.push(`<div class="banner">${esc(sheet.draftBanner.replace(/█/g, '').trim())}</div>`);
  H.push('<main>');

  H.push(`<h1>Portal card — ${esc(r.caseId)}</h1>`);
  H.push(`<div class="meta">Generated ${esc(sheet.generatedAt)} · mode ${r.extractionMode.toUpperCase()} · dispute ${esc(r.disputeNumber ?? '—')} · ${r.batch ? `BATCH, ${r.lines.length} lines` : 'single line'}</div>`);

  // ── Eligibility objection LEADS the card (field intel §3) ──
  if (objection) {
    H.push(`<div class="objection">⛔ ELIGIBILITY OBJECTION — the NIP filed an objection letter, not a merits brief.<br>1. CHECK THE STAFF ELIGIBILITY NOTES on the case screen.<br>2. No eligibility ruling recorded → SEND THE CASE BACK. Do not decide the merits.</div>`);
  }

  if (sheet.flags.length) {
    H.push('<div class="flags"><strong>⚑ Flags — read before transcribing</strong><ul>');
    for (const f of sheet.flags) {
      H.push(`<li class="${f.severity === 'block' ? 'block' : ''}">${f.severity === 'block' ? '⛔' : '⚠'} ${esc(f.code)}${f.line ? ` (line ${f.line})` : ''} — ${esc(f.message)}</li>`);
    }
    H.push('</ul></div>');
  }

  // ══ THE CARD — keystrokes + paste blocks, exact module order ══
  H.push('<h2><span class="module">Module 1</span>COI</h2>');
  H.push('<div class="keys">Check ☑ <strong>“No To All Questions”</strong> · individual questions: <strong>No</strong> · text fields: <strong>empty</strong></div>');
  H.push(`<p class="note">Names in this case (scan for YOUR conflicts): ${sheet.coi.namesForReview.length ? sheet.coi.namesForReview.map(esc).join(' · ') : '(none extracted — check party names under the fold)'}</p>`);

  H.push('<h2><span class="module">Module 2b</span>Non-AA Questions — factor checkboxes</h2>');
  const checkedList = (side: 'ip' | 'nip') =>
    sheet.factorGrid[side].filter((f) => f.raised).map((f) => f.factor).join(', ') || 'none';
  H.push(`<div class="keys">IP: check <strong>${checkedList('ip')}</strong> · NIP: check <strong>${checkedList('nip')}</strong></div>`);
  H.push('<table><tr><th>#</th><th>Factor</th><th class="check">IP</th><th class="check">NIP</th></tr>');
  for (const def of FACTORS) {
    const ip = sheet.factorGrid.ip.find((f) => f.factor === def.factor);
    const nip = sheet.factorGrid.nip.find((f) => f.factor === def.factor);
    H.push(`<tr><td>${def.factor}</td><td>${esc(def.title)}</td><td class="check">${ip?.raised ? '☑' : '☐'}</td><td class="check">${nip?.raised ? '☑' : '☐'}</td></tr>`);
  }
  H.push('</table>');

  H.push('<h2><span class="module">Module 2b</span>Rationale — paste block</h2>');
  H.push(`<pre class="paste">${esc(sheet.rationale)}</pre>`);

  // One "Case Info and Final Resolution" record PER LINE — page 1 of N.
  const total = sheet.recommendations.length;
  for (const rec of sheet.recommendations) {
    const line = r.lines.find((l) => l.line === rec.line);
    const label =
      rec.recommended === 'FLAG'
        ? '<span class="rec-flag">⛔ FLAG — HUMAN RULING REQUIRED</span>'
        : rec.recommended === 'NO_OP'
          ? '<span class="noop">outcome-neutral — offers identical, either selection yields the same amount</span>'
          : `<strong>${rec.recommended}</strong> (${rec.confidencePct}%)`;
    H.push(`<h2><span class="module">Module 2b</span>Case Info and Final Resolution — page ${rec.line} of ${total}</h2>`);
    H.push('<table>');
    H.push(`<tr><th>Dispute Line Item Name</th><td>DLI - [____ ← read off the portal screen]</td></tr>`);
    H.push(`<tr><th>Line facts</th><td>CPT ${esc(line?.cpt ?? '—')} · IP ${money(line?.ipOffer)} · NIP ${money(line?.nipOffer)} · FH 50th %ile ${line?.fhBenchmark == null ? '—' : money(line.fhBenchmark)}</td></tr>`);
    H.push(`<tr><th>Prep recommendation</th><td>${label}</td></tr>`);
    H.push('<tr><th>Prevailing party</th><td>Your DECISION — entered in TWO places; they must match.</td></tr>');
    H.push(`<tr><th>Rationale for this line</th><td>${
      rec.dliChainToLine !== null
        ? `matches decision on line ${rec.dliChainToLine} — paste: ${esc(dliSentence())}`
        : rec.recommended === 'NO_OP'
          ? `if your selection matches a previous line, paste: ${esc(dliSentence())} — otherwise the full paste block above`
          : 'the full paste block above'
    }</td></tr>`);
    H.push('</table>');
  }

  H.push('<h2><span class="module">Module 3</span>Attestation</h2>');
  H.push('<div class="attest">☐ Attestation completed — type YOUR name and TODAY’s date on the portal attestation screen.</div>');

  H.push('<h2>Cases Log row — paste into the IDR Cases Log sheet</h2>');
  H.push(`<pre class="paste">${esc(sheet.logRowHeader)}\n${esc(sheet.logRow)}</pre>`);

  // ══ BELOW THE FOLD — analysis & evidence ══
  H.push('<details class="fold"><summary>Analysis &amp; evidence (below the fold — open when you need the why)</summary>');

  H.push('<h2>Case facts <span class="note">(verify against the documents)</span></h2>');
  H.push('<table><tr><th>IP (provider)</th><th>NIP (payer/TPA)</th><th>QPA (NIP-supplied — display only, never an anchor)</th></tr>');
  H.push(`<tr><td>${esc(r.ipName ?? '— fill from notice of offer —')}</td><td>${esc(r.nipName ?? '— fill from notice of offer —')}</td><td>${money(r.qpa)}</td></tr></table>`);
  H.push('<table><tr><th>Line</th><th>CPT</th><th>Date of service</th><th>IP offer</th><th>NIP offer</th><th>FH 50th %ile</th></tr>');
  for (const l of r.lines) {
    H.push(`<tr><td>${l.line}</td><td>${esc(l.cpt ?? '—')}</td><td>${esc(l.dateOfService ?? '—')}</td><td>${money(l.ipOffer)}</td><td>${money(l.nipOffer)}</td><td>${l.fhBenchmark == null ? '—' : money(l.fhBenchmark)}</td></tr>`);
  }
  H.push('</table>');
  H.push('<div class="note">FH 50th %ile = FAIR Health benchmark from the NIP brief — a neutral reference point, not an offer.</div>');

  H.push('<h2>Staff eligibility notes</h2>');
  H.push('<p><strong>READ the staff eligibility-notes grid on the case screen</strong> (username / date / note) before deciding.</p>');
  if (sheet.eligibilityNotes.length > 0) {
    H.push('<table><tr><th>User</th><th>Date</th><th>Note</th></tr>');
    for (const n of sheet.eligibilityNotes) {
      H.push(`<tr><td>${esc(n.username ?? '—')}</td><td>${esc(n.date ?? '—')}</td><td>${esc(n.note)}</td></tr>`);
    }
    H.push('</table>');
  } else {
    H.push('<p class="note">(none found in the case folder — the portal grid may still have entries)</p>');
  }

  if (sheet.priorDeterminations.length > 0) {
    H.push('<h2>Prior determinations among the exhibits</h2><ul>');
    for (const pd of sheet.priorDeterminations) {
      H.push(`<li>${esc(pd.file)} — outcome: <strong>${pd.outcome ?? 'not stated'}</strong>${pd.date ? ` · ${esc(pd.date)}` : ''}</li>`);
    }
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
  for (const rec of sheet.recommendations) {
    H.push(`<li><strong>Line ${rec.line}</strong>: ${rec.reasons.map(esc).join(' · ')}</li>`);
  }
  H.push('</ul>');

  H.push('<h2>Documents read</h2><ul>');
  for (const d of sheet.documents) H.push(`<li>${esc(d.file)} → ${esc(d.kind)} <span class="note">(${esc(d.classificationReason)})</span></li>`);
  H.push('</ul>');

  H.push('<h2>Template fingerprints</h2><ul>');
  for (const fp of sheet.fingerprints) {
    H.push(`<li>${esc(fp.file)} (${fp.party}): ${fp.status === 'DEVIATION' ? '🚨 <strong>DEVIATION</strong>' : fp.status} — ${esc(fp.detail)}</li>`);
  }
  if (sheet.fingerprints.length === 0) H.push('<li>no briefs fingerprinted</li>');
  H.push('</ul>');

  H.push('</details>');

  H.push('</main>');
  H.push(`<div class="banner foot">${esc(sheet.draftBanner.replace(/█/g, '').trim())}</div>`);
  H.push('</body></html>');
  return H.join('\n');
}
