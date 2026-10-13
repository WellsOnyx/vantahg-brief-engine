import { NextRequest, NextResponse } from 'next/server';
import { aggregateStoploss, isGrain } from '@/lib/vhg/aggregate';
import { isVhgScoreDemoEnabled } from '@/lib/vhg/flag';
import { isISODate } from '@/lib/vhg/time-range';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isVhgScoreDemoEnabled()) {
    return NextResponse.json({ error: 'vhg_score_demo_disabled' }, { status: 404 });
  }
  const params = request.nextUrl.searchParams;
  const grain = params.get('grain');
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  if (!isGrain(grain) || !isISODate(from) || !isISODate(to) || from > to) {
    return NextResponse.json({ error: 'bad_range' }, { status: 400 });
  }
  return NextResponse.json(aggregateStoploss({
    clientId: params.get('client') || undefined,
    grain,
    from,
    to,
  }));
}
