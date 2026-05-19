import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { generateBriefForCase, persistBriefResult } from '@/lib/generate-brief';
import { autoAssignReviewer } from '@/lib/assignment-engine';
import { notifyCaseAssigned } from '@/lib/notifications';
import { assignToPod } from '@/lib/pod-assignment-engine';
import { notifyLpnCaseAssigned, notifyIntakeConfirmation } from '@/lib/notifications';
import { isDemoMode, getDemoCases } from '@/lib/demo-mode';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import {
  computeSubmissionFingerprint,
  findDuplicateCase,
} from '@/lib/intake/efax/storage';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;
    const { searchParams } = new URL(request.url);

    if (isDemoMode()) {
      const cases = getDemoCases({
        status: searchParams.get('status'),
        vertical: searchParams.get('vertical'),
        service_category: searchParams.get('service_category'),
        priority: searchParams.get('priority'),
        review_type: searchParams.get('review_type'),
        assigned_reviewer_id: searchParams.get('assigned_reviewer_id'),
        date_from: searchParams.get('date_from'),
        date_to: searchParams.get('date_to'),
        search: searchParams.get('search'),
      });
      return NextResponse.json(cases);
    }

    const supabase = getServiceClient();

    const status = searchParams.get('status');
    const vertical = searchParams.get('vertical');
    const serviceCategory = searchParams.get('service_category');
    const priority = searchParams.get('priority');
    const reviewType = searchParams.get('review_type');
    const assignedReviewerId = searchParams.get('assigned_reviewer_id');
    const clientId = searchParams.get('client_id');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const search = searchParams.get('search');

    let query = supabase
      .from('cases')
      .select('*, reviewer:reviewers(*), client:clients(*)')
      .order('created_at', { ascending: false });

    // Item 13: Enforce tenant scoping for TPA (client) users
    if (authResult.user.role === 'client') {
      // Resolve the user's actual client
      const { data: clientRow } = await supabase
        .from('clients')
        .select('id')
        .eq('contact_email', authResult.user.email)
        .maybeSingle();

      if (clientRow) {
        query = query.eq('client_id', clientRow.id);
      } else {
        // No client linked → return empty list
        return NextResponse.json([]);
      }
    } else if (clientId) {
      // Internal staff can still filter by client_id
      query = query.eq('client_id', clientId);
    }

    if (serviceCategory) {
      query = query.eq('service_category', serviceCategory);
    }

    if (vertical) {
      query = query.eq('vertical', vertical);
    }

    if (priority) {
      query = query.eq('priority', priority);
    }

    if (reviewType) {
      query = query.eq('review_type', reviewType);
    }

    if (assignedReviewerId) {
      query = query.eq('assigned_reviewer_id', assignedReviewerId);
    }

    if (dateFrom) {
      query = query.gte('created_at', new Date(dateFrom).toISOString());
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      query = query.lte('created_at', to.toISOString());
    }

    if (search) {
      query = query.or(
        `case_number.ilike.%${search}%,patient_name.ilike.%${search}%,patient_member_id.ilike.%${search}%,procedure_description.ilike.%${search}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      return apiError(error, {
        operation: 'list_cases',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    return apiError(err, {
      operation: 'list_cases',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const supabase = getServiceClient();
    const body = await request.json();

    // === Item 12: Proper tenant scoping on case creation ===
    let effectiveClientId = body.client_id;
    let effectivePracticeId = body.practice_id || null;

    if (authResult.user.role === 'client') {
      // TPA users: force their own client and validate practice
      const { data: clientRow, error: clientErr } = await supabase
        .from('clients')
        .select('id')
        .eq('contact_email', authResult.user.email)
        .maybeSingle();

      if (clientErr || !clientRow) {
        return NextResponse.json(
          { error: 'No approved client tenant associated with your account' },
          { status: 403 }
        );
      }

      effectiveClientId = clientRow.id;

      if (effectivePracticeId) {
        const { data: practice } = await supabase
          .from('practices')
          .select('id, client_id')
          .eq('id', effectivePracticeId)
          .single();

        if (!practice || practice.client_id !== effectiveClientId) {
          return NextResponse.json(
            { error: 'Selected practice does not belong to your organization' },
            { status: 403 }
          );
        }
      }
    } else {
      // Internal staff (admin, reviewer, etc.): validate that the provided client exists
      if (effectiveClientId) {
        const { data: clientExists } = await supabase
          .from('clients')
          .select('id')
          .eq('id', effectiveClientId)
          .maybeSingle();

        if (!clientExists) {
          return NextResponse.json({ error: 'Invalid client_id' }, { status: 400 });
        }
      }
    }

    // Generate case_number based on service_category (or fall back to vertical for backward compat)
    const categoryPrefix = (body.service_category || body.vertical || 'GENERAL').toUpperCase().replace(/\s+/g, '-');
    const prefix = `VUM-${categoryPrefix}`;

    const { count, error: countError } = await supabase
      .from('cases')
      .select('*', { count: 'exact', head: true })
      .ilike('case_number', `${prefix}-%`);

    if (countError) {
      return apiError(countError, {
        operation: 'create_case_count',
        actor: body.created_by || authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    const nextNumber = ((count ?? 0) + 1).toString().padStart(4, '0');
    const caseNumber = `${prefix}-${nextNumber}`;

    // Generate authorization number
    const authNumber = `AUTH-${new Date().getFullYear()}-${nextNumber}`;

    // Cross-channel dedup: same patient + procedure codes within 24h returns
    // the existing case rather than a new one. The fingerprint is also
    // persisted on the row so the eFax worker (and any future channel) can
    // dedupe against portal-submitted cases too.
    const fingerprint = computeSubmissionFingerprint({
      patient_name: body.patient_name ?? null,
      patient_dob: body.patient_dob ?? null,
      patient_member_id: body.patient_member_id ?? null,
      procedure_codes: Array.isArray(body.procedure_codes) ? body.procedure_codes : [],
      from_number: null,
    });

    if (fingerprint) {
      const duplicate = await findDuplicateCase(fingerprint);
      if (duplicate) {
        await logAuditEvent(duplicate.case_id, 'portal_intake_duplicate_detected', body.created_by || authResult.user.email, {
          existing_case_number: duplicate.case_number,
          existing_age_hours: Math.round(duplicate.age_hours * 10) / 10,
        }, getRequestContext(request));
        return NextResponse.json(
          {
            duplicate: true,
            case_id: duplicate.case_id,
            case_number: duplicate.case_number,
            authorization_number: duplicate.authorization_number,
            message: `Duplicate of case submitted ${Math.round(duplicate.age_hours * 10) / 10}h ago`,
          },
          { status: 409 },
        );
      }
    }

    const caseData = {
      ...body,
      client_id: effectiveClientId,
      practice_id: effectivePracticeId,
      case_number: caseNumber,
      status: body.status || 'intake',
      authorization_number: authNumber,
      intake_channel: body.intake_channel || 'portal',
      intake_confirmation_sent: false,
      submission_fingerprint: fingerprint,
    };

    const { data, error } = await supabase
      .from('cases')
      .insert(caseData)
      .select('*, reviewer:reviewers(*), client:clients(*)')
      .single();

    if (error) {
      return apiError(error, {
        operation: 'create_case_insert',
        actor: body.created_by || authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Log audit event for case creation
    await logAuditEvent(data.id, 'case_created', body.created_by || 'system', {
      case_number: caseNumber,
      service_category: body.service_category,
      vertical: body.vertical,
      client_id: effectiveClientId,
      practice_id: effectivePracticeId,
      submitted_by_role: authResult.user.role,
    });

    // Send intake confirmation to provider
    if (body.requesting_provider) {
      notifyIntakeConfirmation(data.id, caseNumber, authNumber, body.requesting_provider).catch(console.error);
      // Mark confirmation sent
      supabase.from('cases').update({ intake_confirmation_sent: true }).eq('id', data.id).then(() => {});
    }

    // Trigger brief generation in the background (non-blocking, with client criteria context)
    generateBriefForCase(data, { client: data.client ?? null }).then(async (result) => {
      if (result) {
        // Centralized persistence guarantees fact_check always travels with ai_brief
        await persistBriefResult(data.id, result, supabase, {
          generatedFrom: 'case_create',
        });

        // Assign to pod (LPN → RN → MD nursing tier workflow)
        const podResult = await assignToPod(data.id);
        if (podResult.assigned && podResult.lpnId && podResult.podName) {
          notifyLpnCaseAssigned(data.id, podResult.lpnId, caseNumber, podResult.podName).catch(console.error);
        } else {
          // Fallback: if no pod available, assign directly to physician
          const assignment = await autoAssignReviewer(data.id);
          if (assignment.assigned && assignment.reviewerId) {
            notifyCaseAssigned(data.id, assignment.reviewerId).catch(console.error);
          }
        }
      }
    }).catch((err) => {
      // Background brief generation runs independently of the create response.
      // We log a PHI-safe audit entry rather than echoing err.message to
      // server logs. Common cause: real Anthropic disabled — the case still
      // exists and a reviewer can regenerate later.
      const errorKind = err instanceof Error ? err.name : typeof err;
      logAuditEvent(data.id, 'background_brief_generation_failed', 'system', {
        error_kind: errorKind,
      }).catch(() => { /* already logged inside logAuditEvent */ });
    });

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return apiError(err, {
      operation: 'create_case',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
