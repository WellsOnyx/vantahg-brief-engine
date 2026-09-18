import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode, requireCronSecret } from '@/lib/env';
import { getCaseSpineService } from '@/lib/case-spine';
import { getFanoutService } from '@/lib/fanout';

export const dynamic = 'force-dynamic';

/**
 * Retry fan-out for cases sitting in fanout_pending / determined+pending.
 * Demo is a no-op success so local curls work without CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  try {
    requireCronSecret(request.headers.get('authorization'));
  } catch {
    if (!isDemoMode()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const viewer = { id: 'cron', role: 'superadmin' as const };
  const pending = [
    ...(await getCaseSpineService().listCases(viewer, { state: 'determined' })),
    ...(await getCaseSpineService().listCases(viewer, { state: 'fanout_pending' })),
  ].filter((c) => c.fanout_status === 'pending' && c.determination_package_version);

  const results = [];
  for (const c of pending) {
    try {
      results.push(await getFanoutService().processCase(c.case_id, 'cron:fanout-retry'));
    } catch (err) {
      results.push({
        case_id: c.case_id,
        error: err instanceof Error ? err.message : 'fanout_failed',
      });
    }
  }

  return NextResponse.json({ processed: results.length, results, demo: isDemoMode() });
}

export const POST = GET;
