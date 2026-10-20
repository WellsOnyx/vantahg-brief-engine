import { NextResponse } from 'next/server';
import { portalContext, portalJson, requirePortalUser } from '@/lib/iro/portal/http';
import { readIroCase } from '@/lib/iro/portal/service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  const result = await readIroCase(auth.user, id, await portalContext(request));
  return portalJson(result);
}
