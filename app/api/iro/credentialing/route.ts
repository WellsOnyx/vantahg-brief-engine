import { NextResponse } from 'next/server';
import { IRO_HR_ROLES } from '@/lib/iro/access';
import { requireIro } from '@/lib/iro/http';
import { loadHrWorkspace } from '@/lib/iro/service';

export const dynamic = 'force-dynamic';

/** Full HR credentialing workspace. Front-line roles are denied. */
export async function GET(request: Request) {
  const gate = await requireIro(request, IRO_HR_ROLES);
  if (gate instanceof NextResponse) return gate;
  const body = await loadHrWorkspace();
  return NextResponse.json(body);
}
