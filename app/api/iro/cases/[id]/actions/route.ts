import { NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { portalContext, portalJson, requirePortalUser } from '@/lib/iro/portal/http';
import { actOnIroCase, refusePhiKeys } from '@/lib/iro/portal/service';
import type { IroAction } from '@/lib/iro/workflow';
import type { IroClassification, PartAAnswer, PartAQuestion, ReviewOutcome } from '@/lib/iro/types';
import { PART_A_QUESTIONS } from '@/lib/iro/types';

export const dynamic = 'force-dynamic';

const CLASSIFICATIONS = new Set<IroClassification>([
  'medical_necessity',
  'experimental_investigational',
  'administrative_legal',
  'combined',
  'idre',
  'um',
  'medical_review',
  'internal_review',
]);

const OUTCOMES = new Set<ReviewOutcome>(['upheld', 'overturned', 'partially_overturned']);

function asAction(body: Record<string, unknown>): IroAction | null {
  const type = body.type;
  if (typeof type !== 'string') return null;
  switch (type) {
    case 'log_intake':
      if (typeof body.timezone !== 'string' || typeof body.arrival_channel !== 'string') return null;
      if (typeof body.referring_entity_ref !== 'string' || typeof body.original_request_ref !== 'string') return null;
      return {
        type,
        timezone: body.timezone,
        arrival_channel: body.arrival_channel,
        referring_entity_ref: body.referring_entity_ref,
        original_request_ref: body.original_request_ref,
        duplicate: body.duplicate === true,
      };
    case 'classify':
      if (typeof body.category !== 'string' || !CLASSIFICATIONS.has(body.category as IroClassification)) return null;
      if (typeof body.review_question !== 'string') return null;
      return {
        type,
        category: body.category as IroClassification,
        expedited: body.expedited === true,
        review_question: body.review_question,
      };
    case 'set_pathway_deadline':
    case 'clear_conflict':
    case 'generate_referral':
    case 'release_records':
    case 'team_lead_process_check':
    case 'md_signoff':
    case 'close_case':
      return { type };
    case 'record_conflict_check':
      if (typeof body.possible !== 'boolean' || !Array.isArray(body.parties)) return null;
      return {
        type,
        possible: body.possible,
        parties: body.parties.filter((item): item is string => typeof item === 'string'),
        prior_line_flags: [],
      };
    case 'accept_case':
      if (typeof body.benefit_exclusion !== 'boolean') return null;
      return { type, benefit_exclusion: body.benefit_exclusion };
    case 'log_records':
      if (!Array.isArray(body.documents) || typeof body.missing !== 'boolean') return null;
      return {
        type,
        missing: body.missing,
        documents: body.documents.flatMap((row) => {
          if (!row || typeof row !== 'object') return [];
          const doc = row as Record<string, unknown>;
          if (typeof doc.ref !== 'string' || typeof doc.pages !== 'number' || typeof doc.readable !== 'boolean') return [];
          return [{ ref: doc.ref, pages: doc.pages, readable: doc.readable }];
        }),
      };
    case 'assign_reviewer':
      if (typeof body.reviewer_id !== 'string') return null;
      return { type, reviewer_id: body.reviewer_id };
    case 'submit_attestation': {
      if (typeof body.signed !== 'boolean' || !body.answers || typeof body.answers !== 'object') return null;
      const answers: Partial<Record<PartAQuestion, PartAAnswer>> = {};
      const raw = body.answers as Record<string, unknown>;
      for (const question of PART_A_QUESTIONS) {
        const value = raw[question];
        if (value === 'yes' || value === 'no' || value === '') answers[question] = value;
      }
      return { type, signed: body.signed, answers };
    }
    case 'complete_review':
      if (typeof body.outcome !== 'string' || !OUTCOMES.has(body.outcome as ReviewOutcome)) return null;
      return { type, outcome: body.outcome as ReviewOutcome };
    case 'issue_notice':
      return { type };
    case 'record_delivery':
      if (body.channel !== 'regular' && body.channel !== 'certified') return null;
      if (typeof body.to_ref !== 'string') return null;
      return { type, channel: body.channel, to_ref: body.to_ref };
    default:
      return null;
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = await applyRateLimit(request, { maxRequests: 60 });
  if (limited) return limited;
  const auth = await requirePortalUser(request);
  if (auth instanceof NextResponse) return auth;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }
  if (refusePhiKeys(body)) return NextResponse.json({ ok: false, error: 'phi_field_refused' }, { status: 400 });
  const action = asAction(body);
  if (!action) return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  const { id } = await context.params;
  const result = await actOnIroCase(auth.user, id, action, await portalContext(request));
  return portalJson(result);
}
