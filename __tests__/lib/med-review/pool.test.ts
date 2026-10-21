import { describe, expect, it } from 'vitest';
import {
  emptyCredentialing,
  evaluateAssignment,
  putCredentialItem,
} from '@/lib/credentialing';
import {
  assignPool,
  escalationLevel,
  pageCases,
  pickMedReviewer,
  planBulkIntake,
  type PoolReviewer,
} from '@/lib/med-review/pool';

const NOW = new Date('2026-10-21T12:00:00.000Z');
const DUE = '2026-10-22T12:00:00.000Z';
const LATER = '2027-01-01T00:00:00.000Z';
const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function reviewer(partial: Partial<PoolReviewer> & Pick<PoolReviewer, 'id'>): PoolReviewer {
  return {
    specialty_codes: ['cardiology'],
    licensed_states: ['OH'],
    credential_status: 'active',
    credential_ok: true,
    active_count: 0,
    avg_turnaround_hours: 4,
    max_cases_per_day: 25,
    ...partial,
  };
}

describe('med review pool', () => {
  it('requires specialty, state license, and an active credential', () => {
    const reviewers = [
      reviewer({ id: 'syn-card-oh', specialty_codes: ['cardiology'], licensed_states: ['OH'] }),
      reviewer({ id: 'syn-ortho', specialty_codes: ['orthopedics'], licensed_states: ['OH'] }),
      reviewer({ id: 'syn-tx', specialty_codes: ['cardiology'], licensed_states: ['TX'] }),
      reviewer({ id: 'syn-lapsed', specialty_codes: ['cardiology'], licensed_states: ['OH'], credential_status: 'lapsed' }),
    ];
    const picked = pickMedReviewer(reviewers, {
      id: 'case-1',
      client_id: CLIENT_A,
      specialty_code: 'cardiology',
      state_code: 'OH',
      due_at: DUE,
      received_at: NOW.toISOString(),
    }, NOW);
    expect(picked.reviewer_id).toBe('syn-card-oh');
    expect(picked.reason).toBe('assigned');
  });

  it('uses shared credentialing before a reviewer is eligible', () => {
    const at = NOW.toISOString();
    let state = emptyCredentialing();
    const put = putCredentialItem(state, {
      reviewer_id: 'syn-rev-ok',
      display_token: 'SYN-REV-OK',
      item_id: 'syn-lic-ok',
      kind: 'license',
      label: 'SYN-LICENSE',
      state_code: 'OH',
      specialty_code: null,
      status: 'active',
      expires_at: LATER,
      source: 'vanta_verified',
      vendor_ref: null,
    }, at);
    expect(put.ok).toBe(true);
    if (!put.ok) return;
    state = put.state;
    const allowed = evaluateAssignment(state, {
      line: 'MEDICAL_REVIEW',
      reviewer_id: 'syn-rev-ok',
      due_at: DUE,
      state_code: 'OH',
    }, at);
    const blocked = evaluateAssignment(state, {
      line: 'MEDICAL_REVIEW',
      reviewer_id: 'syn-missing',
      due_at: DUE,
      state_code: 'OH',
    }, at);
    expect(allowed.ok).toBe(true);
    expect(blocked.ok).toBe(false);

    const picked = pickMedReviewer([
      reviewer({ id: 'syn-rev-ok', credential_ok: allowed.ok, active_count: 3 }),
      reviewer({ id: 'syn-missing', credential_ok: blocked.ok, active_count: 0 }),
    ], {
      id: 'case-cred',
      client_id: CLIENT_A,
      specialty_code: 'cardiology',
      state_code: 'OH',
      due_at: DUE,
    }, NOW);
    expect(picked.reviewer_id).toBe('syn-rev-ok');
  });

  it('escalates at 50 percent, 80 percent, and after the due time', () => {
    const start = '2026-10-21T00:00:00.000Z';
    const due = '2026-10-21T10:00:00.000Z';
    expect(escalationLevel({ receivedAt: start, dueAt: due, now: new Date('2026-10-21T04:00:00.000Z') })).toBe('none');
    expect(escalationLevel({ receivedAt: start, dueAt: due, now: new Date('2026-10-21T06:00:00.000Z') })).toBe('l1');
    expect(escalationLevel({ receivedAt: start, dueAt: due, now: new Date('2026-10-21T09:00:00.000Z') })).toBe('l2');
    expect(escalationLevel({ receivedAt: start, dueAt: due, now: new Date('2026-10-21T11:00:00.000Z') })).toBe('l3');
  });

  it('dedupes bulk intake by client and external id', () => {
    const plan = planBulkIntake([
      { client_id: CLIENT_A, external_id: 'EXT-1', specialty_code: 'cardiology' },
      { client_id: CLIENT_A, external_id: 'ext-1', specialty_code: 'cardiology' },
      { client_id: CLIENT_B, external_id: 'EXT-1', specialty_code: 'cardiology' },
      { client_id: '', external_id: 'EXT-2', specialty_code: 'cardiology' },
    ], new Set([`${CLIENT_B}::ext-9`]));
    expect(plan.create).toHaveLength(2);
    expect(plan.duplicates).toHaveLength(1);
    expect(plan.invalid).toHaveLength(1);
  });

  it('does not let client A read client B, even when the query asks for B', () => {
    const rows = [
      { id: 'c1', client_id: CLIENT_A, specialty_code: 'cardiology', state_code: 'OH', external_id: 'EXT-A' },
      { id: 'c2', client_id: CLIENT_B, specialty_code: 'cardiology', state_code: 'OH', external_id: 'EXT-B' },
    ];
    const page = pageCases(rows, {
      viewerIsClient: true,
      viewerClientId: CLIENT_A,
      clientId: CLIENT_B,
      limit: 50,
    });
    expect(page.items.map((row) => row.id)).toEqual(['c1']);
    const unbound = pageCases(rows, { viewerIsClient: true, viewerClientId: null });
    expect(unbound.items).toEqual([]);
  });

  it('assigns 5000 synthetic cases across 10 clients and 50 reviewers', () => {
    const specialties = ['cardiology', 'orthopedics', 'oncology', 'neurology', 'radiology'];
    const clients = Array.from({ length: 10 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`);
    const reviewers: PoolReviewer[] = Array.from({ length: 50 }, (_, i) => reviewer({
      id: `syn-pool-${String(i).padStart(2, '0')}`,
      specialty_codes: [specialties[i % specialties.length]],
      licensed_states: ['OH', 'TX', 'CA', 'NY', 'FL'],
      credential_ok: i !== 0,
      credential_status: i === 0 ? 'lapsed' : 'active',
      avg_turnaround_hours: 2 + (i % 4),
      max_cases_per_day: 200,
      active_count: 0,
    }));
    const cases = Array.from({ length: 5000 }, (_, i) => ({
      id: `case-${String(i).padStart(5, '0')}`,
      client_id: clients[i % clients.length],
      specialty_code: specialties[i % specialties.length],
      state_code: 'OH',
      due_at: DUE,
      received_at: NOW.toISOString(),
      external_id: `EXT-${i}`,
    }));
    const started = Date.now();
    const assigned = assignPool({ cases, reviewers, now: NOW });
    expect(Date.now() - started).toBeLessThan(3000);
    expect(assigned).toHaveLength(5000);
    expect(assigned.every((row) => row.reviewer_id && row.reviewer_id !== 'syn-pool-00')).toBe(true);
    const byClient = new Map<string, number>();
    for (const row of assigned) byClient.set(row.client_id, (byClient.get(row.client_id) ?? 0) + 1);
    expect(byClient.size).toBe(10);
    const loads = new Map<string, number>();
    for (const row of assigned) {
      loads.set(row.reviewer_id!, (loads.get(row.reviewer_id!) ?? 0) + 1);
    }
    const counts = [...loads.values()];
    expect(Math.max(...counts)).toBeLessThanOrEqual(200);
    expect(Math.min(...counts)).toBeGreaterThan(0);
    expect(loads.size).toBeGreaterThan(20);
  });
});
