import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { CaseNotFoundError, getCaseSpineService, resolveSpineViewer } from '@/lib/case-spine';
import { toPortalDetermination } from '@/lib/fanout/portal';

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
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') ?? 'html';
    const viewer = resolveSpineViewer(authResult.user, request);

    const spine = getCaseSpineService();
    const c = await spine.getCase(id, viewer);
    const pkg = await spine.getDeterminationPackage(id);
    if (!pkg) {
      return NextResponse.json({ error: 'Package not written' }, { status: 404 });
    }

    if (format === 'json') {
      return NextResponse.json({
        determination: toPortalDetermination(c, pkg, viewer),
        package: pkg,
      });
    }

    return new NextResponse(pkg.letter_html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-disposition': `attachment; filename="determination-${c.case_number}.html"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    if (err instanceof CaseNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return apiError(err, {
      operation: 'download_portal_determination',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
