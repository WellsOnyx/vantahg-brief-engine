/**
 * First-25 live hypercare checklist (04 CX view / 02 onboarding Day 8+).
 * Synthetic only — no live PHI.
 */

export interface HypercareItem {
  item_id: string;
  label: string;
  required: boolean;
  done: boolean;
  done_at: string | null;
  owner: 'cx' | 'ops' | 'client';
}

export const HYPERCARE_FIRST_25: readonly Omit<HypercareItem, 'done' | 'done_at'>[] = [
  { item_id: 'hc-01', label: 'BAA countersigned and filed', required: true, owner: 'ops' },
  { item_id: 'hc-02', label: 'Client config v1 published (SLA + contacts)', required: true, owner: 'cx' },
  { item_id: 'hc-03', label: 'Intake path smoke (synthetic Gravity Rail / API / fax)', required: true, owner: 'ops' },
  { item_id: 'hc-04', label: 'Portal login for TPA admin', required: true, owner: 'client' },
  { item_id: 'hc-05', label: 'Determination download path verified', required: true, owner: 'cx' },
  { item_id: 'hc-06', label: 'Webhook URL + secret recorded (or marked N/A)', required: true, owner: 'cx' },
  { item_id: 'hc-07', label: 'Statement stub generated for staging tenant', required: true, owner: 'ops' },
  { item_id: 'hc-08', label: 'CX owner named on config', required: true, owner: 'cx' },
  { item_id: 'hc-09', label: 'Escalation contacts (L1–L3) confirmed', required: true, owner: 'cx' },
  { item_id: 'hc-10', label: 'First 5 synthetic cases through MD sign', required: true, owner: 'ops' },
  { item_id: 'hc-11', label: 'SLA clocks visible on Client lens', required: true, owner: 'cx' },
  { item_id: 'hc-12', label: 'Stuck-case chase playbook reviewed', required: false, owner: 'cx' },
  { item_id: 'hc-13', label: 'Fan-out failure → resolve_fanout task drill', required: true, owner: 'cx' },
  { item_id: 'hc-14', label: 'Weekly check-in booked', required: true, owner: 'cx' },
  { item_id: 'hc-15', label: 'No live PHI in CX notes', required: true, owner: 'cx' },
  { item_id: 'hc-16', label: 'Shadow pack (10) queued', required: false, owner: 'ops' },
  { item_id: 'hc-17', label: 'Live pack (25) gate criteria agreed', required: true, owner: 'cx' },
  { item_id: 'hc-18', label: 'Rollback owner named', required: true, owner: 'ops' },
  { item_id: 'hc-19', label: 'After-hours pager / Slack path', required: true, owner: 'cx' },
  { item_id: 'hc-20', label: 'Appeal-linked case visible on Client lens', required: false, owner: 'ops' },
  { item_id: 'hc-21', label: 'Invoice / statement summary on Client lens', required: true, owner: 'cx' },
  { item_id: 'hc-22', label: 'Med review queue sort (SLA then priority) confirmed', required: true, owner: 'ops' },
  { item_id: 'hc-23', label: 'RBAC deny: client cannot see CX notes', required: true, owner: 'ops' },
  { item_id: 'hc-24', label: 'RBAC deny: cross-tenant case hidden', required: true, owner: 'ops' },
  { item_id: 'hc-25', label: 'Go / no-go recorded for first live 25', required: true, owner: 'cx' },
];

export interface HypercareProgress {
  client_id: string;
  items: HypercareItem[];
  done: number;
  remaining: number;
  required_remaining: number;
}

export const HYPERCARE_DONE_DEFAULT = new Set([
  'hc-01',
  'hc-02',
  'hc-03',
  'hc-07',
  'hc-08',
  'hc-15',
  'hc-23',
  'hc-24',
]);

export function hypercareForClient(
  clientId: string,
  doneIds: Iterable<string> = HYPERCARE_DONE_DEFAULT,
  now = new Date(),
): HypercareProgress {
  const done = new Set([...HYPERCARE_DONE_DEFAULT, ...doneIds]);
  const items: HypercareItem[] = HYPERCARE_FIRST_25.map((row) => ({
    ...row,
    done: done.has(row.item_id),
    done_at: done.has(row.item_id) ? now.toISOString() : null,
  }));
  return {
    client_id: clientId,
    items,
    done: items.filter((i) => i.done).length,
    remaining: items.filter((i) => !i.done).length,
    required_remaining: items.filter((i) => i.required && !i.done).length,
  };
}
