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

function acuityFactor(
  request: DeterminationRequest,
  checklist: QaChecklist,
  number: number,
  label: string,
): FactorEvidence {
  const records = request.documents.filter((doc) => doc.role === 'records');
  const reports = request.documents.filter((doc) => doc.role === 'op_report');
  const sentence =
    records.length > 0 && reports.length > 0
      ? checklist.phrases.acuity_both
      : records.length > 0
        ? checklist.phrases.acuity_records
        : reports.length > 0
          ? checklist.phrases.acuity_report
          : checklist.slots.no_acuity_paragraph.trim();
  return {
    factor_id: 'acuity_complexity',
    number,
    label,
    ip: partyDocs('IP', [...records, ...reports]),
    nip: partyDocs('NIP', [...records, ...reports]),
    narrative: sentence,
    ip_narrative: sentence,
    nip_narrative: sentence,
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
