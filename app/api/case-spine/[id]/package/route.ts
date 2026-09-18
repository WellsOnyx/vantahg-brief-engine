import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { CaseNotFoundError, canAccessClinicalPacket, getCaseSpineService, resolveSpineViewer } from '@/lib/case-spine';

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

    const viewer = resolveSpineViewer(authResult.user, request);
    if (!canAccessClinicalPacket(viewer)) {
      return NextResponse.json({ error: 'Forbidden', surface: 'clinical_package' }, { status: 403 });
    }

    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const versionParam = searchParams.get('version');
    const version = versionParam ? Number(versionParam) : undefined;
    const pkg = await getCaseSpineService().getDeterminationPackage(
      id,
      Number.isFinite(version) ? version : undefined,
    );
    if (!pkg) {
      return NextResponse.json({ error: 'Package not written' }, { status: 404 });
    }
    return NextResponse.json({ package: pkg });
  } catch (err) {
    if (err instanceof CaseNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return apiError(err, {
      operation: 'get_determination_package',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
