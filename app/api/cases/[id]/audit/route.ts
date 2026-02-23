import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode, getDemoAuditLog } from '@/lib/demo-mode';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';

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
      return NextResponse.json(
        { error: caseError.message },
        { status: 500 }
      );
    }

    // Fetch audit log entries for the case
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('case_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('Error fetching audit log:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
