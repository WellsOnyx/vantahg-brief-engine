import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase';
import { createServerClient } from '@/lib/supabase-server';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logAuditEvent } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { provisionTpaUserAndMagicLink } from '@/lib/contracts/client-onboarding';
import { getApprovedTpaAccess } from '@/lib/auth/tpa-access';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tpa/practices/[id]/invite
 *
 * TPA admin invites a user to join a practice. Creates the auth user
 * (if not already present), generates a magic link to /portal/provider,
 * and inserts a practice_users row.
 *
 * Reuses provisionTpaUserAndMagicLink from contract onboarding so the
 * auth provisioning path is identical to a TPA signup.
 */

const Schema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100).optional(),
  role: z.enum(['admin', 'staff']).default('staff'),
});

async function resolveTpa(): Promise<{ id: string; email: string } | null> {
  const ssr = await createServerClient();
  const { data: userData } = await ssr.auth.getUser();
  if (!userData?.user?.email) return null;

  // Use the canonical Item 9 / approved-TPA gate (single source of truth,
  // includes future contract/revocation checks when column lands).
  const access = await getApprovedTpaAccess(userData.user.email, userData.user.email);
  if ('status' in access) return null;

  return { id: access.clientId, email: access.email };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 20 });
    if (rateLimited) return rateLimited;

    const { id: practiceId } = await params;
    const raw = await request.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'email and role required', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const body = parsed.data;

    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        demo: true,
        message: `Invite sent to ${body.email} (demo mode - no real email).`,
      });
    }

    const tpa = await resolveTpa();
    if (!tpa) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getServiceClient();

    // Verify the practice belongs to the inviting TPA - prevent
    // cross-tenant invite injection.
    const { data: practice, error: prErr } = await supabase
      .from('practices')
      .select('id, name, client_id')
      .eq('id', practiceId)
      .single();
    if (prErr || !practice) {
      return NextResponse.json({ error: 'Practice not found' }, { status: 404 });
    }
    if (practice.client_id !== tpa.id) {
      await logAuditEvent(null, 'security:cross_tenant_practice_invite_blocked', tpa.email, {
        attempted_practice_id: practiceId,
        attempted_email_domain: body.email.split('@')[1] ?? null,
      }, getRequestContext(request));
      return NextResponse.json({ error: 'Practice does not belong to your tenant' }, { status: 403 });
    }

    // Provision the auth user + magic link. Redirect lands them at
    // /portal/provider after the click.
    const siteUrl =
      (typeof process.env.NEXT_PUBLIC_SITE_URL === 'string' && process.env.NEXT_PUBLIC_SITE_URL) ||
      (typeof process.env.VERCEL_URL === 'string' && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://app.vantaum.com');

    const provision = await provisionTpaUserAndMagicLink(
      supabase,
      {
        email: body.email,
        fullName: body.name ?? null,
        clientId: tpa.id,
        signupId: `practice-invite-${practice.id}`,
        redirectPath: '/portal/provider',
      },
      siteUrl,
    );

    if (!provision.userId) {
      return NextResponse.json(
        { error: provision.error ?? 'Could not provision user' },
        { status: 500 },
      );
    }

    // Link the user to the practice. UNIQUE constraint catches duplicates.
    const { error: linkErr } = await supabase
      .from('practice_users')
      .insert({
        practice_id: practice.id,
        user_id: provision.userId,
        role: body.role,
        invited_by: tpa.email,
      });

    if (linkErr && !linkErr.message.toLowerCase().includes('unique')) {
      return apiError(linkErr, {
        operation: 'practice_invite_link',
        actor: tpa.email,
        requestContext: getRequestContext(request),
      });
    }

    await logAuditEvent(null, 'practice_user_invited', tpa.email, {
      practice_id: practice.id,
      practice_name: practice.name,
      invited_email_domain: body.email.split('@')[1] ?? null,
      role: body.role,
      magic_link_generated: !!provision.magicLink,
    }, getRequestContext(request));

    return NextResponse.json({
      success: true,
      message: `Invited ${body.email} as ${body.role}. Magic link emailed.`,
      // We don't return the magic link itself - it's a credential.
    });
  } catch (err) {
    return apiError(err, {
      operation: 'practice_invite',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
