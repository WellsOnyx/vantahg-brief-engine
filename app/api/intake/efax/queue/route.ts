/**
 * /api/intake/efax/queue
 *
 * CSR triage API for the eFax queue. Supports:
 *   GET  - Query efax_queue rows with status filters (manual_review, dead_letter)
 *   PATCH - Update a row: change status, edit extracted_data, promote to case, reject
 *
 * In demo mode, returns realistic stub data. In production, queries Supabase.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent } from '@/lib/audit';
import { applyRateLimit } from '@/lib/rate-limit-middleware';

export const dynamic = 'force-dynamic';

// ── Demo data ─────────────────────────────────────────────────────────────

interface DemoQueueRow {
  id: string;
  created_at: string;
  fax_id: string;
  from_number: string | null;
  to_number: string | null;
  page_count: number;
  status: string;
  needs_manual_review: boolean;
  manual_review_reasons: string[];
  extracted_data: Record<string, unknown> | null;
  case_id: string | null;
  ocr_confidence: number | null;
  extraction_method: string | null;
  extraction_model: string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  authorization_number: string | null;
  provider: string;
}

function getDemoQueueItems(): DemoQueueRow[] {
  return [
    {
      id: 'triage-demo-001',
      created_at: '2026-04-13T06:22:00Z',
      fax_id: 'FAX-20260413-001',
      from_number: '+14155551234',
      to_number: '+18005551111',
      page_count: 3,
      status: 'manual_review',
      needs_manual_review: true,
      manual_review_reasons: ['Low OCR confidence', 'Patient name not extracted'],
      extracted_data: {
        patient_name: null,
        patient_dob: '1978-06-15',
        patient_member_id: 'BCA-9921034',
        patient_gender: 'Male',
        requesting_provider: 'Dr. Angela Torres, MD',
        requesting_provider_npi: '1234567890',
        requesting_provider_specialty: 'Orthopedic Surgery',
        requesting_provider_fax: '+14155551234',
        requesting_provider_phone: '+14155551230',
        procedure_codes: ['27447'],
        diagnosis_codes: ['M17.11'],
        procedure_description: 'Total knee arthroplasty, right knee',
        service_category: 'surgery',
        review_type: 'prior_auth',
        priority: 'standard',
        facility_name: 'Bay Area Orthopedic Center',
        facility_type: 'outpatient',
        payer_name: 'Blue Cross Advantage',
        plan_type: 'PPO',
        confidence: 42,
        needs_manual_review: true,
        manual_review_reasons: ['Low OCR confidence', 'Patient name not extracted'],
      },
      case_id: null,
      ocr_confidence: 38,
      extraction_method: 'ai',
      extraction_model: 'claude-opus-4-6',
      attempts: 1,
      max_attempts: 5,
      last_error: null,
      authorization_number: 'VUM-20260413-0001',
      provider: 'phaxio',
    },
    {
      id: 'triage-demo-002',
      created_at: '2026-04-13T04:15:00Z',
      fax_id: 'FAX-20260413-002',
      from_number: '+13105559876',
      to_number: '+18005551111',
      page_count: 1,
      status: 'manual_review',
      needs_manual_review: true,
      manual_review_reasons: ['No procedure codes found', 'Blended confidence below 75'],
      extracted_data: {
        patient_name: 'James R. Whitfield',
        patient_dob: '1955-11-02',
        patient_member_id: null,
        patient_gender: 'Male',
        requesting_provider: 'Unknown Provider',
        requesting_provider_npi: null,
        requesting_provider_specialty: null,
        requesting_provider_fax: '+13105559876',
        requesting_provider_phone: null,
        procedure_codes: [],
        diagnosis_codes: ['G47.33'],
        procedure_description: null,
        service_category: null,
        review_type: 'prior_auth',
        priority: 'standard',
        facility_name: null,
        facility_type: null,
        payer_name: 'Aetna',
        plan_type: null,
        confidence: 55,
        needs_manual_review: true,
        manual_review_reasons: ['No procedure codes found', 'Blended confidence below 75'],
      },
      case_id: null,
      ocr_confidence: 62,
      extraction_method: 'ai',
      extraction_model: 'claude-opus-4-6',
      attempts: 1,
      max_attempts: 5,
      last_error: null,
      authorization_number: 'VUM-20260413-0002',
      provider: 'phaxio',
    },
    {
      id: 'triage-demo-003',
      created_at: '2026-04-12T22:45:00Z',
      fax_id: 'FAX-20260412-007',
      from_number: '+12125554567',
      to_number: '+18005551111',
      page_count: 8,
      status: 'manual_review',
      needs_manual_review: true,
      manual_review_reasons: ['Multiple patients detected on fax', 'Ambiguous procedure codes'],
      extracted_data: {
        patient_name: 'Linda M. Chen',
        patient_dob: '1969-03-22',
        patient_member_id: 'UHC-8830021',
        patient_gender: 'Female',
        requesting_provider: 'Dr. Kevin Park, MD',
        requesting_provider_npi: '9876543210',
        requesting_provider_specialty: 'Cardiology',
        requesting_provider_fax: '+12125554567',
        requesting_provider_phone: '+12125554560',
        procedure_codes: ['93306', '93320'],
        diagnosis_codes: ['I25.10', 'I10'],
        procedure_description: 'Transthoracic echocardiogram with Doppler',
        service_category: 'cardiology',
        review_type: 'prior_auth',
        priority: 'urgent',
        facility_name: 'Manhattan Heart Institute',
        facility_type: 'outpatient',
        payer_name: 'UnitedHealthcare',
        plan_type: 'HMO',
        confidence: 72,
        needs_manual_review: true,
        manual_review_reasons: ['Multiple patients detected on fax', 'Ambiguous procedure codes'],
      },
      case_id: null,
      ocr_confidence: 85,
      extraction_method: 'ai',
      extraction_model: 'claude-opus-4-6',
      attempts: 1,
      max_attempts: 5,
      last_error: null,
      authorization_number: 'VUM-20260412-0007',
      provider: 'phaxio',
    },
    {
      id: 'triage-demo-004',
      created_at: '2026-04-12T15:30:00Z',
      fax_id: 'FAX-20260412-004',
      from_number: '+16505553210',
      to_number: '+18005551111',
      page_count: 2,
      status: 'dead_letter',
      needs_manual_review: true,
      manual_review_reasons: ['Max retries exceeded', 'OCR returned empty text'],
      extracted_data: null,
      case_id: null,
      ocr_confidence: 0,
      extraction_method: null,
      extraction_model: null,
      attempts: 5,
      max_attempts: 5,
      last_error: 'OCR returned empty response after 5 attempts. Document may be blank or image-only PDF without text layer.',
      authorization_number: 'VUM-20260412-0004',
      provider: 'phaxio',
    },
    {
      id: 'triage-demo-005',
      created_at: '2026-04-11T11:00:00Z',
      fax_id: 'FAX-20260411-002',
      from_number: '+18585557890',
      to_number: '+18005551111',
      page_count: 5,
      status: 'dead_letter',
      needs_manual_review: true,
      manual_review_reasons: ['AI extraction failed repeatedly', 'Regex fallback also failed'],
      extracted_data: {
        patient_name: 'R. Thompson',
        patient_dob: null,
        patient_member_id: null,
        patient_gender: null,
        requesting_provider: null,
        requesting_provider_npi: null,
        requesting_provider_specialty: null,
        requesting_provider_fax: '+18585557890',
        requesting_provider_phone: null,
        procedure_codes: [],
        diagnosis_codes: [],
        procedure_description: null,
        service_category: null,
        review_type: null,
        priority: 'standard',
        facility_name: null,
        facility_type: null,
        payer_name: null,
        plan_type: null,
        confidence: 15,
        needs_manual_review: true,
        manual_review_reasons: ['AI extraction failed repeatedly', 'Regex fallback also failed'],
      },
      case_id: null,
      ocr_confidence: 28,
      extraction_method: 'regex_fallback',
      extraction_model: null,
      attempts: 5,
      max_attempts: 5,
      last_error: 'AI extraction error: Request timed out after 30s. Regex fallback extracted minimal data.',
      authorization_number: 'VUM-20260411-0002',
      provider: 'phaxio',
    },
    {
      id: 'triage-demo-006',
      created_at: '2026-04-13T07:10:00Z',
      fax_id: 'FAX-20260413-003',
      from_number: '+19165552345',
      to_number: '+18005551111',
      page_count: 4,
      status: 'manual_review',
      needs_manual_review: true,
      manual_review_reasons: ['Blended confidence below 75'],
      extracted_data: {
        patient_name: 'Patricia Anne Delgado',
        patient_dob: '1988-09-14',
        patient_member_id: 'CIG-7720145',
        patient_gender: 'Female',
        requesting_provider: 'Dr. Sarah Mitchell, DO',
        requesting_provider_npi: '5678901234',
        requesting_provider_specialty: 'Pain Management',
        requesting_provider_fax: '+19165552345',
        requesting_provider_phone: '+19165552340',
        procedure_codes: ['64483', '64484'],
        diagnosis_codes: ['M54.5', 'M51.16'],
        procedure_description: 'Lumbar epidural steroid injection, L4-L5 and L5-S1',
        service_category: 'pain_management',
        review_type: 'prior_auth',
        priority: 'standard',
        facility_name: 'Sacramento Pain & Spine Center',
        facility_type: 'asc',
        payer_name: 'Cigna',
        plan_type: 'PPO',
        confidence: 68,
        needs_manual_review: true,
        manual_review_reasons: ['Blended confidence below 75'],
      },
      case_id: null,
      ocr_confidence: 74,
      extraction_method: 'ai',
      extraction_model: 'claude-opus-4-6',
      attempts: 1,
      max_attempts: 5,
      last_error: null,
      authorization_number: 'VUM-20260413-0003',
      provider: 'phaxio',
    },
  ];
}

// ── GET handler ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 100 });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status'); // 'manual_review', 'dead_letter', or 'all'

    if (isDemoMode()) {
      let items = getDemoQueueItems();
      if (statusFilter && statusFilter !== 'all') {
        items = items.filter((item) => item.status === statusFilter);
      }
      const stats = {
        manual_review: getDemoQueueItems().filter((i) => i.status === 'manual_review').length,
        dead_letter: getDemoQueueItems().filter((i) => i.status === 'dead_letter').length,
        total: getDemoQueueItems().length,
        oldest_at: getDemoQueueItems().sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )[0]?.created_at || null,
      };
      return NextResponse.json({ items, stats });
    }

    const supabase = getServiceClient();
    let query = supabase
      .from('efax_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    } else {
      query = query.in('status', ['manual_review', 'dead_letter']);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = (data || []).map((row: Record<string, unknown>) => ({
      id: row.id,
      created_at: row.created_at,
      fax_id: row.fax_id,
      from_number: row.from_number,
      to_number: row.to_number,
      page_count: row.page_count,
      status: row.status,
      needs_manual_review: row.needs_manual_review,
      manual_review_reasons: row.manual_review_reasons || [],
      extracted_data: row.parsed_data,
      case_id: row.case_id,
      ocr_confidence: row.ocr_confidence,
      extraction_method: row.extraction_method,
      extraction_model: row.extraction_model,
      attempts: row.attempts,
      max_attempts: row.max_attempts,
      last_error: row.last_error,
      authorization_number: row.authorization_number,
      provider: row.provider || 'unknown',
    }));

    // Compute stats from all flagged rows
    const { data: statsData } = await supabase
      .from('efax_queue')
      .select('status, created_at')
      .in('status', ['manual_review', 'dead_letter'])
      .order('created_at', { ascending: true })
      .limit(500);

    const stats = {
      manual_review: (statsData || []).filter((r: Record<string, unknown>) => r.status === 'manual_review').length,
      dead_letter: (statsData || []).filter((r: Record<string, unknown>) => r.status === 'dead_letter').length,
      total: (statsData || []).length,
      oldest_at: (statsData || [])[0]?.created_at || null,
    };

    return NextResponse.json({ items, stats });
  } catch (err) {
    console.error('Error fetching triage queue:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── PATCH handler ─────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const { id, action, extracted_data, reject_reason } = body as {
      id: string;
      action: 'promote' | 'reject' | 'retry_ocr' | 'update_data';
      extracted_data?: Record<string, unknown>;
      reject_reason?: string;
    };

    if (!id || !action) {
      return NextResponse.json(
        { error: 'id and action are required' },
        { status: 400 },
      );
    }

    if (isDemoMode()) {
      // In demo mode, simulate the action
      const result: Record<string, unknown> = { success: true, demo: true, action };

      switch (action) {
        case 'promote':
          result.case_id = `demo-case-${Date.now()}`;
          result.case_number = `UM-DEMO-${Math.floor(1000 + Math.random() * 9000)}`;
          result.message = 'Case created from eFax (demo mode)';
          break;
        case 'reject':
          result.message = `eFax rejected: ${reject_reason || 'No reason provided'} (demo mode)`;
          break;
        case 'retry_ocr':
          result.message = 'eFax reset to received for re-processing (demo mode)';
          break;
        case 'update_data':
          result.message = 'Extracted data updated (demo mode)';
          break;
      }

      await logAuditEvent(null, `efax_triage_${action}`, 'csr', {
        efax_queue_id: id,
        demo: true,
      });

      return NextResponse.json(result);
    }

    const supabase = getServiceClient();

    // Fetch the current row
    const { data: row, error: fetchError } = await supabase
      .from('efax_queue')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !row) {
      return NextResponse.json(
        { error: 'Queue item not found' },
        { status: 404 },
      );
    }

    switch (action) {
      case 'promote': {
        // Create a case from the extracted data
        const data = extracted_data || row.parsed_data || {};
        const casePayload = {
          status: 'intake',
          priority: data.priority || 'standard',
          service_category: data.service_category || null,
          review_type: data.review_type || 'prior_auth',
          patient_name: data.patient_name || null,
          patient_dob: data.patient_dob || null,
          patient_member_id: data.patient_member_id || null,
          patient_gender: data.patient_gender || null,
          requesting_provider: data.requesting_provider || null,
          requesting_provider_npi: data.requesting_provider_npi || null,
          requesting_provider_specialty: data.requesting_provider_specialty || null,
          procedure_codes: data.procedure_codes || [],
          diagnosis_codes: data.diagnosis_codes || [],
          procedure_description: data.procedure_description || null,
          facility_name: data.facility_name || null,
          facility_type: data.facility_type || null,
          payer_name: data.payer_name || null,
          plan_type: data.plan_type || null,
          intake_channel: 'efax',
          vertical: 'medical',
          submitted_documents: [],
          sla_pause_total_hours: 0,
          intake_confirmation_sent: false,
          two_midnight_applies: false,
          authorization_number: row.authorization_number || null,
          submission_fingerprint: row.submission_fingerprint || null,
        };

        const { data: newCase, error: caseError } = await supabase
          .from('cases')
          .insert(casePayload)
          .select('id, case_number')
          .single();

        if (caseError || !newCase) {
          return NextResponse.json(
            { error: `Failed to create case: ${caseError?.message || 'unknown'}` },
            { status: 500 },
          );
        }

        // Update efax_queue row
        await supabase
          .from('efax_queue')
          .update({
            status: 'case_created',
            case_id: newCase.id,
            parsed_data: extracted_data || row.parsed_data,
            extraction_method: 'manual',
            processing_completed_at: new Date().toISOString(),
            locked_at: null,
            locked_by: null,
          })
          .eq('id', id);

        await logAuditEvent(newCase.id, 'efax_triage_promote', 'csr', {
          efax_queue_id: id,
          case_number: newCase.case_number,
        });

        return NextResponse.json({
          success: true,
          action: 'promote',
          case_id: newCase.id,
          case_number: newCase.case_number,
        });
      }

      case 'reject': {
        await supabase
          .from('efax_queue')
          .update({
            status: 'rejected',
            last_error: reject_reason || 'Rejected by CSR during triage',
            processing_completed_at: new Date().toISOString(),
            locked_at: null,
            locked_by: null,
          })
          .eq('id', id);

        await logAuditEvent(null, 'efax_triage_reject', 'csr', {
          efax_queue_id: id,
          reason: reject_reason || 'No reason provided',
        });

        return NextResponse.json({
          success: true,
          action: 'reject',
          message: 'eFax rejected',
        });
      }

      case 'retry_ocr': {
        await supabase
          .from('efax_queue')
          .update({
            status: 'received',
            attempts: 0,
            last_error: null,
            next_attempt_at: null,
            locked_at: null,
            locked_by: null,
            processing_started_at: null,
            processing_completed_at: null,
          })
          .eq('id', id);

        await logAuditEvent(null, 'efax_triage_retry', 'csr', {
          efax_queue_id: id,
        });

        return NextResponse.json({
          success: true,
          action: 'retry_ocr',
          message: 'eFax reset for re-processing',
        });
      }

      case 'update_data': {
        if (!extracted_data) {
          return NextResponse.json(
            { error: 'extracted_data is required for update_data action' },
            { status: 400 },
          );
        }

        await supabase
          .from('efax_queue')
          .update({
            parsed_data: extracted_data,
            extraction_method: 'manual',
          })
          .eq('id', id);

        await logAuditEvent(null, 'efax_triage_update_data', 'csr', {
          efax_queue_id: id,
        });

        return NextResponse.json({
          success: true,
          action: 'update_data',
          message: 'Extracted data updated',
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err) {
    console.error('Error in triage PATCH:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
