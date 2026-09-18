import { z } from 'zod';
import {
  AUTO_VS_MD_POLICIES,
  DEFAULT_CLIENT_CONFIG_FIELDS,
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
});

export function parseClientConfigFields(input: unknown): ClientConfigFields {
  return ClientConfigFieldsSchema.parse(input);
}

export function safeParseClientConfigFields(input: unknown) {
  return ClientConfigFieldsSchema.safeParse(input);
}
