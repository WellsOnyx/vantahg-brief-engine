import { NextResponse } from 'next/server';
import { requirePortalUser } from '@/lib/iro/portal/http';
import { evaluateLivePhiGate } from '@/lib/iro/portal/live-phi';
import { resolvePortalRole } from '@/lib/iro/portal/roles';
import { getIroPortalStore } from '@/lib/iro/portal/store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requirePortalUser(request);
  if (auth instanceof NextResponse) return auth;
  const grant = await getIroPortalStore().getGrant(auth.user.id);
  const portalRole = resolvePortalRole({
    role: auth.user.role,
    portal_role: grant?.portal_role ?? null,
  });
  if (!portalRole) {
    return NextResponse.json({ ok: false, error: 'role_denied' }, { status: 403 });
  }
  const gate = evaluateLivePhiGate();
  return NextResponse.json({
    ok: true,
    user: { id: auth.user.id, role: auth.user.role, portal_role: portalRole },
    mfa: auth.mfa,
    live_phi: { allowed: gate.allowed, code: gate.code, baa: gate.baa },
  });
}
