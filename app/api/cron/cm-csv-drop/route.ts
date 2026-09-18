import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode, requireCronSecret } from '@/lib/env';
import { getCmHandoffService } from '@/lib/cm';

export const dynamic = 'force-dynamic';

/**
 * Daily CM CSV drop stub. Records flagged determinations only.
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

  const { searchParams } = new URL(request.url);
  const drop = await getCmHandoffService().dailyCsv(
    searchParams.get('client_id'),
    searchParams.get('day') ?? undefined,
  );

  return NextResponse.json({
    stub: true,
    day: drop.day,
    count: drop.items.length,
    demo: isDemoMode(),
  });
}

export const POST = GET;
