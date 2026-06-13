import { describe, it, expect } from 'vitest';
import {
  buildPings,
  buildCallPrep,
  intakeChannelLabel,
  CALLBACK_TARGET_MINUTES,
} from '@/lib/concierge/pings';
import type { Case } from '@/lib/types';

const NOW = new Date('2026-06-12T15:00:00.000Z');

function minutesAgo(m: number): string {
  return new Date(NOW.getTime() - m * 60_000).toISOString();
}

function makeCase(
  id: string,
  createdMinutesAgo: number,
  overrides: Partial<Case> & { intake_channel?: string | null; client_name?: string | null } = {},
) {
  return {
    id,
    case_number: `VUM-${id}`,
    created_at: minutesAgo(createdMinutesAgo),
    status: 'processing' as Case['status'],
    priority: 'standard' as Case['priority'],
    patient_name: 'Pat Doe',
    procedure_description: 'MRI lumbar spine',
    ai_brief: null,
    fact_check: null,
    intake_channel: 'efax',
    ...overrides,
  };
}

describe('buildPings', () => {
  it('pings every active case with no outbound first contact, most overdue first', () => {
    const pings = buildPings(
      [makeCase('fresh', 5), makeCase('old', 50), makeCase('mid', 20)],
      [],
      NOW,
    );
    expect(pings.map((p) => p.case_id)).toEqual(['old', 'mid', 'fresh']);
    expect(pings[0].overdue).toBe(true);
    expect(pings[0].minutes_to_target).toBe(-(50 - CALLBACK_TARGET_MINUTES));
    expect(pings[2].overdue).toBe(false);
    expect(pings[2].minutes_to_target).toBe(CALLBACK_TARGET_MINUTES - 5);
  });

  it('closes a ping once an outbound first-contact touchpoint exists', () => {
    const pings = buildPings(
      [makeCase('called', 40), makeCase('waiting', 40)],
      [
        { case_id: 'called', direction: 'outbound', is_first_contact: true },
        // inbound or non-first-contact touches do NOT close the ping
        { case_id: 'waiting', direction: 'inbound', is_first_contact: true },
        { case_id: 'waiting', direction: 'outbound', is_first_contact: false },
      ],
      NOW,
    );
    expect(pings.map((p) => p.case_id)).toEqual(['waiting']);
  });

  it('skips terminal-status cases', () => {
    const pings = buildPings(
      [
        makeCase('done', 10, { status: 'determination_made' }),
        makeCase('sent', 10, { status: 'delivered' }),
        makeCase('live', 10),
      ],
      [],
      NOW,
    );
    expect(pings.map((p) => p.case_id)).toEqual(['live']);
  });

  it('labels every entry point', () => {
    expect(intakeChannelLabel('efax')).toBe('Fax');
    expect(intakeChannelLabel('api')).toBe('Gravity Rails agent');
    expect(intakeChannelLabel('phone')).toBe('Live call');
    expect(intakeChannelLabel('email')).toBe('Call center / email');
    expect(intakeChannelLabel('portal')).toBe('Client portal');
    expect(intakeChannelLabel('batch_upload')).toBe('Manual entry');
    expect(intakeChannelLabel(null)).toBe('Manual entry');
    expect(intakeChannelLabel('something_new')).toBe('Manual entry');
  });
});

describe('buildCallPrep', () => {
  const factCheck = { overall_score: 89 } as Case['fact_check'];

  it('auth_prepared when the brief exists — the call is relationship', () => {
    const prep = buildCallPrep({ status: 'brief_ready', ai_brief: {} as Case['ai_brief'], fact_check: factCheck });
    expect(prep.level).toBe('auth_prepared');
    expect(prep.line).toContain('fact-check 89');
    expect(prep.line).toContain('relationship');
  });

  it('auth_prepared without a score still reads prepared', () => {
    const prep = buildCallPrep({ status: 'lpn_review', ai_brief: null, fact_check: null });
    expect(prep.level).toBe('auth_prepared');
    expect(prep.line).not.toContain('fact-check');
  });

  it('needs_info wins over everything — ask on this call', () => {
    const prep = buildCallPrep({ status: 'pend_missing_info', ai_brief: {} as Case['ai_brief'], fact_check: factCheck });
    expect(prep.level).toBe('needs_info');
  });

  it('in_motion while the engine works, just_arrived at intake', () => {
    expect(buildCallPrep({ status: 'processing', ai_brief: null, fact_check: null }).level).toBe('in_motion');
    expect(buildCallPrep({ status: 'intake', ai_brief: null, fact_check: null }).level).toBe('just_arrived');
  });
});
