/**
 * Preview cookie for /demo and /demo-tour only.
 *
 * Never grants an admin session, never unlocks /admin/*, Partner/IDR
 * APIs, or case mutations. httpOnly so client JS cannot read it;
 * short-lived so a leaked link does not mint a month-long grant.
 */
export const DEMO_PREVIEW_COOKIE = 'demo_access';
export const DEMO_PREVIEW_VALUE = 'granted';
export const DEMO_PREVIEW_MAX_AGE_SECONDS = 60 * 60 * 4; // 4 hours

export function demoPreviewCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DEMO_PREVIEW_MAX_AGE_SECONDS,
  };
}

export function hasDemoPreviewCookie(request: Request): boolean {
  const cookie = request.headers.get('cookie') || '';
  return cookie.includes(`${DEMO_PREVIEW_COOKIE}=${DEMO_PREVIEW_VALUE}`);
}
