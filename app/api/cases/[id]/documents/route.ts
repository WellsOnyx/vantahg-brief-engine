/**
 * POST /api/cases/[id]/documents
 *
 * Multipart upload of clinical documents for a case. Stores each file
 * via the storage adapter and appends the resulting path to
 * cases.submitted_documents (text[]).
 *
 * Bucket: 'efax-documents'. We reuse the existing clinical-document
 * bucket (already KMS-encrypted, signed-URL only, in both Supabase
 * and S3 environments) rather than provision a new logical bucket
 * for case-portal uploads — semantically slightly off but avoids an
 * infra change. Path namespacing keeps them separable:
 *   cases/<caseId>/<UTC-yyyymmddThhmmss>-<safe-filename>
 *
 * Constraints:
 *   - Auth required (requireAuth + assertCaseAccess so clients can only
 *     upload to cases they own).
 *   - PDF only for V1. Reject anything else with content_type_unsupported.
 *   - 10 MB per file. The Next.js platform default body limit covers us
 *     before we even hit the adapter.
 *   - At most 5 files per request — keeps the action under the platform's
 *     30-second function timeout on a slow connection.
 *
 * Idempotency: each file goes to a unique timestamp-suffixed path, so
 * re-running the request creates additional entries rather than
 * overwriting. The cases.submitted_documents array preserves order.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { assertCaseAccess } from '@/lib/case-access';
import { getStorageAdapter } from '@/lib/adapters/storage';
import { logAuditEvent } from '@/lib/audit';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

const BUCKET = 'efax-documents';
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set(['application/pdf']);

interface UploadedDoc {
  filename: string;
  storage_path: string;
  bytes: number;
}

interface RejectedDoc {
  filename: string;
  reason: 'content_type_unsupported' | 'too_large' | 'adapter_failed';
  detail?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await applyRateLimit(request, { maxRequests: 20 });
  if (rateLimited) return rateLimited;

  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id: caseId } = await params;

  if (isDemoMode()) {
    return NextResponse.json(
      {
        ok: true,
        demo: true,
        accepted: [],
        rejected: [],
        message: 'Document upload is a no-op in demo mode.',
      },
      { headers: { 'X-Demo-Mode': 'true' } },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  const files = formData.getAll('files').filter((v): v is File => v instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files supplied under "files" field' }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Too many files — limit is ${MAX_FILES} per request.` },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();
  const { data: caseData, error: caseErr } = await supabase
    .from('cases')
    .select('id, client_id, contact_email:clients(contact_email), submitted_documents, case_number')
    .eq('id', caseId)
    .single();
  if (caseErr || !caseData) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  // Tenant ownership / role gate. Writes 403 + security audit itself.
  const denied = await assertCaseAccess(caseData, authResult.user, request);
  if (denied) return denied;

  const adapter = getStorageAdapter();
  const accepted: UploadedDoc[] = [];
  const rejected: RejectedDoc[] = [];

  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) {
      rejected.push({
        filename: file.name,
        reason: 'content_type_unsupported',
        detail: `Got ${file.type || 'unknown'}; only application/pdf is accepted for V1.`,
      });
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      rejected.push({
        filename: file.name,
        reason: 'too_large',
        detail: `File is ${(file.size / 1024 / 1024).toFixed(1)} MB; max is 10 MB.`,
      });
      continue;
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const path = buildCaseDocPath(caseId, file.name);
    const result = await adapter.upload(BUCKET, path, bytes, {
      contentType: 'application/pdf',
      upsert: false,
    });

    if (!result.ok) {
      rejected.push({
        filename: file.name,
        reason: 'adapter_failed',
        detail: `${result.code}: ${result.message}`,
      });
      continue;
    }

    const category = formData.get('category')?.toString() || null;

    accepted.push({
      filename: file.name,
      storage_path: result.path,
      bytes: result.bytes,
      category,
    });
  }

  if (accepted.length > 0) {
    const existing = (caseData as { submitted_documents?: string[] | null }).submitted_documents ?? [];
    const next = [...existing, ...accepted.map((a) => a.storage_path)];

    // Also populate the new rich documents structure (for IDR and future)
    const existingDocs = (caseData as { documents?: any[] | null }).documents ?? [];
    const newDocs = accepted.map((a) => ({
      storage_path: a.storage_path,
      filename: a.filename,
      category: a.category || null,
      bytes: a.bytes,
      uploaded_at: new Date().toISOString(),
      uploaded_by: authResult.user.email,
    }));

    await supabase
      .from('cases')
      .update({
        submitted_documents: next,
        documents: [...existingDocs, ...newDocs],
      })
      .eq('id', caseId);

    await logAuditEvent(
      caseId,
      'case_documents_uploaded',
      authResult.user.email,
      {
        case_number: (caseData as { case_number?: string }).case_number,
        accepted_count: accepted.length,
        rejected_count: rejected.length,
        bytes_total: accepted.reduce((s, a) => s + a.bytes, 0),
      },
      getRequestContext(request),
    ).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    accepted,
    rejected,
  });
}

function buildCaseDocPath(caseId: string, filename: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    now.getUTCFullYear().toString() +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    'T' +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes()) +
    pad(now.getUTCSeconds());
  // Strip path traversal + non-portable chars. Keep dot for the extension.
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return `cases/${caseId}/${stamp}-${safe}`;
}
