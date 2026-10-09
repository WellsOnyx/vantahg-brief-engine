import { NextResponse } from 'next/server';
import { IRO_HR_ROLES } from '@/lib/iro/access';
import { fromResult, requireIro } from '@/lib/iro/http';
import { transitionPhysician } from '@/lib/iro/service';

export const dynamic = 'force-dynamic';

/**
 * HR status moves only. Panel approval (approved / conditional / denied)
 * is rejected here — that step belongs to clinical_approver.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireIro(request, IRO_HR_ROLES);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const to = typeof body.to === 'string' ? body.to : '';
  return fromResult(await transitionPhysician(gate.user, id, to));
}
