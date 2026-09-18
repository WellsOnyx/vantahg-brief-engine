import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import {
  ClientConfigImmutableError,
  ClientConfigNotFoundError,
  getClientConfigService,
  safeParseClientConfigFields,
} from '@/lib/client-config';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ clientId: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const { clientId } = await context.params;
    const { searchParams } = new URL(request.url);
    const history = searchParams.get('history') === '1' || searchParams.get('history') === 'true';
    const svc = getClientConfigService();

    if (history) {
      return NextResponse.json({ client_id: clientId, versions: await svc.listHistory(clientId) });
    }

    const latest = await svc.getLatest(clientId);
    if (!latest) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ latest });
  } catch (err) {
    return apiError(err, {
      operation: 'get_client_config',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ clientId: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const { clientId } = await context.params;
    const body = await request.json();
    const parsed = safeParseClientConfigFields({ ...body, client_id: clientId });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid client_config', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const version = await getClientConfigService().publish(parsed.data, authResult.user.id);
    return NextResponse.json({ version, immutable: true }, { status: 201 });
  } catch (err) {
    if (err instanceof ClientConfigNotFoundError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 404 });
    }
    return apiError(err, {
      operation: 'publish_client_config',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

export async function PATCH() {
  return NextResponse.json(
    {
      error: 'client_config versions are immutable; PUT or POST a new version',
      code: new ClientConfigImmutableError().code,
    },
    { status: 409 },
  );
}

export async function DELETE() {
  return NextResponse.json(
    {
      error: 'client_config versions are immutable; they cannot be deleted',
      code: new ClientConfigImmutableError().code,
    },
    { status: 409 },
  );
}
