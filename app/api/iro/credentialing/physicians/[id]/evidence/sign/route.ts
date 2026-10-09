import { NextResponse } from 'next/server';
import { IRO_APPROVAL_READ_ROLES, IRO_HR_ROLES } from '@/lib/iro/access';
import { fromResult, requireIro } from '@/lib/iro/http';
import { signEvidence } from '@/lib/iro/service';
import type { UserRole } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

const ALLOWED = [...new Set<UserRole>([...IRO_HR_ROLES, ...IRO_APPROVAL_READ_ROLES])];

/** Short-lived signed URL. Contract files stay with HR. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireIro(request, ALLOWED);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const path = new URL(request.url).searchParams.get('path') ?? '';
  return fromResult(await signEvidence(gate.user, id, path));
}
