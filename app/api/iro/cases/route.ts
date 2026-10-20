import { NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { portalContext, portalJson, requirePortalUser } from '@/lib/iro/portal/http';
import { refusePhiKeys, listIroCases, openIroCase } from '@/lib/iro/portal/service';
import type { Receipts } from '@/lib/iro/types';

export const dynamic = 'force-dynamic';

function receiptsOf(value: unknown): Receipts | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const stamp = (key: string): string | null => {
    const item = row[key];
    if (item === null || item === undefined) return null;
    return typeof item === 'string' ? item : null;
  };
  if (!('carrier_receipt_at' in row) && !('vanta_receipt_at' in row)) return null;
  return {
    carrier_receipt_at: stamp('carrier_receipt_at'),
    state_receipt_at: stamp('state_receipt_at'),
    vanta_receipt_at: stamp('vanta_receipt_at'),
  };
}

export async function GET(request: Request) {
  const limited = await applyRateLimit(request, { maxRequests: 120 });
  if (limited) return limited;
  const auth = await requirePortalUser(request);
  if (auth instanceof NextResponse) return auth;
  const result = await listIroCases(auth.user, await portalContext(request));
  return portalJson(result);
}

export async function POST(request: Request) {
  const limited = await applyRateLimit(request, { maxRequests: 30 });
  if (limited) return limited;
  const auth = await requirePortalUser(request);
  if (auth instanceof NextResponse) return auth;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }
  const phi = refusePhiKeys(body);
  if (phi) return NextResponse.json({ ok: false, error: phi }, { status: 400 });
  const receipts = receiptsOf(body.receipts);
  if (!receipts || typeof body.state_code !== 'string') {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }
  const result = await openIroCase(
    auth.user,
    {
      id: typeof body.id === 'string' ? body.id : undefined,
      state_code: body.state_code,
      receipts,
    },
    await portalContext(request),
  );
  return portalJson(result);
}
