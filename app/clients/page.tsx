'use client';

import { useEffect, useState } from 'react';
import type { Client, ClientType, OnboardingStatus } from '@/lib/types';

const clientTypeLabels: Record<ClientType, string> = {
  tpa: 'TPA',
  health_plan: 'Health Plan',
  self_funded_employer: 'Self-Funded Employer',
  managed_care_org: 'Managed Care Org (MCO)',
  workers_comp: "Workers' Comp",
  auto_med: 'Auto Med',
};

const onboardingLabels: Record<OnboardingStatus, { label: string; color: string; dot: string }> = {
  pending: { label: 'Pending Setup', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  credentials_needed: { label: 'Credentials Needed', color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  active: { label: 'Active', color: 'bg-green-100 text-green-800', dot: 'bg-green-500' },
  suspended: { label: 'Suspended', color: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
};

interface ClientFormData {
  name: string;
  type: ClientType;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  uses_interqual: boolean;
  uses_mcg: boolean;
  custom_guidelines_url: string;
  contracted_sla_hours: number | '';
  contracted_rate_per_case: number | '';
  interqual_portal_url: string;
  interqual_username: string;
  interqual_api_key: string;
  mcg_portal_url: string;
  mcg_username: string;
  mcg_api_key: string;
  onboarding_notes: string;
}

const emptyForm: ClientFormData = {
  name: '',
  type: 'tpa',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  uses_interqual: false,
  uses_mcg: false,
  custom_guidelines_url: '',
  contracted_sla_hours: '',
  contracted_rate_per_case: '',
  interqual_portal_url: '',
  interqual_username: '',
  interqual_api_key: '',
  mcg_portal_url: '',
  mcg_username: '',
  mcg_api_key: '',
  onboarding_notes: '',
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState<ClientFormData>({ ...emptyForm });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function fetchClients() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/clients');
      if (!res.ok) throw new Error('Failed to load clients');
      setClients(await res.json());
    } catch (err) {
      console.error('Failed to fetch clients:', err);
      setError(err instanceof Error ? err.message : 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditingClient(null);
    setFormData({ ...emptyForm });
    setShowModal(true);
  }

  function openEdit(client: Client) {
    setEditingClient(client);
    setFormData({
      name: client.name,
      type: (client.type || 'tpa') as ClientType,
      contact_name: client.contact_name || '',
      contact_email: client.contact_email || '',
      contact_phone: client.contact_phone || '',
      uses_interqual: client.uses_interqual ?? false,
      uses_mcg: client.uses_mcg ?? false,
      custom_guidelines_url: client.custom_guidelines_url || '',
      contracted_sla_hours: client.contracted_sla_hours ?? '',
      contracted_rate_per_case: client.contracted_rate_per_case ?? '',
      interqual_portal_url: client.interqual_portal_url || '',
      interqual_username: client.interqual_username || '',
      interqual_api_key: client.interqual_api_key || '',
      mcg_portal_url: client.mcg_portal_url || '',
      mcg_username: client.mcg_username || '',
      mcg_api_key: client.mcg_api_key || '',
      onboarding_notes: client.onboarding_notes || '',
    });
    setShowModal(true);
  }

  function computeOnboardingStatus(data: ClientFormData): OnboardingStatus {
    const needsInterqual = data.uses_interqual;
    const needsMcg = data.uses_mcg;
    const hasInterqual = !!(data.interqual_username && data.interqual_api_key);
    const hasMcg = !!(data.mcg_username && data.mcg_api_key);

    if (!needsInterqual && !needsMcg) return 'active'; // no credentials needed
    if (needsInterqual && !hasInterqual) return 'credentials_needed';
    if (needsMcg && !hasMcg) return 'credentials_needed';
    return 'active';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const status = computeOnboardingStatus(formData);
    const payload = {
      ...formData,
      contracted_sla_hours: formData.contracted_sla_hours === '' ? null : Number(formData.contracted_sla_hours),
      contracted_rate_per_case: formData.contracted_rate_per_case === '' ? null : Number(formData.contracted_rate_per_case),
      custom_guidelines_url: formData.custom_guidelines_url || null,
      interqual_portal_url: formData.interqual_portal_url || null,
      interqual_username: formData.interqual_username || null,
      interqual_api_key: formData.interqual_api_key || null,
      mcg_portal_url: formData.mcg_portal_url || null,
      mcg_username: formData.mcg_username || null,
      mcg_api_key: formData.mcg_api_key || null,
      onboarding_notes: formData.onboarding_notes || null,
      onboarding_status: status,
      credentials_configured_at: status === 'active' ? new Date().toISOString() : null,
    };

    console.log(`[Demo] ${editingClient ? 'Updating' : 'Creating'} client:`, payload);

    try {
      if (editingClient) {
        await fetch(`/api/clients/${editingClient.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      setToast({ message: editingClient ? 'Client updated successfully' : 'Client added successfully', type: 'success' });
    } catch {
      setToast({ message: 'Operation completed (demo mode)', type: 'success' });
    }

    setShowModal(false);
    fetchClients();
  }

  function formatCurrency(amount: number | null | undefined): string {
    if (amount == null) return '---';
    return `$${amount.toFixed(2)}`;
  }

  function formatSLA(hours: number | null | undefined): string {
    if (hours == null) return '---';
    return `${hours} hours`;
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[60] px-5 py-3 rounded-lg shadow-lg text-sm font-medium animate-slide-up ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl text-navy">Clients</h1>
          <p className="text-muted mt-1">Manage TPA, health plan, and employer clients</p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 bg-navy text-white px-5 py-2.5 rounded-lg font-medium hover:bg-navy-light transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Client
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 animate-fade-in">
          <div className="bg-surface rounded-xl border border-red-200 shadow-sm p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">Something went wrong</h3>
                <p className="text-sm text-muted mt-1">{error}</p>
              </div>
              <button
                onClick={fetchClients}
                className="inline-flex items-center gap-2 bg-navy text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-navy-light transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-surface rounded-lg border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="animate-fade-in">
            {/* Skeleton table header */}
            <div className="border-b border-border bg-gray-50 px-5 py-3 flex items-center gap-6">
              <div className="skeleton w-20 h-3 rounded" />
              <div className="skeleton w-14 h-3 rounded" />
              <div className="skeleton w-16 h-3 rounded" />
              <div className="skeleton w-20 h-3 rounded" />
              <div className="skeleton w-20 h-3 rounded" />
              <div className="skeleton w-16 h-3 rounded" />
              <div className="flex-1" />
              <div className="skeleton w-14 h-3 rounded" />
            </div>
            {/* Skeleton rows */}
            <div className="divide-y divide-border">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-6">
                  <div className="skeleton w-36 h-4 rounded" />
                  <div className="skeleton skeleton-badge" />
                  <div>
                    <div className="skeleton w-28 h-4 rounded mb-1" />
                    <div className="skeleton w-36 h-3 rounded" />
                  </div>
                  <div className="hidden md:flex gap-1">
                    <div className="skeleton skeleton-badge" />
                  </div>
                  <div className="skeleton w-16 h-4 rounded" />
                  <div className="skeleton w-14 h-4 rounded" />
                  <div className="flex-1" />
                  <div className="skeleton w-10 h-4 rounded" />
                </div>
              ))}
            </div>
          </div>
        ) : clients.length === 0 ? (
          <div className="p-12 text-center animate-slide-up">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-navy/5 flex items-center justify-center">
              <svg className="w-8 h-8 text-navy/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
              </svg>
            </div>
            <h3 className="font-semibold text-base text-foreground font-[family-name:var(--font-dm-serif)]">
              No clients yet
            </h3>
            <p className="text-sm text-muted mt-2 max-w-sm mx-auto">
              Add your first TPA, health plan, or employer client to start managing contracts and clinical guidelines.
            </p>
            <button
              onClick={openAdd}
              className="mt-6 inline-flex items-center gap-2 bg-navy text-white px-5 py-2.5 rounded-lg font-medium text-sm hover:bg-navy-light transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Client
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium text-muted whitespace-nowrap">Name</th>
                  <th className="text-left px-5 py-3 font-medium text-muted whitespace-nowrap">Type</th>
                  <th className="text-left px-5 py-3 font-medium text-muted whitespace-nowrap">Contact</th>
                  <th className="text-left px-5 py-3 font-medium text-muted whitespace-nowrap">Guidelines</th>
                  <th className="text-right px-5 py-3 font-medium text-muted whitespace-nowrap">Contracted SLA</th>
                  <th className="text-right px-5 py-3 font-medium text-muted whitespace-nowrap">Rate / Case</th>
                  <th className="text-center px-5 py-3 font-medium text-muted whitespace-nowrap">Status</th>
                  <th className="text-right px-5 py-3 font-medium text-muted whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const hasGuidelines = c.uses_interqual || c.uses_mcg;

                  return (
                    <tr key={c.id} className="border-b border-border hover:bg-gray-50/70 transition-colors">
                      {/* Name */}
                      <td className="px-5 py-3 font-medium text-foreground">{c.name}</td>
                      {/* Type */}
                      <td className="px-5 py-3">
                        <span className="bg-navy/10 text-navy px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap">
                          {c.type ? clientTypeLabels[c.type] : '---'}
                        </span>
                      </td>
                      {/* Contact */}
                      <td className="px-5 py-3">
                        {c.contact_name ? (
                          <div>
                            <div className="font-medium text-foreground">{c.contact_name}</div>
                            {c.contact_email && (
                              <div className="text-xs text-muted mt-0.5">{c.contact_email}</div>
                            )}
                            {c.contact_phone && (
                              <div className="text-xs text-muted">{c.contact_phone}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted">---</span>
                        )}
                      </td>
                      {/* Guidelines + Credential Status */}
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {c.uses_interqual && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              c.interqual_username && c.interqual_api_key
                                ? 'bg-green-100 text-green-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={
                                  c.interqual_username && c.interqual_api_key
                                    ? "M5 13l4 4L19 7"
                                    : "M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75"
                                } />
                              </svg>
                              InterQual
                            </span>
                          )}
                          {c.uses_mcg && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              c.mcg_username && c.mcg_api_key
                                ? 'bg-green-100 text-green-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={
                                  c.mcg_username && c.mcg_api_key
                                    ? "M5 13l4 4L19 7"
                                    : "M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75"
                                } />
                              </svg>
                              MCG
                            </span>
                          )}
                          {!hasGuidelines && c.custom_guidelines_url && (
                            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-xs font-medium">
                              Custom
                            </span>
                          )}
                          {!hasGuidelines && !c.custom_guidelines_url && (
                            <span className="text-muted text-xs">---</span>
                          )}
                        </div>
                      </td>
                      {/* SLA */}
                      <td className="px-5 py-3 text-right tabular-nums">
                        {formatSLA(c.contracted_sla_hours)}
                      </td>
                      {/* Rate */}
                      <td className="px-5 py-3 text-right tabular-nums font-medium">
                        {formatCurrency(c.contracted_rate_per_case)}
                      </td>
                      {/* Onboarding Status */}
                      <td className="px-5 py-3 text-center">
                        {(() => {
                          const s = onboardingLabels[c.onboarding_status || 'pending'];
                          return (
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                              {s.label}
                            </span>
                          );
                        })()}
                      </td>
                      {/* Actions */}
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => openEdit(c)} className="text-navy hover:underline text-sm font-medium">
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && clients.length > 0 && (
          <div className="px-5 py-3 border-t border-border bg-gray-50/50 text-xs text-muted">
            {clients.length} client{clients.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* ── Add/Edit Modal ───────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 overflow-y-auto py-8">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 animate-scale-in">
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-[family-name:var(--font-dm-serif)] text-xl text-navy">
                {editingClient ? 'Edit Client' : 'Add Client'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-muted hover:text-foreground p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {/* ── Organization Info ────────────────────────── */}
              <div className="text-xs font-semibold text-muted uppercase tracking-wider">Organization Information</div>

              <div>
                <label className="block text-sm font-medium mb-1">Organization Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Acme Health Systems"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as ClientType })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                >
                  {Object.entries(clientTypeLabels).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>

              {/* ── Contact ──────────────────────────────────── */}
              <div className="border-t border-border pt-5">
                <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Contact Information</div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Contact Name</label>
                <input
                  type="text"
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  placeholder="Jane Smith"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    placeholder="jane@acmehealth.com"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                    placeholder="(555) 123-4567"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                  />
                </div>
              </div>

              {/* ── Guidelines ───────────────────────────────── */}
              <div className="border-t border-border pt-5">
                <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Clinical Guidelines</div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border cursor-pointer hover:bg-gray-50 transition-colors">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={formData.uses_interqual}
                      onChange={(e) => setFormData({ ...formData, uses_interqual: e.target.checked })}
                      className="w-5 h-5 rounded border-border text-navy focus:ring-navy/20"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">Uses InterQual</div>
                    <div className="text-xs text-muted">Change Healthcare InterQual clinical criteria</div>
                  </div>
                  {formData.uses_interqual && (
                    <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded-full text-xs font-medium">Active</span>
                  )}
                </label>

                <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border cursor-pointer hover:bg-gray-50 transition-colors">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={formData.uses_mcg}
                      onChange={(e) => setFormData({ ...formData, uses_mcg: e.target.checked })}
                      className="w-5 h-5 rounded border-border text-navy focus:ring-navy/20"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">Uses MCG</div>
                    <div className="text-xs text-muted">MCG Health evidence-based guidelines</div>
                  </div>
                  {formData.uses_mcg && (
                    <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded-full text-xs font-medium">Active</span>
                  )}
                </label>

                {!formData.uses_interqual && !formData.uses_mcg && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Custom Guidelines URL</label>
                    <p className="text-xs text-muted mb-2">If not using InterQual or MCG, provide a link to custom guidelines</p>
                    <input
                      type="url"
                      value={formData.custom_guidelines_url}
                      onChange={(e) => setFormData({ ...formData, custom_guidelines_url: e.target.value })}
                      placeholder="https://guidelines.example.com/criteria"
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                    />
                  </div>
                )}
              </div>

              {/* ── Criteria Credentials ─────────────────────── */}
              {(formData.uses_interqual || formData.uses_mcg) && (
                <div className="border-t border-border pt-5">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Criteria Credentials</div>
                  <p className="text-xs text-muted mb-4">Login credentials provided by the client under their license. Stored encrypted at rest.</p>

                  {/* Onboarding Checklist */}
                  <div className="bg-navy/5 rounded-lg p-4 mb-4">
                    <div className="text-xs font-semibold text-navy mb-2">Onboarding Checklist</div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[10px] ${formData.contact_email ? 'bg-green-500' : 'bg-gray-300'}`}>
                          {formData.contact_email ? '\u2713' : ''}
                        </span>
                        <span className={formData.contact_email ? 'text-foreground' : 'text-muted'}>Contact information provided</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[10px] ${formData.contracted_sla_hours ? 'bg-green-500' : 'bg-gray-300'}`}>
                          {formData.contracted_sla_hours ? '\u2713' : ''}
                        </span>
                        <span className={formData.contracted_sla_hours ? 'text-foreground' : 'text-muted'}>Contract terms configured</span>
                      </div>
                      {formData.uses_interqual && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[10px] ${formData.interqual_username && formData.interqual_api_key ? 'bg-green-500' : 'bg-amber-500'}`}>
                            {formData.interqual_username && formData.interqual_api_key ? '\u2713' : '!'}
                          </span>
                          <span className={formData.interqual_username && formData.interqual_api_key ? 'text-foreground' : 'text-amber-700 font-medium'}>
                            InterQual credentials {formData.interqual_username && formData.interqual_api_key ? 'configured' : 'needed'}
                          </span>
                        </div>
                      )}
                      {formData.uses_mcg && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[10px] ${formData.mcg_username && formData.mcg_api_key ? 'bg-green-500' : 'bg-amber-500'}`}>
                            {formData.mcg_username && formData.mcg_api_key ? '\u2713' : '!'}
                          </span>
                          <span className={formData.mcg_username && formData.mcg_api_key ? 'text-foreground' : 'text-amber-700 font-medium'}>
                            MCG credentials {formData.mcg_username && formData.mcg_api_key ? 'configured' : 'needed'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* InterQual Credentials */}
                  {formData.uses_interqual && (
                    <div className="bg-surface rounded-lg border border-border p-4 mb-3">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded bg-navy/10 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                          </svg>
                        </div>
                        <span className="text-sm font-semibold text-navy">InterQual Access</span>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-muted mb-1">Portal URL</label>
                          <input
                            type="url"
                            value={formData.interqual_portal_url}
                            onChange={(e) => setFormData({ ...formData, interqual_portal_url: e.target.value })}
                            placeholder="https://interqual.changehealthcare.com"
                            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-muted mb-1">Username</label>
                            <input
                              type="text"
                              value={formData.interqual_username}
                              onChange={(e) => setFormData({ ...formData, interqual_username: e.target.value })}
                              placeholder="client-vhg-reviewer"
                              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-muted mb-1">API Key / Password</label>
                            <input
                              type="password"
                              value={formData.interqual_api_key}
                              onChange={(e) => setFormData({ ...formData, interqual_api_key: e.target.value })}
                              placeholder="••••••••••••"
                              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MCG Credentials */}
                  {formData.uses_mcg && (
                    <div className="bg-surface rounded-lg border border-border p-4 mb-3">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded bg-navy/10 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                          </svg>
                        </div>
                        <span className="text-sm font-semibold text-navy">MCG Cite Access</span>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-muted mb-1">Portal URL</label>
                          <input
                            type="url"
                            value={formData.mcg_portal_url}
                            onChange={(e) => setFormData({ ...formData, mcg_portal_url: e.target.value })}
                            placeholder="https://cite.mcg.com"
                            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-muted mb-1">Username</label>
                            <input
                              type="text"
                              value={formData.mcg_username}
                              onChange={(e) => setFormData({ ...formData, mcg_username: e.target.value })}
                              placeholder="client-vhg-ops"
                              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-muted mb-1">API Key / Password</label>
                            <input
                              type="password"
                              value={formData.mcg_api_key}
                              onChange={(e) => setFormData({ ...formData, mcg_api_key: e.target.value })}
                              placeholder="••••••••••••"
                              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Onboarding Notes */}
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Onboarding Notes</label>
                    <textarea
                      value={formData.onboarding_notes}
                      onChange={(e) => setFormData({ ...formData, onboarding_notes: e.target.value })}
                      placeholder="Notes on credential setup, license agreements, renewal dates..."
                      rows={2}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none resize-none"
                    />
                  </div>
                </div>
              )}

              {/* ── Contract Terms ───────────────────────────── */}
              <div className="border-t border-border pt-5">
                <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Contract Terms</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Contracted SLA (hours)</label>
                  <p className="text-xs text-muted mb-2">Maximum turnaround time in hours</p>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={formData.contracted_sla_hours}
                    onChange={(e) => setFormData({ ...formData, contracted_sla_hours: e.target.value === '' ? '' : Number(e.target.value) })}
                    placeholder="48"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Rate Per Case</label>
                  <p className="text-xs text-muted mb-2">Contracted rate per review</p>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted font-medium">$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={formData.contracted_rate_per_case}
                      onChange={(e) => setFormData({ ...formData, contracted_rate_per_case: e.target.value === '' ? '' : Number(e.target.value) })}
                      placeholder="85.00"
                      className="w-full border border-border rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                    />
                  </div>
                </div>
              </div>
            </form>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3 bg-gray-50/50 rounded-b-xl">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={(e) => {
                  const form = (e.currentTarget.closest('.animate-scale-in') as HTMLElement)?.querySelector('form');
                  if (form) form.requestSubmit();
                }}
                className="bg-navy text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-navy-light transition-colors"
              >
                {editingClient ? 'Save Changes' : 'Add Client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
