import { fillPhrase, partyName } from './phrases';
import type {
  DeterminationRequest,
  FactorEvidence,
  FactorId,
  IdrDocumentInput,
  Party,
  PartyFactorEvidence,
  QaChecklist,
} from './types';

const SUBMISSION_FACTORS: readonly FactorId[] = ['market_share', 'teaching_case_mix', 'good_faith_efforts'];

/**
 * The seven considerations are public: 45 CFR 149.510(c)(5)(iii)(A) through (D).
 * https://www.ecfr.gov/current/title-45/section-149.510
 * QPA methodology: 45 CFR 149.140. https://www.ecfr.gov/current/title-45/section-149.140
 * Training, experience, and quality and outcomes: 45 CFR 149.510(c)(5)(iii)(B)(1).
 * Acuity or complexity: 45 CFR 149.510(c)(5)(iii)(B)(3).
 * Additional information relating to an offer: 45 CFR 149.510(c)(5)(iii)(D).
 * Prohibited factors: 45 CFR 149.510(c)(5)(v).
 * Never crediting factor 7 to the initiating party is house_style.
 * CMS Federal Independent Dispute Resolution (IDR) Process Guidance for Certified IDR Entities (2023 guidance PDF on cms.gov)
 * and the Federal Independent Dispute Resolution (IDR) Process Guidance for Disputing Parties
 * (CMS No Surprises Act policies and resources index).
 */
export const FACTOR_BASIS = {
  basis: 'public',
  citation: '45 CFR 149.510(c)(5)(iii)',
  source_url: 'https://www.ecfr.gov/current/title-45/section-149.510',
} as const;

export const FACTOR_7_CREDIT_BASIS = {
  basis: 'house_style',
  citation: '45 CFR 149.510(c)(5)(iii)(D)',
  source_url: 'https://www.ecfr.gov/current/title-45/section-149.510',
} as const;

/**
 * Maps each statutory factor to what each party actually filed.
 * Training text is the CV board-certification and specialty slot.
 * Acuity states attachment tokens, or the checklist no-acuity slot when none were filed.
 * Factor 7 is never credited to the initiating party. It is credited to the
 * non-initiating party only when the request says the chart supports it and a chart is on file.
 * Notes are not copied into the narrative.
 */
export function buildFactorEvidence(request: DeterminationRequest, checklist: QaChecklist): FactorEvidence[] {
  return checklist.factors.map((spec) => {
    if (spec.id === 'qpa') return qpaFactor(request, checklist, spec.number, spec.label);
    if (spec.id === 'training_experience') return trainingFactor(request, checklist, spec.number, spec.label);
    if (spec.id === 'acuity_complexity') return acuityFactor(request, checklist, spec.number, spec.label);
    if (spec.id === 'additional_information') return factorSeven(request, checklist, spec.number, spec.label);
    return submissionFactor(request, checklist, spec.id, spec.number, spec.label);
  });
}

