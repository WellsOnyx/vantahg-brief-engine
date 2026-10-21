import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/audit', () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/security', () => ({
  getRequestContext: vi.fn().mockReturnValue({ ip: 'test', userAgent: 'test' }),
}));

import { assertCaseAccess } from '@/lib/case-access';
import type { AuthUser } from '@/lib/auth-guard';

const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function user(partial: Partial<AuthUser>): AuthUser {
  return {
    id: 'user-1',
    email: 'a@client.test',
    role: 'client',
    client_id: CLIENT_A,
    ...partial,
  };
}

describe('tenant isolation', () => {
  it('lets client A read their case and refuses client B', async () => {
    const own = await assertCaseAccess(
      { id: 'case-a', client_id: CLIENT_A },
      user({}),
      new Request('http://localhost/api/cases/case-a'),
    );
    expect(own).toBeNull();

    const other = await assertCaseAccess(
      { id: 'case-b', client_id: CLIENT_B, client: { contact_email: 'b@client.test' } },
      user({}),
      new Request('http://localhost/api/cases/case-b'),
    );
    expect(other?.status).toBe(403);
  });

  it('does not let a client email match open another tenant when client_id disagrees', async () => {
    const denied = await assertCaseAccess(
      { id: 'case-b', client_id: CLIENT_B, client: { contact_email: 'a@client.test' } },
      user({ client_id: CLIENT_A, email: 'a@client.test' }),
      new Request('http://localhost/api/cases/case-b'),
    );
    expect(denied?.status).toBe(403);
  });
});
