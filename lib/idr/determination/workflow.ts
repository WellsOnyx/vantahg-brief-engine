import {
  applyDraftStamp,
  assertDraftStamped,
  assertExternalSurfaceClean,
} from '@/lib/idr-assist';
import { authorizeLineAccess, type FirewallAuditEvent, type LineActor, type LineScopedRecord } from '@/lib/lines';
import { composeDraft } from './draft';
import { extractFigures } from './extract';
import { buildFactorEvidence, renderFactorBlock } from './factors';
import { detectIntake } from './intake';
import { templateKey } from './load';
import { evaluateGates, findOpsMarkup } from './qa';
import {
  assertBatchingStub,
  assertGatewayClosed,
  november1BatchingRules,
  stubIdrGateway,
  type IdrGatewayPort,
  type IdrGatewayRefusal,
  type November1BatchingDecision,
  type November1BatchingRules,
} from './stubs';
import type {
  BoardFields,
  DeterminationAuditEvent,
  DeterminationRequest,
  DraftPacket,
  DraftStamp,
  FactorEvidence,
  Figure,
  GateResult,
  IdrContentCatalog,
  IdrDeterminationRecord,
  IntakeRecord,
  TemplateFile,
} from './types';

export interface DeterminationDeps {
  now: () => string;
  catalog: IdrContentCatalog;
  audit?: FirewallAuditEvent[];
  workflowAudit?: DeterminationAuditEvent[];
  /** Defaults to the November 1 stub. A live rules object is refused. */
  batching?: November1BatchingRules;
  /** Defaults to the IDR Gateway stub. A live port is refused. */
  gateway?: IdrGatewayPort;
}

export interface DeterminationResult {
  ok: boolean;
  status: 'blocked' | 'ready_for_review';
  code: string;
  message: string;
  signed: false;
  submitted: false;
  clean_text: string | null;
  reviewer_copy: string | null;
  board: BoardFields | null;
  gates: GateResult[];
  intake: IntakeRecord | null;
  figures: Figure[] | null;
  factors: readonly FactorEvidence[] | null;
  stamps: DraftStamp | null;
  record: IdrDeterminationRecord | null;
  batching: November1BatchingDecision | null;
  gateway: IdrGatewayRefusal | null;
}

export interface SignRefusal {
  ok: false;
  signed: false;
  submitted: false;
  code: 'human_signs' | 'never_submit';
  message: string;
}

const READY_NOTE = 'ready for review' as const;

/**
 * Prepares a federal IDR determination draft on the IDR line.
 * A passing QA checklist can reach "ready for review".
 * This function does not sign and does not submit.
 */
export function prepareDetermination(
  actor: LineActor,
  request: DeterminationRequest,
  deps: DeterminationDeps,
): DeterminationResult {
  const denied = denyUnlessIdr(actor, request.case_id, 'prepare', deps);
  if (denied) return denied;

  const gateway = deps.gateway ?? stubIdrGateway();
  if (!assertGatewayClosed(gateway)) {
    return blocked(actor, request, deps, 'gateway_refused', 'IDR Gateway integration is not enabled.', {
      gateway: null,
    });
  }
  const pulled = gateway.pullDispute(request.dispute_ref);
  if (pulled.ok !== false || pulled.live_call !== false || pulled.vendor !== null || pulled.implemented !== false) {
    return blocked(actor, request, deps, 'gateway_refused', 'IDR Gateway did not stay closed.', { gateway: null });
  }
  const gatewayRefusal: IdrGatewayRefusal = {
    ok: false,
    system: 'idr_gateway',
    vendor: null,
    live_call: false,
    implemented: false,
    settled: false,
    code: 'IDR_GATEWAY_UNIMPLEMENTED',
    dispute_ref: request.dispute_ref,
  };

  const batchingRules = deps.batching ?? november1BatchingRules();
  if (!assertBatchingStub(batchingRules)) {
    return blocked(actor, request, deps, 'batching_rules_refused', 'November 1 batching rules are not enabled.', {
      gateway: gatewayRefusal,
    });
  }
  const batching = batchingRules.evaluate({
    line_count: request.line_items.length,
    service_labels: request.line_items.map((item) => item.label),
  });
  if (batching.implemented !== false || batching.eligible !== null || batching.code !== 'NOV_1_BATCHING_UNIMPLEMENTED') {
    return blocked(actor, request, deps, 'batching_rules_refused', 'November 1 batching rules returned a decision.', {
      gateway: gatewayRefusal,
    });
  }

  const detected = detectIntake(request);
  if (!detected.ok) {
    return blocked(actor, request, deps, detected.code, detected.message, { batching, gateway: gatewayRefusal });
  }

  const figures = extractFigures(request);
  const factors = buildFactorEvidence(request, deps.catalog.checklist);
  const shared = { intake: detected.intake, figures, factors, batching, gateway: gatewayRefusal };

  const reason = request.reason?.trim() ?? '';
  if (!request.prevailing_party || !reason) {
    return blocked(
      actor,
      request,
      deps,
      'decision_not_supplied',
      'Prevailing party and reason are required. The system does not select them.',
      shared,
    );
  }

  const templateId = templateKey(request.prevailing_party, detected.intake.nip_brief, detected.intake.shape);
  const template = deps.catalog.byId.get(templateId);
  if (!template) {
    return blocked(actor, request, deps, 'template_missing', `No template is loaded for ${templateId}.`, shared);
  }

  const composed = composeDraft({
    template,
    checklist: deps.catalog.checklist,
    intake: detected.intake,
    figures,
    factorBlock: renderFactorBlock(factors),
    prevailingParty: request.prevailing_party,
    reason,
  });
  if (!composed.ok) {
    return blocked(actor, request, deps, composed.code, composed.message, shared);
  }

  return judgeDraft(actor, request, deps, {
    ...shared,
    template,
    packet: composed.packet,
  });
}

