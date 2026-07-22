import type { CmsWeight, FactorNumber } from './types';

/**
 * The 7-factor decision frame for non-air disputes (spec §3), with each
 * side's standard argument shape — used both to prompt the LLM analysis
 * and as keyword heuristics for the no-LLM fallback.
 */

export interface FactorDefinition {
  factor: FactorNumber;
  title: string;
  ipStandardArgument: string;
  nipStandardArgument: string;
  /** Keyword stems for the heuristic (no-LLM) pass. Lowercase. */
  keywords: string[];
  /**
   * Phrases removed from a sentence BEFORE keyword matching for this
   * factor — kills cross-factor collisions (e.g. 'median contracted rate'
   * is factor-7 QPA-methodology boilerplate, not factor-5 negotiation
   * history).
   */
  negations?: string[];
  /** Paste-safe phrasing for the rationale; defaults to lowercase title. */
  proseTitle?: string;
}

export const FACTORS: FactorDefinition[] = [
  {
    factor: 1,
    title: 'Training, experience, and quality/outcomes of the provider',
    ipStandardArgument: 'Elite training, fellowships, publications — worth more',
    nipStandardArgument: 'A regular doctor like any other',
    keywords: ['training', 'board certif', 'fellowship', 'residency', 'publication', 'experience of', 'quality of care', 'outcomes', 'curriculum vitae', ' cv '],
  },
  {
    factor: 2,
    title: 'Market share of the parties in the geographic region',
    ipStandardArgument: 'Dominant payer bullies the market price down',
    nipStandardArgument: 'Dominant hospital bullies the price up — same weapon, both directions',
    keywords: ['market share', 'market power', 'geographic region', 'market concentration', 'dominant', 'monopol'],
  },
  {
    factor: 3,
    title: 'Acuity of the patient / complexity of the case', // ★ importance #2
    ipStandardArgument: 'This was severe — see the operating report',
    nipStandardArgument: "~8/10 times: 'the QPA already accounts for acuity' (not 'it wasn't serious')",
    keywords: ['acuity', 'severity', 'complexity', 'critical', 'emergent', 'operating report', 'operative report', 'comorbid'],
  },
  {
    factor: 4,
    title: 'Teaching status, case mix, and scope of services of the facility',
    ipStandardArgument: 'Major teaching hospital, full capability',
    nipStandardArgument: 'A regular hospital like everybody else',
    keywords: ['teaching status', 'teaching hospital', 'case mix', 'scope of services', 'academic medical', 'trauma center', 'level i', 'level ii'],
  },
  {
    factor: 5,
    title: 'Good-faith network-negotiation efforts and contracted rates for the prior 4 plan years', // ★ importance #1 — WINS CASES
    ipStandardArgument: 'EOBs show the payer paid $X under a prior contract, now offers less for the identical service; negotiation emails show payer reluctance',
    nipStandardArgument: 'Mirror-image accusations of bad faith',
    keywords: ['good faith', 'good-faith', 'negotiat', 'contracted rate', 'prior contract', 'previously paid', 'network agreement', 'plan year', 'eob', 'explanation of benefits', 'historically paid'],
    negations: ['median contracted rate'],
  },
  {
    factor: 6,
    title: 'Additional information submitted by a party',
    ipStandardArgument: 'Nearly always checked — someone always submits extra',
    nipStandardArgument: '(same)',
    keywords: ['additional information', 'additional documentation', 'exhibit', 'attached', 'supporting document', 'supplemental'],
  },
  {
    factor: 7,
    title: 'QPA reflects appropriate payment (entity-specific, not legislated)',
    proseTitle: 'whether the qualifying payment amount reflects an appropriate payment amount',
    ipStandardArgument: 'IP never argues this — they filed because they reject the QPA',
    nipStandardArgument: 'NIP almost always argues it',
    keywords: ['qpa reflects', 'qualifying payment amount is appropriate', 'qpa is appropriate', 'qpa already', 'qpa accounts', 'median contracted rate'],
  },
];

/**
 * Rationale ordering (§4): factor-by-factor BY IMPORTANCE —
 * good-faith/contracted-rates (5) first, acuity (3) second, then the rest.
 */
export const IMPORTANCE_ORDER: FactorNumber[] = [5, 3, 1, 2, 4, 6, 7];

/**
 * The house weight ladder (§4, live-portal walkthrough): exactly one rung
 * per discussed factor. Observed usage anchors the defaults below.
 */
export const CMS_WEIGHTS: CmsWeight[] = ['modest weight', 'some weight', 'less weight'];

/**
 * Default weight per factor from observed house usage: negotiation
 * evidence (5) = modest · acuity operating report (3) = some · provider
 * CV/training (1) = less. Everything else starts modest; the calibration
 * corpus refines these from real submitted rationales.
 */
export const OBSERVED_WEIGHT_DEFAULTS: Record<FactorNumber, CmsWeight> = {
  1: 'less weight',
  2: 'modest weight',
  3: 'some weight',
  4: 'modest weight',
  5: 'modest weight',
  6: 'modest weight',
  7: 'modest weight',
};

export function factorDef(n: FactorNumber): FactorDefinition {
  const def = FACTORS.find((f) => f.factor === n);
  if (!def) throw new Error(`unknown factor ${n}`);
  return def;
}
