import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MED_REVIEW_PROVIDERS,
  UM_BRIEF_ENGINE_DENIALS,
  VANTA_MED_REVIEW_CONTRACT_FIELD,
} from '@/lib/entitlements/um-brief-engine';
import { MED_REVIEW_OFFER_PATH, PUBLIC_REDIRECTS } from '@/lib/routing/public-redirects';

const ROOT = process.cwd();

/** Current customer and operator surfaces. Historical logs (STATE.md, PROGRESS.md) are checked separately. */
const CURRENT_SURFACES = [
  'app/page.tsx',
  'app/layout.tsx',
  'app/site/page.tsx',
  'app/site/layout.tsx',
  'app/site/blog/layout.tsx',
  'app/site/blog/buying-outcomes-not-infrastructure-utilization-management/page.tsx',
  'app/signup-tpa/page.tsx',
  'app/welcome/page.tsx',
  'app/demo/page.tsx',
  'app/privacy/page.tsx',
  'app/login/page.tsx',
  'app/interactive-demo/page.tsx',
  'components/vhg/StoplossLive.tsx',
  'components/vhg/StoplossDashboard.tsx',
  'docs/customer-ready/00-README.md',
  'docs/customer-ready/01-product-boundary.md',
  'docs/customer-ready/02-onboarding.md',
  'docs/customer-ready/07-billing-and-tracking.md',
  'docs/customer-ready/10-implementation-commits.md',
  'docs/customer-ready/11-cole-onboarding-runbook.md',
  'docs/customer-ready/12-muse-connector.md',
  'docs/customer-ready/13-go-live-ops.md',
  'docs/customer-ready/14-billing-wire.md',
  'docs/customer-ready/16-vhg-score-demo.md',
  'docs/customer-ready/17-med-review-pivot.md',
  'docs/customer-ready/FULL-PLAN.md',
  'docs/customer-ready/um-pricing-rules.md',
  'docs/customer-ready/um-unit-economics-rate-card.md',
  'docs/customer-ready/pricing-strategy-memo-2026-09-23.md',
  'docs/onboarding/README.md',
  'docs/implementation-guide.md',
  'README.md',
  'fixtures/golive/README.md',
  'lib/onboarding/checklist.ts',
  'lib/onboarding/runbook.ts',
  'lib/entitlements/um-brief-engine.ts',
  'lib/client-config/types.ts',
  'lib/client-config/um-access.ts',
  'lib/billing/events.ts',
  'lib/contracts/templates/msa-with-baa-v1.ts',
  'lib/packaging/med-review-positioning.ts',
  'lib/routing/public-redirects.ts',
];

const RETIRED_PLATFORM_SENTENCE = [
  'VantaHG = IRO + IDR only',
  'VantaHG is IRO and IDR only',
  'VantaHG is IRO + IDR only',
  'VantaHG remains IRO',
  'not the med-review commercial door',
];

/** Preliminary IRO fee amounts from the Oct 19 plan. They must not be compiled in. */
const IRO_FEE_AMOUNTS = ['$1,000', '$1,300', '$1,250', '$1,750', '$150', '$700'];

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

describe('Med Review pivot redirects', () => {
  it('sends retired UM sales paths to the Med Review application', () => {
    const bySource = new Map(PUBLIC_REDIRECTS.map((row) => [row.source, row]));
    for (const source of ['/um', '/products/um', '/brief-engine', '/ai-um', '/utilization-management']) {
      expect(bySource.get(source)?.destination).toBe(MED_REVIEW_OFFER_PATH);
      expect(bySource.get(source)?.permanent).toBe(false);
    }
    expect(bySource.get('/sign-up')?.destination).toBe('/signup');
  });

  it('keeps redirect destinations as real pages', () => {
    expect(existsSync(resolve(ROOT, 'app/signup-tpa/page.tsx'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'app/signup/page.tsx'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'app/demo/page.tsx'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'app/stoploss/page.tsx'))).toBe(true);
  });
});

describe('exclusive Med Review copy', () => {
  it('does not repeat the retired platform sentence on current surfaces', () => {
    const hits: string[] = [];
    for (const path of CURRENT_SURFACES) {
      const text = read(path);
      for (const phrase of RETIRED_PLATFORM_SENTENCE) {
        if (text.includes(phrase)) hits.push(`${path}: ${phrase}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('frames older build logs as superseded', () => {
    for (const path of ['STATE.md', 'docs/PROGRESS.md']) {
      const text = read(path);
      expect(text.toLowerCase()).toContain('superseded');
    }
  });

  it('keeps entitlement keys and denial codes', () => {
    expect(VANTA_MED_REVIEW_CONTRACT_FIELD).toBe('vanta_med_review_contract');
    expect(MED_REVIEW_PROVIDERS).toEqual(['vanta', 'third_party', 'none']);
    expect(UM_BRIEF_ENGINE_DENIALS).toEqual([
      'missing_vanta_med_review_contract',
      'standalone_um_not_offered',
      'third_party_med_review',
    ]);
  });

  it('records the boundary, the parallel firewall, and PR #83', () => {
    const boundary = read('docs/customer-ready/01-product-boundary.md');
    const pivot = read('docs/customer-ready/17-med-review-pivot.md');
    expect(boundary).toMatch(/Vanta Med Review/);
    expect(boundary.toLowerCase()).toContain('superseded');
    expect(boundary).toMatch(/shared engine/i);
    expect(pivot).toMatch(/parallel IRO/i);
    expect(pivot).toMatch(/PR #83/);
    expect(pivot).toMatch(/do not merge/i);
    for (const letter of ['(a)', '(b)', '(c)', '(d)', '(e)', '(f)']) {
      expect(pivot).toContain(letter);
    }
  });

  it('does not hard-code the preliminary IRO fee schedule', () => {
    const pivot = read('docs/customer-ready/17-med-review-pivot.md');
    const boundary = read('docs/customer-ready/01-product-boundary.md');
    const positioning = read('lib/packaging/med-review-positioning.ts');
    for (const amount of IRO_FEE_AMOUNTS) {
      expect(pivot).not.toContain(amount);
      expect(boundary).not.toContain(amount);
      expect(positioning).not.toContain(amount);
    }
  });
});

describe('synthetic demo labels', () => {
  it('keeps /demo and /stoploss labelled synthetic', () => {
    const demo = read('app/demo/page.tsx');
    expect(demo.toLowerCase()).toContain('synthetic');
    expect(demo).toMatch(/not InterQual/i);
    expect(read('components/vhg/StoplossLive.tsx')).toMatch(/Demo, synthetic data/);
    expect(read('components/vhg/StoplossLive.tsx')).toMatch(/Not a live IDR feed/);
    expect(read('components/vhg/StoplossDashboard.tsx')).toMatch(/Demo, synthetic data/);
    expect(read('lib/vhg/types.ts')).toMatch(/Included at no charge with Vanta Med Review/);
  });
});
