/** Public synthetic IRO walkthrough. Exact path only — never a /portal prefix. */
export const IRO_PUBLIC_DEMO_PATH = '/portal';

/** Authorization Status Portal. Same auth as the old /portal page. */
export const AUTHORIZATION_STATUS_PORTAL_PATH = '/portal/status';

/**
 * `/portal` and `/portal/` are the public demo.
 * `/portal/status`, `/portal/tpa`, `/portal/provider`, and `/portal/stoploss`
 * must not match. A startsWith('/portal') check would publish those routes.
 */
export function isIroPublicDemoPath(pathname: string): boolean {
  return pathname === IRO_PUBLIC_DEMO_PATH || pathname === `${IRO_PUBLIC_DEMO_PATH}/`;
}
