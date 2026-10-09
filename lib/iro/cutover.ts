export interface CutoverChecklist {
  workspace_tested: boolean;
  transferred_records_checked: boolean;
  access_permissions_confirmed: boolean;
}

export interface CutoverDecision {
  ready: boolean;
  missing: string[];
  gate: 'closed' | 'open';
}

const ITEMS: Array<keyof CutoverChecklist> = [
  'workspace_tested',
  'transferred_records_checked',
  'access_permissions_confirmed',
];

/**
 * Credentialing stays on the interim workbook until all three checks
 * are confirmed. The workspace can be exercised before the gate opens.
 */
export function evaluateCutover(checklist: CutoverChecklist, openRequested: boolean): CutoverDecision {
  const missing = ITEMS.filter((item) => checklist[item] !== true);
  const ready = missing.length === 0;
  return {
    ready,
    missing,
    gate: ready && openRequested ? 'open' : 'closed',
  };
}
