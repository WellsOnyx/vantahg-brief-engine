import { NextResponse } from 'next/server';
import { isDemoMode, requireCronSecret } from '@/lib/env';
import { isIroPanelFlagEnabled } from '@/lib/entitlements/iro-panel';
import { resolveIroLineContract } from '@/lib/iro/http';
import { runReminderScan } from '@/lib/iro/service';

export const dynamic = 'force-dynamic';

/**
 * Reminder stub. Writes open reminder rows for the HR dashboard.
 * Does not send email and does not call OIG/SAM.
 */
export async function GET(request: Request) {
  if (!isIroPanelFlagEnabled()) {
    return NextResponse.json({ error: 'iro_panel_disabled' }, { status: 404 });
  }
  try {
    requireCronSecret(request.headers.get('authorization'));
  } catch {
    if (!isDemoMode()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  if (!(await resolveIroLineContract())) {
    return NextResponse.json({ error: 'missing_iro_line_contract' }, { status: 403 });
  }
  const asOf = new URL(request.url).searchParams.get('as_of');
  const now = asOf ? new Date(asOf) : new Date();
  if (Number.isNaN(now.getTime())) {
    return NextResponse.json({ error: 'invalid_as_of' }, { status: 400 });
  }
  const result = await runReminderScan(now);
  return NextResponse.json(result);
}
