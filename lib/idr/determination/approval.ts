import type { IdrContentCatalog } from './types';

/**
 * Production use requires a person to set status `approved` and
 * `approved_for_production: true` on the checklist and every template.
 * The shipped files stay `draft_pending_human_approval`.
 */
export function catalogApprovedForProduction(catalog: IdrContentCatalog): boolean {
  const approval = catalog.checklist.approval;
  if (approval.status !== 'approved' || approval.approved_for_production !== true) return false;
  return catalog.templates.every(
    (template) => template.status === 'approved' && template.approved_for_production === true,
  );
}
