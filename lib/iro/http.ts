import { NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/audit';
import { requireAuth, type UserRole } from '@/lib/auth-guard';
import { evaluateIroPanelAccess, isIroPanelFlagEnabled } from '@/lib/entitlements/iro-panel';
import { getIroRepository } from './repository';
import { actorFromUser, type IroActor } from './service';

export async function resolveIroLineContract(): Promise<boolean> {
  if (process.env.IRO_LINE_CONTRACT === 'true') return true;
  if (process.env.IRO_LINE_CONTRACT === 'false') return false;
  const settings = await getIroRepository().getSettings();
  return settings.iro_line_contract === true;
}

export async function requireIro(
  request: Request,
  allowed: readonly UserRole[],
): Promise<{ user: IroActor } | NextResponse> {
  if (!isIroPanelFlagEnabled()) {
    return NextResponse.json({ error: 'iro_panel_disabled' }, { status: 404 });
  }
  const decision = evaluateIroPanelAccess({
    iro_line_contract: await resolveIroLineContract(),
  });
  if (!decision.allowed) {
    return NextResponse.json({ error: decision.code, reason: decision.reason }, { status: 403 });
  }
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!allowed.includes(auth.user.role)) {
    await logSecurityEvent('permission_denied', auth.user.email, {
      module: 'iro_panel',
      required_roles: [...allowed],
      actual_role: auth.user.role,
    });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return { user: actorFromUser(auth.user) };
}

export function fromResult(
  result:
    | { ok: true; data: unknown }
    | { ok: false; status: number; error: string; details?: Record<string, unknown> },
): NextResponse {
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.details ?? {}) },
      { status: result.status },
    );
  }
  return NextResponse.json(result.data);
}
