import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { isDemoMode } from '@/lib/demo-mode';

// ============================================================================
// Types
// ============================================================================

export type NotificationType =
  | 'new_case_assigned'
  | 'determination_ready'
  | 'sla_warning'
  | 'sla_critical'
  | 'sla_overdue'
  | 'case_delivered';

export interface NotificationPayload {
  type: NotificationType;
  recipient_email?: string;
  recipient_phone?: string;
  recipient_name?: string;
  case_number?: string;
  case_id?: string;
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Core Dispatcher
// ============================================================================

/**
 * Send a notification via all available channels.
 * In demo mode, logs to console. In production, sends email and/or SMS.
 */
export async function sendNotification(payload: NotificationPayload): Promise<void> {
  if (isDemoMode()) {
    console.log(`[NOTIFICATION] ${payload.type} | To: ${payload.recipient_name || payload.recipient_email || payload.recipient_phone} | Subject: ${payload.subject}`);
    console.log(`[NOTIFICATION] Body: ${payload.body.substring(0, 200)}`);
    return;
  }

  const promises: Promise<void>[] = [];

  if (payload.recipient_email) {
    promises.push(
      sendEmail(payload.recipient_email, payload.subject, payload.body)
        .catch((err) => console.error(`Email notification failed:`, err))
    );
  }

  if (payload.recipient_phone) {
    promises.push(
      sendSms(payload.recipient_phone, `${payload.subject}: ${payload.body.substring(0, 140)}`)
        .catch((err) => console.error(`SMS notification failed:`, err))
    );
  }

  await Promise.allSettled(promises);

  // Log notification in audit trail
  if (payload.case_id) {
    await logAuditEvent(payload.case_id, 'notification_sent', 'system', {
      type: payload.type,
      recipient_email: payload.recipient_email ? `${payload.recipient_email.substring(0, 3)}***` : undefined,
      recipient_phone: payload.recipient_phone ? '***' : undefined,
    }).catch(() => {}); // Don't fail on audit log errors
  }
}

// ============================================================================
// Channel Implementations
// ============================================================================

/**
 * Send an email via SMTP. Falls back to console logging if SMTP not configured.
 */
async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || 'noreply@vantahg.com';

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log(`[EMAIL STUB] To: ${to} | Subject: ${subject}`);
    console.log(`[EMAIL STUB] Body: ${body.substring(0, 300)}`);
    return;
  }

  // TODO: Install nodemailer (`npm i nodemailer @types/nodemailer`) and uncomment:
  // const nodemailer = await import('nodemailer');
  // const transporter = nodemailer.createTransport({
  //   host: smtpHost, port: parseInt(smtpPort || '587', 10),
  //   secure: (smtpPort || '587') === '465',
  //   auth: { user: smtpUser, pass: smtpPass },
  // });
  // await transporter.sendMail({ from: smtpFrom, to, subject, text: body });
  console.log(`[EMAIL] SMTP configured but nodemailer not installed. To: ${to} | Subject: ${subject}`);
}

/**
 * Send an SMS via Twilio. Falls back to console logging if Twilio not configured.
 */
async function sendSms(phone: string, message: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.log(`[SMS STUB] To: ${phone} | ${message}`);
    return;
  }

  // TODO: Wire up Twilio when ready
  console.log(`[SMS STUB] Would send to ${phone}: ${message}`);
}

// ============================================================================
// High-Level Notification Helpers
// ============================================================================

/**
 * Backward-compatible export for existing code.
 */
export async function sendReviewerNotification(phone: string, message: string): Promise<void> {
  await sendSms(phone, message);
}

/**
 * Notify a reviewer that a new case has been assigned to them.
 */
export async function notifyCaseAssigned(caseId: string, reviewerId: string): Promise<void> {
  if (isDemoMode()) {
    console.log(`[NOTIFICATION] new_case_assigned | Case: ${caseId} → Reviewer: ${reviewerId}`);
    return;
  }

  const supabase = getServiceClient();

  const { data: caseData } = await supabase
    .from('cases')
    .select('case_number, patient_name, service_category, priority')
    .eq('id', caseId)
    .single();

  const { data: reviewer } = await supabase
    .from('reviewers')
    .select('name, email, phone')
    .eq('id', reviewerId)
    .single();

  if (!caseData || !reviewer) return;

  const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000';

  await sendNotification({
    type: 'new_case_assigned',
    recipient_email: reviewer.email,
    recipient_phone: reviewer.phone,
    recipient_name: reviewer.name,
    case_number: caseData.case_number,
    case_id: caseId,
    subject: `New case assigned: ${caseData.case_number}`,
    body: `You have been assigned case ${caseData.case_number} (${caseData.service_category}, ${caseData.priority} priority). Patient: ${caseData.patient_name}. Please review the AI clinical brief and submit your determination at ${baseUrl}/cases/${caseId}`,
  });
}

