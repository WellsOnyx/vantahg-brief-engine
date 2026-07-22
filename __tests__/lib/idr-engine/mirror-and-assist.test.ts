import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, readFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { runCase } from '@/lib/idr-engine/run-case';
import { fillPortal, type PortalFillPayload } from '@/lib/idr-engine/portal-fill';

/**
 * Mirror form (replica screens, pre-filled, copy buttons, minimal JS) and
 * the Phase-3 portal-assist fill logic (fills the current screen, NEVER
 * submits, never touches human-only fields). Internal-only, same
 * guardrails.
 */

const IP_OFFER = `NOTICE OF OFFER — INITIATING PARTY
Dispute number DISP-660001. Line 1 final payment offer: $1,150.00. Line 2 final payment offer: $1,150.00.`;
const NIP_OFFER = `NOTICE OF OFFER — NON-INITIATING PARTY
Dispute DISP-660001. QPA is $400.00. Line 1 final payment offer: $450.00. Line 2 final payment offer: $450.00.`;
const IP_BRIEF = `ARBITRATION BRIEF OF THE INITIATING PARTY
Under the prior contracted rate the payer paid more in good faith negotiations, per the EOB in Exhibit A.
The acuity was high per the operative report.`;
const NIP_BRIEF = `ARBITRATION BRIEF — NON-INITIATING PARTY
The QPA already accounts for acuity and the qualifying payment amount is appropriate.`;

let caseDir: string;
let libPath: string;
let outDir: string;

beforeEach(async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'idr-mirror-'));
  caseDir = path.join(base, 'DISP-660001');
  await mkdir(caseDir);
  libPath = path.join(base, 'lib.json');
  outDir = path.join(base, 'out');
  for (const [f, c] of Object.entries({
    'ip-notice-of-offer.txt': IP_OFFER,
    'nip-notice-of-offer.txt': NIP_OFFER,
    'ip-brief.txt': IP_BRIEF,
    'nip-brief.txt': NIP_BRIEF,
  })) await writeFile(path.join(caseDir, f), c, 'utf-8');
});

// ── Mirror form ────────────────────────────────────────────────────────────

