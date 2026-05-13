import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { createServerClient } from '@/lib/supabase-server';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * GET /api/provider/me
 *
 * Returns the current provider user's practice + the TPA that practice
 * is contracted with + that practice's case stats.
 *
 * Access: user is linked to at least one practice via practice_users.
 * If user is linked to multiple practices, returns the first one
 * (V2: practice picker UI for multi-practice users).
 */

const DEMO = {
  practice: {
    id: 'demo-p-1',
    name: 'Suncoast Orthopedic',
    specialty: 'Orthopedic',
    address: '1234 Bayshore Blvd, Tampa, FL 33606',
    phone: '(813) 555-0142',
  },
  tpa: { id: 'demo-c-1', name: 'Acme TPA' },
  role: 'admin' as const,
  case_counts: { total: 8, active: 3, this_month: 12 },
};

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 120 });
    if (rateLimited) return rateLimited;

    if (isDemoMode()) {
      return NextResponse.json(DEMO);
    }

    const ssr = await createServerClient();
    const { data: userData, error: userErr } = await ssr.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const supabase = getServiceClient();

    // Find the first practice this user is linked to.
    const { data: link, error: linkErr } = await supabase
      .from('practice_users')
      .select('practice_id, role')
      .eq('user_id', userData.user.id)
      .order('invited_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (linkErr) {
      return apiError(linkErr, {
        operation: 'provider_me_link',
        actor: userData.user.email ?? '(unknown)',
        requestContext: getRequestContext(request),
      });
    }
    if (!link) {
      return NextResponse.json(
        { error: 'Your account is not linked to a practice. The TPA you work with needs to invite you.' },
        { status: 403 },
      );
    }

    const { data: practice, error: prErr } = await supabase
      .from('practices')
      .select('id, name, specialty, address_street, address_city, address_state, address_zip, phone, client_id')
      .eq('id', link.practice_id)
      .single();

    if (prErr || !practice) {
      return apiError(prErr ?? new Error('Practice not found'), {
        operation: 'provider_me_practice',
        actor: userData.user.email ?? '(unknown)',
        requestContext: getRequestContext(request),
      });
    }

    const { data: tpa } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', practice.client_id)
      .maybeSingle();

    // Case stats scoped to this practice.
    const ACTIVE_STATUSES = ['intake', 'processing', 'brief_ready', 'lpn_review', 'rn_review', 'md_review', 'pend_missing_info'];
    const { count: totalCount } = await supabase
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .eq('practice_id', practice.id);
    const { count: activeCount } = await supabase
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .eq('practice_id', practice.id)
      .in('status', ACTIVE_STATUSES);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const { count: monthCount } = await supabase
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .eq('practice_id', practice.id)
      .gte('created_at', monthStart.toISOString());

    const addressParts = [practice.address_street, practice.address_city, practice.address_state, practice.address_zip].filter(Boolean);

    return NextResponse.json({
      practice: {
        id: practice.id,
        name: practice.name,
        specialty: practice.specialty,
        address: addressParts.length ? addressParts.join(', ') : null,
        phone: practice.phone,
      },
      tpa: tpa ?? null,
      role: link.role,
      case_counts: {
        total: totalCount ?? 0,
        active: activeCount ?? 0,
        this_month: monthCount ?? 0,
      },
    });
  } catch (err) {
    return apiError(err, {
      operation: 'provider_me',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
