import type { LineActor } from '@/lib/lines';
import { loadIdrCatalog, type DeterminationDeps, type DeterminationRequest } from '@/lib/idr/determination';

export const CV_TEXT = 'Synthetic board certification in a demonstration specialty.';
export const CV_EXCERPT = 'Synthetic board certification in a demonstration specialty.';

export const NOW = '2026-10-20T18:00:00.000Z';

export function idrActor(overrides: Partial<LineActor> = {}): LineActor {
  return {
    id: 'actor-idr',
    companies: ['VANTA_HG'],
    lines: ['IDR'],
    case_restricted: false,
    assigned_case_ids: [],
    line_wide: true,
    ...overrides,
  };
}

export function deps(overrides: Partial<DeterminationDeps> = {}): DeterminationDeps {
  return {
    now: () => NOW,
    catalog: loadIdrCatalog(),
    audit: [],
    workflowAudit: [],
    ...overrides,
  };
}

export function figure(amount: string, docId: string, page = 1) {
  return { amount, doc_id: docId, page };
}

export function singleRequest(overrides: Partial<DeterminationRequest> = {}): DeterminationRequest {
  const base: DeterminationRequest = {
    case_id: 'CASE-SYN-100',
    dispute_ref: 'DISP-SYN-ALPHA',
    prevailing_party: 'IP',
    reason: 'The selected offer is the offer recorded for the prevailing party on this dispute.',
    line_items: [
      {
        line_id: 'LI-SYN-A',
        label: 'Synthetic service A',
        ip_offer: figure('1500.00', 'DOC-SYN-IP-OFFER', 2),
        nip_offer: figure('1000.00', 'DOC-SYN-NIP-OFFER', 3),
        qpa: figure('900.00', 'DOC-SYN-QPA', 1),
      },
    ],
    documents: [
      { doc_id: 'DOC-SYN-IP-OFFER', role: 'offer_sheet', party: 'IP', label: 'Initiating party offer sheet' },
      { doc_id: 'DOC-SYN-NIP-OFFER', role: 'offer_sheet', party: 'NIP', label: 'Non-initiating party offer sheet' },
      { doc_id: 'DOC-SYN-QPA', role: 'qpa_statement', party: 'NIP', label: 'Qualifying payment amount statement' },
      {
        doc_id: 'DOC-SYN-CV',
        role: 'cv',
        party: 'IP',
        label: 'Curriculum vitae',
        text: CV_TEXT,
        excerpt: CV_EXCERPT,
        board_certification: 'board certification',
        specialty: 'demonstration specialty',
      },
      {
        doc_id: 'DOC-SYN-RECORDS',
        role: 'records',
        party: 'IP',
        label: 'Medical records',
        text: 'CPT 99285 clearly warrants a higher offer because the patient was highly complex.',
      },
      {
        doc_id: 'DOC-SYN-OP',
        role: 'op_report',
        party: 'IP',
        label: 'Operative report',
        text: 'Operative report for the synthetic encounter. CPT 99285. This justifies the offer.',
      },
      { doc_id: 'DOC-SYN-BRIEF', role: 'nip_brief', party: 'NIP', label: 'Non-initiating party brief' },
      { doc_id: 'DOC-SYN-MARKET', role: 'other', party: 'IP', label: 'Market share exhibit' },
      { doc_id: 'DOC-SYN-FAITH', role: 'other', party: 'NIP', label: 'Network effort exhibit' },
      { doc_id: 'DOC-SYN-IP-EXTRA', role: 'other', party: 'IP', label: 'Additional information' },
      { doc_id: 'DOC-SYN-NIP-EXTRA', role: 'other', party: 'NIP', label: 'Additional information' },
    ],
    factor_materials: [
      {
        factor_id: 'market_share',
        party: 'IP',
        document_ids: ['DOC-SYN-MARKET'],
        note: 'clearly the dominant market share and an excessive position',
      },
      {
        factor_id: 'good_faith_efforts',
        party: 'NIP',
        document_ids: ['DOC-SYN-FAITH'],
        note: 'The plan obviously negotiated in bad faith.',
      },
      {
        factor_id: 'additional_information',
        party: 'IP',
        document_ids: ['DOC-SYN-IP-EXTRA'],
        note: 'This supports the initiating party and should be credited to the initiating party.',
        credit_to: 'IP',
      },
      {
        factor_id: 'additional_information',
        party: 'NIP',
        document_ids: ['DOC-SYN-NIP-EXTRA'],
      },
      {
        factor_id: 'acuity_complexity',
        party: 'IP',
        document_ids: ['DOC-SYN-RECORDS', 'DOC-SYN-OP'],
        note: 'CPT 99285 warrants the higher offer because the patient was more complex than the code.',
      },
    ],
  };
  return {
    ...base,
    ...overrides,
    line_items: overrides.line_items ?? base.line_items,
    documents: overrides.documents ?? base.documents,
    factor_materials: overrides.factor_materials ?? base.factor_materials,
  };
}

export function batchRequest(): DeterminationRequest {
  const single = singleRequest({ asserted_shape: undefined, asserted_nip_brief: undefined });
  return {
    ...single,
    documents: single.documents.filter((doc) => doc.role !== 'nip_brief'),
    prevailing_party: 'NIP',
    line_items: [
      ...single.line_items,
      {
        line_id: 'LI-SYN-B',
        label: 'Synthetic service B',
        ip_offer: figure('2000.00', 'DOC-SYN-IP-OFFER', 4),
        nip_offer: figure('1200.00', 'DOC-SYN-NIP-OFFER', 5),
        qpa: figure('1100.00', 'DOC-SYN-QPA', 2),
      },
    ],
  };
}
