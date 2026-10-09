import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { evaluateUmBriefEngineAccess } from '@/lib/entitlements/um-brief-engine';
import { evaluateIroPanelAccess, isIroPanelFlagEnabled } from '@/lib/entitlements/iro-panel';
import {
  ASSIGNMENT_FIELD_NAMES,
  ASSIGNMENT_SELECT_COLUMNS,
  CLINICAL_HIDDEN_FIELD_NAMES,
  RESTRICTED_FIELD_NAMES,
  assertAssignmentSelect,
  assignmentQuerySpec,
  collectKeys,
  toAssignmentCard,
  toClinicalPacket,
} from '@/lib/iro/access';
import { SYNTH_SENTINELS, syntheticIroSnapshot } from '@/lib/iro/fixtures';
import { STEP_RESPONSIBILITY } from '@/lib/iro/status';
import { screenWithStub } from '@/lib/iro/screening';

describe('IRO entitlement is separate from UM Med Review', () => {
  it('does not treat a med-review contract as an IRO contract', () => {
    const um = evaluateUmBriefEngineAccess({
      vanta_med_review_contract: true,
      med_review_provider: 'vanta',
    });
    const iro = evaluateIroPanelAccess({
      iro_line_contract: false,
      vanta_med_review_contract: true,
    } as { iro_line_contract: boolean });
    expect(um.allowed).toBe(true);
    expect(iro.allowed).toBe(false);
    if (!iro.allowed) expect(iro.code).toBe('missing_iro_line_contract');
  });

  it('does not treat an IRO contract as free UM', () => {
    const um = evaluateUmBriefEngineAccess({
      vanta_med_review_contract: false,
      med_review_provider: 'vanta',
    });
    const iro = evaluateIroPanelAccess({ iro_line_contract: true });
    expect(iro.allowed).toBe(true);
    expect(um.allowed).toBe(false);
  });

  it('keeps the feature flag off unless ENABLE_IRO_PANEL=true', () => {
    expect(isIroPanelFlagEnabled({ ENABLE_IRO_PANEL: 'false' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isIroPanelFlagEnabled({ ENABLE_IRO_PANEL: 'true' } as NodeJS.ProcessEnv)).toBe(true);
  });
});

describe('assignment projection', () => {
  const ada = syntheticIroSnapshot().physicians[0];

  it('copies only the operational card', () => {
    const card = toAssignmentCard(ada, false);
    const keys = collectKeys(card);
    for (const name of RESTRICTED_FIELD_NAMES) {
      expect(keys.has(name), name).toBe(false);
    }
    expect([...keys].sort()).toEqual([...ASSIGNMENT_FIELD_NAMES].sort());
    const serialized = JSON.stringify(card);
    for (const sentinel of Object.values(SYNTH_SENTINELS)) {
      expect(serialized).not.toContain(sentinel);
    }
    expect(card.display_name).toBe('Ada Okonkwo, MD');
    expect(card.specialties).toEqual(['orthopedic_surgery']);
    expect(card.jurisdictions).toEqual(['TX', 'OK']);
    expect(card.case_checks_complete).toBe(false);
  });

  it('refuses a restricted column on the assignment select list', () => {
    expect(() => assertAssignmentSelect(['id', 'license_number'])).toThrow(/restricted_column:license_number/);
    const spec = assignmentQuerySpec();
    expect(spec.view).toBe('iro_panel_assignment_v');
    for (const name of RESTRICTED_FIELD_NAMES) {
      expect(spec.columns).not.toContain(name);
    }
    expect(spec.columns).toEqual([...ASSIGNMENT_SELECT_COLUMNS]);
  });

  it('hides contracts from the clinical packet', () => {
    const nia = syntheticIroSnapshot().physicians[2];
    const packet = toClinicalPacket(nia, STEP_RESPONSIBILITY[nia.status]);
    const serialized = JSON.stringify(packet);
    for (const name of CLINICAL_HIDDEN_FIELD_NAMES) {
      expect(collectKeys(packet).has(name)).toBe(false);
    }
    expect(serialized).not.toContain(SYNTH_SENTINELS.nia_contract);
    expect(serialized).not.toContain('SYN-COMP-NIA');
    expect(serialized).toContain('TX-SYN-77003');
    expect(packet.evidence.every((row) => row.kind !== 'contract')).toBe(true);
  });
});

describe('assignment view SQL', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/033_iro_panel_credentialing.sql'),
    'utf8',
  );

  function viewBody(name: string): string {
    const match = sql.match(new RegExp(`CREATE OR REPLACE VIEW ${name} AS([\\s\\S]*?);`));
    expect(match, name).toBeTruthy();
    return match![1];
  }

  it('keeps HR columns out of the assignment and case-check views', () => {
    const assignment = viewBody('iro_panel_assignment_v');
    const checks = viewBody('iro_case_check_status_v');
    for (const token of ['legal_name', 'contract_ref', 'notes_hr', 'license_number', 'finding_summary', 'conflict_note', 'evidence']) {
      expect(assignment).not.toContain(token);
      expect(checks).not.toContain(token);
    }
    expect(assignment).toContain('display_name');
    expect(checks).toContain('case_checks_complete');
    const rds = readFileSync(
      join(process.cwd(), 'infra-aws/rds-migrations/033_iro_panel_credentialing.sql'),
      'utf8',
    );
    expect(rds).toBe(sql);
  });
});

describe('screening stub', () => {
  it('records a result without a live call', async () => {
    const clear = await screenWithStub({ source: 'oig_leie', name: 'Ada Okonkwo, MD', asOf: '2026-10-09' });
    expect(clear.live_call).toBe(false);
    expect(clear.result).toBe('clear');
    const hit = await screenWithStub({ source: 'sam', name: 'SYN-HIT Example', asOf: '2026-10-09' });
    expect(hit.result).toBe('hit');
    expect(hit.live_call).toBe(false);
    const source = readFileSync(join(process.cwd(), 'lib/iro/screening.ts'), 'utf8');
    expect(source).not.toMatch(/fetch\s*\(/);
    expect(source).not.toMatch(/https?:\/\//);
  });
});
