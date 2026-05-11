'use client';

import { useTenantScope } from '@/lib/tenant-scope';

/**
 * Admin-only tenant scope dropdown for the top nav.
 *
 * Renders nothing when the current user can't change scope (non-admin or
 * still loading), so non-admin nav layouts aren't affected. When the
 * scope is set to a specific client, the trigger styling switches to
 * gold to make the active filter visible at a glance.
 */
export function TenantScopeSelector() {
  const { selectedClientId, setSelectedClientId, clients, canChangeScope } = useTenantScope();

  if (!canChangeScope) return null;

  const isFiltered = selectedClientId !== null;
  const baseClasses =
    'px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors max-w-[180px] truncate';
  const filteredClasses = 'bg-gold/20 border-gold/50 text-gold hover:bg-gold/30';
  const unfilteredClasses = 'bg-white/10 border-white/20 text-white/90 hover:bg-white/20';

  return (
    <div className="hidden md:flex items-center gap-2 mr-2" title="Filter views by tenant (admin)">
      <span className="text-[10px] uppercase tracking-wider text-white/50 font-semibold">
        Tenant
      </span>
      <select
        value={selectedClientId ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          setSelectedClientId(v === '' ? null : v);
        }}
        className={`${baseClasses} ${isFiltered ? filteredClasses : unfilteredClasses}`}
        aria-label="Tenant scope filter"
      >
        <option value="">All Tenants</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
