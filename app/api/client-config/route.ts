import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import {
  getClientConfigService,
  safeParseClientConfigFields,
} from '@/lib/client-config';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');
    const history = searchParams.get('history') === '1' || searchParams.get('history') === 'true';
    const svc = getClientConfigService();

    if (clientId) {
      if (history) {
        return NextResponse.json({ client_id: clientId, versions: await svc.listHistory(clientId) });
      }
      const latest = await svc.getLatest(clientId);
      if (!latest) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({ latest });
    }

    return NextResponse.json({ configs: await svc.listLatest() });
  } catch (err) {
    return apiError(err, {
      operation: 'list_client_config',
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
    const parsed = safeParseClientConfigFields(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid client_config', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const version = await getClientConfigService().publish(parsed.data, authResult.user.id);
    return NextResponse.json({ version, immutable: true }, { status: 201 });
  } catch (err) {
    return apiError(err, {
      operation: 'publish_client_config',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
