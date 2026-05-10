import { NextRequest, NextResponse } from 'next/server';
import { checkEligibility } from '@/lib/firstmover/eligibility';
import { applyRateLimit } from '@/lib/rate-limit-middleware';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
  if (rateLimited) return rateLimited;

  try {
    const body = await request.json();
    const { client_id, member_id, date_of_service } = body || {};

    if (!client_id || !member_id) {
      return NextResponse.json(
        { error: 'client_id and member_id are required' },
        { status: 400 }
      );
    }

    const result = await checkEligibility({ client_id, member_id, date_of_service });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Eligibility check failed' },
      { status: 500 }
    );
  }
}
