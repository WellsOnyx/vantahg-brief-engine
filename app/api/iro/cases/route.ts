import { NextResponse } from 'next/server';
import { IRO_HR_ROLES, IRO_ASSIGN_ROLES } from '@/lib/iro/access';
import { fromResult, requireIro } from '@/lib/iro/http';
import { registerIroCase } from '@/lib/iro/service';
import type { UserRole } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

const ALLOWED = [...new Set<UserRole>([...IRO_HR_ROLES, ...IRO_ASSIGN_ROLES])];

export async function POST(request: Request) {
  const gate = await requireIro(request, ALLOWED);
  if (gate instanceof NextResponse) return gate;
  const body = await request.json().catch(() => ({}));
  return fromResult(
    await registerIroCase({
      case_ref: typeof body.case_ref === 'string' ? body.case_ref.trim() : '',
      required_specialty: typeof body.required_specialty === 'string' ? body.required_specialty.trim() : '',
      required_jurisdiction: typeof body.required_jurisdiction === 'string' ? body.required_jurisdiction.trim() : '',
      assigned_physician_id: null,
      assignment_state: 'unassigned',
      completed_at: null,
    }),
  );
}