export function renderPartyParagraph(factors: readonly FactorEvidence[], party: Party): string {
  const key = party === 'IP' ? 'ip_narrative' : 'nip_narrative';
  return factors
    .map((factor) => factor[key].trim())
    .filter((narrative) => narrative.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function qpaFactor(request: DeterminationRequest, checklist: QaChecklist, number: number, label: string): FactorEvidence {
  const docs = request.documents.filter((doc) => doc.role === 'qpa_statement');
  const sentence = checklist.phrases.qpa_factor;
  return {
    factor_id: 'qpa',
    number,
    label,
    ip: partyDocs('IP', docs),
    nip: partyDocs('NIP', docs),
    narrative: sentence,
    ip_narrative: sentence,
    nip_narrative: sentence,
    credited_to: null,
    chart_support: 'absent',
  };
}

function trainingFactor(
  request: DeterminationRequest,
  checklist: QaChecklist,
  number: number,
  label: string,
): FactorEvidence {
  const ip = trainingParty(request, checklist, 'IP');
  const nip = trainingParty(request, checklist, 'NIP');
  return {
    factor_id: 'training_experience',
    number,
    label,
    ip: ip.evidence,
    nip: nip.evidence,
    narrative: joinSentences(ip.sentence, nip.sentence),
    ip_narrative: ip.sentence,
    nip_narrative: nip.sentence,
    credited_to: null,
    chart_support: 'absent',
  };
}

function trainingParty(
  request: DeterminationRequest,
  checklist: QaChecklist,
  party: Party,
): { evidence: PartyFactorEvidence; sentence: string } {
  const cv = request.documents.find((doc) => doc.role === 'cv' && doc.party === party && doc.text && doc.text.trim() !== '');
  const name = partyName(party);
  if (!cv || !cv.text) {
    return {
      evidence: emptyParty(party, false, []),
      sentence: fillPhrase(checklist.phrases.training_absent, { party: name }),
    };
  }
  const board = cv.board_certification?.trim() ?? '';
  const specialty = cv.specialty?.trim() ?? '';
  const inFile = board.length > 0 && specialty.length > 0 && cv.text.includes(board) && cv.text.includes(specialty);
  return {
    evidence: {
      party,
      submitted: true,
      document_ids: [cv.doc_id],
      excerpt: board || specialty ? [board, specialty].filter(Boolean).join(' | ') : null,
      excerpt_in_file: inFile,
      board_certification: board || null,
      specialty: specialty || null,
    },
    sentence: fillPhrase(checklist.phrases.training_from_cv, {
      board_certification: board,
      specialty,
    }),
  };
}

/**
 * Acuity text for one party, from that party's own records and operative report.
 * When the other party filed and this party did not, the sentence names this party and says the filing is absent.
 * When nobody filed, both parties use the checklist no-acuity paragraph.
 * house_style for the per-party split. Acuity or complexity is public: 45 CFR 149.510(c)(5)(iii)(B)(3).
 */
export function acuityTextForParty(
  documents: readonly IdrDocumentInput[],
  checklist: QaChecklist,
  party: Party,
): string {
  const records = documents.filter((doc) => doc.role === 'records' && doc.party === party);
  const reports = documents.filter((doc) => doc.role === 'op_report' && doc.party === party);
  if (records.length > 0 && reports.length > 0) return checklist.phrases.acuity_both;
  if (records.length > 0) return checklist.phrases.acuity_records;
  if (reports.length > 0) return checklist.phrases.acuity_report;
  const anyoneFiled = documents.some((doc) => doc.role === 'records' || doc.role === 'op_report');
  if (!anyoneFiled) return checklist.slots.no_acuity_paragraph.trim();
  return fillPhrase(checklist.phrases.acuity_party_absent, { party: partyName(party) });
}

function acuityFactor(
  request: DeterminationRequest,
  checklist: QaChecklist,
  number: number,
  label: string,
): FactorEvidence {
  const ipSentence = acuityTextForParty(request.documents, checklist, 'IP');
  const nipSentence = acuityTextForParty(request.documents, checklist, 'NIP');
  const attachments = request.documents.filter((doc) => doc.role === 'records' || doc.role === 'op_report');
  return {
    factor_id: 'acuity_complexity',
    number,
    label,
    ip: partyDocs('IP', attachments),
    nip: partyDocs('NIP', attachments),
    narrative: ipSentence === nipSentence ? ipSentence : joinSentences(ipSentence, nipSentence),
    ip_narrative: ipSentence,
    nip_narrative: nipSentence,
    credited_to: null,
    chart_support: 'absent',
  };
}

function factorSeven(
  request: DeterminationRequest,
  checklist: QaChecklist,
  number: number,
  label: string,
): FactorEvidence {
  const ip = listedParty(request, 'additional_information', 'IP');
  const nip = listedParty(request, 'additional_information', 'NIP');
  const hasChart = request.documents.some((doc) => doc.role === 'chart');
  const wantsCredit = request.chart_supports_factor_7_nip === true;
  const chartSupport = wantsCredit && hasChart ? 'credited' : wantsCredit ? 'unverified' : 'absent';
  const creditedTo = chartSupport === 'credited' ? 'NIP' : null;
  const ipNarrative = fillPhrase(checklist.phrases.factor_7, {
    party: partyName('IP'),
    state: ip.submitted ? 'submitted' : 'absent',
    credit: 'none',
  });
  const nipNarrative = fillPhrase(checklist.phrases.factor_7, {
    party: partyName('NIP'),
    state: nip.submitted ? 'submitted' : 'absent',
    credit: creditedTo === 'NIP' ? 'NIP' : 'none',
  });
  return {
    factor_id: 'additional_information',
    number,
    label,
    ip,
    nip,
    narrative: joinSentences(ipNarrative, nipNarrative),
    ip_narrative: ipNarrative,
    nip_narrative: nipNarrative,
    credited_to: creditedTo,
    chart_support: chartSupport,
  };
}

function submissionFactor(
  request: DeterminationRequest,
  checklist: QaChecklist,
  factorId: FactorId,
  number: number,
  label: string,
): FactorEvidence {
  if (!SUBMISSION_FACTORS.includes(factorId)) {
    throw new Error(`No narrative rule for factor ${factorId}.`);
  }
  const ip = listedParty(request, factorId, 'IP');
  const nip = listedParty(request, factorId, 'NIP');
  const ipNarrative = partySentence(checklist, label, 'IP', ip.submitted);
  const nipNarrative = partySentence(checklist, label, 'NIP', nip.submitted);
  return {
    factor_id: factorId,
    number,
    label,
    ip,
    nip,
    narrative: joinSentences(ipNarrative, nipNarrative),
    ip_narrative: ipNarrative,
    nip_narrative: nipNarrative,
    credited_to: null,
    chart_support: 'absent',
  };
}

function partySentence(checklist: QaChecklist, label: string, party: Party, submitted: boolean): string {
  const key = submitted ? 'party_submitted' : 'party_absent';
  return fillPhrase(checklist.phrases[key], { factor: label, party: partyName(party) });
}

function listedParty(request: DeterminationRequest, factorId: FactorId, party: Party): PartyFactorEvidence {
  const material = request.factor_materials.find((item) => item.factor_id === factorId && item.party === party);
  const known = new Set(request.documents.map((doc) => doc.doc_id));
  const documentIds = (material?.document_ids ?? []).filter((id) => known.has(id));
  return emptyParty(party, documentIds.length > 0, documentIds);
}

function partyDocs(party: Party, docs: readonly IdrDocumentInput[]): PartyFactorEvidence {
  const mine = docs.filter((doc) => doc.party === party);
  return emptyParty(party, mine.length > 0, mine.map((doc) => doc.doc_id));
}

function emptyParty(party: Party, submitted: boolean, documentIds: readonly string[]): PartyFactorEvidence {
  return {
    party,
    submitted,
    document_ids: documentIds,
    excerpt: null,
    excerpt_in_file: null,
    board_certification: null,
    specialty: null,
  };
}

function joinSentences(left: string, right: string): string {
  return [left, right].filter((part) => part.trim().length > 0).join(' ');
}
