import { describe, it, expect } from 'vitest';
import {
  SYSTEM_REGISTRY,
  systemsByRail,
  type TransportRail,
} from '@/lib/connectors/types';
import {
  assertAdvisoryOnly,
  calibrationLabel,
  CALIBRATION_MIN_SAMPLE,
} from '@/lib/learning/types';

/**
 * Locks the two load-bearing invariants of the integration architecture:
 * (1) ambient learning is advisory-only — the wall holds; (2) every
 * registered system maps to exactly one of the four transport rails, so
 * "top 20 systems" really does collapse to four pipelines.
 */

describe('ambient learning — the wall', () => {
  it('allows the brief generator to read calibration', () => {
    expect(() => assertAdvisoryOnly('brief_generator')).not.toThrow();
  });

  it('throws if any non-brief consumer tries to read calibration', () => {
    // @ts-expect-error — a determination path is not a permitted consumer
    expect(() => assertAdvisoryOnly('determination_writer')).toThrow(/wall holds/i);
  });

  it('labels a context estimated until it crosses the min sample, then calibrated', () => {
    expect(calibrationLabel(CALIBRATION_MIN_SAMPLE - 1)).toBe('estimated_pending_calibration');
    expect(calibrationLabel(CALIBRATION_MIN_SAMPLE)).toBe('calibrated');
  });
});

describe('connector rails — top systems collapse to four rails', () => {
  const RAILS: TransportRail[] = ['rest_json', 'fhir_pas', 'x12_278', 'sftp_batch'];

  it('every registered system uses exactly one of the four rails', () => {
    for (const s of SYSTEM_REGISTRY) {
      expect(RAILS).toContain(s.rail);
    }
  });

  it('covers the named EHRs and adjudication platforms', () => {
    const keys = SYSTEM_REGISTRY.map((s) => s.key);
    for (const k of ['epic', 'oracle_cerner', 'athenahealth', 'trizetto_facets', 'change_healthcare']) {
      expect(keys).toContain(k);
    }
  });

  it('has at least one live rail (the native Partner API hub)', () => {
    expect(SYSTEM_REGISTRY.some((s) => s.verify_status === 'live')).toBe(true);
  });

  it('partitions cleanly — systemsByRail sums to the whole registry', () => {
    const total = RAILS.reduce((n, r) => n + systemsByRail(r).length, 0);
    expect(total).toBe(SYSTEM_REGISTRY.length);
  });
});
