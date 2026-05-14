import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logAuditEvent } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * Signup contract upload + retrieval.
 *
 * POST /api/admin/signups/[id]/contract
 *   multipart/form-data with `file` field. PDF only, ≤10MB. Uploads to
 *   the private `signup-contracts` bucket and updates the signup_request
 *   row with contract_storage_path + uploaded_at + uploaded_by.
 *
 * GET /api/admin/signups/[id]/contract
 *   Returns a short-lived signed URL the admin can use to download or
 *   inline-view what was uploaded. Signed URLs expire in 60 seconds —
 *   intentionally short so a leaked URL has limited blast radius.
 *
 * Both endpoints are admin-only. We deliberately do NOT log the raw
 * filename in audit events — uploaded contracts often have patient or
 * company names in the filename, so we record only content_type + bytes
 * + signup_id.
 */

const BUCKET = 'signup-contracts';
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_CONTENT_TYPES = new Set(['application/pdf']);
const SIGNED_URL_TTL_SECONDS = 60;

function buildStoragePath(signupId: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear().toString();
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const suffix = randomBytes(4).toString('hex');
  // signup_id is a uuid so it's already safe for paths, but defense in depth.
  const safeId = signupId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${safeId}/${yyyy}/${mm}/${Date.now()}-${suffix}.pdf`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRole(request, ['admin']);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 20 });
    if (rateLimited) return rateLimited;

    const { id } = await params;

    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        demo: true,
        message: 'Upload recorded (demo mode — no file persisted).',
        contract_storage_path: `demo/${id}/contract.pdf`,
      }, { headers: { 'X-Demo-Mode': 'true' } });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Invalid multipart payload. Expected form-data with a "file" field.' },
        { status: 400 },
      );
    }

    const fileField = formData.get('file');
    if (!fileField || typeof fileField === 'string') {
      return NextResponse.json({ error: 'A PDF file is required.' }, { status: 400 });
    }
    const file = fileField as File;

    const contentType = file.type || 'application/octet-stream';
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: `Unsupported file type. PDF only (received ${contentType}).` },
        { status: 400 },
      );
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: 'File is empty.' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 10 MB.` },
        { status: 400 },
      );
    }

    const supabase = getServiceClient();

    // Confirm the signup exists before we burn a storage write. Avoids
    // orphaned uploads if the admin opened a stale tab and the row was
    // deleted in the meantime.
    const { data: signup, error: readErr } = await supabase
      .from('signup_requests')
      .select('id, status, legal_name, contract_storage_path')
      .eq('id', id)
      .single();

    if (readErr) {
      if (readErr.code === 'PGRST116') {
        return NextResponse.json({ error: 'Signup not found' }, { status: 404 });
      }
      return apiError(readErr, {
        operation: 'upload_signup_contract_read',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    const path = buildStoragePath(id);
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: false });

    if (uploadErr) {
      return apiError(uploadErr, {
        operation: 'upload_signup_contract_storage',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabase
      .from('signup_requests')
      .update({
        contract_storage_path: path,
        contract_uploaded_at: now,
        contract_uploaded_by: authResult.user.email,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr) {
      // The blob is uploaded but the row didn't get linked. Best-effort
      // cleanup so we don't leave orphan files in the bucket; log loudly
      // either way for manual reconciliation.
      await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
      await logAuditEvent(
        null,
        'security:signup_contract_link_failed',
        authResult.user.email,
        { signup_id: id, attempted_path: path, error_code: updateErr.code ?? null },
        getRequestContext(request),
      );
      return apiError(updateErr, {
        operation: 'upload_signup_contract_link',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Audit — content_type + byte size + signup_id only. Filename is
    // intentionally excluded because uploaded contract filenames often
    // include patient or company names.
    await logAuditEvent(
      null,
      'signup_contract_uploaded',
      authResult.user.email,
      {
        signup_id: id,
        legal_name: signup.legal_name,
        content_type: contentType,
        bytes: file.size,
        replaced_previous: Boolean(signup.contract_storage_path),
      },
      getRequestContext(request),
    );

    return NextResponse.json({ success: true, signup: updated });
  } catch (err) {
    return apiError(err, {
      operation: 'upload_signup_contract',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRole(request, ['admin', 'ceo', 'slt', 'builder']);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const { id } = await params;

    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        demo: true,
        url: '#demo-contract-not-real',
        expires_in_seconds: SIGNED_URL_TTL_SECONDS,
      }, { headers: { 'X-Demo-Mode': 'true' } });
    }

    const supabase = getServiceClient();
    const { data: signup, error: readErr } = await supabase
      .from('signup_requests')
      .select('id, contract_storage_path, legal_name')
      .eq('id', id)
      .single();

    if (readErr) {
      if (readErr.code === 'PGRST116') {
        return NextResponse.json({ error: 'Signup not found' }, { status: 404 });
      }
      return apiError(readErr, {
        operation: 'get_signup_contract_read',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    if (!signup.contract_storage_path) {
      return NextResponse.json({ error: 'No contract uploaded for this signup.' }, { status: 404 });
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(signup.contract_storage_path, SIGNED_URL_TTL_SECONDS);

    if (signErr || !signed?.signedUrl) {
      return apiError(signErr ?? new Error('Signed URL creation returned no URL'), {
        operation: 'get_signup_contract_sign',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    await logAuditEvent(
      null,
      'signup_contract_viewed',
      authResult.user.email,
      { signup_id: id, legal_name: signup.legal_name },
      getRequestContext(request),
    );

    return NextResponse.json({
      success: true,
      url: signed.signedUrl,
      expires_in_seconds: SIGNED_URL_TTL_SECONDS,
    });
  } catch (err) {
    return apiError(err, {
      operation: 'get_signup_contract',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
