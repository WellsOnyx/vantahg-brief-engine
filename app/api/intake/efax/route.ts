import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent } from '@/lib/audit';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { parseEfaxPayload, type EfaxPayload } from '@/lib/intake/efax-parser';
import { generateAuthorizationNumber, logIntakeEvent, hashPatientName, sendReceiptConfirmation } from '@/lib/intake/confirmation';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/intake/efax
 *
 * Webhook endpoint for receiving e-fax transmissions.
 * Called by the e-fax provider (eFax, RingCentral, Phaxio) when a fax is received.
 *
 * Security:
 * - HMAC signature verification (EFAX_WEBHOOK_SECRET)
 * - Rate limiting
 * - Full audit trail
 * - No raw PHI in logs
 *
 * Flow:
 * 1. Verify webhook signature
 * 2. Parse fax payload
 * 3. Extract clinical data via OCR/parsing
 * 4. Generate authorization number
 * 5. Create case (or queue for manual review)
 * 6. Send receipt confirmation
 * 7. Log to intake_log
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    // Verify webhook signature if configured
    const webhookSecret = process.env.EFAX_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = request.headers.get('x-webhook-signature') || request.headers.get('x-efax-signature') || '';
      const rawBody = await request.clone().text();
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (signature !== expectedSignature && signature !== `sha256=${expectedSignature}`) {
        await logAuditEvent(null, 'security:efax_webhook_invalid_signature', 'system', {
          from_number: 'unknown',
        });
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
      }
    }

    const body = await request.json() as EfaxPayload;

    // Validate required fields
    if (!body.fax_id) {
      return NextResponse.json({ error: 'fax_id is required' }, { status: 400 });
    }

    // Parse the fax content
    const parsed = parseEfaxPayload(body);

    // Generate authorization number
    const authNumber = await generateAuthorizationNumber();

    // Log intake event
    await logIntakeEvent({
      channel: 'efax',
      source_identifier: body.from_number || null,
      authorization_number: authNumber,
      case_id: null,
      patient_name_hash: parsed.patient_name ? hashPatientName(parsed.patient_name) : null,
      status: parsed.needs_manual_review ? 'processing' : 'processing',
      rejection_reason: null,
      metadata: {
        fax_id: body.fax_id,
        page_count: body.page_count,
        ocr_confidence: parsed.confidence,
        provider: body.provider || 'unknown',
      },
      processed_at: null,
      processed_by: null,
    });

    await logAuditEvent(null, 'efax_received', 'system', {
      fax_id: body.fax_id,
      from_number: body.from_number,
      page_count: body.page_count,
      authorization_number: authNumber,
      needs_manual_review: parsed.needs_manual_review,
      manual_review_reasons: parsed.manual_review_reasons,
    });

    if (isDemoMode()) {
      // In demo mode, simulate case creation
      const demoCaseId = `efax-${Date.now()}`;
      return NextResponse.json({
        success: true,
        authorization_number: authNumber,
        case_id: demoCaseId,
        status: parsed.needs_manual_review ? 'queued_for_review' : 'case_created',
        parsed_data: {
          patient_name: parsed.patient_name,
          procedure_codes: parsed.procedure_codes,
          diagnosis_codes: parsed.diagnosis_codes,
          service_category: parsed.service_category,
          confidence: parsed.confidence,
        },
        needs_manual_review: parsed.needs_manual_review,
        manual_review_reasons: parsed.manual_review_reasons,
      });
    }

    const supabase = getServiceClient();

    // Store in e-fax queue
    const { data: efaxEntry, error: efaxError } = await supabase
      .from('efax_queue')
      .insert({
        fax_id: body.fax_id,
        from_number: body.from_number || null,
        to_number: body.to_number || null,
        page_count: body.page_count || 0,
        document_url: body.document_url || null,
        content_type: body.content_type || 'application/pdf',
        ocr_text: body.ocr_text || null,
        ocr_confidence: body.ocr_confidence || null,
        parsed_data: parsed,
        status: parsed.needs_manual_review ? 'manual_review' : 'parsed',
        needs_manual_review: parsed.needs_manual_review,
        manual_review_reasons: parsed.manual_review_reasons,
        provider: body.provider || null,
        provider_metadata: body.metadata || null,
      })
      .select('id')
      .single();

    if (efaxError) {
      console.error('Failed to store e-fax:', efaxError);
      return NextResponse.json({ error: 'Failed to process fax' }, { status: 500 });
    }

    // If high confidence, auto-create the case
    let caseId: string | null = null;
    if (!parsed.needs_manual_review && parsed.patient_name) {
      const caseNumber = `VUM-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

      const { data: newCase, error: caseError } = await supabase
        .from('cases')
        .insert({
          case_number: caseNumber,
          status: 'intake',
          priority: parsed.priority,
          service_category: parsed.service_category || 'other',
          review_type: parsed.review_type || 'prior_auth',
          patient_name: parsed.patient_name,
          patient_dob: parsed.patient_dob,
          patient_member_id: parsed.patient_member_id,
          patient_gender: parsed.patient_gender,
          requesting_provider: parsed.requesting_provider,
          requesting_provider_npi: parsed.requesting_provider_npi,
          requesting_provider_specialty: parsed.requesting_provider_specialty,
          procedure_codes: parsed.procedure_codes,
          diagnosis_codes: parsed.diagnosis_codes,
          procedure_description: parsed.procedure_description,
          facility_name: parsed.facility_name,
          facility_type: parsed.facility_type,
          payer_name: parsed.payer_name,
          plan_type: parsed.plan_type,
          intake_channel: 'efax',
          authorization_number: authNumber,
          intake_confirmation_sent: false,
          intake_received_at: new Date().toISOString(),
          submitted_documents: body.document_url ? [body.document_url] : [],
          vertical: 'medical',
        })
        .select('id')
        .single();

      if (!caseError && newCase) {
        caseId = newCase.id;

        // Update e-fax queue with case reference
        await supabase
          .from('efax_queue')
          .update({ case_id: caseId, status: 'case_created' })
          .eq('id', efaxEntry.id);

        // Send receipt confirmation
        const confirmation = await sendReceiptConfirmation({
          caseId: newCase.id,
          authorizationNumber: authNumber,
          channel: 'efax',
          recipientFax: body.from_number,
        });

        // Update case with confirmation status
        await supabase
          .from('cases')
          .update({
            intake_confirmation_sent: confirmation.confirmation_sent,
            intake_processed_at: new Date().toISOString(),
          })
          .eq('id', caseId);

        // Update intake log
        await logIntakeEvent({
          channel: 'efax',
          source_identifier: body.from_number || null,
          authorization_number: authNumber,
          case_id: caseId,
          patient_name_hash: hashPatientName(parsed.patient_name),
          status: 'case_created',
          rejection_reason: null,
          metadata: { fax_id: body.fax_id },
          processed_at: new Date().toISOString(),
          processed_by: 'system',
        });

        await logAuditEvent(caseId, 'case_created_from_efax', 'system', {
          authorization_number: authNumber,
          fax_id: body.fax_id,
          auto_created: true,
        });
      }
    }

    return NextResponse.json({
      success: true,
      authorization_number: authNumber,
      case_id: caseId,
      efax_queue_id: efaxEntry.id,
      status: caseId ? 'case_created' : 'queued_for_review',
      needs_manual_review: parsed.needs_manual_review,
      manual_review_reasons: parsed.manual_review_reasons,
    });
  } catch (err) {
    console.error('Error processing e-fax:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/intake/efax
 *
 * Returns the e-fax queue for admin review.
 * Filtered by status, with pagination.
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 100 });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const needsReview = searchParams.get('needs_review');

    if (isDemoMode()) {
      // Return demo e-fax queue
      const demoQueue = [
        {
          id: 'efax-demo-001',
          created_at: '2026-02-20T09:15:00Z',
          fax_id: 'FAX-20260220-001',
          from_number: '+14155551234',
          to_number: '+18005551111',
          page_count: 4,
          status: 'case_created',
          needs_manual_review: false,
          manual_review_reasons: [],
          parsed_data: {
            patient_name: 'Maria Santos',
            procedure_codes: ['27447'],
            service_category: 'surgery',
            confidence: 92,
          },
          case_id: 'efax-case-001',
        },
        {
          id: 'efax-demo-002',
          created_at: '2026-02-21T14:30:00Z',
          fax_id: 'FAX-20260221-003',
          from_number: '+13105559876',
          to_number: '+18005551111',
          page_count: 2,
          status: 'manual_review',
          needs_manual_review: true,
          manual_review_reasons: ['Low OCR confidence', 'No procedure codes found'],
          parsed_data: {
            patient_name: 'J. Williams',
            procedure_codes: [],
            service_category: null,
            confidence: 45,
          },
          case_id: null,
        },
        {
          id: 'efax-demo-003',
          created_at: '2026-02-22T08:00:00Z',
          fax_id: 'FAX-20260222-001',
          from_number: '+12125554567',
          to_number: '+18005551111',
          page_count: 6,
          status: 'parsed',
          needs_manual_review: false,
          manual_review_reasons: [],
          parsed_data: {
            patient_name: 'Robert Chen',
            procedure_codes: ['70553', '72148'],
            service_category: 'imaging',
            confidence: 88,
          },
          case_id: null,
        },
      ];

      let filtered = demoQueue;
      if (status) filtered = filtered.filter((f) => f.status === status);
      if (needsReview === 'true') filtered = filtered.filter((f) => f.needs_manual_review);

      return NextResponse.json(filtered);
    }

    const supabase = getServiceClient();
    let query = supabase
      .from('efax_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (status) query = query.eq('status', status);
    if (needsReview === 'true') query = query.eq('needs_manual_review', true);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err) {
    console.error('Error fetching e-fax queue:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
