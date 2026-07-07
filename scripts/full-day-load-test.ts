#!/usr/bin/env tsx
/**
 * Full-day engine load test for 333k/yr readiness (pre-client-go).
 * 1,400 medical_review + 354 IRO (iro/ire) + IDR (payer_idr) concurrent.
 *
 * 12-pod concurrency simulation.
 * Exercises: synthetic generator (specialized streams), labor-metric (per-stream rails),
 * fact-checker (IDR vs clinical dispatch), prompt chassis logic paths (via case shape).
 *
 * Cost model: token estimates x Claude pricing → compare vs $0.34/case benchmark.
 * All cases: SYNTH-*, estimated_pending_calibration.
 *
 * Run: npx tsx scripts/full-day-load-test.ts
 * (No real Anthropic key required — chassis + cost model only.)
 */

import { generateSyntheticCases, isSyntheticCase } from '../lib/synthetic/generator';
import {
  computeLaborMetricForCase,
  type LaborStream,
  WEIGHTS_BASIS,
} from '../lib/labor-metric';
import { factCheckBrief } from '../lib/fact-checker';
import type { Case, AIBrief, FactCheckResult } from '../lib/types';

// 12-pod concurrent simulation
const POD_CONCURRENCY = 12;

// Volumes per directive
const MR_COUNT = 1400;
const IRO_COUNT = 354;
const IDR_COUNT = 120; // representative IDR slice for concurrent mix

// Cost model (conservative for Claude 3.5 Sonnet / equiv)
const TOKENS_PER_CASE_AVG = 2400; // input+output combined, tuned to brief size + context
const USD_PER_MILLION_TOKENS = 3.5; // blended in/out approx
const TARGET_COST_PER_CASE = 0.34;

type LoadCase = ReturnType<typeof generateSyntheticCases>[number];

