import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode, getDemoCase } from '@/lib/demo-mode';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { generateDeterminationPdf } from '@/lib/pdf-generator';

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

    if (!caseData.determination) {
      return NextResponse.json(
        { error: 'No determination has been made for this case' },
        { status: 400 }
      );
    }

    const pdfBuffer = await generateDeterminationPdf(caseData);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="determination-${caseData.case_number}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Error generating PDF:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
