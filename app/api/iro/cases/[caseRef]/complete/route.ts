import { NextResponse } from 'next/server';
import { IRO_COMPLETE_ROLES } from '@/lib/iro/access';
import { fromResult, requireIro } from '@/lib/iro/http';
import { completeIroCase } from '@/lib/iro/service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseRef: string }> },
) {
  const gate = await requireIro(request, IRO_COMPLETE_ROLES);
  if (gate instanceof NextResponse) return gate;
  const { caseRef } = await params;
  return fromResult(await completeIroCase(gate.user, decodeURIComponent(caseRef)));
}
