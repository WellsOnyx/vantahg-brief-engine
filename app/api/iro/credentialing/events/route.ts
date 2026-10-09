import { NextResponse } from 'next/server';
import { IRO_HR_ROLES } from '@/lib/iro/access';
import { fromResult, requireIro } from '@/lib/iro/http';
import { loadHrWorkspace, recordCredentialEvent } from '@/lib/iro/service';
import type { CredentialEventType } from '@/lib/iro/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const gate = await requireIro(request, IRO_HR_ROLES);
  if (gate instanceof NextResponse) return gate;
  const workspace = await loadHrWorkspace();
  const events = workspace.physicians.flatMap((physician) => physician.events);
  return NextResponse.json({ events });
}

export async function POST(request: Request) {
  const gate = await requireIro(request, IRO_HR_ROLES);
  if (gate instanceof NextResponse) return gate;
  const body = await request.json().catch(() => ({}));
  const physicianId = typeof body.physician_id === 'string' ? body.physician_id : '';
  const eventType = typeof body.event_type === 'string' ? body.event_type : '';
  const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
  if (!physicianId || !summary) {
    return NextResponse.json({ error: 'physician_id and summary are required' }, { status: 400 });
  }
  return fromResult(
    await recordCredentialEvent(gate.user, physicianId, eventType as CredentialEventType, summary),
  );
}
