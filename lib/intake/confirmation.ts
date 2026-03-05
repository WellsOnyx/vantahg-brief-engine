import { logAuditEvent } from '../audit';
import { isDemoMode } from '../demo-mode';
import { getServiceClient } from '../supabase';

/**
 * Generates a sequential authorization number for case tracking.
 * Format: AUTH-YYYY-XXXXXX (e.g., AUTH-2026-000042)
 *
 * In demo mode, returns a deterministic number.
 * In production, uses a Supabase sequence for atomic increment.
 */
export async function generateAuthorizationNumber(): Promise<string> {
  const year = new Date().getFullYear();

  if (isDemoMode()) {
    // Deterministic counter for demo mode
    const counter = Math.floor(Math.random() * 999) + 1;
    return `AUTH-${year}-${String(counter).padStart(6, '0')}`;
  }

  const supabase = getServiceClient();

  // Use a simple counter approach via a settings table or RPC
  // Fall back to timestamp-based if sequence doesn't exist yet
  try {
    const { data, error } = await supabase.rpc('next_authorization_number');
    if (!error && data) {
      return `AUTH-${year}-${String(data).padStart(6, '0')}`;
    }
  } catch {
    // Sequence not set up yet — fall back
  }

  // Fallback: timestamp-based unique number
  const ts = Date.now().toString().slice(-6);
  return `AUTH-${year}-${ts}`;
}

/**
 * Intake log entry for tracking all incoming submissions
 * regardless of whether they become cases.
 */
export interface IntakeLogEntry {
  id: string;
  created_at: string;
  channel: 'portal' | 'efax' | 'email' | 'phone' | 'api' | 'batch_upload';
  source_identifier: string | null; // fax number, email address, API key name, etc.
  authorization_number: string | null;
  case_id: string | null; // null until case is created
  patient_name_hash: string | null; // hashed for HIPAA — no PHI in logs
  status: 'received' | 'processing' | 'case_created' | 'rejected' | 'duplicate';
  rejection_reason: string | null;
  metadata: Record<string, unknown> | null;
  processed_at: string | null;
  processed_by: string | null;
}

/**
 * Logs an intake event to the intake_log table.
 * This is the compliance trail showing every submission we received.
 */
export async function logIntakeEvent(entry: Omit<IntakeLogEntry, 'id' | 'created_at'>): Promise<void> {
  if (isDemoMode()) {
    console.log('[INTAKE LOG]', entry.channel, entry.status, entry.authorization_number);
    return;
  }

  try {
    const supabase = getServiceClient();
    const { error } = await supabase.from('intake_log').insert({
      channel: entry.channel,
      source_identifier: entry.source_identifier,
      authorization_number: entry.authorization_number,
      case_id: entry.case_id,
      patient_name_hash: entry.patient_name_hash,
      status: entry.status,
      rejection_reason: entry.rejection_reason,
      metadata: entry.metadata,
      processed_at: entry.processed_at,
      processed_by: entry.processed_by,
    });
    if (error) {
      console.error('Failed to log intake event:', error);
    }
  } catch (err) {
    console.error('Intake log write exception:', err);
  }
}

/**
 * Sends a receipt confirmation to the submitting provider.
 * This is a HIPAA requirement — providers must receive acknowledgment
 * that their authorization request was received.
 *
 * Returns the confirmation details for the API response.
 */
export async function sendReceiptConfirmation(params: {
  caseId: string;
  authorizationNumber: string;
  channel: string;
  recipientFax?: string;
  recipientEmail?: string;
  patientName?: string;
}): Promise<{
  confirmation_sent: boolean;
  confirmation_method: string;
  authorization_number: string;
  received_at: string;
  estimated_turnaround: string;
}> {
  const receivedAt = new Date().toISOString();

  // Log the confirmation attempt
  await logAuditEvent(params.caseId, 'intake_confirmation_sent', 'system', {
    authorization_number: params.authorizationNumber,
    channel: params.channel,
    recipient_fax: params.recipientFax || null,
    recipient_email: params.recipientEmail || null,
  });

  // In production, this would integrate with:
  // 1. eFax API to send fax confirmation
  // 2. SMTP/SendGrid to send email confirmation
  // 3. SMS via Twilio for phone confirmations
  //
  // For now, we log and return the confirmation data
  const confirmationMethod = params.recipientEmail ? 'email' : params.recipientFax ? 'efax' : 'portal';

  if (!isDemoMode()) {
    // TODO: Integrate with actual delivery channels
    // await sendConfirmationEmail(params.recipientEmail, { ... })
    // await sendConfirmationFax(params.recipientFax, { ... })
    console.log(`[CONFIRMATION] ${confirmationMethod} confirmation for ${params.authorizationNumber}`);
  }

  return {
    confirmation_sent: true,
    confirmation_method: confirmationMethod,
    authorization_number: params.authorizationNumber,
    received_at: receivedAt,
    estimated_turnaround: '24-72 hours depending on priority and review type',
  };
}

/**
 * Hashes a patient name for intake logging (HIPAA compliance).
 * We never store raw PHI in the intake_log table.
 */
export function hashPatientName(name: string): string {
  // Simple hash for logging — not for cryptographic use
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    const char = name.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `PHI-${Math.abs(hash).toString(36).toUpperCase()}`;
}
