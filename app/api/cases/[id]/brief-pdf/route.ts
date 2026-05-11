import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode, getDemoCase } from '@/lib/demo-mode';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { generateBriefPdf } from '@/lib/pdf-generator';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const { id } = await params;

    let caseData;
    if (isDemoMode()) {
      caseData = getDemoCase(id);
      if (!caseData) {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
      }
    } else {
      const supabase = getServiceClient();
      const { data, error } = await supabase
        .from('cases')
        .select('*, reviewer:reviewers(*), client:clients(*)')
        .eq('id', id)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
      }
      caseData = data;
    }

    if (!caseData.ai_brief) {
      return NextResponse.json(
        { error: 'No clinical brief has been generated for this case' },
        { status: 400 },
      );
    }

    const pdfBuffer = await generateBriefPdf(caseData);

    // SOC 2 CC6.1: brief PDF contains PHI. Log the export. Fire-and-forget
    // so the download doesn't fail if the audit table is briefly unavailable.
    logAuditEvent(id, 'brief_pdf_downloaded', authResult.user.email, {
      case_number: caseData.case_number,
    }, getRequestContext(request)).catch(() => { /* already logged inside logAuditEvent */ });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="brief-${caseData.case_number}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return apiError(err, {
      operation: 'generate_brief_pdf',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
