import type { CanonicalCase, CaseSpinePriority } from './types';

/** Expedited first, then urgent, then standard. */
export function priorityRank(priority: CaseSpinePriority): number {
  if (priority === 'expedited') return 0;
  if (priority === 'urgent') return 1;
  return 2;
}

/**
 * Med review queue sort from 04: SLA due-at ascending, then priority.
 * Cases with no sla_due_at sort last.
 */
export function sortMdQueue<T extends Pick<CanonicalCase, 'sla_due_at' | 'priority'>>(
  cases: readonly T[],
): T[] {
  return [...cases].sort((a, b) => {
    const slaA = a.sla_due_at ?? '9999-12-31T23:59:59.000Z';
    const slaB = b.sla_due_at ?? '9999-12-31T23:59:59.000Z';
    const sla = slaA.localeCompare(slaB);
    if (sla !== 0) return sla;
    return priorityRank(a.priority) - priorityRank(b.priority);
  });
}
