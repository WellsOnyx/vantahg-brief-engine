/**
 * Synthetic-harness entry point for the labor metric.
 *
 * This is intentionally a thin re-export of the CANONICAL module
 * (lib/labor-metric.ts). The harness MUST compute identical percentages to the
 * per-case cockpit field, so both import the same functions from one source of
 * truth. Do not fork the formula here.
 *
 * See docs/LABOR_METRIC.md for the canonical definition.
 */
export {
  computeLaborMetric,
  computeLaborMetricForCase,
  stepsForStream,
  isConfidenceResolved,
  confidenceResolutionRate,
  WEIGHTS_BASIS,
  CONFIDENCE_THRESHOLD,
} from '@/lib/labor-metric';

export type {
  LaborStream,
  LaborStep,
  LaborMetricResult,
  ConfidenceInput,
  BriefDirection,
} from '@/lib/labor-metric';
