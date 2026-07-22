import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent } from '@/lib/audit';
import {
  applicableElements,
  type ProviderProfileForApplicability,
  type VerificationElement,
} from '@/lib/credentialing/config';

/**
 * PSV orchestration (Phase 1: the seam + seeding; Phase 2 adds the real
 * source adapters behind `PsvSource`).
 *
 * The engine's whole job on this line: open one verification_item per
 * applicable NCQA element, drive each to verified/discrepancy via its
 * source adapter, and assemble a committee-ready file. It never decides —
 * credentialing_cases.decision is written only by the committee endpoint.
 *
 * Adapter contract mirrors lib/adapters/*: each source implements
 * `PsvSource`; Phase 1 registers the `manual` fallback (a structured
 * human task — pend-cleanly, never a silent skip) and a CAQH stub that
 * declares itself unavailable until real credentials exist. Build-vs-buy
 * per the plan: buy the aggregation APIs, build this orchestration.
 */

export interface PsvRequestContext {
  caseId: string;
  providerId: string;
  element: VerificationElement;
}

export interface PsvResult {
  /** 'verified' | 'discrepancy' — terminal; 'in_progress' — async source will callback/poll. */
  status: 'verified' | 'discrepancy' | 'in_progress';
  /** Normalized, PII-light detail for the committee file (never raw source blobs). */
  detail?: Record<string, unknown>;
}

export interface PsvSource {
  key: string;
  /** Whether this adapter can run in the current environment (creds present). */
  available(): boolean;
  /** Kick off (or complete) verification for one element. */
  request(ctx: PsvRequestContext): Promise<PsvResult>;
}

/** Manual fallback — a structured task for the credentialing coordinator. */
const manualSource: PsvSource = {
  key: 'manual',
  available: () => true,
  request: async () => ({
    status: 'in_progress',
    detail: { mode: 'manual_task', note: 'Awaiting coordinator verification against the primary source.' },
  }),
};

/**
 * CAQH ProView stub — the seam is real, the credentials are not yet.
 * When CAQH_API_KEY lands (Phase 2), this becomes the attest-and-pull
 * adapter; until then it declares unavailable and orchestration falls back
 * to manual, visibly.
 */
const caqhSource: PsvSource = {
  key: 'caqh',
  available: () => !!process.env.CAQH_API_KEY,
  request: async () => ({
    status: 'in_progress',
    detail: { mode: 'caqh_pull_requested' },
  }),
};

const SOURCES: Record<string, PsvSource> = {
  manual: manualSource,
  caqh: caqhSource,
  // Phase 2: npdb, oig_leie, sam_gov, abms, state_board, dea
};

function resolveSource(key: string): PsvSource {
  const s = SOURCES[key];
  if (s && s.available()) return s;
  return manualSource;
}

/**
 * Seed one verification_item per applicable element for a fresh cycle and
 * kick off each element's source request. Idempotent under the
 * (case_id, element) unique index — a retry cannot double-seed.
 */
export async function openVerificationItems(
  caseId: string,
  providerId: string,
  profile: ProviderProfileForApplicability,
): Promise<{ seeded: number }> {
  if (isDemoMode()) return { seeded: 0 };
  const supabase = getServiceClient();
  const elements = applicableElements(profile);
  let seeded = 0;

  for (const element of elements) {
    const source = resolveSource(element.source);
    const { error } = await supabase.from('verification_items').insert({
      case_id: caseId,
      element: element.key,
      source: source.key,
      status: 'pending',
    });
    if (error) continue; // unique violation = already seeded — idempotent
    seeded += 1;

    // Kick off the source request; failures leave the item pending +
    // audited, never silently dropped.
    try {
      const result = await source.request({ caseId, providerId, element });
      await supabase
        .from('verification_items')
        .update({
          status: result.status === 'in_progress' ? 'in_progress' : result.status,
          detail: result.detail ?? null,
          requested_at: new Date().toISOString(),
          ...(result.status === 'verified' ? { verified_at: new Date().toISOString() } : {}),
        })
        .eq('case_id', caseId)
        .eq('element', element.key);
    } catch {
      await logAuditEvent(caseId, 'psv_request_failed', 'system', {
        element: element.key,
        source: source.key,
      }).catch(() => {});
    }
  }

  if (seeded > 0) {
    await logAuditEvent(caseId, 'psv_items_opened', 'system', { count: seeded }).catch(() => {});
    await supabase
      .from('credentialing_cases')
      .update({ status: 'psv_in_progress', updated_at: new Date().toISOString() })
      .eq('id', caseId);
  }
  return { seeded };
}

/**
 * Committee-readiness check: every REQUIRED applicable element must be
 * terminal (verified / discrepancy / not_applicable). Discrepancies don't
 * block readiness — the committee must SEE them; that's the point.
 */
export async function isCommitteeReady(caseId: string): Promise<{
  ready: boolean;
  pending: string[];
  discrepancies: string[];
}> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('verification_items')
    .select('element, status')
    .eq('case_id', caseId);
  const items = data ?? [];
  const pending = items
    .filter((i) => i.status === 'pending' || i.status === 'in_progress')
    .map((i) => i.element as string);
  const discrepancies = items
    .filter((i) => i.status === 'discrepancy' || i.status === 'expired')
    .map((i) => i.element as string);
  return { ready: items.length > 0 && pending.length === 0, pending, discrepancies };
}
