import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/env';
import { backfillReviewDataset } from '@/lib/dataset/review-dataset';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/review-dataset-backfill
 *
 * Nightly sweep that (re)captures a de-identified training sample for every
 * finalized review missing one — so the dataset self-heals and retroactively
 * covers historical cases, not just those determined after this feature
 * shipped. Determination-time hooks handle the going-forward path; this is the
 * safety net. Authenticated via CRON_SECRET bearer token.
 */
export async function POST(request: NextRequest) {
  try {
    try {
      requireCronSecret(request.headers.get('authorization'));
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await backfillReviewDataset({ actor: 'cron:review-dataset-backfill' });

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Review dataset backfill cron failed:', err);
    return NextResponse.json({ error: 'Backfill failed' }, { status: 500 });
  }
}

/** Vercel cron hits GET by default. */
export async function GET(request: NextRequest) {
  return POST(request);
}
