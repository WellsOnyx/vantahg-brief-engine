import type { CanonicalCase, CanonicalDetermination, ConnectorResult } from '@/lib/connectors/types';
import type { CasePriority } from '@/lib/types';

/**
 * X12 rail — ASC X12N 278 Health Care Services Review (005010X217),
 * pragmatic subset (docs/CONNECTOR_RAILS.md §X12).
 *
 * This is the EDI dialect legacy adjudication engines and clearinghouses
 * speak (Facets, QNXT, HealthEdge, Availity, Change/Optum). Inbound: a 278
 * request interchange → CanonicalCase → the same shared ingest path as
 * every rail. Outbound: a structurally valid 278 response with the HCR
 * review action (A1 certified · A3 not certified · A4 pended · A6
 * modified) and our authorization number.
 *
 * Subset read (documented, deliberate — full SNIP conformance is the
 * clearinghouse's job, not the engine's):
 *   ISA/GS/ST envelopes  — delimiters derived from ISA itself
 *   BHT03                → fallback trace when no TRN
 *   TRN02 (event level)  → client_reference (retry-stable idempotency)
 *   HL 20/21/22/23/EV    — UMO / requester / subscriber / dependent / event
 *   NM1 IL|QC            → patient last*first + MI member id
 *   NM1 1P|SJ|FA (…XX)   → requesting provider + NPI
 *   NM1 X3|PR (level 20) → payer name
 *   DMG*D8               → patient DOB
 *   UM                   → request category; UM06 level of service:
 *                          U→urgent · 03 (emergency)→expedited
 *   DTP*472/435          → service date → turnaround anchor (unused in v1)
 *   HI ABK|ABF|BK|BF     → diagnosis codes (ICD-10 / legacy ICD-9 quals)
 *   SV1/SV2/SV3 HC|HP    → procedure codes (CPT/HCPCS)
 *
 * PHI rule: parse errors carry segment/element locators, never values.
 */

// ---------------------------------------------------------------------------
// Tokenizer — delimiters come from the ISA segment itself.
// ---------------------------------------------------------------------------

export interface X12Segment {
  id: string;
  /** elements[i] = components of element i+1 (ISA-relative), each already component-split. */
  elements: string[][];
}

export interface X12Interchange {
  segments: X12Segment[];
  delimiters: { element: string; component: string; segment: string; repetition: string };
  isa: string[]; // raw ISA elements (16)
  gs: string[];
}

export function tokenizeX12(raw: string): ConnectorResult<X12Interchange> {
  const text = raw.replace(/\r?\n/g, '').trim();
  if (!text.startsWith('ISA')) {
    return { ok: false, errors: [{ path: 'ISA', message: 'interchange must start with an ISA segment' }] };
  }
  // ISA is fixed-position: element separator at index 3; ISA16 (component
  // separator) is the char before the segment terminator. ISA has 16
  // elements; with 1-char values for ISA16 the terminator is the char
  // after it.
  const element = text[3];
  // idx starts ON separator 1 (before ISA01); hop to separator 16 (before ISA16).
  let idx = 3;
  for (let n = 0; n < 15; n++) {
    idx = text.indexOf(element, idx + 1);
    if (idx === -1) return { ok: false, errors: [{ path: 'ISA', message: 'malformed ISA — fewer than 16 elements' }] };
  }
  const component = text[idx + 1];
  const segment = text[idx + 2];
  if (!component || !segment) {
    return { ok: false, errors: [{ path: 'ISA16', message: 'could not derive component/segment delimiters' }] };
  }
  const isaRaw = text.slice(0, idx + 2);
  const repetition = isaRaw.split(element)[11]?.length === 1 ? isaRaw.split(element)[11] : '^';

  const segStrings = text.split(segment).map((s) => s.trim()).filter(Boolean);
  const segments: X12Segment[] = segStrings.map((s) => {
    const parts = s.split(element);
    return {
      id: parts[0],
      elements: parts.slice(1).map((e) => e.split(component)),
    };
  });

  const isa = segStrings[0]?.split(element).slice(1) ?? [];
  const gs = segments.find((s) => s.id === 'GS')?.elements.map((e) => e.join('')) ?? [];
  if (!segments.some((s) => s.id === 'ST')) {
    return { ok: false, errors: [{ path: 'ST', message: 'no transaction set in interchange' }] };
  }
  return { ok: true, value: { segments, delimiters: { element, component, segment, repetition }, isa, gs } };
}

