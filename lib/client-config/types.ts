/**
 * Versioned client_config from docs/customer-ready/02-onboarding.md Phase B.
 *
 * Every change is a new immutable version. History is append-only.
 */

export const AUTO_VS_MD_POLICIES = ['always_md', 'auto_then_md', 'auto_when_clear'] as const;
export type AutoVsMdPolicy = (typeof AUTO_VS_MD_POLICIES)[number];

export const NOTIFY_CHANNELS = ['portal', 'webhook', 'fax', 'email'] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

export const INTAKE_MODES = ['gravity_rail', 'api', 'sftp', 'fax'] as const;
export type IntakeMode = (typeof INTAKE_MODES)[number];

export const GO_LIVE_MODES = ['synthetic', 'shadow', 'live'] as const;
export type GoLiveMode = (typeof GO_LIVE_MODES)[number];

/** Default first-25 SLA miss rate that triggers rollback to shadow. */
export const DEFAULT_SLA_MISS_ROLLBACK_THRESHOLD = 0.2;

export interface EscalationContact {
  name: string;
  role: string;
  phone?: string;
  email?: string;
}

export interface BusinessHours {
  start: string;
  end: string;
  days: string[];
}

export interface ClientConfigFields {
  client_id: string;
  legal_name: string;
  lob: string[];
  sla_hours_standard: number;
  sla_hours_urgent: number;
  auto_vs_md_policy: AutoVsMdPolicy;
  notify_channels: NotifyChannel[];
  determination_recipients: string[];
  cm_handoff_enabled: boolean;
  cm_webhook_url?: string | null;
  /** HMAC secret for cm.handoff. Falls back to determination_webhook_secret. */
  cm_webhook_secret?: string | null;
  /** Client webhook for determination.signed (F2). Optional. */
  determination_webhook_url?: string | null;
  determination_webhook_secret?: string | null;
  intake_modes: IntakeMode[];
  timezone: string;
  business_hours: BusinessHours;
  escalation_contacts: EscalationContact[];
  cx_owner: string;
  reviewer_queue: string;
  /** Phase E gate. `shadow` records outbound intent only — no member/provider final send. */
  go_live_mode: GoLiveMode;
  /** Explicit shadow flag. Also true when go_live_mode === 'shadow'. */
  shadow_mode: boolean;
  /** First-25 SLA miss rate (0–1) that pauses live intake. Config, not a HIPAA claim. */
  sla_miss_rollback_threshold: number;
  /**
   * Packaging lock (corrected 2026-09-21): required true for free UM Brief Engine access.
   * VantaUM sells Med Review. UM is included free only under UM’s Vanta
   * med-review contract — not standalone, not with another shop’s review.
   * VantaHG = IRO + IDR only.
   */
  vanta_med_review_contract: boolean;
  /** Who performs med review. `third_party` never gets free UM. */
  med_review_provider: 'vanta' | 'third_party' | 'none';
}

export interface ClientConfigVersion {
  id: string;
  client_id: string;
  version: number;
  config: ClientConfigFields;
  created_at: string;
  created_by: string;
  supersedes_version: number | null;
}

export const DEFAULT_CLIENT_CONFIG_FIELDS: Omit<ClientConfigFields, 'client_id' | 'legal_name' | 'cx_owner' | 'reviewer_queue'> = {
  lob: ['medical'],
  sla_hours_standard: 72,
  sla_hours_urgent: 24,
  auto_vs_md_policy: 'always_md',
  notify_channels: ['portal'],
  determination_recipients: [],
  cm_handoff_enabled: false,
  cm_webhook_url: null,
  cm_webhook_secret: null,
  determination_webhook_url: null,
  determination_webhook_secret: null,
  intake_modes: ['api'],
  timezone: 'America/New_York',
  business_hours: { start: '09:00', end: '17:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  escalation_contacts: [],
  go_live_mode: 'synthetic',
  shadow_mode: false,
  sla_miss_rollback_threshold: DEFAULT_SLA_MISS_ROLLBACK_THRESHOLD,
  vanta_med_review_contract: false,
  med_review_provider: 'none',
};

export class ClientConfigNotFoundError extends Error {
  readonly code = 'client_config_not_found' as const;
  constructor(readonly client_id: string) {
    super(`No client_config for ${client_id}`);
    this.name = 'ClientConfigNotFoundError';
  }
}

export class ClientConfigImmutableError extends Error {
  readonly code = 'client_config_immutable' as const;
  constructor(message = 'client_config versions are immutable; POST a new version') {
    super(message);
    this.name = 'ClientConfigImmutableError';
  }
}
