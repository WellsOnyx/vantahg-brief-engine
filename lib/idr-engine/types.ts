/**
 * IDR arbitration engine — Phase 0 types (docs/IDR_ENGINE_PHASE0.md; spec:
 * IDR Engine Build Spec v1 §2–§6).
 *
 * Doctrine, identical to UM: THE ENGINE PREPARES, A CREDENTIALED HUMAN
 * DECIDES. Every output is a DRAFT FOR ARBITER REVIEW. Nothing here
 * submits to, or automates against, any portal.
 */

/** One page of extracted text from a searchable PDF. */
export interface PageText {
  page: number; // 1-indexed
  text: string;
}

export type DocKind =
  | 'ip_offer' // ① Notice of Offer — Initiating Party (provider)
  | 'nip_offer' // ② Notice of Offer — Non-Initiating Party (payer/TPA)
  | 'ip_brief' // ③ IP arbitration brief / position statement
  | 'nip_brief' // ④ NIP arbitration brief (or an eligibility-objection letter — flagged)
  | 'exhibit' // EOBs, operating reports, CVs, negotiation emails
  | 'negotiation_proof' // ProofofOpenNegotiation* — pre-labeled factor-5 evidence
  | 'prior_determination' // a prior IDR determination submitted as an exhibit — parsed for outcome + date
  | 'eligibility_notes' // staff eligibility-notes export, when present in the folder
  | 'duplicate' // identical content to another file in the folder — excluded from analysis
  | 'cms_filler' // CMS-generated compliance/eligibility filler — ignored
  | 'unknown';

export interface CaseDocument {
  file: string; // basename within the case folder
  kind: DocKind;
  pages: PageText[];
  classificationReason: string;
}

/** Spec §6 edge cases + guardrail conditions. Any flag = human attention. */
export type FlagCode =
  | 'MISSING_DOC' // one of the four core documents absent
  | 'IDENTICAL_OFFERS' // IP offer == NIP offer on a line → outcome-neutral no-op (field intel)
  | 'ELIGIBILITY_OBJECTION' // NIP submitted an objection letter, not a merits brief → eligibility first
  | 'NIP_OFFER_EQUALS_QPA' // NIP offer exactly equals the QPA
  | 'MISSING_CITED_EXHIBIT' // a brief references an exhibit not in the folder
  | 'SPLIT_DECISION' // recommended PP differs across batch lines
  | 'TEMPLATE_DEVIATION' // known template shell with changed content/exhibits (§5)
  | 'COI_NAME_MATCH' // party name needs human COI judgment
  | 'HEURISTIC_MODE' // LLM disabled — deterministic heuristics only
  | 'LOW_CONFIDENCE' // extraction/analysis below gating threshold
  | 'EXTRACTION_GAP'; // a field the reviewer must fill from the documents

export interface EdgeFlag {
  code: FlagCode;
  severity: 'warn' | 'block'; // block = do not recommend on the affected line
  message: string;
  line?: number; // affected line number, when line-scoped
}

export interface OfferLine {
  line: number; // 1-indexed dispute line item
  cpt: string | null;
  description: string | null;
  dateOfService: string | null;
  ipOffer: number | null; // final payment offer per line — 'the whole kit and caboodle'
  nipOffer: number | null;
  /** FAIR Health 50th-percentile allowed amount (from the NIP brief's table) — neutral reference, shown next to the offers. */
  fhBenchmark: number | null;
}

export interface CaseRecord {
  caseId: string; // folder name / dispute reference
  disputeNumber: string | null;
  ipName: string | null;
  nipName: string | null;
  /** Supplied BY the NIP in their own interest — display, never anchor (§2). */
  qpa: number | null;
  batch: boolean;
  lines: OfferLine[];
  flags: EdgeFlag[];
  extractionMode: 'llm' | 'heuristic';
}

export type Party = 'IP' | 'NIP';
export type FactorNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * The house weight ladder (live-portal walkthrough): every discussed
 * factor gets exactly one of these. Observed real usage: good-faith
 * negotiation emails = modest · acuity operating report = some ·
 * provider CV/training = less.
 */
export type CmsWeight = 'modest weight' | 'some weight' | 'less weight';

export interface EvidenceQuote {
  quote: string;
  page: number;
  file: string;
}

/**
 * CHECK RULE (§3): a party gets a factor checked ONLY if their brief
 * actually raises it.
 */
export interface FactorFinding {
  factor: FactorNumber;
  raised: boolean;
  evidence: EvidenceQuote[];
  /** Suggested CMS weight when raised; the arbiter owns the final weighting. */
  suggestedWeight: CmsWeight | null;
  summary: string | null; // one-line: what the party actually argued
}

export interface FactorGrid {
  ip: FactorFinding[];
  nip: FactorFinding[];
}

export interface LineRecommendation {
  line: number;
  /**
   * 'FLAG' = engine declines to recommend — human ruling required (§6).
   * 'NO_OP' = identical offers, outcome-neutral — either selection yields
   * the same amount (field intel: handled as a no-op, not a blocker).
   */
  recommended: Party | 'FLAG' | 'NO_OP';
  confidencePct: number; // 0–100; heuristic mode is capped low
  /**
   * DLI chaining slot (§2): the sentence is pre-staged; the DLI NUMBER is
   * read off the portal screen and typed by the human — never auto-filled.
   */
  dliChainToLine: number | null;
  reasons: string[];
}

export interface FingerprintResult {
  file: string;
  party: Party;
  contentHash: string;
  shellHash: string;
  status: 'new_template' | 'known_template' | 'DEVIATION';
  templateId: string | null;
  detail: string;
}

export interface EligibilityNote {
  username: string | null;
  date: string | null;
  note: string;
}

/** A prior IDR determination found among the exhibits (field intel guard). */
export interface PriorDetermination {
  file: string;
  outcome: Party | null; // who prevailed, when the letter's close names them
  date: string | null;
}

export interface AnswerSheet {
  caseId: string;
  generatedAt: string;
  draftBanner: string; // DRAFT FOR ARBITER REVIEW — on every artifact
  record: CaseRecord;
  /** Staff eligibility notes found in the case folder (portal grid also exists — the sheet reminds the reviewer to read it either way). */
  eligibilityNotes: EligibilityNote[];
  /** Prior IDR determinations found among the exhibits, with outcomes + dates. */
  priorDeterminations: PriorDetermination[];
  documents: Array<Pick<CaseDocument, 'file' | 'kind' | 'classificationReason'>>;
  coi: {
    answer: 'No'; // per policy — but every name is surfaced for human COI judgment
    namesForReview: string[];
  };
  factorGrid: FactorGrid;
  rationale: string; // paste-ready, house template (§4)
  recommendations: LineRecommendation[];
  fingerprints: FingerprintResult[];
  flags: EdgeFlag[];
  logRow: string; // ready-to-paste IDR Cases Log row (TSV)
  logRowHeader: string;
}
