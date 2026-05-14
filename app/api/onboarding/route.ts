import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logAuditEvent } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { nextIncompleteStep, type OnboardingData } from '@/lib/onboarding/types';
import { sendKickoffInvite } from '@/lib/notifications/kickoff-invite';

export const dynamic = 'force-dynamic';

/**
 * Onboarding wizard read/write endpoint.
 *
 * Authenticated by the signed-in TPA session (via cookies). The signup
 * row is looked up by the `signup_id` on user_metadata that was stamped
 * by `provisionTpaUserAndMagicLink`. This means the endpoint does NOT
 * require admin role — it's the TPA's self-serve onboarding.
 *
 * GET — returns the current onboarding payload + status.
 * PATCH — merges the supplied step data into onboarding_data and bumps
 *         status to `in_progress` (or `completed` if the caller passes
 *         `{ complete: true }` AND all steps have content).
 *
 * Demo mode: returns/accepts an empty/echoed payload so the wizard UI
 * can be exercised in local development.
 */

interface PatchBody {
  /** Partial onboarding data to merge into the existing blob. */
  data?: Partial<OnboardingData>;
  /** When true, attempt to mark the wizard complete. Rejected if any step is empty. */
  complete?: boolean;
}

async function resolveSignupForUser(): Promise<
  | { signupId: string; userEmail: string; demo: false }
  | { demo: true; signupId: string; userEmail: string }
  | { error: NextResponse }
> {
  if (isDemoMode()) {
    return { demo: true, signupId: 'demo-signup', userEmail: 'demo@vantaum.test' };
  }

  const supabase = await createServerClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return { error: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) };
  }
  const user = userData.user;
  const meta = (user.user_metadata ?? {}) as { signup_id?: unknown };
  const signupId = typeof meta.signup_id === 'string' ? meta.signup_id : null;
  if (!signupId) {
    return {
      error: NextResponse.json(
        { error: 'No signup linked to this user. Contact your Delivery Lead.' },
        { status: 403 },
      ),
    };
  }
  return { signupId, userEmail: user.email ?? '(no-email)', demo: false };
}

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 120 });
    if (rateLimited) return rateLimited;

    const resolved = await resolveSignupForUser();
    if ('error' in resolved) return resolved.error;

    if (resolved.demo) {
      return NextResponse.json({
        signup_id: resolved.signupId,
        status: 'in_progress',
        data: {},
        next_step: 'brand',
      });
    }

    const supabase = getServiceClient();
    const { data: signup, error } = await supabase
      .from('signup_requests')
      .select('id, onboarding_status, onboarding_data, legal_name')
      .eq('id', resolved.signupId)
      .single();

    if (error) {
      return apiError(error, {
        operation: 'onboarding_load',
        actor: resolved.userEmail,
        requestContext: getRequestContext(request),
      });
    }

    const data = (signup.onboarding_data ?? {}) as OnboardingData;
    return NextResponse.json({
      signup_id: signup.id,
      legal_name: signup.legal_name,
      status: signup.onboarding_status,
      data,
      next_step: nextIncompleteStep(data),
    });
  } catch (err) {
    return apiError(err, {
      operation: 'onboarding_load',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const resolved = await resolveSignupForUser();
    if ('error' in resolved) return resolved.error;

    const body = (await request.json().catch(() => ({}))) as PatchBody;

    if (resolved.demo) {
      return NextResponse.json({
        success: true,
        demo: true,
        status: body.complete ? 'completed' : 'in_progress',
        data: body.data ?? {},
      });
    }

    const supabase = getServiceClient();
    // Read current blob to merge.
    const { data: current, error: readErr } = await supabase
      .from('signup_requests')
      .select('onboarding_data, onboarding_status, onboarding_started_at')
      .eq('id', resolved.signupId)
      .single();
    if (readErr) {
      return apiError(readErr, {
        operation: 'onboarding_save_read',
        actor: resolved.userEmail,
        requestContext: getRequestContext(request),
      });
    }

    const existing = (current.onboarding_data ?? {}) as OnboardingData;
    const merged: OnboardingData = { ...existing };
    if (body.data) {
      // Per-step merge — replacing a step replaces all of its fields, but
      // other steps stay intact. Keeps the write semantics predictable.
      for (const [step, value] of Object.entries(body.data) as Array<[keyof OnboardingData, OnboardingData[keyof OnboardingData]]>) {
        if (value && typeof value === 'object') {
          merged[step] = { ...(existing[step] ?? {}), ...value } as OnboardingData[typeof step];
        }
      }
    }

    const now = new Date().toISOString();
    let newStatus = current.onboarding_status as 'not_started' | 'in_progress' | 'completed';
    let completedAt: string | null = null;

    if (body.complete) {
      const next = nextIncompleteStep(merged);
      if (next !== null) {
        return NextResponse.json(
          {
            error: `Cannot complete onboarding — step "${next}" is empty.`,
            next_step: next,
          },
          { status: 400 },
        );
      }
      newStatus = 'completed';
      completedAt = now;
    } else if (newStatus === 'not_started') {
      newStatus = 'in_progress';
    }

    const updatePayload: Record<string, unknown> = {
      onboarding_data: merged,
      onboarding_status: newStatus,
    };
    if (!current.onboarding_started_at) {
      // newStatus is always in_progress or completed at this point — we
      // bump on the first save, full stop.
      updatePayload.onboarding_started_at = now;
    }
    if (completedAt) {
      updatePayload.onboarding_completed_at = completedAt;
    }

    const { data: updated, error: updateErr } = await supabase
      .from('signup_requests')
      .update(updatePayload)
      .eq('id', resolved.signupId)
      .select('id, onboarding_status, onboarding_data')
      .single();

    if (updateErr) {
      return apiError(updateErr, {
        operation: 'onboarding_save_write',
        actor: resolved.userEmail,
        requestContext: getRequestContext(request),
      });
    }

    await logAuditEvent(
      null,
      body.complete ? 'onboarding_completed' : 'onboarding_step_saved',
      resolved.userEmail,
      {
        signup_id: resolved.signupId,
        status: newStatus,
        steps_present: Object.keys(merged),
      },
      getRequestContext(request),
    );

    // Fire-and-forget the kickoff calendar invite on completion. A failed
    // send must not block the onboarding response — the helper is
    // idempotent (tracks invite_sent_at on onboarding_data.kickoff) so a
    // future retry endpoint can re-attempt safely.
    if (body.complete && newStatus === 'completed') {
      sendKickoffInvite(resolved.signupId, { actor: resolved.userEmail }).catch(
        (err) => {
          console.warn('[onboarding] kickoff invite send failed', err);
        },
      );
    }

    return NextResponse.json({
      success: true,
      status: updated.onboarding_status,
      data: updated.onboarding_data,
      next_step: nextIncompleteStep((updated.onboarding_data ?? {}) as OnboardingData),
    });
  } catch (err) {
    return apiError(err, {
      operation: 'onboarding_save',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
