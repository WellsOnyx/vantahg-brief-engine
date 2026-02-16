import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Stub for future incoming case webhooks
    const body = await request.json();

    console.log('Webhook received:', JSON.stringify(body));

    return NextResponse.json({ message: 'webhook received' }, { status: 200 });
  } catch (err) {
    console.error('Error processing webhook:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
