import { describe, expect, it } from 'vitest';
import { ENTITLED_CLIENT_ID, UNENTITLED_CLIENT_ID, VHG_PORTFOLIO_COUNT } from '@/lib/vhg/catalog';
import { canViewStoplossDashboard, getStoplossDashboard } from '@/lib/vhg/dashboard';
import { getRedactedIdrPatterns } from '@/lib/vhg/patterns';
import { getSyntheticIdrRecords } from '@/lib/vhg/synthetic-idr';
import { VHG_BANNER } from '@/lib/vhg/types';

const CANARIES = [
  'Zebediah Quillstone',
  'MBR-CANARY-88421',
  'CLM-CANARY-7731',
  '1999999999',
  'Dr. Canary Personlink',
  '88421 Canary Lane',
  'Canaryville',
  '1954-03-22',
];

describe('stop-loss dashboard gate', () => {
  it('returns aggregated rows only for an active Vanta med review client', () => {
    const entitled = getStoplossDashboard(ENTITLED_CLIENT_ID);
    expect(entitled.ok).toBe(true);
    if (!entitled.ok) return;
    expect(entitled.banner).toBe(VHG_BANNER);
    expect(entitled.role).toBe('stoploss_partner');
    expect(entitled.totals.cases_reviewed).toBe(VHG_PORTFOLIO_COUNT);
    expect(entitled.totals.high_vhg_risk_count).toBeGreaterThan(0);
    expect(entitled.totals.high_vhg_risk_count).toBeLessThan(entitled.totals.cases_reviewed);
    expect(entitled.by_service_line.length).toBeGreaterThan(0);
    expect(entitled.by_state.length).toBeGreaterThan(0);
    expect(entitled.trend.length).toBeGreaterThan(1);
    expect(entitled.stop_sign.length).toBeGreaterThan(0);
    expect(entitled.stop_sign.every((row) => row.band === 'high')).toBe(true);
    const blob = JSON.stringify(entitled);
    for (const token of CANARIES) expect(blob).not.toContain(token);
    expect(blob).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
  });

  it('withholds rows when the client has no Vanta med review entitlement', () => {
    const denied = getStoplossDashboard(UNENTITLED_CLIENT_ID);
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.code).toBe('not_entitled');
    expect(denied.banner).toBe(VHG_BANNER);
    expect(denied.reason.length).toBeGreaterThan(10);
    expect(JSON.stringify(denied)).not.toContain('vhg-mr-');
  });

  it('does not invent a dashboard for an unknown client', () => {
    const unknown = getStoplossDashboard('someone-else');
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.code).toBe('unknown_client');
  });

  it('limits the role to stop-loss partners and internal admins', () => {
    expect(canViewStoplossDashboard('stoploss_partner')).toBe(true);
    expect(canViewStoplossDashboard('admin')).toBe(true);
    expect(canViewStoplossDashboard('client')).toBe(false);
    expect(canViewStoplossDashboard('reviewer')).toBe(false);
  });

  it('keeps raw identifier tokens out of the redacted pattern set', () => {
    const blob = JSON.stringify(getRedactedIdrPatterns());
    for (const row of getSyntheticIdrRecords()) {
      expect(blob).not.toContain(row.patient_name);
      expect(blob).not.toContain(row.member_id);
      expect(blob).not.toContain(row.claim_number);
      expect(blob).not.toContain(row.provider_npi);
      expect(blob).not.toContain(row.provider_person_name);
    }
  });
});