// ---------------------------------------------------------------------------
// Inbound: 278 request → CanonicalCase
// ---------------------------------------------------------------------------

const el = (seg: X12Segment, i: number): string => seg.elements[i - 1]?.join('') ?? '';
const comp = (seg: X12Segment, i: number, c: number): string => seg.elements[i - 1]?.[c - 1] ?? '';

const DIAGNOSIS_QUALS = new Set(['ABK', 'ABF', 'BK', 'BF']);
const PROCEDURE_QUALS = new Set(['HC', 'HP']);

function fmtDate(d8: string): string | undefined {
  if (!/^\d{8}$/.test(d8)) return undefined;
  return `${d8.slice(0, 4)}-${d8.slice(4, 6)}-${d8.slice(6, 8)}`;
}

export function parse278ToCanonical(raw: string): ConnectorResult<CanonicalCase & { trace: string }> {
  const tok = tokenizeX12(raw);
  if (!tok.ok || !tok.value) return { ok: false, errors: tok.errors };
  const { segments } = tok.value;

  const st = segments.find((s) => s.id === 'ST');
  if (!st || el(st, 1) !== '278') {
    return { ok: false, errors: [{ path: 'ST01', message: 'transaction set is not a 278' }] };
  }

  let patientName = '';
  let memberId: string | undefined;
  let dob: string | undefined;
  let providerName: string | undefined;
  let npi: string | undefined;
  let payerName: string | undefined;
  let trace = '';
  let priority: CasePriority = 'standard';
  const procedureCodes: string[] = [];
  const diagnosisCodes: string[] = [];

  let currentLevel = '';
  const bht = segments.find((s) => s.id === 'BHT');

  for (const seg of segments) {
    switch (seg.id) {
      case 'HL':
        currentLevel = el(seg, 3); // 20 UMO | 21 requester | 22 subscriber | 23 dependent | EV event
        break;
      case 'NM1': {
        const qual = el(seg, 1);
        const last = el(seg, 3);
        const first = el(seg, 4);
        const idQual = el(seg, 8);
        const idVal = el(seg, 9);
        if (qual === 'IL' || qual === 'QC') {
          patientName = [first, last].filter(Boolean).join(' ').trim() || patientName;
          if (idQual === 'MI' && idVal) memberId = idVal;
        } else if (['1P', 'SJ', 'FA', '71'].includes(qual)) {
          providerName = [first, last].filter(Boolean).join(' ').trim() || last || providerName;
          if (idQual === 'XX' && idVal) npi = idVal;
        } else if ((qual === 'X3' || qual === 'PR') && currentLevel === '20') {
          payerName = last || payerName;
        }
        break;
      }
      case 'DMG':
        if (el(seg, 1) === 'D8') dob = fmtDate(el(seg, 2)) ?? dob;
        break;
      case 'TRN':
        if (!trace && el(seg, 2)) trace = el(seg, 2);
        break;
      case 'UM': {
        const levelOfService = el(seg, 6);
        if (levelOfService === 'U') priority = 'urgent';
        if (levelOfService === '03') priority = 'expedited';
        break;
      }
      case 'HI':
        for (let i = 1; i <= seg.elements.length; i++) {
          const q = comp(seg, i, 1);
          const code = comp(seg, i, 2);
          if (DIAGNOSIS_QUALS.has(q) && code) {
            // ICD-10 arrives undotted (M1711) — normalize to M17.11 form.
            diagnosisCodes.push(code.length > 3 && !code.includes('.') ? `${code.slice(0, 3)}.${code.slice(3)}` : code);
          }
        }
        break;
      case 'SV1':
      case 'SV2':
      case 'SV3': {
        // Composite is SV101 for SV1/SV3, SV202 for SV2.
        const compIndex = seg.id === 'SV2' ? 2 : 1;
        const q = comp(seg, compIndex, 1);
        const code = comp(seg, compIndex, 2);
        if (PROCEDURE_QUALS.has(q) && code) procedureCodes.push(code);
        break;
      }
    }
  }

  const errors: Array<{ path: string; message: string }> = [];
  if (!trace) trace = bht ? el(bht, 3) : '';
  const clientReference = trace.replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 128);
  if (clientReference.length < 8) {
    errors.push({ path: 'TRN02', message: 'trace number required (8+ chars) — the retry-stable idempotency reference' });
  }
  if (!patientName) errors.push({ path: 'NM1*IL', message: 'subscriber/patient name required' });
  if (procedureCodes.length === 0) errors.push({ path: 'SV1/SV2', message: 'at least one HC/HP procedure code required' });
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      client_reference: clientReference,
      trace,
      case_type: 'um',
      review_type: 'prior_auth',
      priority,
      patient: { name: patientName, dob, member_id: memberId },
      procedure_codes: procedureCodes,
      diagnosis_codes: diagnosisCodes,
      requesting_provider: providerName || npi ? { name: providerName, npi } : undefined,
      payer_name: payerName,
      source_system: 'x12_278',
    },
  };
}

