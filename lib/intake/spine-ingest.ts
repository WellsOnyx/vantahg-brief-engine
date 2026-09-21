/**
 * Map inbound intake payloads onto the Phase 1 case spine.
 *
 * Synthetic / tokenized refs only. Never persist raw member names or DOB
 * onto CanonicalCase.intake. SLA hours come from versioned client_config
 * when one exists for the client.
 */

import { getCaseSpineService } from '@/lib/case-spine';
import type {
  AuthWorkflowType,
  CaseSpinePriority,
  CreateCaseResult,
  IntakePayload,
} from '@/lib/case-spine';
import { getClientConfigService } from '@/lib/client-config';
import { hashPatientName } from './confirmation';
import { SYNTHETIC_CLIENT_ID } from './constants';

export { SYNTHETIC_CLIENT_ID, INTAKE_TO_SPINE_SLA_MS } from './constants';

export type IntakeSource = 'gravity_rail' | 'external_api' | 'fax_phaxio';

export interface SpineIngestInput {
  source: IntakeSource;
  client_id?: string | null;
  intake: IntakePayload;
  type?: AuthWorkflowType;
  parent_case_id?: string | null;
  priority?: CaseSpinePriority;
  packet_storage_keys?: string[];
  actor?: string;
}

export interface SpineIngestResult extends CreateCaseResult {
  source: IntakeSource;
  elapsed_ms: number;
  webhook_received_at: string;
  spine_created_at: string;
}

export function defaultIntakeClientId(explicit?: string | null): string {
  if (explicit && explicit.trim()) return explicit.trim();
  const fromEnv = process.env.DEFAULT_INTAKE_CLIENT_ID?.trim();
  if (fromEnv) return fromEnv;
  return SYNTHETIC_CLIENT_ID;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asPriority(value: unknown): CaseSpinePriority | null {
  if (value === 'standard' || value === 'urgent' || value === 'expedited') return value;
  return null;
}

function asBenefit(value: unknown): IntakePayload['benefit_type'] {
  if (value === 'medical' || value === 'pharmacy' || value === 'drug') return value;
  return null;
}

function asWorkflowType(value: unknown): AuthWorkflowType | undefined {
  if (value === 'prior_auth' || value === 'first_level_appeal') return value;
  if (value === 'appeal') return 'first_level_appeal';
  return undefined;
}

function serviceFromBody(body: Record<string, unknown>): string | null {
  const direct = asString(body.service_or_rx);
  if (direct) return direct;
  const codes = body.procedure_codes;
  if (Array.isArray(codes) && codes.length > 0) {
    return codes.map((c) => String(c)).filter(Boolean).join(',');
  }
  return asString(body.procedure_description);
}

/**
 * Flatten Gravity Rail record / chat / synthetic envelopes into a single
 * field bag. Unknown keys are ignored later.
 */
export function flattenGravityRailPayload(body: Record<string, unknown>): Record<string, unknown> {
  const record = (body.record && typeof body.record === 'object'
    ? (body.record as Record<string, unknown>)
    : null);
  const data = (body.data && typeof body.data === 'object'
    ? (body.data as Record<string, unknown>)
    : null);
  const nestedRecord = data?.record && typeof data.record === 'object'
    ? (data.record as Record<string, unknown>)
    : null;
  const fieldValues = {
    ...((nestedRecord?.fieldValues && typeof nestedRecord.fieldValues === 'object'
      ? nestedRecord.fieldValues
      : {}) as Record<string, unknown>),
    ...((record?.fieldValues && typeof record.fieldValues === 'object'
      ? record.fieldValues
      : {}) as Record<string, unknown>),
    ...((body.fieldValues && typeof body.fieldValues === 'object'
      ? body.fieldValues
      : {}) as Record<string, unknown>),
    ...((body.fields && typeof body.fields === 'object'
      ? body.fields
      : {}) as Record<string, unknown>),
  };

  return {
    ...fieldValues,
    ...body,
    external_id:
      body.external_id ??
      body.externalId ??
      record?.externalId ??
      record?.external_id ??
      nestedRecord?.externalId ??
      fieldValues.external_id,
    client_id: body.client_id ?? fieldValues.client_id ?? body.clientId,
  };
}

export function mapUnknownToIntake(body: Record<string, unknown>): {
  client_id: string;
  intake: IntakePayload;
  type?: AuthWorkflowType;
  parent_case_id?: string | null;
  priority?: CaseSpinePriority;
} {
  const memberRef =
    asString(body.member_ref) ||
    asString(body.patient_member_id) ||
    asString(body.member_id) ||
    (asString(body.patient_name) ? hashPatientName(String(body.patient_name)) : null);

  const docs = body.document_urls;
  const firstDoc = Array.isArray(docs) && docs.length > 0 ? asString(docs[0]) : null;

  const urgency = asPriority(body.urgency) ?? asPriority(body.priority);
  const intake: IntakePayload = {
    external_id: asString(body.external_id) ?? asString(body.externalId),
    member_ref: memberRef,
    requesting_provider: asString(body.requesting_provider),
    service_or_rx: serviceFromBody(body),
    place_of_service: asString(body.place_of_service),
    urgency,
    clinicals_pointer:
      asString(body.clinicals_pointer) ||
      firstDoc ||
      (Array.isArray(body.packet_storage_keys)
        ? asString(body.packet_storage_keys[0])
        : null),
    received_at: asString(body.received_at),
    benefit_type: asBenefit(body.benefit_type),
  };

  return {
    client_id: defaultIntakeClientId(asString(body.client_id)),
    intake,
    type: asWorkflowType(body.type) ?? asWorkflowType(body.review_type),
    parent_case_id: asString(body.parent_case_id),
    priority: urgency ?? undefined,
  };
}

export async function ingestToCaseSpine(input: SpineIngestInput): Promise<SpineIngestResult> {
  const webhookReceivedAt = new Date();
  const clientId = defaultIntakeClientId(input.client_id);
  const latest = await getClientConfigService().getLatest(clientId);

  const result = await getCaseSpineService().createCase(
    {
      client_id: clientId,
      type: input.type,
      parent_case_id: input.parent_case_id,
      external_id: input.intake.external_id,
      priority: input.priority ?? input.intake.urgency ?? undefined,
      packet_storage_keys: input.packet_storage_keys,
      intake: {
        ...input.intake,
        received_at: input.intake.received_at || webhookReceivedAt.toISOString(),
      },
      client_config: latest
        ? {
            client_id: clientId,
            sla_hours_standard: latest.config.sla_hours_standard,
            sla_hours_urgent: latest.config.sla_hours_urgent,
            pharmacy_benefit:
              latest.config.lob.includes('pharmacy') || latest.config.lob.includes('drug'),
          }
        : undefined,
    },
    input.actor ?? `intake:${input.source}`,
  );

  const spineCreatedAt = new Date();
  return {
    ...result,
    source: input.source,
    elapsed_ms: spineCreatedAt.getTime() - webhookReceivedAt.getTime(),
    webhook_received_at: webhookReceivedAt.toISOString(),
    spine_created_at: spineCreatedAt.toISOString(),
  };
}
