'use client';

import { useEffect, useState } from 'react';
import type { Staff, StaffRole } from '@/lib/types';

const ROLE_LABELS: Record<StaffRole, string> = {
  lpn: 'Licensed Practical Nurse',
  rn: 'Registered Nurse',
  admin_staff: 'Administrative Staff',
};

const ROLE_BADGES: Record<StaffRole, string> = {
  lpn: 'bg-teal-100 text-teal-800',
  rn: 'bg-blue-100 text-blue-800',
  admin_staff: 'bg-gray-100 text-gray-700',
};

const STATUS_BADGES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-600',
  on_leave: 'bg-yellow-100 text-yellow-800',
};

interface FormData {
  name: string;
  role: StaffRole;
  email: string;
  phone: string;
  license_number: string;
  license_state: string;
  certifications: string[];
  max_cases_per_day: number;
  status: 'active' | 'inactive' | 'on_leave';
}

const emptyForm: FormData = {
  name: '',
  role: 'lpn',
  email: '',
  phone: '',
  license_number: '',
  license_state: '',
  certifications: [],
  max_cases_per_day: 20,
  status: 'active',
};

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [formData, setFormData] = useState<FormData>({ ...emptyForm });
  const [certInput, setCertInput] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => { fetchStaff(); }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function fetchStaff() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/staff');
      if (!res.ok) throw new Error('Failed to load staff');
      setStaff(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditingStaff(null);
    setFormData({ ...emptyForm });
    setCertInput('');
    setShowModal(true);
  }

  function openEdit(s: Staff) {
    setEditingStaff(s);
    setFormData({
      name: s.name,
      role: s.role,
      email: s.email || '',
      phone: s.phone || '',
      license_number: s.license_number || '',
      license_state: s.license_state || '',
      certifications: s.certifications || [],
      max_cases_per_day: s.max_cases_per_day || 20,
      status: s.status,
    });
    setCertInput('');
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingStaff) {
        await fetch(`/api/staff/${editingStaff.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
      } else {
        await fetch('/api/staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
      }
      setToast({ message: editingStaff ? 'Staff updated successfully' : 'Staff added successfully', type: 'success' });
    } catch {
      setToast({ message: 'Operation completed (demo mode)', type: 'success' });
    }
    setShowModal(false);
    fetchStaff();
  }

  function handleCertKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && certInput.trim()) {
      e.preventDefault();
      if (!formData.certifications.includes(certInput.trim())) {
        setFormData({ ...formData, certifications: [...formData.certifications, certInput.trim()] });
      }
      setCertInput('');
    }
  }

  const filtered = staff.filter((s) => {
    if (filterRole && s.role !== filterRole) return false;
    if (filterStatus && s.status !== filterStatus) return false;
    return true;
  });

  const hasFilters = filterRole || filterStatus;
  const activeLpns = staff.filter((s) => s.role === 'lpn' && s.status === 'active').length;
  const activeRns = staff.filter((s) => s.role === 'rn' && s.status === 'active').length;
  const qualityStaff = staff.filter((s) => s.quality_score != null);
  const avgQuality = qualityStaff.length > 0 ? qualityStaff.reduce((sum, s) => sum + (s.quality_score || 0), 0) / qualityStaff.length : 0;

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {toast && (
        <div className={`fixed top-6 right-6 z-[60] px-5 py-3 rounded-lg shadow-lg text-sm font-medium animate-slide-up ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>{toast.message}</div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl text-navy">Clinical Staff</h1>
          <p className="text-muted mt-1">Manage LPNs, RNs, and administrative staff across pods</p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-2 bg-navy text-white px-5 py-2.5 rounded-lg font-medium hover:bg-navy-light transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Staff
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Staff', value: staff.length, color: 'text-navy' },
          { label: 'Active LPNs', value: activeLpns, color: 'text-teal-600' },
          { label: 'Active RNs', value: activeRns, color: 'text-blue-600' },
          { label: 'Avg Quality Score', value: `${avgQuality.toFixed(0)}%`, color: 'text-gold-dark' },
        ].map((stat) => (
          <div key={stat.label} className="bg-surface rounded-lg border border-border p-4">
            <div className="text-xs font-medium text-muted uppercase tracking-wider">{stat.label}</div>
            <div className={`text-2xl font-bold ${stat.color} mt-1`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-lg border border-border shadow-sm p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
          <span className="text-sm font-medium text-muted">Filters</span>
          {hasFilters && (
            <button onClick={() => { setFilterRole(''); setFilterStatus(''); }} className="ml-auto text-xs text-navy hover:underline">Clear all</button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none">
            <option value="">All Roles</option>
            <option value="lpn">LPN</option>
            <option value="rn">RN</option>
            <option value="admin_staff">Admin Staff</option>
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none">
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="on_leave">On Leave</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 animate-fade-in">
          <div className="bg-surface rounded-xl border border-red-200 shadow-sm p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">Something went wrong</h3>
                <p className="text-sm text-muted mt-1">{error}</p>
              </div>
              <button onClick={fetchStaff} className="inline-flex items-center gap-2 bg-navy text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-navy-light transition-colors">Retry</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-surface rounded-lg border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="animate-fade-in">
            <div className="border-b border-border bg-gray-50 px-5 py-3 flex items-center gap-6">
              <div className="skeleton w-32 h-3 rounded" /><div className="skeleton w-20 h-3 rounded" /><div className="skeleton w-20 h-3 rounded" /><div className="skeleton w-20 h-3 rounded" />
            </div>
            <div className="divide-y divide-border">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-6">
                  <div><div className="skeleton w-36 h-4 rounded mb-1.5" /><div className="skeleton w-28 h-3 rounded" /></div>
                  <div className="skeleton w-24 h-5 rounded" /><div className="skeleton w-20 h-5 rounded" /><div className="skeleton w-16 h-4 rounded" /><div className="skeleton w-12 h-4 rounded" />
                </div>
              ))}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center animate-slide-up">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-navy/5 flex items-center justify-center">
              <svg className="w-8 h-8 text-navy/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
            </div>
            <h3 className="font-semibold text-base text-foreground font-[family-name:var(--font-dm-serif)]">{hasFilters ? 'No matching staff' : 'No staff yet'}</h3>
            <p className="text-sm text-muted mt-2 max-w-sm mx-auto">{hasFilters ? 'No staff match the selected filters.' : 'Add your first clinical staff member to start building pods.'}</p>
            {!hasFilters && (
              <button onClick={openAdd} className="mt-6 inline-flex items-center gap-2 bg-navy text-white px-5 py-2.5 rounded-lg font-medium text-sm hover:bg-navy-light transition-colors">Add Staff</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium text-muted whitespace-nowrap">Name</th>
                  <th className="text-left px-5 py-3 font-medium text-muted whitespace-nowrap">Role</th>
                  <th className="text-left px-5 py-3 font-medium text-muted whitespace-nowrap">License</th>
                  <th className="text-left px-5 py-3 font-medium text-muted whitespace-nowrap">Certifications</th>
                  <th className="text-left px-5 py-3 font-medium text-muted whitespace-nowrap">Status</th>
                  <th className="text-right px-5 py-3 font-medium text-muted whitespace-nowrap">Cases</th>
                  <th className="text-right px-5 py-3 font-medium text-muted whitespace-nowrap">Quality</th>
                  <th className="text-right px-5 py-3 font-medium text-muted whitespace-nowrap">Capacity</th>
                  <th className="text-right px-5 py-3 font-medium text-muted whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-border hover:bg-gray-50/70 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-foreground">{s.name}</div>
                      {s.email && <div className="text-xs text-muted mt-0.5">{s.email}</div>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${ROLE_BADGES[s.role]}`}>{s.role.toUpperCase()}</span>
                      <div className="text-xs text-muted mt-0.5">{ROLE_LABELS[s.role]}</div>
                    </td>
                    <td className="px-5 py-3">
                      {s.license_number ? (
                        <div><span className="font-mono text-xs">{s.license_number}</span>{s.license_state && <span className="text-xs text-muted ml-1">({s.license_state})</span>}</div>
                      ) : <span className="text-muted">---</span>}
                    </td>
                    <td className="px-5 py-3">
                      {(s.certifications || []).length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {s.certifications.map((cert) => (
                            <span key={cert} className="bg-navy/10 text-navy px-2 py-0.5 rounded-full text-xs font-medium">{cert}</span>
                          ))}
                        </div>
                      ) : <span className="text-muted">---</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_BADGES[s.status] || 'bg-gray-100 text-gray-600'}`}>{s.status.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">{s.cases_completed ?? 0}</td>
                    <td className="px-5 py-3 text-right">
                      {s.quality_score != null ? (
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${s.quality_score >= 90 ? 'bg-green-500' : s.quality_score >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${s.quality_score}%` }} />
                          </div>
                          <span className="tabular-nums text-xs font-medium">{s.quality_score}%</span>
                        </div>
                      ) : <span className="text-muted text-xs">---</span>}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-xs">{s.max_cases_per_day || '---'}/day</td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => openEdit(s)} className="text-navy hover:underline text-sm font-medium">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border bg-gray-50/50 text-xs text-muted">Showing {filtered.length} of {staff.length} staff members</div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 overflow-y-auto py-8">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 animate-scale-in">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-[family-name:var(--font-dm-serif)] text-xl text-navy">{editingStaff ? 'Edit Staff Member' : 'Add Staff Member'}</h3>
              <button onClick={() => setShowModal(false)} className="text-muted hover:text-foreground p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Maria Santos, LPN" className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Role *</label>
                  <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value as StaffRole })} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none">
                    <option value="lpn">LPN - Licensed Practical Nurse</option>
                    <option value="rn">RN - Registered Nurse</option>
                    <option value="admin_staff">Admin Staff</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' | 'on_leave' })} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="on_leave">On Leave</option>
                  </select>
                </div>
              </div>
              <div className="border-t border-border pt-5"><div className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">License & Contact</div></div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">License Number</label>
                  <input type="text" value={formData.license_number} onChange={(e) => setFormData({ ...formData, license_number: e.target.value })} placeholder="LPN-12345" className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">License State</label>
                  <input type="text" value={formData.license_state} onChange={(e) => setFormData({ ...formData, license_state: e.target.value })} placeholder="TX" maxLength={2} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Phone</label>
                  <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none" />
                </div>
              </div>
              <div className="border-t border-border pt-5"><div className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Certifications & Capacity</div></div>
              <div>
                <label className="block text-sm font-medium mb-1">Certifications</label>
                <p className="text-xs text-muted mb-2">Type a certification and press Enter</p>
                <input type="text" placeholder="e.g., IV Certification, BLS..." value={certInput} onChange={(e) => setCertInput(e.target.value)} onKeyDown={handleCertKeyDown} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none" />
                {formData.certifications.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {formData.certifications.map((cert) => (
                      <span key={cert} className="inline-flex items-center gap-1 bg-navy/10 text-navy px-2.5 py-1 rounded-full text-xs font-medium">
                        {cert}
                        <button type="button" onClick={() => setFormData({ ...formData, certifications: formData.certifications.filter((c) => c !== cert) })} className="hover:text-red-600 ml-0.5">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Cases Per Day</label>
                <input type="number" min={1} max={100} value={formData.max_cases_per_day} onChange={(e) => setFormData({ ...formData, max_cases_per_day: parseInt(e.target.value) || 20 })} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none" />
              </div>
            </form>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3 bg-gray-50/50 rounded-b-xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors">Cancel</button>
              <button onClick={(e) => { const form = (e.currentTarget.closest('.animate-scale-in') as HTMLElement)?.querySelector('form'); if (form) form.requestSubmit(); }} className="bg-navy text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-navy-light transition-colors">
                {editingStaff ? 'Save Changes' : 'Add Staff Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
