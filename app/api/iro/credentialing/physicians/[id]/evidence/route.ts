import { NextResponse } from 'next/server';
import { IRO_HR_ROLES } from '@/lib/iro/access';
import { fromResult, requireIro } from '@/lib/iro/http';
import { addEvidence, sectionOf } from '@/lib/iro/service';
import { EVIDENCE_KINDS, type EvidenceKind } from '@/lib/iro/types';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireIro(request, IRO_HR_ROLES);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  return fromResult(await sectionOf(id, 'evidence'));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireIro(request, IRO_HR_ROLES);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const filename = typeof body.filename === 'string' ? body.filename : 'evidence.pdf';
  const contentType = typeof body.content_type === 'string' ? body.content_type : '';
  const label = typeof body.label === 'string' ? body.label : 'Evidence';
  const kind = typeof body.kind === 'string' ? body.kind : 'other';
  const encoded = typeof body.content_base64 === 'string' ? body.content_base64 : '';
  if (!encoded) return NextResponse.json({ error: 'content_base64 is required' }, { status: 400 });
  if (!(EVIDENCE_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  }
  const bytes = Buffer.from(encoded, 'base64');
  return fromResult(
    await addEvidence(gate.user, id, {
      filename,
      content_type: contentType,
      bytes,
      label,
      kind: kind as EvidenceKind,
    }),
  );
}
