import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { AUTH_RULE_IDS, getCaseSpineService, type AuthRuleId } from '@/lib/case-spine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const rules = await getCaseSpineService().listRules();
    return NextResponse.json({ rules, version: 1 });
  } catch (err) {
    return apiError(err, {
      operation: 'list_auth_rules',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['admin', 'ceo', 'slt']);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const body = (await request.json()) as { rule_id?: string; enabled?: boolean };
    if (!body.rule_id || !(AUTH_RULE_IDS as readonly string[]).includes(body.rule_id)) {
      return NextResponse.json({ error: 'rule_id must be R01–R16' }, { status: 400 });
    }
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
    }

    const rule = await getCaseSpineService().setRuleEnabled(
      body.rule_id as AuthRuleId,
      body.enabled,
      authResult.user.id,
    );
    return NextResponse.json({ rule });
  } catch (err) {
    return apiError(err, {
      operation: 'toggle_auth_rule',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
