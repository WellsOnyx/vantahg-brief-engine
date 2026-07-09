import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent } from '@/lib/audit';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { requireRole, INTERNAL_STAFF_ROLES } from '@/lib/auth-guard';
import { isCommitteeReady } from '@/lib/credentialing/psv';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * POST /api/credentialing/cases/[id]/decision — the committee decision.
 *
 * THE WALL, credentialing edition: this endpoint is the ONLY writer of
 * credentialing_cases.decision. The engine orchestrates PSV and assembles
 * the file; a human committee member (internal staff) renders the
 * participation decision — with required rationale and a per-case
 * attestation, exactly like the clinical determination path.
 *
 * Guards:
 *   - internal staff only
 *   - the case must be committee-ready: every required PSV element
 *     terminal (verified / discrepancy). Discrepancies don't block — the
 *     committee must SEE and weigh them; deciding blind is what's blocked.
 *   - rationale >= 30 chars (same bar as concierge validation)
 *   - attestation.flags_acknowledged required when discrepancies exist
 */

const decisionSchema = z.object({
  decision: z.enum(['approved', 'denied', 'deferred']),
  rationale: z.string().min(30, 'rationale must be at least 30 characters'),
  attestation: z
    .object({
      flags_acknowledged: z.boolean(),
      attested_at: z.string().datetime({ offset: true }).optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const auth = await requireRole(request, [...INTERNAL_STAFF_ROLES]);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;

    let bodyJson: unknown;
    try {
      bodyJson = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const parsed = decisionSchema.safeParse(bodyJson);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation_failed', errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
        { status: 400 },
      );
    }
    const body = parsed.data;

    if (isDemoMode()) {
      return NextResponse.json({ demo: true, decided: true, case_id: id, decision: body.decision });
    }

    const supabase = getServiceClient();
    const { data: credCase } = await supabase
      .from('credentialing_cases')
      .select('id, status, decision')
      .eq('id', id)
      .maybeSingle();
    if (!credCase) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    if (credCase.decision) {
      return NextResponse.json({ error: 'already_decided', detail: 'This cycle already has a committee decision.' }, { status: 409 });
    }

    const readiness = await isCommitteeReady(id);
    if (!readiness.ready) {
      return NextResponse.json(
        {
          error: 'not_committee_ready',
          detail: 'Required verification elements are still pending — the committee never decides on an incomplete file.',
          pending_elements: readiness.pending,
        },
        { status: 409 },
      );
    }
    if (readiness.discrepancies.length > 0 && body.attestation?.flags_acknowledged !== true) {
      return NextResponse.json(
        {
          error: 'discrepancies_unacknowledged',
          detail: 'This file has verification discrepancies; the decision requires attestation.flags_acknowledged = true.',
          discrepancy_elements: readiness.discrepancies,
        },
        { status: 409 },
      );
    }

    const attestation = body.attestation
      ? { flags_acknowledged: body.attestation.flags_acknowledged, attested_at: body.attestation.attested_at ?? new Date().toISOString() }
      : null;

    const { error: updateErr } = await supabase
      .from('credentialing_cases')
      .update({
        decision: body.decision,
        decision_rationale: body.rationale.trim(),
        decided_by: auth.user.email,
        decided_at: new Date().toISOString(),
        attestation,
        status: 'decided',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (updateErr) {
      return apiError(updateErr, {
        operation: 'credentialing_decision_update', actor: auth.user.email,
        requestContext: getRequestContext(request),
      });
    }

    await logAuditEvent(id, 'credentialing_decision_made', auth.user.email, {
      decision: body.decision,
      rationale: body.rationale.trim(),
      discrepancies_acknowledged: readiness.discrepancies.length > 0 ? readiness.discrepancies : null,
      attestation,
    }, getRequestContext(request));

    return NextResponse.json({ decided: true, case_id: id, decision: body.decision });
  } catch (e) {
    return apiError(e, { operation: 'credentialing_decision', actor: 'system', requestContext: getRequestContext(request) });
  }
}
