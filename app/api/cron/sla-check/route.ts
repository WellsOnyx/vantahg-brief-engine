import { NextRequest, NextResponse } from 'next/server';
import { checkAndEscalateSlaBreach } from '@/lib/sla-escalation';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/sla-check
 * Called by Vercel cron or external scheduler every 15 minutes.
 * Authenticated via CRON_SECRET bearer token.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.CRON_SECRET;

    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await checkAndEscalateSlaBreach();

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('SLA check cron failed:', err);
    return NextResponse.json(
      { error: 'SLA check failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/sla-check
 * Vercel cron jobs hit GET by default.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}
