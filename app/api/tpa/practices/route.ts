import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase';
import { createServerClient } from '@/lib/supabase-server';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logAuditEvent } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/tpa/practices  — list practices for the current TPA
 * POST /api/tpa/practices  — create a new practice in the current TPA's network
 *
 * Both require the user to be a TPA-side user (role='client') whose
 * client tenant is resolvable via clients.contact_email = user.email.
 */

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  npi: z.string().regex(/^\d{10}$/).optional().or(z.literal('')),
  tax_id: z.string().max(50).optional(),
  specialty: z.string().max(100).optional(),
  address_street: z.string().max(200).optional(),
  address_city: z.string().max(100).optional(),
  address_state: z.string().length(2).optional().or(z.literal('')),
  address_zip: z.string().max(10).optional(),
  phone: z.string().max(30).optional(),
  fax: z.string().max(30).optional(),
  estimated_weekly_auths: z.number().int().nonnegative().max(10_000).optional(),
});

async function resolveTpa(): Promise<{ id: string; email: string } | null> {
  const ssr = await createServerClient();
  const { data: userData } = await ssr.auth.getUser();
  if (!userData?.user?.email) return null;
  const supabase = getServiceClient();
  const { data: tpa } = await supabase
    .from('clients')
    .select('id')
    .eq('contact_email', userData.user.email)
    .maybeSingle();
  if (!tpa) return null;
  return { id: tpa.id, email: userData.user.email };
}

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 120 });
    if (rateLimited) return rateLimited;

    if (isDemoMode()) {
      return NextResponse.json({
        practices: [
          { id: 'demo-p-1', name: 'Suncoast Orthopedic', specialty: 'Orthopedic', estimated_weekly_auths: 35, active: true },
          { id: 'demo-p-2', name: 'Tampa Family Medicine', specialty: 'Primary Care', estimated_weekly_auths: 22, active: true },
        ],
      });
    }

    const tpa = await resolveTpa();
    if (!tpa) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('practices')
      .select('id, name, npi, specialty, address_city, address_state, phone, estimated_weekly_auths, active, created_at')
      .eq('client_id', tpa.id)
      .order('name', { ascending: true });

    if (error) {
      return apiError(error, {
        operation: 'list_practices',
        actor: tpa.email,
        requestContext: getRequestContext(request),
      });
    }
    return NextResponse.json({ practices: data ?? [] });
  } catch (err) {
    return apiError(err, {
      operation: 'list_practices',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    if (isDemoMode()) {
      return NextResponse.json({ success: true, demo: true, practice_id: 'demo-new' });
    }

    const tpa = await resolveTpa();
    if (!tpa) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const raw = await request.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid practice data', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const supabase = getServiceClient();
    const { data: created, error } = await supabase
      .from('practices')
      .insert({
        client_id: tpa.id,
        name: body.name,
        npi: body.npi || null,
        tax_id: body.tax_id || null,
        specialty: body.specialty || null,
        address_street: body.address_street || null,
        address_city: body.address_city || null,
        address_state: body.address_state || null,
        address_zip: body.address_zip || null,
        phone: body.phone || null,
        fax: body.fax || null,
        estimated_weekly_auths: body.estimated_weekly_auths ?? 0,
        active: true,
      })
      .select('id, name')
      .single();

    if (error || !created) {
      return apiError(error ?? new Error('Insert returned no row'), {
        operation: 'create_practice',
        actor: tpa.email,
        requestContext: getRequestContext(request),
      });
    }

    await logAuditEvent(null, 'practice_created', tpa.email, {
      practice_id: created.id,
      client_id: tpa.id,
      practice_name: created.name,
    }, getRequestContext(request));

    return NextResponse.json({ success: true, practice_id: created.id, name: created.name });
  } catch (err) {
    return apiError(err, {
      operation: 'create_practice',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
