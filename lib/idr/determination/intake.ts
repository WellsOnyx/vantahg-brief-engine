import type { BriefState, DeterminationRequest, DisputeShape, IntakeRecord } from './types';

export interface IntakeOk {
  ok: true;
  intake: IntakeRecord;
}

export interface IntakeStop {
  ok: false;
  code: 'no_line_items' | 'duplicate_line_item' | 'line_item_invalid' | 'duplicate_document' | 'shape_mismatch' | 'brief_mismatch' | 'request_invalid';
  message: string;
}

/**
 * Records the dispute shape and whether a non-initiating-party brief is in the file.
 * Shape is the line-item count on this dispute.
 * November 1 batching eligibility is not applied here.
 */
export function detectIntake(request: DeterminationRequest): IntakeOk | IntakeStop {
  if (!request.case_id.trim() || !request.dispute_ref.trim()) {
    return { ok: false, code: 'request_invalid', message: 'Case and dispute references are required.' };
  }
  if (request.line_items.length === 0) {
    return { ok: false, code: 'no_line_items', message: 'A determination needs at least one line item.' };
  }
  const lineIds = new Set<string>();
  const lineItems = [];
  for (const item of request.line_items) {
    if (!item.line_id.trim() || !item.label.trim()) {
      return { ok: false, code: 'line_item_invalid', message: 'Each line item needs an id and a label.' };
    }
    if (lineIds.has(item.line_id)) {
      return { ok: false, code: 'duplicate_line_item', message: `Line item ${item.line_id} is repeated.` };
    }
    lineIds.add(item.line_id);
    lineItems.push({ line_id: item.line_id, label: item.label });
  }
  const docIds = new Set<string>();
  for (const doc of request.documents) {
    if (!doc.doc_id.trim()) {
      return { ok: false, code: 'request_invalid', message: 'Each document needs an id.' };
    }
    if (docIds.has(doc.doc_id)) {
      return { ok: false, code: 'duplicate_document', message: `Document ${doc.doc_id} is repeated.` };
    }
    docIds.add(doc.doc_id);
  }
  const shape: DisputeShape = request.line_items.length === 1 ? 'single' : 'batched';
  if (request.asserted_shape && request.asserted_shape !== shape) {
    return {
      ok: false,
      code: 'shape_mismatch',
      message: `The file has ${request.line_items.length} line item(s), so the dispute is ${shape}.`,
    };
  }
  const nipBrief: BriefState = request.documents.some((doc) => doc.role === 'nip_brief') ? 'present' : 'absent';
  if (request.asserted_nip_brief && request.asserted_nip_brief !== nipBrief) {
    return {
      ok: false,
      code: 'brief_mismatch',
      message: `Non-initiating party brief is ${nipBrief}.`,
    };
  }
  return {
    ok: true,
    intake: {
      case_id: request.case_id,
      dispute_ref: request.dispute_ref,
      shape,
      nip_brief: nipBrief,
      line_items: lineItems,
      document_ids: [...docIds],
    },
  };
}
