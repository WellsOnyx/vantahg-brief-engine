import { describe, it, expect } from 'vitest';
import {
  VANTAQUAL_NAME,
  vantaQualInfo,
  coverageFor,
  activeBackend,
  getCriteriaSet,
  assessFromBrief,
} from '@/lib/vantaqual';

/**
 * VantaQual V1 — the branded product surface over our criteria engine
 * (Make-it-real Block 2). Pins the product identity, the coverage-honesty
 * report (no silent gaps), and that the engine functions re-export cleanly
 * so callers can import one place.
 */

describe('VantaQual product info', () => {
  it('reports its name, version, backend, and governed code count', () => {
    const info = vantaQualInfo();
    expect(info.name).toBe(VANTAQUAL_NAME);
    expect(info.version).toBeGreaterThanOrEqual(1);
    expect(info.governed_code_count).toBeGreaterThan(0);
    // The RAG isn't wired yet — be honest about the active backend.
    expect(info.backend).toBe('static_library');
    expect(activeBackend()).toBe('static_library');
  });
});

describe('VantaQual coverage honesty', () => {
  it('separates governed from ungoverned codes', () => {
    const rep = coverageFor(['72148', '99999']);
    expect(rep.governed).toContain('72148');
    expect(rep.ungoverned).toContain('99999');
    expect(rep.fully_covered).toBe(false);
  });

  it('marks full coverage only when every code is governed', () => {
    expect(coverageFor(['72148']).fully_covered).toBe(true);
    expect(coverageFor([]).fully_covered).toBe(false); // empty isn't "covered"
    expect(coverageFor(['00000']).fully_covered).toBe(false);
  });
});

describe('VantaQual re-exports the engine', () => {
  it('getCriteriaSet works through the product surface', () => {
    expect(getCriteriaSet('72148')?.set_id).toMatch(/^VC-72148/);
  });

  it('assessFromBrief is reachable via VantaQual', () => {
    expect(typeof assessFromBrief).toBe('function');
  });
});
