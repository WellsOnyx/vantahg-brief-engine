'use client';

import { useTenantScope } from '@/lib/tenant-scope';

/**
 * Inline "Showing: <tenant>" badge for pages whose data is scoped by the
 * active tenant filter. Drop it next to a page title so it's obvious when
 * the visible data is filtered down vs. showing all tenants.
 *
 * Renders nothing when the current user can't see the selector (it would
 * be misleading to show "All Tenants" to a non-admin who never had the
 * option to change scope anyway).
 */
export function TenantScopeBadge() {
  const { selectedClientId, selectedClientName, canChangeScope } = useTenantScope();
  if (!canChangeScope) return null;

  if (selectedClientId === null) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        All Tenants
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gold/15 text-gold-dark border border-gold/40"
      title="Use the tenant selector in the top nav to change scope"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-gold" />
      Showing: {selectedClientName ?? 'Selected tenant'}
    </span>
  );
}
