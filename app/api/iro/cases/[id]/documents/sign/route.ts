import { NextResponse } from 'next/server';
import { portalContext, portalJson, requirePortalUser } from '@/lib/iro/portal/http';
import { signIroDocument } from '@/lib/iro/portal/service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser(request);
  if (auth instanceof NextResponse) return auth;
  const documentId = new URL(request.url).searchParams.get('document');
  if (!documentId) return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  const { id } = await context.params;
  const result = await signIroDocument(auth.user, id, documentId, await portalContext(request));
  return portalJson(result);
}
