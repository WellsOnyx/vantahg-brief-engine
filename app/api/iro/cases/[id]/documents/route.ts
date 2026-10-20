import { NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { portalContext, portalJson, requirePortalUser } from '@/lib/iro/portal/http';
import { attachIroDocument, readIroCase } from '@/lib/iro/portal/service';
import { getIroPortalStore } from '@/lib/iro/portal/store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  const ctx = await portalContext(request);
  const readable = await readIroCase(auth.user, id, ctx);
  if (!readable.ok) return portalJson(readable);
  const docs = await getIroPortalStore().listDocuments(id);
  return NextResponse.json({
    ok: true,
    documents: docs.map((row) => ({
      id: row.id,
      storage_key: row.storage_key,
      bucket: row.bucket,
      byte_size: row.byte_size,
      created_at: row.created_at,
    })),
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = await applyRateLimit(request, { maxRequests: 20 });
  if (limited) return limited;
  const auth = await requirePortalUser(request);
  if (auth instanceof NextResponse) return auth;
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const { id } = await context.params;
  const result = await attachIroDocument(
    auth.user,
    id,
    { bytes, contentType: file.type || 'application/octet-stream' },
    await portalContext(request),
  );
  return portalJson(result);
}
