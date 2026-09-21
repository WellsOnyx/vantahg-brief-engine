import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { canAccessCxView, resolveSpineViewer } from '@/lib/case-spine';
import { ONBOARDING_CHECKLIST, ONBOARDING_PHASE_META } from '@/lib/onboarding/checklist';
import {
  buildOnboardingProgress,
  getOnboardingProgressStore,
} from '@/lib/onboarding/progress';
import {
  COLE_DAY_SCRIPT,
  E1_SYNTHETIC_COMMAND,
  E2_SHADOW_COMMAND,
  HARD_CONSTRAINTS,
  ONBOARDING_RUNBOOK_PATH,
  PACKAGING_LOCK,
  PUBLISH_SYNTHETIC_CONFIG_COMMAND,
  RELATED_SURFACES,
  SYNTHETIC_CLIENT_CONFIG_FIXTURE,
} from '@/lib/onboarding/runbook';
import { buildGoLiveStatus } from '@/lib/golive';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const viewer = resolveSpineViewer(authResult.user, request);
    if (!canAccessCxView(viewer)) {
      return NextResponse.json({ error: 'Forbidden', surface: 'onboarding_gates' }, { status: 403 });
    }

    const clientId = new URL(request.url).searchParams.get('client_id') || SYNTHETIC_CLIENT_ID;
    const progress = buildOnboardingProgress(clientId);
    const golive = await buildGoLiveStatus(clientId);
    return NextResponse.json({
      client_id: clientId,
      phases: ONBOARDING_PHASE_META,
      catalog: ONBOARDING_CHECKLIST,
      progress,
      golive,
      runbook: {
        path: ONBOARDING_RUNBOOK_PATH,
        constraints: HARD_CONSTRAINTS,
        days: COLE_DAY_SCRIPT,
        packaging: PACKAGING_LOCK,
        fixture: SYNTHETIC_CLIENT_CONFIG_FIXTURE,
        commands: {
          publish_config: PUBLISH_SYNTHETIC_CONFIG_COMMAND,
          e1: E1_SYNTHETIC_COMMAND,
          e2: E2_SHADOW_COMMAND,
        },
        related: RELATED_SURFACES,
      },
      hipaa_complete: false,
      note: 'Code gates only. BAA + live PHI remain human ops. ENABLE_AWS_* stay false.',
    });
  } catch (err) {
    return apiError(err, {
      operation: 'onboarding_gates',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const viewer = resolveSpineViewer(authResult.user, request);
    if (!canAccessCxView(viewer)) {
      return NextResponse.json({ error: 'Forbidden', surface: 'onboarding_gates' }, { status: 403 });
    }

    const body = (await request.json()) as { client_id?: string; item_id?: string; done?: boolean };
    if (!body.item_id || typeof body.done !== 'boolean') {
      return NextResponse.json({ error: 'item_id and done are required' }, { status: 400 });
    }
    const known = ONBOARDING_CHECKLIST.some((i) => i.id === body.item_id);
    if (!known) {
      return NextResponse.json({ error: 'unknown_item' }, { status: 404 });
    }
    const clientId = body.client_id || SYNTHETIC_CLIENT_ID;
    getOnboardingProgressStore().mark(clientId, body.item_id, body.done, authResult.user.id, new Date());
    return NextResponse.json({ progress: buildOnboardingProgress(clientId) });
  } catch (err) {
    return apiError(err, {
      operation: 'onboarding_gates_patch',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
