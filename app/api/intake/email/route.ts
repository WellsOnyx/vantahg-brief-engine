import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent } from '@/lib/audit';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { parseEmailPayload, type EmailPayload } from '@/lib/intake/email-parser';
import { generateAuthorizationNumber, logIntakeEvent, hashPatientName, sendReceiptConfirmation } from '@/lib/intake/confirmation';

export const dynamic = 'force-dynamic';

/**
 * Extracts the domain from an email address.
 * Returns null if the address format is invalid.
 */
function extractDomain(email: string): string | null {
  const match = email.match(/@([^>]+)>?\s*$/);
  if (match) return match[1].toLowerCase().trim();
  const simple = email.split('@')[1];
  return simple ? simple.replace(/[>\s]/g, '').toLowerCase() : null;
}

/**
 * Checks if the sender domain is in the allowed list.
 * If EMAIL_ALLOWED_DOMAINS is not set, all domains are accepted (dev/demo mode).
 */
function isSenderAllowed(fromAddress: string): boolean {
  const allowedDomainsRaw = process.env.EMAIL_ALLOWED_DOMAINS;
  if (!allowedDomainsRaw) return true; // No restriction in dev/demo

  const allowedDomains = allowedDomainsRaw
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  if (allowedDomains.length === 0) return true;

  const senderDomain = extractDomain(fromAddress);
  if (!senderDomain) return false;

  return allowedDomains.includes(senderDomain);
}