/**
 * Re-runs the hard-stop gates against a draft. Used when reviewer edits are
 * applied to the working text before it can become ready for review.
 * Does not sign or submit.
 */
export function advanceToReadyForReview(
  actor: LineActor,
  request: DeterminationRequest,
  draft: {
    template: TemplateFile;
    intake: IntakeRecord;
    figures: readonly Figure[];
    factors: readonly FactorEvidence[];
    packet: DraftPacket;
  },
  deps: DeterminationDeps,
): DeterminationResult {
  const denied = denyUnlessIdr(actor, request.case_id, 'prepare', deps);
  if (denied) return denied;
  const gateway = stubIdrGateway().pullDispute(request.dispute_ref);
  const batching = november1BatchingRules().evaluate({
    line_count: request.line_items.length,
    service_labels: request.line_items.map((item) => item.label),
  });
  return judgeDraft(actor, request, deps, {
    template: draft.template,
    intake: draft.intake,
    figures: draft.figures,
    factors: draft.factors,
    packet: draft.packet,
    batching,
    gateway,
  });
}

export function signDetermination(): SignRefusal {
  return {
    ok: false,
    signed: false,
    submitted: false,
    code: 'human_signs',
    message: 'A human reviewer signs the determination. The system does not sign.',
  };
}

export function submitDetermination(): SignRefusal {
  return {
    ok: false,
    signed: false,
    submitted: false,
    code: 'never_submit',
    message: 'The system does not submit a federal IDR determination.',
  };
}

export function readDetermination(
  actor: LineActor,
  record: IdrDeterminationRecord,
  deps: Pick<DeterminationDeps, 'now' | 'audit'>,
) {
  return authorizeLineAccess(actor, record, 'read', { now: deps.now, audit: deps.audit });
}