// ---------------------------------------------------------------------------
// Outbound: 278 response
// ---------------------------------------------------------------------------

const HCR_ACTION: Record<string, string> = {
  approve: 'A1',
  deny: 'A3',
  pend: 'A4',
  partial_approve: 'A6',
  modify: 'A6',
  queued: 'A4',
};

/**
 * Render a structurally valid 278 response mirroring the request envelope
 * (sender/receiver swapped), carrying HCR with the review action and our
 * authorization number as the certification reference. Control numbers
 * echo the request's for correlation.
 */
export function render278Response(opts: {
  request: X12Interchange;
  det: CanonicalDetermination;
  authorizationNumber: string;
  trace: string;
  now?: Date;
}): string {
  const { element: e, component: c, segment: t } = opts.request.delimiters;
  const isa = opts.request.isa;
  const now = opts.now ?? new Date();
  const yymmdd = now.toISOString().slice(2, 10).replace(/-/g, '');
  const ccyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const hhmm = now.toISOString().slice(11, 16).replace(':', '');
  const action = HCR_ACTION[opts.det.decision ?? 'queued'] ?? 'A4';
  const ctrl = (isa[12] ?? '000000001').trim() || '000000001';

  // Swap sender/receiver from the request ISA.
  const pad = (s: string, n: number) => (s ?? '').padEnd(n).slice(0, n);
  const segs: string[] = [];
  segs.push(
    ['ISA', pad(isa[0] ?? '00', 2), pad(isa[1] ?? '', 10), pad(isa[2] ?? '00', 2), pad(isa[3] ?? '', 10),
      pad(isa[6] ?? 'ZZ', 2), pad(isa[7] ?? 'RECEIVER', 15), pad(isa[4] ?? 'ZZ', 2), pad(isa[5] ?? 'VANTAUM', 15),
      yymmdd, hhmm, opts.request.delimiters.repetition, '00501', ctrl, '0', pad(isa[14] ?? 'P', 1), c,
    ].join(e),
  );
  segs.push(['GS', 'HI', 'VANTAUM', (opts.request.gs[1] ?? 'PARTNER'), ccyymmdd, hhmm, '1', 'X', '005010X217'].join(e));
  segs.push(['ST', '278', '0001', '005010X217'].join(e));
  segs.push(['BHT', '0007', '11', opts.trace, ccyymmdd, hhmm].join(e)); // 11 = response
  segs.push(['HL', '1', '', '20', '1'].join(e));
  segs.push(['NM1', 'X3', '2', 'VANTAUM UTILIZATION MANAGEMENT', '', '', '', '', '46', 'VANTAUM'].join(e));
  segs.push(['HL', '2', '1', '21', '1'].join(e));
  segs.push(['HL', '3', '2', '22', '1'].join(e));
  segs.push(['HL', '4', '3', 'EV', '0'].join(e));
  segs.push(['TRN', '2', opts.trace, '9VANTAUM01'].join(e));
  segs.push(['HCR', action, opts.authorizationNumber].join(e));
  const stIndex = segs.findIndex((s) => s.startsWith('ST' + e));
  const segCountThroughSe = segs.length - stIndex + 1; // ST..SE inclusive
  segs.push(['SE', String(segCountThroughSe), '0001'].join(e));
  segs.push(['GE', '1', '1'].join(e));
  segs.push(['IEA', '1', ctrl].join(e));
  return segs.join(t) + t;
}
