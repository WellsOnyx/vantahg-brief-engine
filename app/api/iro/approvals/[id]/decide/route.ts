import { NextResponse } from 'next/server';
import { IRO_CLINICAL_DECIDE_ROLES } from '@/lib/iro/access';
import { fromResult, requireIro } from '@/lib/iro/http';
import { decidePanel } from '@/lib/iro/service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireIro(request, IRO_CLINICAL_DECIDE_ROLES);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const decision = body.decision;
  if (decision !== 'approved' && decision !== 'conditional' && decision !== 'denied') {
    return NextResponse.json({ error: 'invalid_decision' }, { status: 400 });
  }
  const note = typeof body.note === 'string' ? body.note : '';
  const expiresOn = typeof body.expires_on === 'string' ? body.expires_on : null;
  return fromResult(await decidePanel(gate.user, id, decision, note, expiresOn));
}
