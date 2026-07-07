/**
 * Synthetic case generator for engine load tests and specialization verification.
 * Supports medical_review, iro, ire, payer_idr, um.
 * Used for full-day load simulation (1400 MR + 354 IRO + IDR concurrent).
 *
 * All synthetic cases are obviously fake (SYNTH- prefix) and tagged for easy purge.
 * Everything labeled estimated_pending_calibration.
 */

import type { Case, CaseType } from '../types';
import type { LaborStream } from '../labor-metric';
import { computeSubmissionFingerprint } from '../intake/efax/storage';

export interface SyntheticOptions {
  count: number;
  stream: LaborStream | 'mixed';
  scenario?: 'clean' | 'complex' | 'malformed' | 'conflicted' | 'timing-edge' | 'incomplete-data' | 'conflicting-data';
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
    const isIre = stream === 'ire';

    // Adversarial / malformed data injection per stream and scenario for edge hardening
    let procCodes = isIdr ? ['A0430'] : ['27447'];
    let diagCodes = ['M17.12'];
    let clinQ = `Synthetic question for load test ${stream}`;
    let billed = isIdr ? 2500000 : undefined;
    let oon = isIdr ? true : undefined;
    let appeal = isIro ? `orig-${i % 100}` : undefined;
    let turnDeadline: string | null = (scenario === 'malformed' || (isIre && i % 3 === 0)) ? null : new Date(Date.now() + 72*3600*1000).toISOString();
    let slaH = isIro ? 72 : undefined;
    let reviewType = isMedical ? 'second_level_review' : isIro ? 'appeal' : 'prior_auth';
    let caseStatus = scenario === 'complex' || scenario === 'malformed' ? 'md_review' : 'brief_ready';

    if (scenario === 'malformed' || scenario === 'incomplete-data') {
      procCodes = i % 2 === 0 ? ['INVALID-CODE', '99999'] : [];
      clinQ = i % 3 === 0 ? '' : clinQ;
      if (isIdr) { billed = undefined; oon = null as any; }
      if (isIre) appeal = undefined; // missing linkage for IRE independence/timing edge
      if (isMedical) clinQ = 'Insufficient details provided for medical review.';
    }
    if (scenario === 'conflicting-data') {
      procCodes = ['27447', 'BAD'];
      diagCodes = ['Z99.9']; // unlikely match
      if (isIdr) { billed = 100; oon = false; } // conflicting for NSA
    }
    if (scenario === 'timing-edge') {
      turnDeadline = new Date(Date.now() - 1000*3600).toISOString(); // past/overdue
      slaH = 1; // very tight for IRE rail
    }
    if (scenario === 'incomplete-data' || scenario === 'malformed') {
      if (stream === 'medical_review') {
        reviewType = 'prior_auth'; // wrong for medical_review stream
      }
    }
    // Additional per-stream adversarial for edge hardening (set via lets)
    if (scenario === 'incomplete-data' || scenario === 'malformed') {
      if (stream === 'medical_review') {
        // wrong review_type for medical stream
        // will be overridden in object for some, but we can force bad clinQ
        clinQ = 'Insufficient details for second level medical review - adversarial';
      }
      if (stream === 'ire' || stream === 'iro') {
        appeal = undefined; // missing for independence/timing edge
        if (stream === 'ire') turnDeadline = null;
      }
      if (stream === 'payer_idr') {
        billed = 0;
        oon = undefined;
        procCodes = ['BAD'];
      }
    }

    const syn: SyntheticCase = {
      id: `synth-${stream}-${i}`,
      case_number: `SYNTH-${stream.toUpperCase()}-${i.toString().padStart(5, '0')}`,
      case_type: caseType,
      status: caseStatus,
      priority: (scenario === 'conflicted' || scenario === 'timing-edge') ? 'urgent' : 'standard',
      service_category: 'other',
      review_type: reviewType,
      patient_name: fakePatient(i),
      patient_dob: '1980-01-01',
      patient_member_id: `SYNTH-MBR-${i}`,
      requesting_provider: `SYNTH-PROV-${i}`,
      procedure_codes: procCodes,
      diagnosis_codes: diagCodes,
      procedure_description: `Synthetic ${stream} procedure`,
      clinical_question: clinQ,
      payer_name: 'SYNTH-PAYER',
      billed_amount_cents: billed,
      is_out_of_network: oon,
      appeal_of_case_id: appeal,
      // Timing edge for IRE-rail + mixed batches
      turnaround_deadline: turnDeadline,
      sla_hours: slaH,
      synthetic: true,
      syntheticMetadata: {
        stream,
        scenario,
        generatedForLoadTest: true,
      },
      created_at: new Date(Date.now() - i * 1000).toISOString(),
    };

    // For load test / pipeline, attach stub brief-like; vary for adversarial/malformed to stress fact-checker + prompts
    const isHard = scenario === 'malformed' || scenario === 'incomplete-data' || scenario === 'conflicting-data' || scenario === 'timing-edge';
    if (!isHard) {
      (syn as any).ai_brief = {
        clinical_question: syn.clinical_question,
        ai_recommendation: { recommendation: 'approve', confidence: 'high' },
      };
      (syn as any).fact_check = { overall_score: 85, overall_status: 'pass' };
    } else {
      (syn as any).ai_brief = {
        clinical_question: syn.clinical_question || 'incomplete',
        ai_recommendation: { recommendation: 'approve', confidence: 'low' },
      };
      (syn as any).fact_check = { overall_score: 40, overall_status: 'fail' }; // stresses flags
    }

    cases.push(syn);
  }

  return cases;
}

export function isSyntheticCase(c: any): boolean {
  return !!c && c.synthetic === true && String(c.case_number).startsWith('SYNTH-');
}
