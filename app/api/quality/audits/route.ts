import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { isDemoMode, getDemoQualityAudits } from '@/lib/demo-mode';
import { getServiceClient } from '@/lib/supabase';
import { createAudit } from '@/lib/quality-audit';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(request.url);
    const caseId = searchParams.get('case_id') ?? undefined;
    const staffId = searchParams.get('staff_id') ?? undefined;
    const clientId = searchParams.get('client_id') ?? undefined;

    if (isDemoMode()) {
      // Demo mode currently has no client-scoped audit fixtures; the
      // client_id filter is a no-op there. Returning all is correct demo
      // behavior — the admin selector still works against real data.
      return NextResponse.json(getDemoQualityAudits(caseId, staffId));
    }

    const supabase = getServiceClient();

    // Tenant scope: quality_audits has no direct client_id column. Look up
    // the matching case IDs first, then filter audits by them. Two queries,
    // but the cases table is already indexed on client_id (migration 008).
    let caseIdsInScope: string[] | null = null;
    if (clientId) {
      const { data: scopedCases, error: scopedErr } = await supabase
        .from('cases')
        .select('id')
        .eq('client_id', clientId);
      if (scopedErr) {
        return apiError(scopedErr, {
          operation: 'list_quality_audits_scope',
          actor: authResult.user.email,
          requestContext: getRequestContext(request),
        });
      }
      caseIdsInScope = (scopedCases ?? []).map((c) => c.id as string);
      // No cases for this tenant → no audits possible. Short-circuit so the
      // .in() query below doesn't get an empty array (which Supabase
      // handles fine, but the round-trip is wasted).
      if (caseIdsInScope.length === 0) {
        return NextResponse.json([]);
      }
    }

    let query = supabase.from('quality_audits').select('*').order('created_at', { ascending: false });

    if (caseId) query = query.eq('case_id', caseId);
    if (staffId) query = query.eq('audited_staff_id', staffId);
    if (caseIdsInScope) query = query.in('case_id', caseIdsInScope);

    const { data, error } = await query;
    if (error) {
      return apiError(error, {
        operation: 'list_quality_audits',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    return apiError(err, {
      operation: 'list_quality_audits',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const { case_id, auditor_id, audited_staff_id } = body;

    if (!case_id || !auditor_id || !audited_staff_id) {
      return NextResponse.json(
        { error: 'case_id, auditor_id, and audited_staff_id are required' },
        { status: 400 },
      );
    }

    const result = await createAudit(case_id, auditor_id, audited_staff_id);

    if (!result.success) {
      return NextResponse.json({ error: result.reason }, { status: 500 });
    }

    return NextResponse.json({ success: true, auditId: result.auditId }, { status: 201 });
  } catch (err) {
    return apiError(err, {
      operation: 'create_quality_audit',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
