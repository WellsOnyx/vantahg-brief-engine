import { NextResponse } from 'next/server';
import { IRO_HR_ROLES } from '@/lib/iro/access';
import { fromResult, requireIro } from '@/lib/iro/http';
import { applyCutover } from '@/lib/iro/service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const gate = await requireIro(request, IRO_HR_ROLES);
  if (gate instanceof NextResponse) return gate;
  const body = await request.json().catch(() => ({}));
  return fromResult(
    await applyCutover(
      gate.user,
      {
        workspace_tested: body.workspace_tested === true,
        transferred_records_checked: body.transferred_records_checked === true,
        access_permissions_confirmed: body.access_permissions_confirmed === true,
      },
      body.open === true,
    ),
  );
}
