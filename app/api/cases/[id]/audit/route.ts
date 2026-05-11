import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode, getDemoAuditLog } from '@/lib/demo-mode';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;
    const { id } = await params;

    if (isDemoMode()) {
      const auditLog = getDemoAuditLog(id);
      if (auditLog === null) {
        return NextResponse.json(
          { error: 'Case not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(auditLog);
    }

    const supabase = getServiceClient();

    // Verify the case exists
    const { error: caseError } = await supabase
      .from('cases')
      .select('id')
      .eq('id', id)
      .single();

    if (caseError) {
      if (caseError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Case not found' },
          { status: 404 }
        );
      }
      return apiError(caseError, {
        operation: 'fetch_audit_log',
        caseId: id,
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Fetch audit log entries for the case
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('case_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      return apiError(error, {
        operation: 'fetch_audit_log',
        caseId: id,
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    return apiError(err, {
      operation: 'fetch_audit_log',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
