/**
 * /api/intake/efax/queue/[id]/document
 *
 * CSR-only endpoint that mints a short-lived signed URL to the source fax
 * document for a given efax_queue row. The triage UI calls this when a
 * reviewer expands the "Source Fax" panel — embedding the PDF directly
 * lets the CSR verify what the OCR / AI extractor actually saw instead
 * of editing extracted fields blind.
 *
 * Auth: internal staff only (requireRole INTERNAL_STAFF_ROLES). The
 * read is audit-logged as a PHI access event because the document may
 * contain protected information.
 *
 * Response shape:
 *   { available: true,  url: string, expires_in_seconds: number }
 *   { available: false, message: string, demo?: boolean }
 *
 * Demo mode short-circuits to `{ available: false, demo: true }` because
 * the demo storage paths point at files that were never uploaded.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent } from '@/lib/audit';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { requireRole, INTERNAL_STAFF_ROLES } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

const BUCKET = 'efax-documents';
const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const authResult = await requireRole(request, [...INTERNAL_STAFF_ROLES]);
    if (authResult instanceof NextResponse) return authResult;
    const actor = authResult.user.email;

    const { id } = await params;

    if (isDemoMode()) {
      return NextResponse.json(
        {
          available: false,
          demo: true,
          message: 'PDF preview is not available in demo mode — the underlying storage path is a placeholder.',
        },
        { headers: { 'X-Demo-Mode': 'true' } },
      );
    }

    const supabase = getServiceClient();
    const { data: row, error: fetchErr } = await supabase
      .from('efax_queue')
      .select('id, storage_path, content_type, fax_id')
      .eq('id', id)
      .single();

    if (fetchErr || !row) {
      return NextResponse.json({ error: 'Queue item not found' }, { status: 404 });
    }

    const storagePath = (row as { storage_path: string | null }).storage_path;
    if (!storagePath) {
      return NextResponse.json({
        available: false,
        message: 'The original document was not persisted to storage. Provider download may have failed at intake.',
      });
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

    if (signErr || !signed?.signedUrl) {
      return NextResponse.json({
        available: false,
        message: `Failed to generate signed URL: ${signErr?.message ?? 'unknown error'}`,
      });
    }

    await logAuditEvent(null, 'efax_document_viewed', actor, {
      efax_queue_id: id,
      fax_id: (row as { fax_id: string }).fax_id,
      storage_path: storagePath,
    });

    return NextResponse.json({
      available: true,
      url: signed.signedUrl,
      expires_in_seconds: SIGNED_URL_TTL_SECONDS,
      content_type: (row as { content_type: string | null }).content_type ?? 'application/pdf',
    });
  } catch (err) {
    console.error('Error generating signed URL for efax document:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