/**
 * Notify the TPA/client that a determination has been made.
 */
export async function notifyDeterminationReady(caseId: string): Promise<void> {
  if (isDemoMode()) {
    console.log(`[NOTIFICATION] determination_ready | Case: ${caseId}`);
    return;
  }

  const supabase = getServiceClient();

  const { data: caseData } = await supabase
    .from('cases')
    .select('case_number, determination, client_id, patient_name')
    .eq('id', caseId)
    .single();

  if (!caseData || !caseData.client_id) return;

  const { data: client } = await supabase
    .from('clients')
    .select('name, contact_email, contact_phone')
    .eq('id', caseData.client_id)
    .single();

  if (!client) return;

  const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000';

  await sendNotification({
    type: 'determination_ready',
    recipient_email: client.contact_email,
    recipient_phone: client.contact_phone,
    recipient_name: client.name,
    case_number: caseData.case_number,
    case_id: caseId,
    subject: `Determination ready: ${caseData.case_number}`,
    body: `A determination of "${caseData.determination?.replace(/_/g, ' ').toUpperCase()}" has been issued for case ${caseData.case_number} (Patient: ${caseData.patient_name}). View the full determination letter at ${baseUrl}/cases/${caseId}/determination`,
  });
}

/**
 * Send SLA escalation notifications.
 */
export async function notifySlaEscalation(
  caseId: string,
  level: 'warning' | 'critical' | 'overdue',
  reviewerId?: string
): Promise<void> {
  if (isDemoMode()) {
    console.log(`[NOTIFICATION] sla_${level} | Case: ${caseId}`);
    return;
  }

  const supabase = getServiceClient();

  const { data: caseData } = await supabase
    .from('cases')
    .select('case_number, turnaround_deadline, patient_name, assigned_reviewer_id')
    .eq('id', caseId)
    .single();

  if (!caseData) return;

  const actualReviewerId = reviewerId || caseData.assigned_reviewer_id;
  const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000';

  // Notify the assigned reviewer (for critical/overdue)
  if (actualReviewerId && (level === 'critical' || level === 'overdue')) {
    const { data: reviewer } = await supabase
      .from('reviewers')
      .select('name, email, phone')
      .eq('id', actualReviewerId)
      .single();

    if (reviewer) {
      await sendNotification({
        type: level === 'critical' ? 'sla_critical' : 'sla_overdue',
        recipient_email: reviewer.email,
        recipient_phone: reviewer.phone,
        recipient_name: reviewer.name,
        case_number: caseData.case_number,
        case_id: caseId,
        subject: `SLA ${level.toUpperCase()}: Case ${caseData.case_number}`,
        body: `Case ${caseData.case_number} is ${level === 'overdue' ? 'OVERDUE' : 'approaching deadline'}. Deadline: ${caseData.turnaround_deadline}. Please review immediately at ${baseUrl}/cases/${caseId}`,
      });
    }
  }

  // Always notify admin email if configured
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (adminEmail) {
    await sendNotification({
      type: level === 'critical' ? 'sla_critical' : level === 'overdue' ? 'sla_overdue' : 'sla_warning',
      recipient_email: adminEmail,
      case_number: caseData.case_number,
      case_id: caseId,
      subject: `SLA ${level.toUpperCase()}: Case ${caseData.case_number}`,
      body: `Case ${caseData.case_number} SLA is ${level}. Deadline: ${caseData.turnaround_deadline}. Patient: ${caseData.patient_name}. Review at ${baseUrl}/cases/${caseId}`,
    });
  }
}

/**
 * Deliver determination to TPA client and return success status.
 */
export async function deliverToClient(caseId: string): Promise<boolean> {
  try {
    await notifyDeterminationReady(caseId);
    return true;
  } catch (err) {
    console.error(`Failed to deliver case ${caseId}:`, err);
    return false;
  }
}
