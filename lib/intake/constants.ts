/** Well-known synthetic staging tenant. Tokenized refs only — no live PHI. */
export const SYNTHETIC_CLIENT_ID = '11111111-1111-1111-1111-111111111111';

/** Sibling tenant used only for RBAC cross-tenant deny fixtures. */
export const OTHER_SYNTHETIC_CLIENT_ID = '22222222-2222-2222-2222-222222222222';

/** Phase 2 acceptance: webhook receipt → case-spine queue. */
export const INTAKE_TO_SPINE_SLA_MS = 120_000;