function judgeDraft(
  actor: LineActor,
  request: DeterminationRequest,
  deps: DeterminationDeps,
  draft: {
    template: TemplateFile;
    intake: IntakeRecord;
    figures: readonly Figure[];
    factors: readonly FactorEvidence[];
    packet: DraftPacket;
    batching: November1BatchingDecision;
    gateway: IdrGatewayRefusal;
  },
): DeterminationResult {
  const gates = evaluateGates({
    checklist: deps.catalog.checklist,
    template: draft.template,
    intake: draft.intake,
    figures: draft.figures,
    factors: draft.factors,
    documents: request.documents,
    packet: draft.packet,
  });
  const opsToken = findOpsMarkup(draft.packet.text, deps.catalog.checklist.ops_markup);
  if (opsToken) {
    gates.push({
      id: 'ops_markup',
      label: 'Clean determination text has no ops markup.',
      blocking: true,
      pass: false,
      detail: `ops markup: ${opsToken}`,
    });
  } else {
    try {
      assertExternalSurfaceClean(draft.packet.text, 'determination');
    } catch (error) {
      gates.push({
        id: 'ops_markup',
        label: 'Clean determination text has no ops markup.',
        blocking: true,
        pass: false,
        detail: error instanceof Error ? error.message : 'ops markup',
      });
    }
  }

  const base = {
    intake: draft.intake,
    figures: [...draft.figures],
    factors: draft.factors,
    stamps: draft.packet.stamps,
    batching: draft.batching,
    gateway: draft.gateway,
    gates,
  };
  if (gates.some((gate) => !gate.pass)) {
    return blocked(actor, request, deps, 'qa_failed', 'QA gates failed. The draft cannot advance.', base);
  }

  const clean = draft.packet.text;
  const reviewer = applyDraftStamp(clean);
  assertDraftStamped(reviewer, 'IDR determination');
  const board: BoardFields = {
    prevailing_party: draft.packet.prevailing_party,
    reason: draft.packet.reason,
    date_completed: completedDate(deps.now()),
    note: READY_NOTE,
    status: 'ready_for_review',
  };
  return finish(actor, request, deps, {
    ok: true,
    status: 'ready_for_review',
    code: 'ready',
    message: READY_NOTE,
    clean_text: clean,
    reviewer_copy: reviewer,
    board,
    record: recordFor(request, 'ready_for_review'),
    ...base,
    signed: false,
    submitted: false,
  });
}

function denyUnlessIdr(
  actor: LineActor,
  caseId: string,
  action: DeterminationAuditEvent['action'],
  deps: DeterminationDeps,
): DeterminationResult | null {
  const decision = authorizeLineAccess(actor, probe(caseId), 'write', { now: deps.now, audit: deps.audit });
  if (decision.allowed) return null;
  const result = emptyResult(decision.code, decision.message);
  audit(deps, actor, caseId, action, result.code, false);
  return result;
}

function blocked(
  actor: LineActor,
  request: DeterminationRequest,
  deps: DeterminationDeps,
  code: string,
  message: string,
  extra: Partial<DeterminationResult> = {},
): DeterminationResult {
  return finish(actor, request, deps, {
    ...emptyResult(code, message),
    record: recordFor(request, 'blocked'),
    ...extra,
    ok: false,
    status: 'blocked',
    code,
    message,
    signed: false,
    submitted: false,
    clean_text: null,
    reviewer_copy: null,
    board: null,
  });
}

function finish(
  actor: LineActor,
  request: DeterminationRequest,
  deps: DeterminationDeps,
  result: DeterminationResult,
): DeterminationResult {
  audit(deps, actor, request.case_id, 'prepare', result.code, result.ok);
  return result;
}

function emptyResult(code: string, message: string): DeterminationResult {
  return {
    ok: false,
    status: 'blocked',
    code,
    message,
    signed: false,
    submitted: false,
    clean_text: null,
    reviewer_copy: null,
    board: null,
    gates: [],
    intake: null,
    figures: null,
    factors: null,
    stamps: null,
    record: null,
    batching: null,
    gateway: null,
  };
}

function probe(caseId: string): LineScopedRecord {
  return {
    id: `idr-det-${caseId}`,
    case_id: caseId,
    company: 'VANTA_HG',
    line_of_business: 'IDR',
    kind: 'workflow',
  };
}

function recordFor(request: DeterminationRequest, status: 'blocked' | 'ready_for_review'): IdrDeterminationRecord {
  return {
    id: `idr-det-${request.case_id}`,
    case_id: request.case_id,
    company: 'VANTA_HG',
    line_of_business: 'IDR',
    kind: 'workflow',
    dispute_ref: request.dispute_ref,
    status,
  };
}

function completedDate(nowIso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(nowIso)) {
    throw new Error('now() must return an ISO timestamp.');
  }
  return nowIso.slice(0, 10);
}

function audit(
  deps: DeterminationDeps,
  actor: LineActor,
  caseId: string,
  action: DeterminationAuditEvent['action'],
  code: string,
  ok: boolean,
): void {
  deps.workflowAudit?.push({
    at: deps.now(),
    actor_id: actor.id,
    case_id: caseId,
    action,
    code,
    ok,
  });
}
