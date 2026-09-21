/**
 * Muse Connector Platform — CX / relationship types only.
 *
 * Phase 8 stub. Not live-keyed. Muse is not a clinical system of record
 * and these types have no case, member, or determination fields.
 */

export const MUSE_CONTACT_ROLES = [
  'tpa_ops',
  'cx_owner',
  'billing_contact',
  'implementation_lead',
] as const;

export type MuseContactRole = (typeof MUSE_CONTACT_ROLES)[number];

export const MUSE_SCHEDULING_INTENTS = [
  'kickoff',
  'follow_up',
  'hypercare_standup',
  'renewal',
] as const;

export type MuseSchedulingIntent = (typeof MUSE_SCHEDULING_INTENTS)[number];

/** Boolean flags only. No free text. */
export type MuseSchedulingFlags = Record<MuseSchedulingIntent, boolean>;

/**
 * The only record Muse is allowed to hold for VantaUM.
 * Opaque account id, a role label, and scheduling flags.
 */
export interface MuseRelationshipRecord {
  account_id: string;
  contact_role: MuseContactRole;
  scheduling_intent: MuseSchedulingFlags;
  /** Caller idempotency token. Not a member id and not a case id. */
  external_touchpoint_id?: string;
}

export interface MuseTouchpoint {
  touchpoint_id: string;
  account_id: string;
  contact_role: MuseContactRole;
  scheduling_intent: MuseSchedulingFlags;
  received_at: string;
}

export interface MuseCxEntitlement {
  /** MUSE_API_KEY is set. Still does not place a live HTTP call. */
  configured: boolean;
  /** MUSE_CX_ENABLED=true. */
  flag_enabled: boolean;
  /** Both. The CX panel lists touchpoints only when this is true. */
  entitled: boolean;
  live_call: false;
}

export type MuseConnectorSnapshot =
  | { configured: false; live_call: false; code: 'not_configured' }
  | { configured: true; live_call: false; code: 'stub_only' };
