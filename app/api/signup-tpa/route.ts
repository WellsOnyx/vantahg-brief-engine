import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logAuditEvent } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * POST /api/signup-tpa
 *
 * Public, unauthenticated endpoint that prospects submit from
 * /signup-tpa (form lands in the next PR). Writes a row to
 * signup_requests (migration 012) in status=pending_review for an
 * admin to review at /admin/signups.
 *
 * Security model:
 *   - Unauthenticated by design — prospects don't have accounts yet.
 *   - Aggressive rate limit to discourage spam (20/min per IP).
 *   - Zod-validated body with length caps; anything malformed → 400.
 *   - No PHI is captured here — only business contact info + deal
 *     economics. The form intentionally does NOT take patient data.
 *   - Service-role insert (bypasses RLS) because the public has no
 *     session. Server-side validation is the only gate.
 *
 * Audit:
 *   - signup_received event written with low-cardinality metadata
 *     (legal_name, primary contact email DOMAIN, estimated_members).
 *     Never logs the raw email or phone — they're business contact
 *     info, not PHI, but treat conservatively.
 *
 * Response:
 *   - 201 with { success: true, message } — does NOT echo the new
 *     row's id to prevent enumeration of the signup_requests table.
 *     Admin review surface uses the id; the prospect doesn't need it.
 */

const SignupBodySchema = z.object({
  // Company — legal_name is the only strictly-required identity field.
  legal_name: z.string().trim().min(1).max(256),
  dba: z.string().trim().max(256).optional(),
  entity_state: z.string().trim().max(64).optional(),
  street_address: z.string().trim().max(256).optional(),
  city: z.string().trim().max(128).optional(),
  state: z.string().trim().max(64).optional(),
  zip: z.string().trim().max(16).optional(),

  // Primary contact — name + email required so we can follow up.
  primary_contact_name: z.string().trim().min(1).max(128),
  primary_contact_title: z.string().trim().max(128).optional(),
  primary_contact_email: z.string().trim().toLowerCase().email().max(256),
  primary_contact_phone: z.string().trim().max(64).optional(),

  // Contract signer — optional; admin can populate later.
  signer_name: z.string().trim().max(128).optional(),
  signer_title: z.string().trim().max(128).optional(),
  signer_email: z.string().trim().toLowerCase().email().max(256).optional(),

  // Deal economics — all optional; admin negotiates final terms.
  estimated_members: z.number().int().nonnegative().max(10_000_000).optional(),
  pepm_rate_cents: z.number().int().nonnegative().max(100_000).optional(),
  expected_weekly_auths: z.number().int().nonnegative().max(1_000_000).optional(),

  // Context
  existing_tpa_system: z.string().trim().max(256).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Aggressive rate limit — public unauthenticated endpoint.
    const rateLimited = await applyRateLimit(request, { maxRequests: 20 });
    if (rateLimited) return rateLimited;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = SignupBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      // Surface field-path issues so the form can highlight bad inputs.
      // PHI-safe: we report the field path + zod issue code, never the
      // submitted value (which could include the prospect's contact info).
      const issues = parsed.error.issues.slice(0, 8).map((i) => ({
        field: i.path.join('.') || '<root>',
        code: i.code,
      }));
      return NextResponse.json({ error: 'Validation failed', issues }, { status: 400 });
    }
    const body = parsed.data;

    if (isDemoMode()) {
      // Don't write to demo fixtures — return success so the form path
      // is testable end-to-end in local/preview deploys.
      return NextResponse.json(
        { success: true, demo: true, message: 'Signup recorded (demo mode — no row written).' },
        { status: 201 },
      );
    }

    const supabase = getServiceClient();

    const { error } = await supabase
      .from('signup_requests')
      .insert({
        legal_name: body.legal_name,
        dba: body.dba ?? null,
        entity_state: body.entity_state ?? null,
        street_address: body.street_address ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        zip: body.zip ?? null,
        primary_contact_name: body.primary_contact_name,
        primary_contact_title: body.primary_contact_title ?? null,
        primary_contact_email: body.primary_contact_email,
        primary_contact_phone: body.primary_contact_phone ?? null,
        signer_name: body.signer_name ?? null,
        signer_title: body.signer_title ?? null,
        signer_email: body.signer_email ?? null,
        estimated_members: body.estimated_members ?? null,
        pepm_rate_cents: body.pepm_rate_cents ?? null,
        expected_weekly_auths: body.expected_weekly_auths ?? null,
        existing_tpa_system: body.existing_tpa_system ?? null,
        notes: body.notes ?? null,
        status: 'pending_review',
      });

    if (error) {
      return apiError(error, {
        operation: 'signup_tpa_submit',
        actor: 'public',
        requestContext: getRequestContext(request),
        clientMessage: 'Could not record your submission. Please try again or email hello@wellsonyx.com.',
      });
    }

    // Audit event. Email DOMAIN only — conservative even though business
    // contact info isn't PHI. The full row is available to admins at
    // /admin/signups for review.
    const emailDomain = body.primary_contact_email.split('@')[1] ?? null;
    logAuditEvent(
      null,
      'signup_received',
      'public',
      {
        legal_name: body.legal_name,
        primary_contact_email_domain: emailDomain,
        estimated_members: body.estimated_members ?? null,
        existing_tpa_system_provided: !!body.existing_tpa_system,
      },
      getRequestContext(request),
    ).catch(() => { /* already logged inside logAuditEvent */ });

    return NextResponse.json(
      {
        success: true,
        message:
          "Thanks — we've received your submission. Our team will be in touch within one business day.",
      },
      { status: 201 },
    );
  } catch (err) {
    return apiError(err, {
      operation: 'signup_tpa_submit',
      actor: 'public',
      requestContext: getRequestContext(request),
    });
  }
}
