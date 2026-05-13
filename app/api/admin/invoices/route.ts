import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logAuditEvent } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { generateInvoice, previousMonthRange, monthRange } from '@/lib/billing/invoice-generator';

export const dynamic = 'force-dynamic';

const PostBodySchema = z.object({
  client_id: z.string().uuid(),
  /** YYYY-MM. Defaults to the previous calendar month. */
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  member_count_override: z.number().int().min(0).optional(),
  pepm_rate_cents_override: z.number().int().min(0).optional(),
});

const DEMO_INVOICES = [
  {
    id: 'demo-inv-1',
    invoice_number: 'VUM-INV-2026-00001',
    client_id: 'demo-c-1',
    client_name: 'Acme TPA',
    period_start: '2026-04-01',
    period_end: '2026-04-30',
    pepm_rate_cents: 240,
    member_count: 15000,
    total_cents: 3_600_000,
    status: 'sent',
    invoice_date: '2026-05-01',
  },
  {
    id: 'demo-inv-2',
    invoice_number: 'VUM-INV-2026-00002',
    client_id: 'demo-c-2',
    client_name: 'Sunrise Health Plan',
    period_start: '2026-04-01',
    period_end: '2026-04-30',
    pepm_rate_cents: 240,
    member_count: 8500,
    total_cents: 2_040_000,
    status: 'draft',
    invoice_date: '2026-05-01',
  },
];

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['admin', 'builder', 'ceo', 'slt', 'practice-lead']);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 120 });
    if (rateLimited) return rateLimited;

    if (isDemoMode()) {
      return NextResponse.json({ invoices: DEMO_INVOICES });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, client_id, period_start, period_end, pepm_rate_cents, member_count, total_cents, status, sent_at, paid_at, created_at, meow_invoice_id, meow_status, meow_payment_url, clients(name)')
      .order('period_start', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      return apiError(error, {
        operation: 'list_invoices',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }
    const shaped = (data ?? []).map((r) => ({
      ...r,
      client_name: (r.clients as { name?: string } | null)?.name ?? null,
    }));
    return NextResponse.json({ invoices: shaped });
  } catch (err) {
    return apiError(err, {
      operation: 'list_invoices',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['admin']);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const raw = await request.json().catch(() => ({}));
    const parsed = PostBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
    }
    const body = parsed.data;

    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        demo: true,
        invoice_id: 'demo-inv-new',
        invoice_number: 'VUM-INV-DEMO-00003',
      });
    }

    let periodStart: Date;
    let periodEnd: Date;
    if (body.period) {
      const [y, m] = body.period.split('-').map(Number);
      const { start, end } = monthRange(new Date(Date.UTC(y, m - 1, 15)));
      periodStart = start;
      periodEnd = end;
    } else {
      const r = previousMonthRange(new Date());
      periodStart = r.start;
      periodEnd = r.end;
    }

    const supabase = getServiceClient();
    const result = await generateInvoice(supabase, {
      clientId: body.client_id,
      periodStart,
      periodEnd,
      memberCountOverride: body.member_count_override,
      pepmRateOverride: body.pepm_rate_cents_override,
      generatedBy: authResult.user.email,
    });

    if (!result.ok) {
      const status = result.code === 'client_not_found' ? 404 : result.code === 'already_exists' ? 409 : 400;
      return NextResponse.json({ error: result.message, code: result.code }, { status });
    }

    await logAuditEvent(null, 'invoice_generated', authResult.user.email, {
      invoice_id: result.invoiceId,
      invoice_number: result.invoiceNumber,
      client_id: body.client_id,
      period_start: periodStart.toISOString().slice(0, 10),
      total_cents: result.totalCents,
    }, getRequestContext(request));

    return NextResponse.json({
      success: true,
      invoice_id: result.invoiceId,
      invoice_number: result.invoiceNumber,
      total_cents: result.totalCents,
    });
  } catch (err) {
    return apiError(err, {
      operation: 'generate_invoice',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
