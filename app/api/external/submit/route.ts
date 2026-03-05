import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent } from '@/lib/audit';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { generateAuthorizationNumber, logIntakeEvent, hashPatientName, sendReceiptConfirmation } from '@/lib/intake/confirmation';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/external/submit
 *
 * Secure external API endpoint for programmatic case submission.
 * Used by TPAs, provider EHR systems, and partner integrations.
 *
 * Authentication: HMAC-SHA256 signature using shared API key
 * Header: x-api-key (API key identifier) + x-signature (HMAC of body)
 *
 * This endpoint is whitelisted in middleware.ts (no session required).
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    // Authenticate via API key
    const apiKey = request.headers.get('x-api-key');
    const signature = request.headers.get('x-signature');

    if (!isDemoMode()) {
      if (!apiKey) {
        await logAuditEvent(null, 'security:external_submit_no_api_key', 'system');
        return NextResponse.json({ error: 'x-api-key header required' }, { status: 401 });
      }

      // Verify API key against configured keys
      const validKeys = (process.env.EXTERNAL_API_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean);
      if (validKeys.length > 0 && !validKeys.includes(apiKey)) {
        await logAuditEvent(null, 'security:external_submit_invalid_key', 'system', { api_key_prefix: apiKey.substring(0, 8) });
        return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
      }

      // Verify HMAC signature if secret is configured
      const apiSecret = process.env.EXTERNAL_API_SECRET;
      if (apiSecret && signature) {
        const rawBody = await request.clone().text();
        const expectedSig = crypto.createHmac('sha256', apiSecret).update(rawBody).digest('hex');
        if (signature !== expectedSig) {
          await logAuditEvent(null, 'security:external_submit_invalid_signature', 'system');
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
      }
    }

    const body = await request.json();

    // Validate required fields
    const requiredFields = ['patient_name', 'procedure_codes'];
    const missing = requiredFields.filter((f) => !body[f]);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.procedure_codes) || body.procedure_codes.length === 0) {
      return NextResponse.json(
        { error: 'procedure_codes must be a non-empty array' },
        { status: 400 }
      );
    }

    // Validate enums
    const validPriorities = ['standard', 'urgent', 'expedited'];
    if (body.priority && !validPriorities.includes(body.priority)) {
      return NextResponse.json(
        { error: `priority must be one of: ${validPriorities.join(', ')}` },
        { status: 400 }
      );
    }

    const validReviewTypes = ['prior_auth', 'medical_necessity', 'concurrent', 'retrospective', 'peer_to_peer', 'appeal', 'second_level_review'];
    if (body.review_type && !validReviewTypes.includes(body.review_type)) {
      return NextResponse.json(
        { error: `review_type must be one of: ${validReviewTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Generate auth number
    const authNumber = await generateAuthorizationNumber();
    const caseNumber = `VHG-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    // Log intake
    await logIntakeEvent({
      channel: 'api',
      source_identifier: apiKey ? `key:${apiKey.substring(0, 8)}...` : 'demo',
      authorization_number: authNumber,
      case_id: null,
      patient_name_hash: hashPatientName(body.patient_name),
      status: 'processing',
      rejection_reason: null,
      metadata: { api_key_prefix: apiKey?.substring(0, 8) },
      processed_at: null,
      processed_by: null,
    });

    if (isDemoMode()) {
      const demoCaseId = `api-${Date.now()}`;
      const confirmation = await sendReceiptConfirmation({
        caseId: demoCaseId,
        authorizationNumber: authNumber,
        channel: 'api',
        recipientEmail: body.contact_email,
      });

      return NextResponse.json({
        success: true,
        case_id: demoCaseId,
        case_number: caseNumber,
        authorization_number: authNumber,
        status: 'intake',
        confirmation,
        message: 'Case submitted successfully (demo mode)',
      }, { status: 201 });
    }

    const supabase = getServiceClient();

    const { data: newCase, error: caseError } = await supabase
      .from('cases')
      .insert({
        case_number: caseNumber,
        status: 'intake',
        priority: body.priority || 'standard',
        service_category: body.service_category || 'other',
        review_type: body.review_type || 'prior_auth',
        patient_name: body.patient_name,
        patient_dob: body.patient_dob || null,
        patient_member_id: body.patient_member_id || null,
        patient_gender: body.patient_gender || null,
        requesting_provider: body.requesting_provider || null,
        requesting_provider_npi: body.requesting_provider_npi || null,
        requesting_provider_specialty: body.requesting_provider_specialty || null,
        procedure_codes: body.procedure_codes,
        diagnosis_codes: body.diagnosis_codes || [],
        procedure_description: body.procedure_description || null,
        clinical_question: body.clinical_question || null,
        facility_name: body.facility_name || null,
        facility_type: body.facility_type || null,
        payer_name: body.payer_name || null,
        plan_type: body.plan_type || null,
        client_id: body.client_id || null,
        intake_channel: 'api',
        authorization_number: authNumber,
        intake_confirmation_sent: false,
        intake_received_at: new Date().toISOString(),
        submitted_documents: body.document_urls || [],
        vertical: 'medical',
      })
      .select('id, case_number, status')
      .single();

    if (caseError) {
      console.error('Failed to create case via external API:', caseError);
      return NextResponse.json({ error: 'Failed to create case' }, { status: 500 });
    }

    // Send confirmation
    const confirmation = await sendReceiptConfirmation({
      caseId: newCase.id,
      authorizationNumber: authNumber,
      channel: 'api',
      recipientEmail: body.contact_email,
    });

    // Update case
    await supabase
      .from('cases')
      .update({
        intake_confirmation_sent: confirmation.confirmation_sent,
        intake_processed_at: new Date().toISOString(),
      })
      .eq('id', newCase.id);

    // Update intake log
    await logIntakeEvent({
      channel: 'api',
      source_identifier: apiKey ? `key:${apiKey.substring(0, 8)}...` : null,
      authorization_number: authNumber,
      case_id: newCase.id,
      patient_name_hash: hashPatientName(body.patient_name),
      status: 'case_created',
      rejection_reason: null,
      metadata: null,
      processed_at: new Date().toISOString(),
      processed_by: 'system',
    });

    await logAuditEvent(newCase.id, 'case_created_via_api', 'system', {
      authorization_number: authNumber,
      api_key_prefix: apiKey?.substring(0, 8),
    });

    return NextResponse.json({
      success: true,
      case_id: newCase.id,
      case_number: newCase.case_number,
      authorization_number: authNumber,
      status: newCase.status,
      confirmation,
    }, { status: 201 });
  } catch (err) {
    console.error('Error in external submit:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
