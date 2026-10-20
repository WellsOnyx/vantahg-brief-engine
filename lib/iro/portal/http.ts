import { NextResponse } from 'next/server';
import { requireAuth, type UserRole } from '@/lib/auth-guard';
import { getRequestContext } from '@/lib/security';
import { readMfaStatus, type MfaStatus } from './mfa';
import { evaluateLivePhiGate } from './live-phi';
import type { PortalUser } from './roles';
import { getIroPortalStore, type IroPortalStore } from './store';
import type { PortalContext, PortalResult } from './service';

export function portalJson<T>(result: PortalResult<T>): NextResponse {
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.code, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true, ...result.data });
}

export async function portalContext(request: Request, store: IroPortalStore = getIroPortalStore()): Promise<PortalContext> {
  const requestId = getRequestContext(request).requestId ?? null;
  return {
    store,
    requestId,
    gate: evaluateLivePhiGate(),
  };
}

export async function requirePortalUser(
  request: Request,
): Promise<{ user: PortalUser; mfa: MfaStatus } | NextResponse> {
  const mfa = readMfaStatus(request);
  if (mfa.required && !mfa.satisfied) {
    return NextResponse.json(
      { ok: false, error: 'mfa_required', message: 'This session has not completed MFA.', mfa },
      { status: 403 },
    );
  }
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const user: PortalUser = {
    id: auth.user.id,
    email: auth.user.email,
    role: auth.user.role as UserRole,
    portal_role: null,
    clearance_role: null,
  };
  return { user, mfa };
}
