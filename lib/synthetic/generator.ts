/**
 * Synthetic case generator for engine load tests and specialization verification.
 * Supports medical_review, iro, ire, payer_idr, um.
 * Used for full-day load simulation (1400 MR + 354 IRO + IDR concurrent).
 *
 * All synthetic cases are obviously fake (SYNTH- prefix) and tagged for easy purge.
 * Everything labeled estimated_pending_calibration.
 */

import type { Case, CaseType, LaborStream } from '../types';
import { computeSubmissionFingerprint } from '../intake/efax/storage';

export interface SyntheticOptions {
  count: number;
  stream: LaborStream | 'mixed';
  scenario?: 'clean' | 'complex' | 'malformed' | 'conflicted';
  seed?: number;
}

export interface SyntheticCase extends Partial<Case> {
  synthetic: true;
  syntheticMetadata: {
    stream: string;
    scenario: string;
    generatedForLoadTest: true;
  };
}

let rng = 42;
function rand() {
  rng = (rng * 1103515245 + 12345) % 2147483648;
  return rng / 2147483648;
}

function fakePatient(idx: number) {
  return `SYNTH-FAKE-PATIENT-${idx.toString().padStart(4, '0')} [TEST-ONLY]`;
}

export function generateSyntheticCases(opts: SyntheticOptions): SyntheticCase[] {
  const { count, stream: streamOpt, scenario = 'clean' } = opts;
  if (opts.seed) rng = opts.seed;

  const cases: SyntheticCase[] = [];
  const streams: LaborStream[] = streamOpt === 'mixed'
    ? ['medical_review', 'iro', 'ire', 'payer_idr']
    : [streamOpt as LaborStream];

  for (let i = 0; i < count; i++) {
    const stream = streams[i % streams.length];
    const caseType: CaseType = stream === 'payer_idr' ? 'payer_idr'
      : stream === 'iro' ? 'iro'
      : stream === 'ire' ? 'ire'
      : stream === 'medical_review' ? 'medical_review'
      : 'um';

    const isMedical = stream === 'medical_review';
    const isIro = stream === 'iro' || stream === 'ire';
    const isIdr = stream === 'payer_idr';

    const syn: SyntheticCase = {
      id: `synth-${stream}-${i}`,
      case_number: `SYNTH-${stream.toUpperCase()}-${i.toString().padStart(5, '0')}`,
      case_type: caseType,
      status: scenario === 'complex' ? 'md_review' : 'brief_ready',
      priority: 'standard',
      service_category: 'other',
      review_type: isMedical ? 'second_level_review' : 'prior_auth',
      patient_name: fakePatient(i),
      patient_dob: '1980-01-01',
      patient_member_id: `SYNTH-MBR-${i}`,
      requesting_provider: `SYNTH-PROV-${i}`,
      procedure_codes: isIdr ? ['A0430'] : ['27447'],
      diagnosis_codes: ['M17.12'],
      procedure_description: `Synthetic ${stream} procedure`,
      clinical_question: `Synthetic question for load test ${stream}`,
      payer_name: 'SYNTH-PAYER',
      billed_amount_cents: isIdr ? 2500000 : undefined,
      is_out_of_network: isIdr ? true : undefined,
      appeal_of_case_id: isIro ? `orig-${i % 100}` : undefined,
      synthetic: true,
      syntheticMetadata: {
        stream,
        scenario,
        generatedForLoadTest: true,
      },
      created_at: new Date(Date.now() - i * 1000).toISOString(),
    };

    // For load test, attach minimal brief-like for downstream
    if (scenario !== 'malformed') {
      (syn as any).ai_brief = {
        clinical_question: syn.clinical_question,
        ai_recommendation: { recommendation: 'approve', confidence: 'high' },
      };
      (syn as any).fact_check = { overall_score: 85, overall_status: 'pass' };
    }

    cases.push(syn);
  }

  return cases;
}

export function isSyntheticCase(c: any): boolean {
  return !!c && c.synthetic === true && String(c.case_number).startsWith('SYNTH-');
}