/**
 * POST /api/intake/email
 *
 * Webhook endpoint for receiving inbound emails via SendGrid Inbound Parse
 * or Mailgun Routes. Processes email submissions into utilization review cases.
 *
 * Security:
 * - Sender domain verification (EMAIL_ALLOWED_DOMAINS)
 * - Rate limiting
 * - Full audit trail
 * - No raw PHI in logs (patient names are hashed)
 *
 * Flow:
 * 1. Verify sender domain
 * 2. Parse multipart/form-data payload
 * 3. Extract clinical data from email body + attachments
 * 4. Generate authorization number
 * 5. Create case (or queue for manual review)
 * 6. Send receipt confirmation
 * 7. Log to intake_log
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    // Parse the multipart/form-data sent by SendGrid Inbound Parse
    const formData = await request.formData();

    const from = formData.get('from') as string || '';
    const to = formData.get('to') as string || '';
    const subject = formData.get('subject') as string || '';
    const textBody = formData.get('text') as string || '';
    const htmlBody = formData.get('html') as string || '';
    const envelopeRaw = formData.get('envelope') as string || '{}';
    const attachmentCount = parseInt(formData.get('attachments') as string || '0', 10);
    const attachmentInfoRaw = formData.get('attachment-info') as string || '{}';

    // Verify sender domain
    if (!isSenderAllowed(from)) {
      await logAuditEvent(null, 'security:email_sender_rejected', 'system', {
        domain: extractDomain(from) || 'unknown',
      });
      return NextResponse.json(
        { error: 'Sender domain not authorized' },
        { status: 403 },
      );
    }

    // Parse envelope for structured sender/recipient info
    let envelope: { from?: string; to?: string[] } = {};
    try {
      envelope = JSON.parse(envelopeRaw);
    } catch {
      // Envelope parsing failed — non-critical, continue with header fields
    }

    // Parse attachment-info for file metadata
    let attachmentInfo: Record<string, { filename?: string; type?: string; 'content-type'?: string }> = {};
    try {
      attachmentInfo = JSON.parse(attachmentInfoRaw);
    } catch {
      // Attachment info parsing failed — non-critical
    }

    // Collect attachment files
    const attachments: Array<{ filename: string; contentType: string; size: number }> = [];
    const attachmentTypes: string[] = [];
    for (let i = 1; i <= attachmentCount; i++) {
      const file = formData.get(`attachment${i}`) as File | null;
      if (file) {
        const ext = (file.name || '').split('.').pop()?.toLowerCase() || 'unknown';
        attachments.push({
          filename: file.name || `attachment${i}`,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
        });
        attachmentTypes.push(ext);
      } else {
        // Try attachment-info for metadata
        const info = attachmentInfo[`attachment${i}`] || attachmentInfo[String(i)];
        if (info) {
          const ct = info['content-type'] || info.type || 'application/octet-stream';
          const ext = (info.filename || '').split('.').pop()?.toLowerCase() || 'unknown';
          attachments.push({
            filename: info.filename || `attachment${i}`,
            contentType: ct,
            size: 0,
          });
          attachmentTypes.push(ext);
        }
      }
    }

    // Build email payload for the parser (matches EmailPayload interface)
    const emailPayload: EmailPayload = {
      from,
      to,
      subject,
      text: textBody,
      html: htmlBody,
      envelope: envelopeRaw,
      attachments: attachmentCount,
      attachment_info: attachmentInfoRaw,
      attachment_files: attachments.map((a) => ({
        filename: a.filename,
        content_type: a.contentType,
        size: a.size,
      })),
    };

    // Keep a unique ID for tracking
    const emailId = `email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Parse the email content to extract clinical data
    const parsed = parseEmailPayload(emailPayload);

    // Generate authorization number
    const authNumber = await generateAuthorizationNumber();

    // Log intake event (HIPAA: no raw PHI in logs)
    await logIntakeEvent({
      channel: 'email',
      source_identifier: extractDomain(from) || null,
      authorization_number: authNumber,
      case_id: null,
      patient_name_hash: parsed.patient_name ? hashPatientName(parsed.patient_name) : null,
      status: 'processing',
      rejection_reason: null,
      metadata: {
        email_id: emailId,
        subject_length: subject.length,
        attachment_count: attachmentCount,
        attachment_types: attachmentTypes,
        confidence: parsed.confidence_score,
      },
      processed_at: null,
      processed_by: null,
    });

    await logAuditEvent(null, 'email_received', 'system', {
      email_id: emailId,
      from_domain: extractDomain(from) || 'unknown',
      attachment_count: attachmentCount,
      authorization_number: authNumber,
      needs_manual_review: parsed.needs_manual_review,
      manual_review_reasons: parsed.manual_review_reasons,
    });

    if (isDemoMode()) {
      // In demo mode, simulate case creation
      const demoCaseId = `email-${Date.now()}`;
      return NextResponse.json({
        success: true,
        authorization_number: authNumber,
        case_id: parsed.needs_manual_review ? null : demoCaseId,
        status: parsed.needs_manual_review ? 'queued_for_review' : 'case_created',
        parsed_data: {
          patient_name: parsed.patient_name,
          procedure_codes: parsed.procedure_codes,
          diagnosis_codes: parsed.diagnosis_codes,
          service_category: parsed.service_category,
          confidence: parsed.confidence_score,
        },
        needs_manual_review: parsed.needs_manual_review,
        manual_review_reasons: parsed.manual_review_reasons,
      });
    }

    const supabase = getServiceClient();

    // Store in email_queue table
    const { data: emailEntry, error: emailError } = await supabase
      .from('email_queue')
      .insert({
        email_id: emailId,
        from_address: from,
        from_name: parsed.from_name,
        to_address: to,
        subject,
        body_text: textBody,
        body_html: htmlBody,
        attachment_count: attachmentCount,
        attachment_types: attachmentTypes,
        attachment_urls: attachments.map((a) => ({ filename: a.filename, content_type: a.contentType, size: a.size })),
        has_clinical_documents: parsed.has_clinical_documents,
        parsed_data: parsed,
        authorization_number: authNumber,
        confidence_score: parsed.confidence_score,
        status: parsed.needs_manual_review ? 'manual_review' : 'parsed',
        needs_manual_review: parsed.needs_manual_review,
        manual_review_reasons: parsed.manual_review_reasons,
      })
      .select('id')
      .single();

    if (emailError) {
      console.error('Failed to store email:', emailError);
      return NextResponse.json({ error: 'Failed to process email' }, { status: 500 });
    }

    // Auto-create case if confidence is high enough
    let caseId: string | null = null;
    if (!parsed.needs_manual_review && parsed.patient_name && parsed.procedure_codes.length > 0) {
      const caseNumber = `VHG-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

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
          patient_member_id: parsed.member_id,
          requesting_provider: parsed.provider_name,
          requesting_provider_npi: parsed.provider_npi,
          procedure_codes: parsed.procedure_codes,
          diagnosis_codes: parsed.diagnosis_codes,
          facility_name: parsed.facility_name,
          facility_type: parsed.facility_type,
          payer_name: parsed.payer_name,
          clinical_info: parsed.clinical_notes,
          intake_channel: 'email',
          authorization_number: authNumber,
          intake_confirmation_sent: false,
          intake_received_at: new Date().toISOString(),
          submitted_documents: [],
          vertical: 'medical',
        })
        .select('id')
        .single();

      if (!caseError && newCase) {
        caseId = newCase.id;

        // Update email queue with case reference
        await supabase
          .from('email_queue')
          .update({ case_id: caseId, status: 'case_created' })
          .eq('id', emailEntry.id);

        // Send receipt confirmation back to sender
        const senderEmail = envelope.from || from;
        const confirmation = await sendReceiptConfirmation({
          caseId: newCase.id,
          authorizationNumber: authNumber,
          channel: 'email',
          recipientEmail: senderEmail,
        });

        // Update case with confirmation status
        await supabase
          .from('cases')
          .update({
            intake_confirmation_sent: confirmation.confirmation_sent,
            intake_processed_at: new Date().toISOString(),
          })
          .eq('id', caseId);

        // Update intake log with case creation
        await logIntakeEvent({
          channel: 'email',
          source_identifier: extractDomain(from) || null,
          authorization_number: authNumber,
          case_id: caseId,
          patient_name_hash: hashPatientName(parsed.patient_name),
          status: 'case_created',
          rejection_reason: null,
          metadata: { email_id: emailId },
          processed_at: new Date().toISOString(),
          processed_by: 'system',
        });

        await logAuditEvent(caseId, 'case_created_from_email', 'system', {
          authorization_number: authNumber,
          email_id: emailId,
          auto_created: true,
        });
      }
    }

    return NextResponse.json({
      success: true,
      authorization_number: authNumber,
      case_id: caseId,
      email_queue_id: emailEntry.id,
      status: caseId ? 'case_created' : 'queued_for_review',
      needs_manual_review: parsed.needs_manual_review,
      manual_review_reasons: parsed.manual_review_reasons,
    });
  } catch (err) {
    console.error('Error processing inbound email:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/intake/email
 *
 * Returns the email intake queue for admin review.
 * Filtered by status and needs_review flag.
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 100 });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const needsReview = searchParams.get('needs_review');

    if (isDemoMode()) {
      // Return demo email queue entries with realistic healthcare data
      const demoQueue = [
        {
          id: 'email-demo-1',
          email_id: 'msg_abc123',
          from_address: 'drsanchez@suncoastortho.com',
          from_name: 'Dr. Maria Sanchez',
          subject: 'Auth Request: Knee Arthroscopy - J. Martinez',
          status: 'case_created',
          case_id: 'demo-case-1',
          authorization_number: 'AUTH-2026-000021',
          confidence_score: 92,
          needs_manual_review: false,
          manual_review_reasons: [],
          attachment_count: 2,
          attachment_types: ['pdf', 'pdf'],
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          processed_at: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'email-demo-2',
          email_id: 'msg_def456',
          from_address: 'frontdesk@metropleximaging.net',
          from_name: 'Metro Plex Imaging Center',
          subject: 'FW: Faxed Auth Request - MRI Lumbar Spine',
          status: 'manual_review',
          case_id: null,
          authorization_number: 'AUTH-2026-000022',
          confidence_score: 51,
          needs_manual_review: true,
          manual_review_reasons: [
            'Forwarded e-fax — original fax image may not parse reliably',
            'Patient member ID not found in email body',
          ],
          attachment_count: 1,
          attachment_types: ['tiff'],
          created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
          processed_at: null,
        },
        {
          id: 'email-demo-3',
          email_id: 'msg_ghi789',
          from_address: 'authteam@pinnaclehealth.org',
          from_name: 'Pinnacle Health Auth Team',
          subject: 'Prior Auth Submission: Cardiac Catheterization - R. Thompson',
          status: 'case_created',
          case_id: 'demo-case-3',
          authorization_number: 'AUTH-2026-000023',
          confidence_score: 88,
          needs_manual_review: false,
          manual_review_reasons: [],
          attachment_count: 3,
          attachment_types: ['pdf', 'pdf', 'jpg'],
          created_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
          processed_at: new Date(Date.now() - 5.5 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'email-demo-4',
          email_id: 'msg_jkl012',
          from_address: 'drpatel@urgentcarenow.com',
          from_name: 'Dr. Vikram Patel',
          subject: 'URGENT: Emergency Auth Needed - CT Head W/O Contrast',
          status: 'escalated',
          case_id: 'demo-case-4',
          authorization_number: 'AUTH-2026-000024',
          confidence_score: 85,
          needs_manual_review: false,
          manual_review_reasons: [],
          attachment_count: 1,
          attachment_types: ['pdf'],
          created_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
          processed_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
        },
        {
          id: 'email-demo-5',
          email_id: 'msg_mno345',
          from_address: 'callcenter@regionalhealthplan.com',
          from_name: 'Regional Health Plan Call Center',
          subject: 'Phone Auth Submission: PT Eval - S. Nguyen',
          status: 'case_created',
          case_id: 'demo-case-5',
          authorization_number: 'AUTH-2026-000025',
          confidence_score: 78,
          needs_manual_review: false,
          manual_review_reasons: [],
          attachment_count: 0,
          attachment_types: [],
          created_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
          processed_at: new Date(Date.now() - 7.5 * 60 * 60 * 1000).toISOString(),
        },
      ];

      let filtered = demoQueue;
      if (status) filtered = filtered.filter((e) => e.status === status);
      if (needsReview === 'true') filtered = filtered.filter((e) => e.needs_manual_review);

      return NextResponse.json(filtered);
    }

    const supabase = getServiceClient();
    let query = supabase
      .from('email_queue')
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
    console.error('Error fetching email queue:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts the display name from a "Name <email@domain.com>" format.
 * Returns null if only an email address is provided.
 */
function extractSenderName(from: string): string | null {
  // Handle "Dr. Maria Sanchez <drsanchez@suncoastortho.com>" format
  const match = from.match(/^(.+?)\s*<[^>]+>$/);
  if (match) {
    return match[1].replace(/^["']|["']$/g, '').trim();
  }
  return null;
}
