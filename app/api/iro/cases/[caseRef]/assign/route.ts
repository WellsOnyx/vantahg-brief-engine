import { NextResponse } from 'next/server';
import { IRO_ASSIGN_ROLES } from '@/lib/iro/access';
import { fromResult, requireIro } from '@/lib/iro/http';
import { assignIroCase } from '@/lib/iro/service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseRef: string }> },
) {
  const gate = await requireIro(request, IRO_ASSIGN_ROLES);
  if (gate instanceof NextResponse) return gate;
  const { caseRef } = await params;
  const body = await request.json().catch(() => ({}));
  const physicianId = typeof body.physician_id === 'string' ? body.physician_id : '';
  return fromResult(await assignIroCase(gate.user, decodeURIComponent(caseRef), physicianId));
}
