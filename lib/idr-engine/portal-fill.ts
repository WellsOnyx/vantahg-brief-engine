/**
 * Phase-3 portal-assist fill logic (field intel §2 / spec §7 Phase 3),
 * INTERNAL-ONLY, in-workspace.
 *
 * This is the pure DOM function the bookmarklet runs against the CURRENT
 * SFFlexSuite screen. It fills what it can identify from the engine's
 * `portal_fill` payload and then HALTS — the human reviews every field and
 * clicks save. It runs entirely in the reviewer's browser inside the AWS
 * workspace; nothing is sent anywhere.
 *
 * HARD GUARDRAILS, enforced in this code:
 *   - NEVER submits: it never calls form.submit(), never .click()s a
 *     submit/save/next control, never dispatches a submit event. It only
 *     sets field values and checkbox states and fires 'input'/'change' so
 *     the page's own validation runs.
 *   - NEVER fills human-only fields: DLI numbers and the attestation
 *     name/date are left untouched by doctrine.
 *   - Idempotent + reversible by the human: every field it changes is
 *     outlined so the reviewer sees exactly what was pre-filled.
 *
 * The matching is intentionally forgiving (label text / nearby markers),
 * because the exact SFFlexSuite field ids are only knowable from a live
 * screen. Tune the selectors after the first inspection; the guardrails do
 * not change.
 */

export interface PortalFillPayload {
  version: number;
  coi: 'no_to_all_questions';
  factor_rows: Array<{ factor: number; markers: string[]; ip: boolean; nip: boolean }>;
  rationale_paste: string;
  lines: Array<{ line: number; recommended_pp: string; dli_chain_to_line: number | null }>;
  decided_party: 'IP' | 'NIP' | null;
}

export interface FillResult {
  filled: string[];
  skipped: string[];
  submitted: false; // always — proof in the type that this path never submits
}

const HIGHLIGHT = '2px solid #d9a520';

// Controls we must NEVER actuate — the whole point of "halt before submit".
const SUBMIT_MARKERS = /\b(submit|save|finali[sz]e|complete|sign|attest|next|continue|confirm)\b/i;

function fire(el: Element, type: string): void {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.value = value;
  (el as HTMLElement).style.outline = HIGHLIGHT;
  fire(el, 'input');
  fire(el, 'change');
}

/** The element's explicit <label> text, or '' if none. */
function explicitLabel(el: Element): string {
  const id = el.getAttribute('id');
  if (id) {
    const lab = el.ownerDocument?.querySelector(`label[for="${CSS?.escape ? CSS.escape(id) : id}"]`);
    if (lab?.textContent) return lab.textContent.toLowerCase();
  }
  return '';
}

/** Text of the nearest row/cell/container — carries the factor description. */
function rowText(el: Element): string {
  return (el.closest('tr, .row, li, div')?.textContent || '').toLowerCase();
}

/** All context, for the submit guard (own attrs + explicit label + row). */
function isSubmitControl(el: Element): boolean {
  const own = (el.getAttribute('value') || el.textContent || '') + ' ' + (el.getAttribute('name') || '') + ' ' + (el.getAttribute('id') || '');
  return SUBMIT_MARKERS.test(own) || SUBMIT_MARKERS.test(explicitLabel(el)) || SUBMIT_MARKERS.test(rowText(el));
}

/** Context used to find a field by its label/purpose (label preferred, row fallback). */
function fieldContext(el: Element): string {
  return explicitLabel(el) || rowText(el);
}

/**
 * Fill the current portal document from the payload. Returns what was
 * filled and skipped. NEVER submits — guaranteed by construction and by
 * the `submitted: false` literal in the return.
 */
