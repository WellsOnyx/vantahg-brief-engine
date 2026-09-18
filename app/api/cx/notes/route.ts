import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { canAccessCxNotes, resolveSpineViewer } from '@/lib/case-spine';
import { CX_NOTE_KINDS, createCxNote, getMemoryCxNoteStore, type CxNoteKind } from '@/lib/cx';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const viewer = resolveSpineViewer(authResult.user, request);
    if (!canAccessCxNotes(viewer)) {
      return NextResponse.json({ error: 'Forbidden', surface: 'cx_notes' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const notes = await getMemoryCxNoteStore().list({
      client_id: searchParams.get('client_id') ?? undefined,
      case_id: searchParams.get('case_id') ?? undefined,
    });
    return NextResponse.json({ notes });
  } catch (err) {
    return apiError(err, {
      operation: 'list_cx_notes',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const viewer = resolveSpineViewer(authResult.user, request);
    if (!canAccessCxNotes(viewer)) {
      return NextResponse.json({ error: 'Forbidden', surface: 'cx_notes' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      client_id?: string;
      case_id?: string | null;
      kind?: string;
      body?: string;
    };
    if (!body.client_id || !body.body || typeof body.body !== 'string') {
      return NextResponse.json({ error: 'client_id and body are required' }, { status: 400 });
    }
    if (body.kind && !(CX_NOTE_KINDS as readonly string[]).includes(body.kind)) {
      return NextResponse.json({ error: 'invalid kind' }, { status: 400 });
    }

    const note = await getMemoryCxNoteStore().insert(
      createCxNote({
        client_id: body.client_id,
        case_id: body.case_id ?? null,
        kind: (body.kind as CxNoteKind) || 'relationship',
        body: body.body.trim(),
        created_by: authResult.user.id,
      }),
    );
    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    return apiError(err, {
      operation: 'create_cx_note',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
