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
 * Training text is a curriculum vitae excerpt. Acuity states only that
 * records or an operative report are attached. Factor 7 is not credited
 * to the initiating party. Notes are not copied into the narrative.
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

export function renderFactorBlock(factors: readonly FactorEvidence[]): string {
  return factors
    .map((factor) => factor.narrative.trim())
    .filter((narrative) => narrative.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function qpaFactor(request: DeterminationRequest, checklist: QaChecklist, number: number, label: string): FactorEvidence {
  const docs = request.documents.filter((doc) => doc.role === 'qpa_statement');
  return {
    factor_id: 'qpa',
    number,
    label,
    ip: partyDocs('IP', docs),
    nip: partyDocs('NIP', docs),
    narrative: checklist.phrases.qpa_factor,
    credited_to: null,
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
    narrative: `${ip.sentence} ${nip.sentence}`.trim(),
    credited_to: null,
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
      evidence: { party, submitted: false, document_ids: [], excerpt: null, excerpt_in_file: null },
      sentence: fillPhrase(checklist.phrases.training_absent, { party: name }),
    };
  }
  const excerpt = cv.excerpt?.trim() ? cv.excerpt.trim() : safeWholeFile(cv.text);
  if (!excerpt) {
    return {
      evidence: {
        party,
        submitted: true,
        document_ids: [cv.doc_id],
        excerpt: null,
        excerpt_in_file: false,
      },
      sentence: '',
    };
  }
  return {
    evidence: {
      party,
      submitted: true,
      document_ids: [cv.doc_id],
      excerpt,
      excerpt_in_file: cv.text.includes(excerpt),
    },
    sentence: fillPhrase(checklist.phrases.training_from_cv, { party: name, excerpt }),
  };
}

function safeWholeFile(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.includes('\n') || trimmed.includes('"') || trimmed.length > 240) return null;
  return trimmed;
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
          : checklist.phrases.acuity_absent;
  return {
    factor_id: 'acuity_complexity',
    number,
    label,
    ip: partyDocs('IP', [...records, ...reports]),
    nip: partyDocs('NIP', [...records, ...reports]),
    narrative: sentence,
    credited_to: null,
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
  return {
    factor_id: 'additional_information',
    number,
    label,
    ip,
    nip,
    narrative: fillPhrase(checklist.phrases.factor_7, {
      ip_state: ip.submitted ? 'submitted' : 'did not submit',
      nip_state: nip.submitted ? 'submitted' : 'did not submit',
    }),
    credited_to: null,
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
  return {
    factor_id: factorId,
    number,
    label,
    ip,
    nip,
    narrative: `${partySentence(checklist, label, 'IP', ip.submitted)} ${partySentence(checklist, label, 'NIP', nip.submitted)}`,
    credited_to: null,
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
  return {
    party,
    submitted: documentIds.length > 0,
    document_ids: documentIds,
    excerpt: null,
    excerpt_in_file: null,
  };
}

function partyDocs(party: Party, docs: readonly IdrDocumentInput[]): PartyFactorEvidence {
  const mine = docs.filter((doc) => doc.party === party);
  return {
    party,
    submitted: mine.length > 0,
    document_ids: mine.map((doc) => doc.doc_id),
    excerpt: null,
    excerpt_in_file: null,
  };
}
