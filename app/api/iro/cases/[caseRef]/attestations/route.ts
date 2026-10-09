import { NextResponse } from 'next/server';
import { IRO_ATTEST_ROLES } from '@/lib/iro/access';
import { fromResult, requireIro } from '@/lib/iro/http';
import { recordAttestation } from '@/lib/iro/service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseRef: string }> },
) {
  const gate = await requireIro(request, IRO_ATTEST_ROLES);
  if (gate instanceof NextResponse) return gate;
  const { caseRef } = await params;
  const body = await request.json().catch(() => ({}));
  return fromResult(
    await recordAttestation(gate.user, {
      case_ref: decodeURIComponent(caseRef),
      physician_id: typeof body.physician_id === 'string' ? body.physician_id : '',
      conflict_attested: body.conflict_attested === true,
      conflict_free: body.conflict_free === true,
      conflict_note: typeof body.conflict_note === 'string' ? body.conflict_note : null,
      qualification_attested: body.qualification_attested === true,
      specialty_match: body.specialty_match === true,
      jurisdiction_match: body.jurisdiction_match === true,
    }),
  );
}
