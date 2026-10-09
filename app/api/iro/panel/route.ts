import { NextResponse } from 'next/server';
import { IRO_ASSIGNMENT_ROLES } from '@/lib/iro/access';
import { requireIro } from '@/lib/iro/http';
import { loadAssignmentPanel } from '@/lib/iro/service';

export const dynamic = 'force-dynamic';

/**
 * Assignment card only. HR records are not selected for this response,
 * including when an admin or credentialing admin calls it.
 */
export async function GET(request: Request) {
  const gate = await requireIro(request, IRO_ASSIGNMENT_ROLES);
  if (gate instanceof NextResponse) return gate;
  const caseRef = new URL(request.url).searchParams.get('case_ref');
  const body = await loadAssignmentPanel(caseRef);
  return NextResponse.json(body);
}