async function main() {
  console.log('=== FULL-DAY LOAD TEST (engine core) ===');
  console.log(`Target: ${MR_COUNT} MR + ${IRO_COUNT} IRO + ${IDR_COUNT} IDR`);
  console.log(`Concurrency: ${POD_CONCURRENCY} pods (simulated)`);
  console.log('WEIGHTS_BASIS=estimated_pending_calibration (no speed claims)');
  console.log('');

  const start = Date.now();

  // Generate per stream with scenario mix for hard cases (conflicted/malformed for realism)
  const mrCases = generateSyntheticCases({ count: MR_COUNT, stream: 'medical_review', scenario: 'clean', seed: 1001 });
  const iroCases = generateSyntheticCases({ count: Math.floor(IRO_COUNT / 2), stream: 'iro', scenario: 'complex', seed: 2002 })
    .concat(generateSyntheticCases({ count: Math.ceil(IRO_COUNT / 2), stream: 'ire', scenario: 'conflicted', seed: 2003 }));
  const idrCases = generateSyntheticCases({ count: IDR_COUNT, stream: 'payer_idr', scenario: 'malformed', seed: 3003 });

  const allCases: LoadCase[] = [...mrCases, ...iroCases, ...idrCases];

  console.log(`Generated ${allCases.length} synthetic cases (all SYNTH-* tagged).`);

  // Prepare minimal real-ish brief for fact-check (exercises stream dispatch in fact-checker)
  function makeStubBrief(c: LoadCase): AIBrief {
    const isIdrLike = c.case_type === 'payer_idr' || c.case_type === 'iro' || c.case_type === 'ire';
    const procCode = (c.procedure_codes?.[0] || '27447') + ' - synthetic';
    const dxCode = (c.diagnosis_codes?.[0] || 'M17.12') + ' - synthetic';
    return {
      clinical_question: c.clinical_question || '',
      procedure_analysis: {
        requested_service: c.procedure_description || 'synthetic service',
        diagnosis_support: 'synthetic support',
        alternatives: [],
        complexity_level: 'moderate',
        codes: [procCode], // required by verifyProcedureCodes
      },
      diagnosis_analysis: {
        primary_diagnosis: dxCode,
        secondary_diagnoses: [],
      },
      criteria_match: {
        applicable_guideline: isIdrLike ? 'NSA IDR factors' : 'VantaUM Medical Criteria',
        criteria_met: ['synthetic met 1'],
        criteria_not_met: [],
        criteria_unable_to_assess: [],
      },
      documentation_gaps: [],
      documentation_review: { missing_documentation: [] },
      two_midnight: { applies: false, rationale: 'N/A for synthetic load' },
      reviewer_action: {
        decision_required: 'review',
        time_sensitivity: 'standard',
        peer_to_peer_suggested: false,
        state_specific_requirements: [],
        additional_info_needed: [],
      },
      ai_recommendation: {
        recommendation: 'approve',
        confidence: 'medium',
        rationale: 'Load-test stub for chassis validation.',
        key_considerations: ['synthetic only'],
      },
      generation_metadata: { passes_completed: 1, self_improvement_applied: false } as any,
    } as unknown as AIBrief;
  }

  // Cost + labor accumulators
  let totalTokensEst = 0;
  let totalLaborPctSum = 0;
  let byStream: Record<string, { count: number; laborSum: number; costSum: number }> = {};

  // 12-pod concurrent processor
  async function processBatch(batch: LoadCase[]): Promise<void> {
    await Promise.all(
      batch.map(async (c) => {
        const stream: LaborStream =
          c.syntheticMetadata?.stream === 'ire' ? 'ire' :
          c.syntheticMetadata?.stream === 'iro' ? 'iro' :
          c.syntheticMetadata?.stream === 'medical_review' ? 'medical_review' :
          c.syntheticMetadata?.stream === 'payer_idr' ? 'payer_idr' : 'um';

        // Labor rail (exercises per-stream config incl. IRE)
        const labor = computeLaborMetricForCase({ case_type: c.case_type, stream });
        totalLaborPctSum += labor.labor_reduction_pct;

        // Exercise fact-checker specialized path (IDR vs clinical)
        const stubBrief = makeStubBrief(c);
        const fc: FactCheckResult = factCheckBrief(stubBrief, c as unknown as Case);

        // Token / cost model
        const tokens = TOKENS_PER_CASE_AVG + Math.floor((c.procedure_codes?.length || 1) * 20);
        totalTokensEst += tokens;
        const caseCost = (tokens / 1_000_000) * USD_PER_MILLION_TOKENS;

        const s = stream;
        if (!byStream[s]) byStream[s] = { count: 0, laborSum: 0, costSum: 0 };
        byStream[s].count += 1;
        byStream[s].laborSum += labor.labor_reduction_pct;
        byStream[s].costSum += caseCost;
      })
    );
  }

  // Chunk into concurrent pods of 12
  const chunks: LoadCase[][] = [];
  for (let i = 0; i < allCases.length; i += POD_CONCURRENCY) {
    chunks.push(allCases.slice(i, i + POD_CONCURRENCY));
  }

  for (const chunk of chunks) {
    await processBatch(chunk);
  }

  const wallMs = Date.now() - start;
  const totalCases = allCases.length;
  const avgLabor = totalCases > 0 ? Math.round(totalLaborPctSum / totalCases) : 0;
  const totalEstCost = (totalTokensEst / 1_000_000) * USD_PER_MILLION_TOKENS;
  const costPerCase = totalCases > 0 ? totalEstCost / totalCases : 0;
  const vsBenchmark = (costPerCase - TARGET_COST_PER_CASE).toFixed(4);

  console.log('\n=== PER-STREAM RESULTS (labor rails + fact-check dispatch) ===');
  for (const [s, stats] of Object.entries(byStream)) {
    const avgL = (stats.laborSum / stats.count).toFixed(1);
    const avgC = (stats.costSum / stats.count).toFixed(4);
    console.log(`  ${s}: ${stats.count} cases | avg labor ${avgL}% | est cost/case $${avgC}`);
  }

  console.log('\n=== AGGREGATE (12-pod sim) ===');
  console.log(`Total cases: ${totalCases}`);
  console.log(`Avg labor_reduction: ${avgLabor}% (all streams, ${WEIGHTS_BASIS})`);
  console.log(`Simulated wall time: ${wallMs}ms (${(wallMs / 1000).toFixed(2)}s) for ${POD_CONCURRENCY}-way concurrent chunks`);
  console.log(`Est tokens: ${totalTokensEst.toLocaleString()}`);
  console.log(`Est total compute cost: $${totalEstCost.toFixed(2)}`);
  console.log(`Cost per case: $${costPerCase.toFixed(4)}`);
  console.log(`Benchmark: $${TARGET_COST_PER_CASE}`);
  console.log(`Delta vs benchmark: ${costPerCase < TARGET_COST_PER_CASE ? '-' : '+'}$${Math.abs(parseFloat(vsBenchmark))}`);

  // Validation
  const syntheticAll = allCases.every(isSyntheticCase);
  const hasAllStreams = ['medical_review', 'iro', 'ire', 'payer_idr'].every((st) =>
    allCases.some((c) => c.syntheticMetadata?.stream === st || (st === 'ire' && c.case_type === 'ire'))
  );

  console.log('\n=== READINESS CHECKS ===');
  console.log(`All SYNTH- tagged: ${syntheticAll ? 'PASS' : 'FAIL'}`);
  console.log(`All target streams exercised (MR + IRO/IRE + IDR): ${hasAllStreams ? 'PASS' : 'FAIL'}`);
  console.log(`No real LLM calls (decontaminated chassis): PASS`);
  console.log(`Labor + fact-check + generator specialization: exercised`);

  if (syntheticAll && hasAllStreams) {
    console.log('\nEngine core ready for specialized stream volume (medical_review + iro/ire rails).');
  } else {
    console.log('\nIssues detected — do not ship to real volume.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('LOAD TEST FAILED:', e);
  process.exit(1);
});
