import { payloadHash } from './hash';
import type {
  CanonicalCase,
  DeterminationPackage,
  SignDeterminationInput,
  SpineBrief,
} from './types';

export function determinationStorageKey(caseId: string, version: number): string {
  return `determinations/${caseId}/${version}/`;
}

export function renderDeterminationLetterHtml(
  c: CanonicalCase,
  input: SignDeterminationInput,
  brief: SpineBrief,
): string {
  const determinedAt = c.determined_at ?? new Date().toISOString();
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Determination ${c.case_number}</title></head>
<body>
<h1>VantaUM determination</h1>
<p>Case: ${escapeHtml(c.case_number)} (${escapeHtml(c.case_id)})</p>
<p>Type: ${escapeHtml(c.type)} · Lane: ${escapeHtml(c.lane ?? 'unset')}</p>
<p>Member ref: ${escapeHtml(c.intake.member_ref ?? 'n/a')}</p>
<p>Service/Rx: ${escapeHtml(c.intake.service_or_rx ?? 'n/a')}</p>
<p>Determination: <strong>${escapeHtml(input.determination)}</strong></p>
<p>Signed at: ${escapeHtml(determinedAt)}</p>
<p>Signer: ${escapeHtml(c.signer_id ?? 'unknown')}</p>
<p>Brief: ${escapeHtml(brief.brief_id)} (${escapeHtml(brief.source)})</p>
<h2>Rationale</h2>
<p>${escapeHtml(input.rationale)}</p>
<p><em>Synthetic package. No live PHI. Phase 4 fans this out to portal, webhook, and ledger.</em></p>
</body></html>`;
}

export function buildDeterminationPackage(input: {
  case: CanonicalCase;
  brief: SpineBrief;
  sign: SignDeterminationInput;
  version: number;
  signer_id: string;
  signed_at: string;
  billable_event_id: string;
  previous_version?: number | null;
}): DeterminationPackage {
  const storage_key = determinationStorageKey(input.case.case_id, input.version);
  const evidence_manifest = {
    packet_storage_keys: [...input.case.packet_storage_keys],
    hashes: Object.fromEntries(
      input.case.packet_storage_keys.map((key) => [key, payloadHash({ key, case_id: input.case.case_id })]),
    ),
  };
  const letter_html = renderDeterminationLetterHtml(
    { ...input.case, signer_id: input.signer_id, determined_at: input.signed_at },
    input.sign,
    input.brief,
  );
  const draft: Omit<DeterminationPackage, 'content_hash'> = {
    version: input.version,
    case_id: input.case.case_id,
    storage_key,
    brief_id: input.brief.brief_id,
    brief_hash: input.brief.content_hash,
    determination: input.sign.determination,
    rationale: input.sign.rationale,
    letter_html,
    evidence_manifest,
    signer_id: input.signer_id,
    signed_at: input.signed_at,
    session_refs: {
      actor: input.signer_id,
      ip: input.sign.session_refs?.ip ?? null,
      request_id: input.sign.session_refs?.request_id ?? null,
    },
    criteria_snapshot: input.brief.content.criteria_match,
    cm_flags: input.sign.cm_flags ? [...input.sign.cm_flags] : [...input.case.cm_flags],
    fanout_enqueued: true,
    billable_event_id: input.billable_event_id,
    immutable: true,
    previous_version: input.previous_version ?? null,
  };
  return {
    ...draft,
    content_hash: payloadHash({
      case_id: draft.case_id,
      version: draft.version,
      determination: draft.determination,
      brief_id: draft.brief_id,
      brief_hash: draft.brief_hash,
      signer_id: draft.signer_id,
      signed_at: draft.signed_at,
      rationale: draft.rationale,
      evidence_manifest: draft.evidence_manifest,
    }),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
