import { describe, it, expect } from 'vitest';
import {
  buildMigrationPlan,
  checksumSql,
  formatPlan,
  resolveRepoRoot,
  rewriteCreatePolicyIfNotExists,
} from '@/lib/db/rds-migrations';

describe('RDS migration catalog', () => {
  const plan = buildMigrationPlan(resolveRepoRoot());

  it('starts with the bootstrap file', () => {
    expect(plan.apply[0]?.filename).toBe('000_rds_bootstrap.sql');
    expect(plan.apply[0]?.source).toBe('bootstrap');
  });

  it('applies the portable initial schema after bootstrap', () => {
    const initial = plan.apply.find((e) => e.filename === '000_initial_schema.sql');
    expect(initial?.source).toBe('supabase');
  });

  it('prefers RDS-flavored files when they exist', () => {
    const auth = plan.apply.find((e) => e.prefix === '001');
    expect(auth?.source).toBe('rds');
    expect(auth?.filename).toBe('001_auth_rls.sql');

    const practices = plan.apply.find((e) => e.prefix === '019');
    expect(practices?.source).toBe('rds');
    expect(practices?.path).toContain('infra-aws/rds-migrations');
  });

  it('skips the Supabase storage.buckets migration', () => {
    expect(plan.skip.some((e) => e.prefix === '013')).toBe(true);
    expect(plan.apply.some((e) => e.prefix === '013')).toBe(false);
  });

  it('includes later portable supabase files that have no RDS override', () => {
    const concierge = plan.apply.find((e) => e.prefix === '017');
    expect(concierge?.source).toBe('supabase');
    expect(concierge?.filename).toBe('017_case_concierge.sql');
  });

  it('covers every numbered supabase migration except the skipped bucket one', () => {
    const prefixes = new Set(plan.apply.map((e) => e.prefix));
    expect(prefixes.has('000')).toBe(true);
    expect(prefixes.has('008')).toBe(true);
    expect(prefixes.has('020')).toBe(true);
    expect(prefixes.has('026')).toBe(true);
    expect(prefixes.has('013')).toBe(false);
  });

  it('formatPlan mentions skipped storage migration', () => {
    const text = formatPlan(plan);
    expect(text).toMatch(/013_signup_contracts_bucket/);
    expect(text).toMatch(/000_rds_bootstrap/);
  });
});

describe('rewriteCreatePolicyIfNotExists', () => {
  it('rewrites invalid PG 15 syntax into DROP + CREATE', () => {
    const sql = `CREATE POLICY IF NOT EXISTS intake_log_service_all ON intake_log\n  FOR ALL USING (true);`;
    const out = rewriteCreatePolicyIfNotExists(sql);
    expect(out).toContain('DROP POLICY IF EXISTS intake_log_service_all ON intake_log');
    expect(out).toContain('CREATE POLICY intake_log_service_all ON intake_log');
    expect(out).not.toMatch(/CREATE POLICY IF NOT EXISTS/);
  });
});

describe('checksumSql', () => {
  it('is stable for the same contents', () => {
    expect(checksumSql('select 1')).toBe(checksumSql('select 1'));
    expect(checksumSql('select 1')).not.toBe(checksumSql('select 2'));
  });
});
