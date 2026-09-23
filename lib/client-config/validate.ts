import { z } from 'zod';
import { MED_REVIEW_PROVIDERS } from '@/lib/entitlements/um-brief-engine';
import {
  AUTO_VS_MD_POLICIES,
  DEFAULT_CLIENT_CONFIG_FIELDS,
  GO_LIVE_MODES,
  INTAKE_MODES,
  NOTIFY_CHANNELS,
  type ClientConfigFields,
} from './types';

const EscalationContactSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  phone: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

const BusinessHoursSchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
  days: z.array(z.string().min(1)).min(1),
});

export const ClientConfigFieldsSchema = z.object({
  client_id: z.string().min(1),
  legal_name: z.string().min(1),
  lob: z.array(z.string().min(1)).default([...DEFAULT_CLIENT_CONFIG_FIELDS.lob]),
  sla_hours_standard: z.number().positive().default(DEFAULT_CLIENT_CONFIG_FIELDS.sla_hours_standard),
  sla_hours_urgent: z.number().positive().default(DEFAULT_CLIENT_CONFIG_FIELDS.sla_hours_urgent),
  auto_vs_md_policy: z.enum(AUTO_VS_MD_POLICIES).default(DEFAULT_CLIENT_CONFIG_FIELDS.auto_vs_md_policy),
  notify_channels: z.array(z.enum(NOTIFY_CHANNELS)).min(1).default([...DEFAULT_CLIENT_CONFIG_FIELDS.notify_channels]),
  determination_recipients: z.array(z.string().min(1)).default([]),
  cm_handoff_enabled: z.boolean().default(false),
  cm_webhook_url: z.string().url().nullable().optional(),
  cm_webhook_secret: z.string().min(8).nullable().optional(),
  determination_webhook_url: z.string().url().nullable().optional(),
  determination_webhook_secret: z.string().min(8).nullable().optional(),
  intake_modes: z.array(z.enum(INTAKE_MODES)).min(1),
  timezone: z.string().min(1).default(DEFAULT_CLIENT_CONFIG_FIELDS.timezone),
  business_hours: BusinessHoursSchema.default(DEFAULT_CLIENT_CONFIG_FIELDS.business_hours),
  escalation_contacts: z.array(EscalationContactSchema).default([]),
  cx_owner: z.string().min(1),
  reviewer_queue: z.string().min(1),
  go_live_mode: z.enum(GO_LIVE_MODES).default(DEFAULT_CLIENT_CONFIG_FIELDS.go_live_mode),
  shadow_mode: z.boolean().default(DEFAULT_CLIENT_CONFIG_FIELDS.shadow_mode),
  sla_miss_rollback_threshold: z
    .number()
    .min(0)
    .max(1)
    .default(DEFAULT_CLIENT_CONFIG_FIELDS.sla_miss_rollback_threshold),
  vanta_med_review_contract: z
    .boolean()
    .default(DEFAULT_CLIENT_CONFIG_FIELDS.vanta_med_review_contract),
  med_review_provider: z
    .enum(MED_REVIEW_PROVIDERS)
    .default(DEFAULT_CLIENT_CONFIG_FIELDS.med_review_provider),
  /** Staging or contract census for one month. Not the 500k planning denominator. */
  lives_in_month: z.number().nonnegative().nullable().optional(),
  /** Staging or contract employee count for one month. Not the 333k planning denominator. */
  employees_in_month: z.number().nonnegative().nullable().optional(),
  /** Explicit fat-TPA waiver. Absent or false keeps the $1.50 platform. */
  platform_fee_waived: z.boolean().optional(),
});

export function parseClientConfigFields(input: unknown): ClientConfigFields {
  return ClientConfigFieldsSchema.parse(input);
}

export function safeParseClientConfigFields(input: unknown) {
  return ClientConfigFieldsSchema.safeParse(input);
}
