import { NextResponse } from 'next/server';
import { IRO_APPROVAL_READ_ROLES } from '@/lib/iro/access';
import { requireIro } from '@/lib/iro/http';
import { loadApprovalQueue } from '@/lib/iro/service';

export const dynamic = 'force-dynamic';

/** Verification packet for the Medical Director. Contracts are omitted. */
export async function GET(request: Request) {
  const gate = await requireIro(request, IRO_APPROVAL_READ_ROLES);
  if (gate instanceof NextResponse) return gate;
  return NextResponse.json(await loadApprovalQueue());
}
