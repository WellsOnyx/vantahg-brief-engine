/**
 * Replay E1 fixtures through existing demo API routes (no Next server,
 * no vendor keys, no ENABLE_AWS_* flips). Tokenized refs only.
 */

import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';
import type { PackCaseSpec } from './types';

export interface ApiReplayRow {
  spec_id: string;
  source: PackCaseSpec['source'];
  case_id: string | null;
  type: string | null;
  state: string | null;
  sla_clock: string | null;
  parent_case_id: string | null;
  ok: boolean;
  error: string | null;
  http_status: number;
}

export interface ApiReplayResult {
  passed: boolean;
  count: number;
  cases: ApiReplayRow[];
}

function replayHeaders(): HeadersInit {
  return { 'content-type': 'application/json', 'x-vantaum-role': 'admin' };
}

function intakeBody(spec: PackCaseSpec, clientId: string, parentCaseId?: string) {
  return {
    synthetic: true,
    client_id: clientId,
    type: spec.type ?? 'prior_auth',
    parent_case_id: parentCaseId,
    ...spec.intake,
  };
}

async function fetchCreatedCase(caseId: string): Promise<Record<string, unknown> | null> {
  const { GET } = await import('@/app/api/case-spine/[id]/route');
  const res = await GET(
    new Request(`http://localhost:3000/api/case-spine/${caseId}`) as never,
    { params: Promise.resolve({ id: caseId }) },
  );
  if (res.status !== 200) return null;
  const body = (await res.json()) as { case?: Record<string, unknown> };
  return body.case ?? null;
}

async function createViaSource(
  spec: PackCaseSpec,
  clientId: string,
  parentCaseId?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const payload = intakeBody(spec, clientId, parentCaseId);

  if (spec.source === 'gravity_rail') {
    const { POST } = await import('@/app/api/intake/gravity-rail/route');
    const res = await POST(
      new Request('http://localhost:3000/api/intake/gravity-rail', {
        method: 'POST',
        headers: replayHeaders(),
        body: JSON.stringify(payload),
      }) as never,
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  if (spec.source === 'external_api') {
    const { POST } = await import('@/app/api/external/submit/route');
    const res = await POST(
      new Request('http://localhost:3000/api/external/submit', {
        method: 'POST',
        headers: replayHeaders(),
        body: JSON.stringify(payload),
      }) as never,
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  if (spec.source === 'fax_phaxio') {
    const { POST } = await import('@/app/api/intake/efax/phaxio/route');
    const res = await POST(
      new Request('http://localhost:3000/api/intake/efax/phaxio', {
        method: 'POST',
        headers: replayHeaders(),
        body: JSON.stringify({
          synthetic: true,
          type: spec.type ?? 'prior_auth',
          parent_case_id: parentCaseId,
          fax: {
            id: spec.intake.external_id,
            direction: 'received',
            from_number: '+15555550100',
            to_number: '+15555550199',
            num_pages: 1,
            status: 'success',
            media_url: spec.intake.clinicals_pointer ?? 's3://synth/fax/empty.pdf',
          },
          intake: payload,
        }),
      }) as never,
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  const { POST } = await import('@/app/api/case-spine/route');
  const res = await POST(
    new Request('http://localhost:3000/api/case-spine', {
      method: 'POST',
      headers: replayHeaders(),
      body: JSON.stringify({
        client_id: clientId,
        type: spec.type ?? 'prior_auth',
        parent_case_id: parentCaseId,
        external_id: spec.intake.external_id,
        priority: spec.intake.urgency ?? 'standard',
        packet_storage_keys: spec.intake.clinicals_pointer ? [spec.intake.clinicals_pointer] : [],
        intake: spec.intake,
      }),
    }) as never,
  );
  const body = (await res.json()) as Record<string, unknown>;
  const created = (body.case && typeof body.case === 'object' ? body.case : body) as Record<
    string,
    unknown
  >;
  return { status: res.status, body: { ...body, ...created } };
}

function createdStateOk(spec: PackCaseSpec, state: string | null): boolean {
  if (spec.scenario === 'missing_clinicals') return state === 'intake_incomplete';
  // Create-only: complete packets stay received (R14 cannot jump received → briefing).
  return state === 'received';
}

export async function replaySyntheticPackViaApis(
  specs: readonly PackCaseSpec[],
  opts: { clientId?: string } = {},
): Promise<ApiReplayResult> {
  const clientId = opts.clientId ?? SYNTHETIC_CLIENT_ID;
  const parentByExternal = new Map<string, string>();
  const rows: ApiReplayRow[] = [];

  for (const spec of specs) {
    const parentCaseId = spec.parent_external_id
      ? parentByExternal.get(spec.parent_external_id)
      : undefined;
    try {
      if (spec.parent_external_id && !parentCaseId) {
        throw new Error(`parent ${spec.parent_external_id} has not been created yet`);
      }
      const { status, body } = await createViaSource(spec, clientId, parentCaseId);
      const postedId = typeof body.case_id === 'string' ? body.case_id : null;
      const fetched = postedId ? await fetchCreatedCase(postedId) : null;
      const caseId = typeof fetched?.case_id === 'string' ? fetched.case_id : postedId;
      const type = typeof fetched?.type === 'string' ? fetched.type : null;
      const state = typeof fetched?.state === 'string' ? fetched.state : null;
      const slaClock = typeof fetched?.sla_clock === 'string' ? fetched.sla_clock : null;
      const parent = typeof fetched?.parent_case_id === 'string' ? fetched.parent_case_id : null;
      const typeOk = !spec.expected.type || type === spec.expected.type;
      const clockOk = spec.scenario !== 'missing_clinicals' || slaClock === 'paused';
      const parentOk = !parentCaseId || parent === parentCaseId;
      const ok =
        status < 300 && Boolean(caseId) && createdStateOk(spec, state) && typeOk && clockOk && parentOk;
      if (caseId && spec.intake.external_id) parentByExternal.set(spec.intake.external_id, caseId);
      rows.push({
        spec_id: spec.id,
        source: spec.source,
        case_id: caseId,
        type,
        state,
        sla_clock: slaClock,
        parent_case_id: parent,
        ok,
        error: ok
          ? null
          : `http ${status} state=${state ?? '—'} type=${type ?? '—'} ${typeof body.error === 'string' ? body.error : ''}`,
        http_status: status,
      });
    } catch (err) {
      rows.push({
        spec_id: spec.id,
        source: spec.source,
        case_id: null,
        type: null,
        state: null,
        sla_clock: null,
        parent_case_id: null,
        ok: false,
        error: err instanceof Error ? err.message : 'api_replay_failed',
        http_status: 0,
      });
    }
  }

  return {
    passed: rows.length === specs.length && rows.every((r) => r.ok),
    count: rows.length,
    cases: rows,
  };
}
