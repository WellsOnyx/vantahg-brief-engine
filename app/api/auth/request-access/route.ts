import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logAuditEvent } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { getEmailAdapter } from '@/lib/adapters/email';
import { isDemoMode } from '@/lib/demo-mode';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/request-access
 *
 * Concierge-onboarded staff signup. The public sign-up page no longer
 * runs self-serve supabase.auth.signUp — that left the auth tenant open
 * to anyone who guessed the URL. Instead, prospective staff (reviewers,
 * concierge ops, IDR attorneys, administrators) submit a request that
 * gets emailed to onboarding@wellsonyx.com for human provisioning.
 *
 * Partner clients (TPAs, health plans) use POST /api/signup-tpa.
 *
 * 202 on success — opaque to prevent email enumeration.
 */

const RequestAccessSchema = z.object({
  full_name: z.string().trim().min(1).max(128),
  work_email: z.string().trim().toLowerCase().email().max(256),
  organization: z.string().trim().min(1).max(256),
  role: z.enum(['reviewer', 'concierge_ops', 'idr_attorney', 'administrator']),
  notes: z.string().trim().max(2000).optional(),
});

const ONBOARDING_INBOX =
  process.env.ONBOARDING_NOTIFICATION_EMAIL || 'onboarding@wellsonyx.com';

const ROLE_LABELS: Record<string, string> = {
  reviewer: 'Physician Reviewer',
  concierge_ops: 'Concierge Ops',
  idr_attorney: 'IDR Attorney',
  administrator: 'Administrator',
};

export async function POST(request: NextRequest) {
  const ctx = getRequestContext(request);

  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 20 });
    if (rateLimited) return rateLimited;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch (err) {
      return apiError(err, {
        status: 400,
        operation: 'request_access_parse',
        clientMessage: 'Invalid JSON',
        requestContext: ctx,
      });
    }

    const parsed = RequestAccessSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(parsed.error, {
        status: 400,
        operation: 'request_access_validate',
        clientMessage: 'Invalid request',
        requestContext: ctx,
      });
    }
    const body = parsed.data;
    const emailDomain = body.work_email.split('@')[1] || 'unknown';

    await logAuditEvent(
      null,
      'access_request_received',
      'public',
      {
        organization: body.organization,
        role: body.role,
        email_domain: emailDomain,
      },
      ctx,
    );

    // In demo mode just succeed without trying to send.
    if (!isDemoMode()) {
      try {
        const adapter = getEmailAdapter();
        await adapter.send({
          to: ONBOARDING_INBOX,
          subject: `Access request — ${body.full_name} (${ROLE_LABELS[body.role]})`,
          text: [
            `New access request from the VantaUM sign-up page.`,
            ``,
            `Name:         ${body.full_name}`,
            `Email:        ${body.work_email}`,
            `Organization: ${body.organization}`,
            `Role:         ${ROLE_LABELS[body.role]}`,
            ``,
            `Notes:`,
            body.notes || '(none)',
            ``,
            `Provision in Supabase Auth + user_profiles, then email the user a magic link.`,
          ].join('\n'),
        });
      } catch (err) {
        // Don't leak failure to the public — log and still return 202.
        await logAuditEvent(
          null,
          'access_request_email_failed',
          'system',
          { email_domain: emailDomain, error: String(err) },
          ctx,
        );
      }
    }

    return NextResponse.json({ accepted: true }, { status: 202 });
  } catch (err) {
    return apiError(err, {
      status: 500,
      operation: 'request_access',
      clientMessage: 'Internal error',
      requestContext: ctx,
    });
  }
}