describe('mirror form', () => {
  it('renders replica screens in portal order with pre-filled fields and per-textfield copy buttons', async () => {
    const { files, sheet } = await runCase(caseDir, { libraryPath: libPath, outDir });
    const html = await readFile(files.html, 'utf-8');

    // Replica screens, in order.
    expect(html.indexOf('Conflict of Interest')).toBeLessThan(html.indexOf('Non-AA Questions — Factors'));
    expect(html.indexOf('Non-AA Questions — Factors')).toBeLessThan(html.indexOf('Case Info and Final Resolution'));
    expect(html.indexOf('Case Info and Final Resolution')).toBeLessThan(html.indexOf('Attestation'));

    // Checkboxes rendered in the state to click them to (☑ for a raised factor).
    expect(html).toContain('class="cb on">☑'); // at least one checked
    expect(html).toContain('class="cb off">☐'); // at least one unchecked
    // COI master is pre-checked.
    expect(html).toContain('No To All Questions');

    // Copy button on every text field: rationale textarea + log row at minimum.
    const copyButtons = html.match(/class="copybtn"/g) ?? [];
    expect(copyButtons.length).toBeGreaterThanOrEqual(2);
    // The rationale paste value is embedded verbatim in a copy button.
    expect(html).toContain(`data-copy="${sheet.rationalePaste.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 20)}`);

    // Minimal JS is the copy handler ONLY — no submit, no network.
    expect(html).toContain('function idrCopy');
    expect(html).not.toMatch(/\.submit\s*\(/);
    expect(html).not.toMatch(/fetch\s*\(|XMLHttpRequest/);

    // Human-only fields rendered as blanks, never pre-filled.
    expect(html).toContain('DLI - ____');
    expect(html).toContain('type YOUR name');
    expect(html).not.toMatch(/DLI - \d/);

    // Analysis still below the fold.
    expect(html.indexOf('<details class="fold">')).toBeLessThan(html.indexOf('Evidence backing each factor check'));
    expect(html).not.toMatch(/engine/i); // no tooling fingerprints
  });

  it('answer-sheet.json carries the portal_fill payload (no DLI, no attestation)', async () => {
    const { files } = await runCase(caseDir, { libraryPath: libPath, outDir });
    const json = JSON.parse(await readFile(files.json, 'utf-8'));
    const pf = json.portal_fill;
    expect(pf.coi).toBe('no_to_all_questions');
    expect(pf.factor_rows).toHaveLength(7);
    expect(pf.factor_rows[4]).toMatchObject({ factor: 5, ip: true }); // IP raised factor 5
    expect(pf.rationale_paste).toContain('offer is selected as the out-of-network rate');
    expect(pf.decided_party).toBe('IP');
    expect(JSON.stringify(pf)).not.toMatch(/dli_number|attestation/i);
  });
});

// ── Phase-3 portal-assist fill logic ───────────────────────────────────────

function synthPortal(): Document {
  document.body.innerHTML = `
    <form id="portal">
      <div class="row"><label for="coi">No To All Questions</label><input type="checkbox" id="coi"></div>
      <table>
        <tr><td>Factor 5 — good faith negotiation and contracted rates</td>
            <td><label for="f5ip">IP</label><input type="checkbox" id="f5ip"></td>
            <td><label for="f5nip">NIP</label><input type="checkbox" id="f5nip"></td></tr>
        <tr><td>Factor 3 — acuity of the case</td>
            <td><label for="f3ip">IP</label><input type="checkbox" id="f3ip"></td>
            <td><label for="f3nip">NIP</label><input type="checkbox" id="f3nip"></td></tr>
      </table>
      <div class="row"><label for="rat">Rationale</label><textarea id="rat" rows="10"></textarea></div>
      <div class="row"><label for="pp">Prevailing Party</label>
        <select id="pp"><option value="">--</option><option value="IP">Initiating Party</option><option value="NIP">Non-Initiating Party</option></select></div>
      <div class="row"><label for="dli">Dispute Line Item Name</label><input type="text" id="dli"></div>
      <input type="submit" id="go" value="Submit Determination">
    </form>`;
  return document;
}

const PAYLOAD: PortalFillPayload = {
  version: 1,
  coi: 'no_to_all_questions',
  factor_rows: [
    { factor: 5, markers: ['good faith', 'contracted rate'], ip: true, nip: false },
    { factor: 3, markers: ['acuity'], ip: true, nip: true },
  ],
  rationale_paste: 'The Initiating Party has presented sufficient credible evidence to substantiate its offer.',
  lines: [{ line: 1, recommended_pp: 'IP', dli_chain_to_line: null }],
  decided_party: 'IP',
};

describe('fillPortal (Phase-3 assist)', () => {
  it('fills COI, factor checkboxes, rationale, and prevailing party from the payload', () => {
    const doc = synthPortal();
    const result = fillPortal(doc, PAYLOAD);

    expect((doc.getElementById('coi') as HTMLInputElement).checked).toBe(true);
    expect((doc.getElementById('f5ip') as HTMLInputElement).checked).toBe(true);
    expect((doc.getElementById('f5nip') as HTMLInputElement).checked).toBe(false);
    expect((doc.getElementById('f3ip') as HTMLInputElement).checked).toBe(true);
    expect((doc.getElementById('f3nip') as HTMLInputElement).checked).toBe(true);
    expect((doc.getElementById('rat') as HTMLTextAreaElement).value).toContain('sufficient credible evidence');
    expect((doc.getElementById('pp') as HTMLSelectElement).value).toBe('IP');
    expect(result.filled).toContain('rationale');
  });

  it('NEVER submits and NEVER fills human-only fields (DLI, attestation)', () => {
    const doc = synthPortal();
    let submitted = false;
    (doc.getElementById('portal') as HTMLFormElement).addEventListener('submit', () => { submitted = true; });
    const submitBtn = doc.getElementById('go') as HTMLInputElement;
    let clicked = false;
    submitBtn.addEventListener('click', () => { clicked = true; });

    const result = fillPortal(doc, PAYLOAD);

    expect(result.submitted).toBe(false);
    expect(submitted).toBe(false); // no submit event ever dispatched
    expect(clicked).toBe(false); // the submit control was never actuated
    expect((doc.getElementById('dli') as HTMLInputElement).value).toBe(''); // DLI never filled
    expect(result.skipped.some((s) => /DLI number/.test(s))).toBe(true);
    expect(result.skipped.some((s) => /attestation/i.test(s))).toBe(true);
    expect(result.skipped.some((s) => /SUBMIT|submit\/save/i.test(s))).toBe(true);
  });

  it('outlines every field it changed so the reviewer can verify', () => {
    const doc = synthPortal();
    fillPortal(doc, PAYLOAD);
    expect((doc.getElementById('rat') as HTMLTextAreaElement).style.outline).toContain('#d9a520');
    expect((doc.getElementById('f5ip') as HTMLInputElement).style.outline).toContain('#d9a520');
  });

  it('does not select a prevailing party when the decision is split/flagged', () => {
    const doc = synthPortal();
    const result = fillPortal(doc, { ...PAYLOAD, decided_party: null });
    expect((doc.getElementById('pp') as HTMLSelectElement).value).toBe('');
    expect(result.skipped.some((s) => /split\/flag/.test(s))).toBe(true);
  });

  it('never actuates a control whose label looks like submit/save even if it matches a field pattern', () => {
    document.body.innerHTML = `
      <div class="row"><label for="x">Rationale — Save and Submit</label><textarea id="x"></textarea></div>`;
    const result = fillPortal(document, { ...PAYLOAD, factor_rows: [], decided_party: null });
    // The textarea's context says submit → skipped, not filled.
    expect((document.getElementById('x') as HTMLTextAreaElement).value).toBe('');
    expect(result.filled).not.toContain('rationale');
  });
});
