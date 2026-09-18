import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { getMemoryStatementStore, renderStatementPdf } from '@/lib/billing/statement';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const { id } = await context.params;
    const format = new URL(request.url).searchParams.get('format') ?? 'json';
    const statement = await getMemoryStatementStore().get(id);
    if (!statement) {
      return NextResponse.json({ error: 'Statement not found' }, { status: 404 });
    }

    if (format === 'html') {
      return new NextResponse(statement.html, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    if (format === 'pdf') {
      const pdf = renderStatementPdf(statement);
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="statement-${statement.statement_id.slice(0, 8)}.pdf"`,
        },
      });
    }
    return NextResponse.json({ statement });
  } catch (err) {
    return apiError(err, {
      operation: 'get_billing_statement',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