export function fillPortal(doc: Document, payload: PortalFillPayload): FillResult {
  const filled: string[] = [];
  const skipped: string[] = [];

  // 1 · COI — "No To All Questions" master checkbox.
  const checkboxes = Array.from(doc.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
  const noToAll = checkboxes.find((c) => /no to all/i.test(fieldContext(c)) || /no to all/i.test(rowText(c)));
  if (noToAll && !isSubmitControl(noToAll)) {
    if (!noToAll.checked) { noToAll.checked = true; noToAll.style.outline = HIGHLIGHT; fire(noToAll, 'click'); fire(noToAll, 'change'); }
    filled.push('COI: No To All Questions');
  } else {
    skipped.push('COI master checkbox (not found on this screen)');
  }

  // 2 · Factor checkboxes — match each row by its markers, set IP/NIP boxes.
  for (const row of payload.factor_rows) {
    for (const side of ['ip', 'nip'] as const) {
      const want = row[side];
      // Markers identify the FACTOR (row text); the explicit label
      // identifies the SIDE (IP vs NIP) — so paired IP/NIP boxes in one
      // row disambiguate correctly.
      const box = checkboxes.find((c) => {
        const marker = rowText(c);
        const sideCtx = explicitLabel(c) || rowText(c);
        return row.markers.some((m) => marker.includes(m)) && new RegExp(`(^|[^a-z])${side}([^a-z]|$)`, 'i').test(sideCtx);
      });
      if (!box || isSubmitControl(box)) continue;
      if (box.checked !== want) { box.checked = want; box.style.outline = HIGHLIGHT; fire(box, 'click'); fire(box, 'change'); }
      filled.push(`factor ${row.factor} ${side.toUpperCase()} = ${want ? 'checked' : 'unchecked'}`);
    }
  }

  // 3 · Rationale — the largest empty textarea, or one whose label mentions rationale.
  const textareas = Array.from(doc.querySelectorAll('textarea')) as HTMLTextAreaElement[];
  const rationaleTa =
    textareas.find((t) => /rationale|reason|narrative|explanation/i.test(fieldContext(t)) && !isSubmitControl(t))
    ?? textareas.filter((t) => !t.value.trim() && !isSubmitControl(t)).sort((a, b) => (b.rows || 0) - (a.rows || 0))[0];
  if (rationaleTa && !isSubmitControl(rationaleTa)) {
    setInputValue(rationaleTa, payload.rationale_paste);
    filled.push('rationale');
  } else {
    skipped.push('rationale textarea (not found)');
  }

  // 4 · Prevailing party — select/radio matching the decided party. Only
  // when a single party is decided; splits and FLAG/NO_OP are human calls.
  if (payload.decided_party) {
    const pp = payload.decided_party;
    const selects = Array.from(doc.querySelectorAll('select')) as HTMLSelectElement[];
    const ppSelect = selects.find((s) => /prevailing|final resolution|party|selected offer/i.test(fieldContext(s)));
    if (ppSelect && !isSubmitControl(ppSelect)) {
      const opt = Array.from(ppSelect.options).find((o) => new RegExp(`(^|[^a-z])${pp}([^a-z]|$)|${pp === 'IP' ? 'initiating' : 'non-initiating'}`, 'i').test(o.textContent || o.value));
      if (opt) { ppSelect.value = opt.value; ppSelect.style.outline = HIGHLIGHT; fire(ppSelect, 'change'); filled.push(`prevailing party = ${pp}`); }
    } else {
      skipped.push('prevailing-party control (not found — select it yourself)');
    }
  } else {
    skipped.push('prevailing party (split/flagged — human selects per line)');
  }

  // NEVER touched by doctrine — record so the reviewer knows.
  skipped.push('DLI number (human types from the portal screen)');
  skipped.push('attestation name + date (human only)');
  skipped.push('submit/save (human reviews every field, then clicks)');

  return { filled, skipped, submitted: false };
}

/** The exact source the bookmarklet ships — a self-invoking function that
 *  reads a pasted JSON payload and calls fillPortal. Kept in sync with the
 *  module above; the generator inlines fillPortal's logic. */
export const PORTAL_FILL_FUNCTION_SOURCE = fillPortal.toString();
