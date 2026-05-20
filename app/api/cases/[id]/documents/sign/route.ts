/**
 * GET /api/cases/[id]/documents/sign?path=<storage-path>
 *
 * Mints a short-lived signed URL for one document attached to a case.
 * Used by the case detail page's Documents card so reviewers can
 * download the PDFs that TPAs / providers uploaded via the portal.
 *
 * Security: defense-in-depth on the path argument. The caller passes
 * a storage path string, which we validate to:
 *   - belong to this case's namespace (`cases/<id>/...`)
 *   - appear in cases.submitted_documents[] for this row (so a TPA
 *     who knows the URL pattern still can't peek into another case's
 *     uploads even within their own tenant)
 *
 * Both checks are cheap and stack — if either fails, return 404 to
 * avoid leaking whether the document exists elsewhere.
 *
 * Auth: requireAuth + assertCaseAccess (tenant ownership).
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
const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
  if (rateLimited) return rateLimited;

  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id: caseId } = await params;
  const path = new URL(request.url).searchParams.get('path');
  if (!path) {
    return NextResponse.json({ error: 'path query param is required' }, { status: 400 });
  }

  if (isDemoMode()) {
    return NextResponse.json(
      {
        available: false,
        demo: true,
        message: 'Document download is a no-op in demo mode.',
      },
      { headers: { 'X-Demo-Mode': 'true' } },
    );
  }

  // Cheap structural guard — paths from this case must live under its
  // own namespace. Caller passing any other path (../ traversal,
  // another case's prefix, raw bucket root) gets 404.
  const expectedPrefix = `cases/${caseId}/`;
  if (!path.startsWith(expectedPrefix) || path.includes('..')) {
    await logAuditEvent(caseId, 'security:document_sign_invalid_path', authResult.user.email, {
      requested_path: path,
    }, getRequestContext(request)).catch(() => {});
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const supabase = getServiceClient();
  const { data: caseData, error } = await supabase
    .from('cases')
    .select('id, client_id, case_number, submitted_documents')
    .eq('id', caseId)
    .single();
  if (error || !caseData) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  // Tenant access gate (writes its own 403 + audit if denied).
  const denied = await assertCaseAccess(caseData, authResult.user, request);
  if (denied) return denied;

  const docs = (caseData as { submitted_documents?: string[] | null }).submitted_documents ?? [];
  if (!docs.includes(path)) {
    // The path passes the prefix check but isn't actually one of this
    // case's uploads. Same 404 as the prefix-mismatch branch — never
    // tell the caller whether the file exists elsewhere.
    await logAuditEvent(caseId, 'security:document_sign_unknown_path', authResult.user.email, {
      requested_path: path,
    }, getRequestContext(request)).catch(() => {});
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const adapter = await getStorageAdapter();
  const signed = await adapter.signedUrl(BUCKET, path, SIGNED_URL_TTL_SECONDS);
  if (!signed.ok) {
    return NextResponse.json(
      { error: `Could not generate signed URL: ${signed.code}` },
      { status: signed.code === 'not_found' ? 404 : 500 },
    );
  }

  await logAuditEvent(
    caseId,
    'case_document_viewed',
    authResult.user.email,
    {
      case_number: (caseData as { case_number?: string }).case_number,
      storage_path: path,
    },
    getRequestContext(request),
  ).catch(() => {});

  return NextResponse.json({
    available: true,
    url: signed.url,
    expires_in_seconds: SIGNED_URL_TTL_SECONDS,
  });
}
