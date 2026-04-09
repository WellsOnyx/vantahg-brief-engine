/**
 * GET/POST /api/cron/efax-process
 *
 * Vercel cron worker for the eFax intake pipeline. Runs every minute and
 * drives queued rows through: fetch document -> OCR -> AI extraction ->
 * dedup check -> case creation -> receipt confirmation.
 *
 * Claim-process-release pattern:
 *   1. `claim_efax_batch(worker_id, batch_size)` atomically locks up to N
 *      rows from efax_queue using FOR UPDATE SKIP LOCKED. It increments
 *      `attempts`, sets `locked_at` / `locked_by`, and returns the claimed
 *      IDs. Concurrent workers will skip locked rows cleanly.
 *   2. For each claimed ID we SELECT the full row, then drive it through
 *      the pipeline with eager status transitions so a crash mid-flight
 *      leaves the row in a known state.
 *   3. On success, the row is marked `case_created` / `duplicate` /
 *      `manual_review` and the lock is cleared.
 *   4. On failure, `handleProcessingError` applies exponential backoff
 *      (1min, 2min, 4min, 8min, 16min) via `next_attempt_at` and resets
 *      status to `received` so the row is re-claimable. After
 *      `max_attempts` it moves to `dead_letter`.
 *
 * Time budget:
 *   Vercel Pro functions can run up to 300s, but we stop claiming new work
 *   once 50s have elapsed so the next minute's cron picks up the rest.
 *
 * Authentication:
 *   Bearer CRON_SECRET. Demo mode short-circuits and returns a stub.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent } from '@/lib/audit';
import {
  logIntakeEvent,
  sendReceiptConfirmation,
  hashPatientName,
} from '@/lib/intake/confirmation';
import {
  fetchAndStoreDocument,
  getStoredDocumentBytes,
  computeSubmissionFingerprint,
  findDuplicateCase,
} from '@/lib/intake/efax/storage';
import { runOcr, type OcrInput } from '@/lib/intake/efax/ocr';
import { extractClinicalDataFromFax } from '@/lib/intake/efax/ai-extractor';
import { getPhaxioAuth } from '@/lib/intake/efax/providers/phaxio';
import type { ParsedFaxData } from '@/lib/intake/efax-parser';

export const dynamic = 'force-dynamic';

// ── Config ─────────────────────────────────────────────────────────────────

const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 20;
const TIME_BUDGET_MS = 50_000;

type ProcessStatus =
  | 'case_created'
  | 'duplicate'
  | 'manual_review'
  | 'dead_letter'
  | 'failed';

interface ProcessResult {
  status: ProcessStatus;
  case_id?: string;
  error?: string;
}

interface EfaxQueueRow {
  id: string;
  fax_id: string | null;
  from_number: string | null;
  to_number: string | null;
  page_count: number | null;
  document_url: string | null;
  content_type: string | null;
  ocr_text: string | null;
  ocr_confidence: number | null;
  provider: string | null;
  provider_metadata: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
  status: string;
}

// ── Route handlers ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // Auth
  const authHeader = request.headers.get('authorization');
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isDemoMode()) {
    return NextResponse.json({
      success: true,
      demo: true,
      processed: 0,
      message: 'demo mode — no processing',
    });
  }

  const workerId = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const batchSize = resolveBatchSize();

  const counts = {
    case_created: 0,
    duplicate: 0,
    manual_review: 0,
    dead_letter: 0,
    failed: 0,
  };
  let timeBudgetExceeded = false;
  let processed = 0;

  try {
    const supabase = getServiceClient();

    // Claim a batch
    const { data: claimed, error: claimError } = await supabase.rpc(
      'claim_efax_batch',
      { worker_id: workerId, batch_size: batchSize },
    );

    if (claimError) {
      console.error('[efax-process] claim_efax_batch failed', claimError);
      return NextResponse.json({
        success: false,
        worker_id: workerId,
        error: 'claim_failed',
        message: claimError.message,
        duration_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });
    }

    const claimedIds: string[] = Array.isArray(claimed)
      ? (claimed as Array<{ id: string }>).map((r) => r.id).filter(Boolean)
      : [];

    if (claimedIds.length === 0) {
      return NextResponse.json({
        success: true,
        worker_id: workerId,
        processed: 0,
        skipped: 'no_work',
        duration_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });
    }

    for (const rowId of claimedIds) {
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        timeBudgetExceeded = true;
        // Release the lock on the unfinished row so the next cron picks it up.
        await releaseLock(rowId);
        continue;
      }

      processed += 1;

      // Fetch the full row
      const { data: rowData, error: rowError } = await supabase
        .from('efax_queue')
        .select(
          'id, fax_id, from_number, to_number, page_count, document_url, content_type, ocr_text, ocr_confidence, provider, provider_metadata, attempts, max_attempts, status',
        )
        .eq('id', rowId)
        .single();

      if (rowError || !rowData) {
        console.error('[efax-process] failed to fetch claimed row', rowId, rowError);
        counts.failed += 1;
        await releaseLock(rowId);
        continue;
      }

      const row = rowData as EfaxQueueRow;

      try {
        const result = await processFaxRow(row);
        counts[result.status] += 1;
      } catch (err) {
        const handled = await handleProcessingError(
          row.id,
          row.attempts,
          row.max_attempts,
          err instanceof Error ? err : new Error(String(err)),
        );
        if (handled === 'dead_letter') counts.dead_letter += 1;
        else counts.failed += 1;
      }
    }

    return NextResponse.json({
      success: true,
      worker_id: workerId,
      processed,
      succeeded: counts.case_created,
      duplicates: counts.duplicate,
      manual_review: counts.manual_review,
      dead_lettered: counts.dead_letter,
      failed: counts.failed,
      time_budget_exceeded: timeBudgetExceeded,
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // Never throw out of the top-level handler. Return 200 with partial counts.
    console.error('[efax-process] top-level error', err);
    return NextResponse.json({
      success: false,
      worker_id: workerId,
      processed,
      ...counts,
      error: err instanceof Error ? err.message : String(err),
      time_budget_exceeded: timeBudgetExceeded,
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function resolveBatchSize(): number {
  const raw = process.env.EFAX_WORKER_BATCH_SIZE;
  if (!raw) return DEFAULT_BATCH_SIZE;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_BATCH_SIZE;
  return Math.min(n, MAX_BATCH_SIZE);
}

async function updateRow(
  rowId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase.from('efax_queue').update(patch).eq('id', rowId);
  if (error) {
    console.warn('[efax-process] updateRow failed', rowId, error.message);
  }
}

async function releaseLock(rowId: string): Promise<void> {
  await updateRow(rowId, { locked_at: null, locked_by: null });
}

async function processFaxRow(row: EfaxQueueRow): Promise<ProcessResult> {
  const supabase = getServiceClient();

  // 1. Mark status=fetching
  await updateRow(row.id, { status: 'fetching' });
  await logAuditEvent(null, 'efax_worker_fetching', 'system', {
    row_id: row.id,
    fax_id: row.fax_id,
    attempts: row.attempts,
  });

  // 2. Fetch document (if we have a URL). Phaxio needs HTTP Basic auth.
  let storagePath = '';
  let storageSha256 = '';
  let storageBytes = 0;
  let documentBytes: Buffer | undefined;

  if (row.document_url) {
    const basicAuth =
      row.provider === 'phaxio' ? getPhaxioAuth() : null;
    const stored = await fetchAndStoreDocument(
      row.fax_id || row.id,
      row.document_url,
      {
        basicAuth: basicAuth
          ? { user: basicAuth.apiKey, pass: basicAuth.apiSecret }
          : null,
        contentType: row.content_type || 'application/pdf',
      },
    );
    storagePath = stored.storage_path;
    storageSha256 = stored.storage_sha256;
    storageBytes = stored.storage_bytes;

    if (storagePath) {
      documentBytes = await getStoredDocumentBytes(storagePath);
      if (documentBytes.length === 0) documentBytes = undefined;
    }

    await updateRow(row.id, {
      storage_path: storagePath || null,
      storage_sha256: storageSha256 || null,
      storage_bytes: storageBytes || null,
    });
  }

  // 3. Mark status=ocr_processing
  await updateRow(row.id, { status: 'ocr_processing' });
  await logAuditEvent(null, 'efax_worker_ocr', 'system', {
    row_id: row.id,
    fax_id: row.fax_id,
    has_document_bytes: Boolean(documentBytes),
  });

  // 4. Run OCR
  const ocrInput: OcrInput = {
    document: documentBytes,
    document_url: row.document_url || undefined,
    content_type: row.content_type || undefined,
    provider_ocr_text: row.ocr_text || undefined,
    provider_ocr_confidence: row.ocr_confidence ?? undefined,
  };
  const ocrResult = await runOcr(ocrInput);

  // 5. Mark status=extracting, persist OCR provider
  await updateRow(row.id, {
    status: 'extracting',
    ocr_provider: ocrResult.provider,
  });
  await logAuditEvent(null, 'efax_worker_extracting', 'system', {
    row_id: row.id,
    fax_id: row.fax_id,
    ocr_provider: ocrResult.provider,
    ocr_confidence: ocrResult.confidence,
    page_count: ocrResult.page_count,
  });

  // 6. AI extraction
  const extraction = await extractClinicalDataFromFax({
    ocr_text: ocrResult.text,
    ocr_confidence: ocrResult.confidence,
    from_number: row.from_number,
    page_count: ocrResult.page_count ?? row.page_count,
  });
  const parsed: ParsedFaxData = extraction.parsed;

  // 8. Compute submission fingerprint
  const fingerprint = computeSubmissionFingerprint({
    patient_name: parsed.patient_name,
    patient_dob: parsed.patient_dob,
    patient_member_id: parsed.patient_member_id,
    procedure_codes: parsed.procedure_codes,
    from_number: row.from_number,
  });

  // 7. Persist extraction results to the row
  await updateRow(row.id, {
    ocr_text: ocrResult.text,
    ocr_confidence: ocrResult.confidence,
    ocr_provider: ocrResult.provider,
    parsed_data: parsed,
    extraction_method: extraction.method,
    extraction_model: extraction.model || null,
    confidence_score: Math.round(parsed.confidence),
    needs_manual_review: parsed.needs_manual_review,
    manual_review_reasons: parsed.manual_review_reasons,
    submission_fingerprint: fingerprint,
    status: 'extracting',
  });

  // 9. Dedup check
  if (fingerprint) {
    const match = await findDuplicateCase(fingerprint, 24);
    if (match) {
      await updateRow(row.id, {
        status: 'duplicate',
        case_id: match.case_id,
        processing_completed_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
      });
      await logAuditEvent(match.case_id, 'efax_duplicate_detected', 'system', {
        fax_id: row.fax_id,
        row_id: row.id,
        original_case_id: match.case_id,
        age_hours: match.age_hours,
      });
      return { status: 'duplicate', case_id: match.case_id };
    }
  }

  // 10. Manual review gate
  if (parsed.needs_manual_review) {
    await updateRow(row.id, {
      status: 'manual_review',
      processing_completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
    });
    await logAuditEvent(null, 'efax_manual_review_required', 'system', {
      row_id: row.id,
      fax_id: row.fax_id,
      reasons: parsed.manual_review_reasons,
      confidence: parsed.confidence,
    });
    return { status: 'manual_review' };
  }

  // 11. Happy path: create case
  if (!parsed.patient_name) {
    // Defensive — shouldn't happen if needs_manual_review is false, but treat
    // as manual review rather than crashing.
    await updateRow(row.id, {
      status: 'manual_review',
      processing_completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
    });
    await logAuditEvent(null, 'efax_manual_review_required', 'system', {
      row_id: row.id,
      fax_id: row.fax_id,
      reasons: ['Patient name missing after extraction'],
    });
    return { status: 'manual_review' };
  }

  const caseNumber = `VUM-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  const nowIso = new Date().toISOString();

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
      intake_confirmation_sent: false,
      intake_received_at: nowIso,
      submitted_documents: row.document_url ? [row.document_url] : [],
      vertical: 'medical',
      submission_fingerprint: fingerprint,
    })
    .select('id, case_number, authorization_number')
    .single();

  if (caseError || !newCase) {
    throw new Error(
      `Failed to insert case: ${caseError?.message || 'unknown error'}`,
    );
  }

  const caseId = newCase.id as string;
  const authorizationNumber = (newCase.authorization_number as string | null) || null;

  // 12. Mark row as case_created
  await updateRow(row.id, {
    status: 'case_created',
    case_id: caseId,
    processing_completed_at: nowIso,
    locked_at: null,
    locked_by: null,
  });

  // 13. Receipt confirmation (non-blocking — case is source of truth)
  try {
    const confirmation = await sendReceiptConfirmation({
      caseId,
      authorizationNumber: authorizationNumber || caseNumber,
      channel: 'efax',
      recipientFax: row.from_number || undefined,
    });
    await supabase
      .from('cases')
      .update({
        intake_confirmation_sent: confirmation.confirmation_sent,
        intake_processed_at: new Date().toISOString(),
      })
      .eq('id', caseId);
  } catch (err) {
    console.warn(
      '[efax-process] sendReceiptConfirmation failed (non-fatal)',
      err instanceof Error ? err.message : err,
    );
  }

  // 14. Intake event
  try {
    await logIntakeEvent({
      channel: 'efax',
      source_identifier: row.from_number || null,
      authorization_number: authorizationNumber,
      case_id: caseId,
      patient_name_hash: hashPatientName(parsed.patient_name),
      status: 'case_created',
      rejection_reason: null,
      metadata: {
        fax_id: row.fax_id,
        row_id: row.id,
        extraction_method: extraction.method,
        ocr_provider: ocrResult.provider,
      },
      processed_at: new Date().toISOString(),
      processed_by: 'system',
    });
  } catch (err) {
    console.warn('[efax-process] logIntakeEvent failed (non-fatal)', err);
  }

  // 15. Audit
  await logAuditEvent(caseId, 'case_created_from_efax_worker', 'system', {
    row_id: row.id,
    fax_id: row.fax_id,
    case_number: newCase.case_number,
    extraction_method: extraction.method,
    ocr_provider: ocrResult.provider,
  });

  return { status: 'case_created', case_id: caseId };
}

async function handleProcessingError(
  rowId: string,
  attempts: number,
  maxAttempts: number,
  error: Error,
): Promise<'dead_letter' | 'failed'> {
  const message = error.message.slice(0, 500);
  console.error('[efax-process] row failed', rowId, message);

  if (attempts >= maxAttempts) {
    await updateRow(rowId, {
      status: 'dead_letter',
      last_error: message,
      processing_completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
    });
    await logAuditEvent(null, 'efax_dead_letter', 'system', {
      row_id: rowId,
      error: message,
      attempts,
    });
    return 'dead_letter';
  }

  // Exponential backoff: 1, 2, 4, 8, 16 min
  const delayMinutes = Math.pow(2, Math.max(0, attempts - 1));
  const nextAttemptAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();

  await updateRow(rowId, {
    status: 'received',
    last_error: message,
    next_attempt_at: nextAttemptAt,
    locked_at: null,
    locked_by: null,
  });
  await logAuditEvent(null, 'efax_worker_retry_scheduled', 'system', {
    row_id: rowId,
    error: message,
    attempts,
    next_attempt_at: nextAttemptAt,
    delay_minutes: delayMinutes,
  });
  return 'failed';
}
