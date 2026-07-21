import { FACTORS } from './factors';
import { dliSentence } from './rationale';
import type { AnswerSheet } from './types';

/**
 * Stage 8, v1.1 shape: ONE CLEAN HTML SHEET PER CASE, visually mirroring
 * the SFFlexSuite module flow (1·COI → 2b·Non-AA Questions → 3·Attestation)
 * so the reviewer works side-by-side with the portal, top to bottom, zero
 * re-derivation.
 *
 * Plywood doctrine (spec §6 guardrails): no auth, no web app, no config,
 * no JavaScript — a static self-contained file the workspace browser
 * opens. Effort goes to extraction and rationale quality, not the wrapper.
 */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function money(v: number | null): string {
  return v === null ? '<span class="gap">— NOT EXTRACTED —</span>' : `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1a2233; margin: 0; background: #f2f4f8; }
  main { max-width: 900px; margin: 0 auto; padding: 16px 20px 60px; }
  .banner { background: #7a1f1f; color: #fff; font-weight: 700; text-align: center; padding: 10px 14px; letter-spacing: .02em; }
  .banner.foot { margin-top: 28px; }
  h1 { font-size: 20px; margin: 20px 0 4px; }
  h2 { font-size: 16px; margin: 26px 0 8px; padding-top: 14px; border-top: 2px solid #c6cede; }
  h2 .module { display: inline-block; background: #0c2340; color: #fff; font-size: 12px; padding: 2px 8px; border-radius: 3px; margin-right: 8px; vertical-align: 2px; }
  .meta { color: #5a6478; font-size: 13px; margin-bottom: 14px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; background: #fff; }
  th, td { border: 1px solid #c6cede; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: #e8ecf3; font-weight: 600; }
  .flags { background: #fff7e6; border: 2px solid #d9822b; padding: 10px 14px; margin: 14px 0; }
  .flags .block { color: #a12020; font-weight: 700; }
  .check { font-family: monospace; font-size: 16px; text-align: center; width: 60px; }
  .evidence { background: #fff; border-left: 4px solid #8ea3c2; margin: 6px 0; padding: 6px 10px; font-size: 13px; }
  .evidence .cite { color: #5a6478; }
  pre.paste { background: #10233d; color: #e8eef7; padding: 14px 16px; white-space: pre-wrap; word-wrap: break-word; font-size: 13px; border-radius: 4px; }
  .rec-flag { color: #a12020; font-weight: 700; }
  .gap { color: #a12020; font-weight: 600; }
  .note { color: #5a6478; font-size: 13px; }
  .attest { background: #fff; border: 1px dashed #8ea3c2; padding: 10px 14px; }
`;

export function renderAnswerSheetHtml(sheet: AnswerSheet): string {
  const r = sheet.record;
  const H: string[] = [];

  H.push('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">');
  H.push(`<title>Answer sheet — ${esc(sheet.caseId)}</title><style>${CSS}</style></head><body>`);
  H.push(`<div class="banner">${esc(sheet.draftBanner.replace(/█/g, '').trim())}</div>`);
  H.push('<main>');

  H.push(`<h1>Answer sheet — ${esc(r.caseId)}</h1>`);
  H.push(`<div class="meta">Generated ${esc(sheet.generatedAt)} · extraction mode ${r.extractionMode.toUpperCase()} · dispute ${esc(r.disputeNumber ?? '—')} · ${r.batch ? `BATCH, ${r.lines.length} lines` : 'single line'}</div>`);

  if (sheet.flags.length) {
    H.push('<div class="flags"><strong>⚑ Flags — read before anything else</strong><ul>');
    for (const f of sheet.flags) {
      H.push(`<li class="${f.severity === 'block' ? 'block' : ''}">${f.severity === 'block' ? '⛔' : '⚠'} ${esc(f.code)}${f.line ? ` (line ${f.line})` : ''} — ${esc(f.message)}</li>`);
    }
    H.push('</ul></div>');
  }

  H.push('<h2>Case facts <span class="note">(verify against the documents)</span></h2>');
  H.push('<table><tr><th>IP (provider)</th><th>NIP (payer/TPA)</th><th>QPA (NIP-supplied — display only, never an anchor)</th></tr>');
  H.push(`<tr><td>${esc(r.ipName ?? '— fill from notice of offer —')}</td><td>${esc(r.nipName ?? '— fill from notice of offer —')}</td><td>${money(r.qpa)}</td></tr></table>`);
  H.push('<table><tr><th>Line</th><th>CPT</th><th>Date of service</th><th>IP offer</th><th>NIP offer</th><th>FH 50th %ile</th></tr>');
  for (const l of r.lines) {
    H.push(`<tr><td>${l.line}</td><td>${esc(l.cpt ?? '—')}</td><td>${esc(l.dateOfService ?? '—')}</td><td>${money(l.ipOffer)}</td><td>${money(l.nipOffer)}</td><td>${l.fhBenchmark == null ? '—' : money(l.fhBenchmark)}</td></tr>`);
  }
  H.push('</table>');
  H.push('<div class="note">FH 50th %ile = FAIR Health benchmark from the NIP brief — a neutral reference point, not an offer.</div>');
  H.push(`<div class="note">Documents read: ${sheet.documents.map((d) => `${esc(d.file)} → ${esc(d.kind)}`).join(' · ')}</div>`);

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

  // ── Portal module order ──
  H.push('<h2><span class="module">Module 1</span>COI</h2>');
  H.push(`<p>Answer: <strong>${sheet.coi.answer}</strong> (per policy) — check the master <strong>“No To All Questions”</strong> box; each individual conflict question keeps its <strong>No</strong> dropdown and an <strong>empty</strong> text field.</p>`);
  H.push('<p>Scan the names below for any conflict YOU have — the sheet cannot know your conflicts:</p><ul>');
  if (sheet.coi.namesForReview.length === 0) H.push('<li class="note">(no names extracted — check the party names in Case facts yourself)</li>');
  for (const n of sheet.coi.namesForReview) H.push(`<li>${esc(n)}</li>`);
  H.push('</ul>');

  H.push('<h2><span class="module">Module 2b</span>Non-AA Questions — factor checkboxes</h2>');
  H.push('<p class="note">Check rule: a party is checked ONLY if their brief raises the factor. Every check below carries its evidence.</p>');
  H.push('<table><tr><th>#</th><th>Factor</th><th class="check">IP</th><th class="check">NIP</th></tr>');
  for (const def of FACTORS) {
    const ip = sheet.factorGrid.ip.find((f) => f.factor === def.factor);
    const nip = sheet.factorGrid.nip.find((f) => f.factor === def.factor);
    H.push(`<tr><td>${def.factor}</td><td>${esc(def.title)}</td><td class="check">${ip?.raised ? '☑' : '☐'}</td><td class="check">${nip?.raised ? '☑' : '☐'}</td></tr>`);
  }
  H.push('</table>');
  for (const side of ['ip', 'nip'] as const) {
    for (const f of sheet.factorGrid[side]) {
      if (!f.raised) continue;
      H.push(`<div class="evidence"><strong>${side.toUpperCase()} · factor ${f.factor}</strong> (${esc(f.suggestedWeight ?? 'weight tbd')})${f.summary ? ` — ${esc(f.summary)}` : ''}`);
      for (const e of f.evidence) H.push(`<div>“${esc(e.quote)}” <span class="cite">— ${esc(e.file)}, p. ${e.page}</span></div>`);
      H.push('</div>');
    }
  }

  H.push('<h2><span class="module">Module 2b</span>Rationale — paste block</h2>');
  H.push(`<pre class="paste">${esc(sheet.rationale)}</pre>`);

  // One "Case Info and Final Resolution" record PER LINE — page 1 of N,
  // each carrying its Dispute Line Item Name (the DLI number is read off
  // the portal screen and typed by the human, never pre-filled).
  const total = sheet.recommendations.length;
  for (const rec of sheet.recommendations) {
    const line = r.lines.find((l) => l.line === rec.line);
    const label = rec.recommended === 'FLAG'
      ? '<span class="rec-flag">⛔ FLAG — HUMAN RULING REQUIRED</span>'
      : `<strong>${rec.recommended}</strong> (${rec.confidencePct}%)`;
    H.push(`<h2><span class="module">Module 2b</span>Case Info and Final Resolution — page ${rec.line} of ${total}</h2>`);
    H.push('<table>');
    H.push(`<tr><th>Dispute Line Item Name</th><td>DLI - [____ ← read off the portal screen]</td></tr>`);
    H.push(`<tr><th>Line facts</th><td>CPT ${esc(line?.cpt ?? '—')} · IP ${money(line?.ipOffer ?? null)} · NIP ${money(line?.nipOffer ?? null)} · FH 50th %ile ${line?.fhBenchmark == null ? '—' : money(line.fhBenchmark)}</td></tr>`);
    H.push(`<tr><th>Prep recommendation</th><td>${label} — ${esc(rec.reasons[0] ?? '')}</td></tr>`);
    H.push('<tr><th>Prevailing party</th><td>Your DECISION — entered in TWO places; they must match.</td></tr>');
    H.push(`<tr><th>Rationale for this line</th><td>${rec.dliChainToLine !== null ? `matches decision on line ${rec.dliChainToLine}: ${esc(dliSentence())}` : 'the full paste block above'}</td></tr>`);
    H.push('</table>');
  }

  H.push('<h2><span class="module">Module 3</span>Attestation</h2>');
  H.push('<div class="attest">☐ Attestation completed — type YOUR name and TODAY’s date on the portal attestation screen.</div>');

  H.push('<h2>Cases Log row</h2>');
  H.push(`<pre class="paste">${esc(sheet.logRowHeader)}\n${esc(sheet.logRow)}</pre>`);

  H.push('</main>');
  H.push(`<div class="banner foot">${esc(sheet.draftBanner.replace(/█/g, '').trim())}</div>`);
  H.push('</body></html>');
  return H.join('\n');
}
