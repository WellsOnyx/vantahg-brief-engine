import { NextResponse } from 'next/server';
import { portalContext, portalJson, requirePortalUser } from '@/lib/iro/portal/http';
import { recordSharedActivation, recordSharedCredential, saveStaffGrant } from '@/lib/iro/portal/service';
import type { CredentialItemInput } from '@/lib/credentialing';
import { isPortalRole } from '@/lib/iro/portal/roles';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requirePortalUser(request);
  if (auth instanceof NextResponse) return auth;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }
  const ctx = await portalContext(request);
  if (body.op === 'activation') {
    if (typeof body.reviewer_id !== 'string' || typeof body.approver_id !== 'string') {
      return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
    }
    return portalJson(
      await recordSharedActivation(auth.user, { reviewer_id: body.reviewer_id, approver_id: body.approver_id }, ctx),
    );
  }
  if (body.op === 'grant') {
    if (typeof body.user_id !== 'string') {
      return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
    }
    const requested = typeof body.portal_role === 'string' ? body.portal_role : null;
    if (requested && !isPortalRole(requested)) {
      return NextResponse.json({ ok: false, error: 'role_denied' }, { status: 400 });
    }
    return portalJson(
      await saveStaffGrant(
        auth.user,
        {
          user_id: body.user_id,
          portal_role: requested && isPortalRole(requested) ? requested : null,
          clearance_role: typeof body.clearance_role === 'string' ? body.clearance_role : null,
        },
        ctx,
      ),
    );
  }
  const input = body as unknown as CredentialItemInput;
  if (typeof input.reviewer_id !== 'string' || typeof input.item_id !== 'string') {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }
  return portalJson(await recordSharedCredential(auth.user, input, ctx));
}
