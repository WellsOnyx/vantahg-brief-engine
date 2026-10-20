/** Authenticated IRO portal login. Exact path only — never a /portal prefix. */
export const IRO_PORTAL_ENTRY_PATH = '/portal';

/** Authorization Status Portal. Same auth as before the IRO demo. */
export const AUTHORIZATION_STATUS_PORTAL_PATH = '/portal/status';

/**
 * `/portal` and `/portal/` render the IRO sign-in entry.
 * `/portal/status`, `/portal/iro`, `/portal/tpa`, and `/portal/provider`
 * must not match. A startsWith('/portal') check would publish those routes.
 */
export function isIroPortalEntryPath(pathname: string): boolean {
  return pathname === IRO_PORTAL_ENTRY_PATH || pathname === `${IRO_PORTAL_ENTRY_PATH}/`;
}

/** The public synthetic demo is gone. Kept so older imports cannot republish /portal. */
export function isIroPublicDemoPath(_pathname: string): boolean {
  return false;
}
