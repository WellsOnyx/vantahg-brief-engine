import { describe, it, expect } from 'vitest';
import {
  DEMO_PREVIEW_COOKIE,
  DEMO_PREVIEW_VALUE,
  DEMO_PREVIEW_MAX_AGE_SECONDS,
  demoPreviewCookieOptions,
  hasDemoPreviewCookie,
} from '@/lib/demo-preview-cookie';

describe('demo preview cookie', () => {
  it('is httpOnly and short-lived', () => {
    const opts = demoPreviewCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/');
    expect(opts.maxAge).toBe(DEMO_PREVIEW_MAX_AGE_SECONDS);
    expect(DEMO_PREVIEW_MAX_AGE_SECONDS).toBeLessThanOrEqual(60 * 60 * 4);
    expect(DEMO_PREVIEW_COOKIE).toBe('demo_access');
    expect(DEMO_PREVIEW_VALUE).toBe('granted');
  });

  it('detects the grant cookie on a request', () => {
    const req = new Request('https://example.com/demo', {
      headers: { cookie: 'demo_access=granted' },
    });
    expect(hasDemoPreviewCookie(req)).toBe(true);
    expect(hasDemoPreviewCookie(new Request('https://example.com/demo'))).toBe(false);
  });
});
