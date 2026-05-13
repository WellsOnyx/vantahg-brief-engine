import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireCronSecret } from '@/lib/env';
import { logAuditEvent } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { getInvoice, meowStatusToLocal, type MeowInvoiceStatus } from '@/lib/billing/meow-client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/meow-invoice-sync
 *
 * Polls Meow for status changes on every open invoice. Meow does not
 * publish webhook events for invoice paid/void, so we poll instead.
 *
 * Logic:
 *   - SELECT invoices WHERE meow_invoice_id IS NOT NULL AND
 *     meow_status IN ('DRAFT', 'OPEN'). These are the only ones that
 *     can still flip to PAID/VOID/UNCOLLECTIBLE.
 *   - For each row, GET /billing/invoices/{id}. Compare returned status
 *     to our stored meow_status. If different:
 *       - Update meow_status, meow_last_synced_at
 *       - Update our local invoices.status via meowStatusToLocal()
 *       - If PAID, stamp paid_at
 *       - If VOID/UNCOLLECTIBLE, stamp voided_at + void_reason
 *   - Audit-log every transition.
 *
 * Schedule: every 30 minutes is plenty for billing cadence. Set in
 * vercel.json or EventBridge.
 *
 * Auth: CRON_SECRET bearer (same pattern as the eFax worker).
 */

type CronOutcome = {
  scanned: number;
  changed: number;
  errors: number;
  transitions: Array<{
    local_invoice_id: string;
    invoice_number: string | null;
    from: string;
    to: string;
  }>;
};

export async function GET(request: NextRequest) {
  try {
    if (!isDemoMode()) {
      try {
        requireCronSecret(request.headers.get('authorization'));
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Unauthorized' },
          { status: 401 },
        );
      }
    }

    if (isDemoMode()) {
      return NextResponse.json({
        demo: true,
        scanned: 0,
        changed: 0,
        message: 'Demo mode — no Meow polling performed.',
      });
    }

    const supabase = getServiceClient();

    const { data: openInvoices, error: readErr } = await supabase
      .from('invoices')
      .select('id, invoice_number, meow_invoice_id, meow_status, status')
      .not('meow_invoice_id', 'is', null)
      .in('meow_status', ['DRAFT', 'OPEN'])
      .limit(200);

    if (readErr) {
      return apiError(readErr, {
        operation: 'meow_sync_read',
        actor: 'cron',
        requestContext: getRequestContext(request),
      });
    }

    const rows = (openInvoices ?? []) as Array<{
      id: string;
      invoice_number: string;
      meow_invoice_id: string;
      meow_status: MeowInvoiceStatus;
      status: string;
    }>;

    const outcome: CronOutcome = {
      scanned: rows.length,
      changed: 0,
      errors: 0,
      transitions: [],
    };

    const now = new Date().toISOString();

    for (const row of rows) {
      const result = await getInvoice(row.meow_invoice_id);
      if (!result.ok) {
        outcome.errors++;
        await logAuditEvent(null, 'security:meow_sync_fetch_failed', 'cron', {
          local_invoice_id: row.id,
          meow_invoice_id: row.meow_invoice_id,
          code: result.code,
          message: result.message.slice(0, 200),
        }, getRequestContext(request));
        continue;
      }

      const remote = result.data;
      if (remote.status === row.meow_status) {
        // No change - just refresh the sync timestamp so we know we checked.
        await supabase
          .from('invoices')
          .update({ meow_last_synced_at: now })
          .eq('id', row.id);
        continue;
      }

      // Status changed. Compute our local-status mapping and apply.
      const newLocalStatus = meowStatusToLocal(remote.status);
      const update: Record<string, unknown> = {
        meow_status: remote.status,
        meow_last_synced_at: now,
        status: newLocalStatus,
      };
      if (remote.status === 'PAID' && remote.paid_at) {
        update.paid_at = remote.paid_at;
      }
      if (remote.status === 'VOID' || remote.status === 'UNCOLLECTIBLE') {
        update.voided_at = now;
        update.void_reason = `meow_status=${remote.status}`;
      }

      const { error: updateErr } = await supabase
        .from('invoices')
        .update(update)
        .eq('id', row.id);

      if (updateErr) {
        outcome.errors++;
        await logAuditEvent(null, 'security:meow_sync_persist_failed', 'cron', {
          local_invoice_id: row.id,
          meow_invoice_id: row.meow_invoice_id,
          attempted_status: remote.status,
          error: updateErr.message?.slice(0, 200),
        }, getRequestContext(request));
        continue;
      }

      outcome.changed++;
      outcome.transitions.push({
        local_invoice_id: row.id,
        invoice_number: row.invoice_number,
        from: row.meow_status,
        to: remote.status,
      });

      await logAuditEvent(null, 'invoice_meow_status_changed', 'cron', {
        local_invoice_id: row.id,
        invoice_number: row.invoice_number,
        from: row.meow_status,
        to: remote.status,
        new_local_status: newLocalStatus,
      }, getRequestContext(request));
    }

    return NextResponse.json(outcome);
  } catch (err) {
    return apiError(err, {
      operation: 'meow_invoice_sync',
      actor: 'cron',
      requestContext: getRequestContext(request),
    });
  }
}

// Allow POST too so EventBridge invocation Lambda doesn't have to care
// about method.
export const POST = GET;
