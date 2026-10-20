import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { isIroPortalEntryPath, isIroPublicDemoPath } from '@/lib/routing/iro-public-demo';

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('IRO portal entry', () => {
  it('removes the public synthetic demo from /portal', () => {
    const page = read('app/portal/page.tsx');
    expect(page).not.toMatch(/IroPublicDemo|buildIroPublicDemo|public-demo/);
    expect(page).toContain('Staff sign in');
    expect(page).toContain('/api/auth/sign-in');
    expect(page).toContain('/portal/iro');
    expect(read('app/portal/status/page.tsx')).toContain('IRO portal sign in');
    expect(read('app/portal/status/page.tsx')).not.toContain('Synthetic Ohio IRO demo');
    expect(read('lib/notifications.ts')).toContain('${baseUrl}/portal/status');
  });

  it('keeps exact /portal as the sign-in entry and leaves the other portal routes protected', () => {
    expect(isIroPublicDemoPath('/portal')).toBe(false);
    expect(isIroPortalEntryPath('/portal')).toBe(true);
    expect(isIroPortalEntryPath('/portal/')).toBe(true);
    expect(isIroPortalEntryPath('/portal/status')).toBe(false);
    expect(isIroPortalEntryPath('/portal/iro')).toBe(false);
    expect(isIroPortalEntryPath('/portal/tpa')).toBe(false);
    expect(isIroPortalEntryPath('/portal/provider')).toBe(false);
    expect(isIroPortalEntryPath('/portal/stoploss')).toBe(false);
    const middleware = read('middleware.ts');
    expect(middleware).toContain('isIroPortalEntryPath');
    expect(middleware).not.toContain('isIroPublicDemoPath');
    expect(read('components/AppShell.tsx')).toContain('isIroPortalEntryPath(pathname)');
  });
});
