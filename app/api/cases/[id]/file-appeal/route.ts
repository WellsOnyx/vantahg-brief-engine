import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { isDemoMode, updateDemoCase, getDemoCase } from '@/lib/demo-mode';
import { createAppeal, validateAppealEligibility } from '@/lib/appeal-engine';
import { logAuditEvent } from '@/lib/audit';
import { getServiceClient } from '@/lib/supabase';

/**
 * POST /api/cases/[id]/file-appeal
 *
 * Files a first-level appeal for a denied/partial case.
 * Creates linked appeal case + appeals record via the appeal-engine.
 * Requires strong human reasoning (the appeal reason) — core to the "human makes it defensible" model.
 *
 * Strict tenant scoping via requireAuth + case access (defense in depth).
 * Fully audited.
 * Demo-mode safe (simulates creation + updates in-memory demo data).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const rateLimited = await applyRateLimit(request, { maxRequests: 20 });
    if (rateLimited) return rateLimited;

    const { id: originalCaseId } = await params;
    const body = await request.json();
    const { reason, filedBy: explicitFiledBy } = body;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 20) {
      return NextResponse.json(
        { error: 'Appeal reason is required and must be at least 20 characters (strong clinical justification expected).' },
        { status: 400 }
      );
    }

    const actor = authResult.user.email;
    const filedBy = explicitFiledBy || actor || 'concierge';

    const requestContext = getRequestContext(request);

    // ── DEMO MODE ─────────────────────────────────────────────────────────
    if (isDemoMode()) {
      const demoCase = getDemoCase(originalCaseId);
      if (!demoCase) {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
      }

      const eligibility = validateAppealEligibility(demoCase as any);
      if (!eligibility.eligible) {
        return NextResponse.json({ error: eligibility.reason || 'Not eligible for appeal' }, { status: 400 });
      }

      // Simulate creation
      const appealCaseId = `${originalCaseId}-APPEAL-DEMO`;
      const appealId = `appeal-${Date.now()}`;

      // Update original in demo memory
      updateDemoCase(originalCaseId, {
        appeal_status: 'pending',
      } as any);

      // Log rich audits (demo path uses console inside logAuditEvent)
      await logAuditEvent(originalCaseId, 'appeal_filed', filedBy, {
        appeal_id: appealId,
        appeal_case_id: appealCaseId,
        appeal_case_number: `${demoCase.case_number}-APPEAL`,
        reason: reason.trim(),
        is_demo: true,
      }, requestContext);

      return NextResponse.json({
        success: true,
        appealId,
        appealCaseId,
        appealCaseNumber: `${demoCase.case_number}-APPEAL`,
        message: 'First appeal filed successfully (demo).',
      });
    }

    // ── LIVE PATH ─────────────────────────────────────────────────────────
    const supabase = getServiceClient();

    // Load the original case for access check + eligibility (service client bypasses RLS for the engine call)
    const { data: originalCase, error: fetchErr } = await supabase
      .from('cases')
      .select('*, client:clients(*)')
      .eq('id', originalCaseId)
      .single();

    if (fetchErr || !originalCase) {
      return NextResponse.json({ error: 'Original case not found' }, { status: 404 });
    }

    // Tenant / role access guard
    // (createAppeal will also validate internally, but explicit guard here for early rejection + audit)
    // We import assertCaseAccess for consistency with other protected routes
    const { assertCaseAccess } = await import('@/lib/case-access');
    const accessDenied = await assertCaseAccess(originalCase as any, authResult.user, request);
    if (accessDenied) {
      return accessDenied;
    }

    const result = await createAppeal(originalCaseId, reason.trim(), filedBy);

    if (!result.success) {
      return NextResponse.json({ error: result.reason || 'Failed to file appeal' }, { status: 400 });
    }

    // Extra audit for the filing action (engine already logs appeal_created)
    await logAuditEvent(originalCaseId, 'appeal_filed', filedBy, {
      appeal_id: result.appealId,
      appeal_case_id: result.appealCaseId,
      reason: reason.trim(),
    }, requestContext);

    return NextResponse.json({
      success: true,
      appealId: result.appealId,
      appealCaseId: result.appealCaseId,
      message: 'First appeal filed. Linked appeal case created.',
    });
  } catch (err) {
    return apiError(err, {
      operation: 'file_appeal',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
