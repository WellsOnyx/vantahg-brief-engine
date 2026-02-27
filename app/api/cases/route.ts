import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { generateBriefForCase } from '@/lib/generate-brief';
import { autoAssignReviewer } from '@/lib/assignment-engine';
import { notifyCaseAssigned } from '@/lib/notifications';
import { isDemoMode, getDemoCases } from '@/lib/demo-mode';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';

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

    if (status) {
      query = query.eq('status', status);
    }

    if (clientId) {
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('Error fetching cases:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
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

    // Generate case_number based on service_category (or fall back to vertical for backward compat)
    const categoryPrefix = (body.service_category || body.vertical || 'GENERAL').toUpperCase().replace(/\s+/g, '-');
    const prefix = `VHG-${categoryPrefix}`;

    const { count, error: countError } = await supabase
      .from('cases')
      .select('*', { count: 'exact', head: true })
      .ilike('case_number', `${prefix}-%`);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    const nextNumber = ((count ?? 0) + 1).toString().padStart(4, '0');
    const caseNumber = `${prefix}-${nextNumber}`;

    const caseData = {
      ...body,
      case_number: caseNumber,
      status: body.status || 'intake',
    };

    const { data, error } = await supabase
      .from('cases')
      .insert(caseData)
      .select('*, reviewer:reviewers(*), client:clients(*)')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log audit event for case creation
    await logAuditEvent(data.id, 'case_created', body.created_by || 'system', {
      case_number: caseNumber,
      service_category: body.service_category,
      vertical: body.vertical,
    });

    // Trigger brief generation in the background (non-blocking)
    generateBriefForCase(data).then(async (brief) => {
      if (brief) {
        await supabase
          .from('cases')
          .update({
            ai_brief: brief,
            ai_brief_generated_at: new Date().toISOString(),
            status: 'brief_ready',
          })
          .eq('id', data.id);

        await logAuditEvent(data.id, 'brief_generated', 'system', {
          generated_automatically: true,
        });

        // Auto-assign a reviewer now that the brief is ready
        const assignment = await autoAssignReviewer(data.id);
        if (assignment.assigned && assignment.reviewerId) {
          notifyCaseAssigned(data.id, assignment.reviewerId).catch(console.error);
        }
      }
    }).catch((err) => {
      console.error('Background brief generation failed:', err);
    });

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('Error creating case:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
