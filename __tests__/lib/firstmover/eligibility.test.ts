import { describe, it, expect, beforeEach, vi } from 'vitest';

// Force demo-mode path for these tests so we exercise the synchronous demo
// lookup without needing a Supabase connection.
vi.mock('@/lib/demo-mode', async () => {
  const actual = await vi.importActual<typeof import('@/lib/demo-mode')>('@/lib/demo-mode');
  return { ...actual, isDemoMode: () => true };
});

import { checkEligibility } from '@/lib/firstmover/eligibility';

describe('checkEligibility (demo mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns green for known demo members', async () => {
    const result = await checkEligibility({ client_id: 'demo-client', member_id: 'M1001' });
    expect(result.status).toBe('green');
    expect(result.message).toMatch(/active/i);
  });

  it('returns green for the M-prefixed convention', async () => {
    const result = await checkEligibility({ client_id: 'demo-client', member_id: 'M9001' });
    expect(result.status).toBe('green');
  });

  it('returns red for known inactive members', async () => {
    const result = await checkEligibility({ client_id: 'demo-client', member_id: 'M9999' });
    expect(result.status).toBe('red');
    expect(result.next_action).toMatch(/Manager must call TPA/i);
  });

  it('returns red for unknown members not matching the demo convention', async () => {
    const result = await checkEligibility({ client_id: 'demo-client', member_id: 'XXXXXX' });
    expect(result.status).toBe('red');
  });
});
