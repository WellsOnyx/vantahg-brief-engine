import { NextResponse } from 'next/server';
import { IRO_HR_ROLES } from '@/lib/iro/access';
import { fromResult, requireIro } from '@/lib/iro/http';
import { sectionOf } from '@/lib/iro/service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireIro(request, IRO_HR_ROLES);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  return fromResult(await sectionOf(id, 'licenses'));
}
