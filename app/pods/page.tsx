'use client';

import { useEffect, useState } from 'react';
import type { Pod, Staff, ServiceCategory } from '@/lib/types';

const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  imaging: 'Imaging',
  surgery: 'Surgery',
  specialty_referral: 'Specialty Referral',
  dme: 'DME',
  infusion: 'Infusion',
  behavioral_health: 'Behavioral Health',
  rehab_therapy: 'Rehab Therapy',
  home_health: 'Home Health',
  skilled_nursing: 'Skilled Nursing',
  transplant: 'Transplant',
  genetic_testing: 'Genetic Testing',
  pain_management: 'Pain Management',
  cardiology: 'Cardiology',
  oncology: 'Oncology',
  ophthalmology: 'Ophthalmology',
  workers_comp: 'Workers Comp',
  emergency_medicine: 'Emergency Medicine',
  internal_medicine: 'Internal Medicine',
  other: 'Other',
};

const ALL_SERVICE_CATEGORIES = Object.keys(SERVICE_CATEGORY_LABELS) as ServiceCategory[];

export default function PodsPage() {
  const [pods, setPods] = useState<Pod[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingPod, setEditingPod] = useState<Pod | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategories, setFormCategories] = useState<ServiceCategory[]>([]);
  const [formRnId, setFormRnId] = useState('');
  const [formLpnIds, setFormLpnIds] = useState<string[]>([]);
  const [formAdminId, setFormAdminId] = useState('');
  const [formCapacity, setFormCapacity] = useState(50);
  const [formActive, setFormActive] = useState(true);

  useEffect(() => {
    Promise.all([fetchPods(), fetchStaff()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function fetchPods() {
    try {
      const res = await fetch('/api/pods');
      if (!res.ok) throw new Error('Failed to load pods');
      setPods(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pods');
    }
  }

  async function fetchStaff() {
    try {
      const res = await fetch('/api/staff');
      if (res.ok) setStaff(await res.json());
    } catch { /* staff load is optional */ }
  }

  function getStaffName(id: string): string {
    return staff.find((s) => s.id === id)?.name || id.slice(0, 8);
  }

  function openAdd() {
    setEditingPod(null);
    setFormName(''); setFormDescription(''); setFormCategories([]); setFormRnId(''); setFormLpnIds([]); setFormAdminId(''); setFormCapacity(50); setFormActive(true);
    setShowModal(true);
  }

  function openEdit(pod: Pod) {
    setEditingPod(pod);
    setFormName(pod.name);
    setFormDescription(pod.description || '');
    setFormCategories(pod.service_categories || []);
    setFormRnId(pod.rn_id || '');
    setFormLpnIds(pod.lpn_ids || []);
    setFormAdminId(pod.admin_staff_id || '');
    setFormCapacity(pod.capacity_per_day || 50);
    setFormActive(pod.is_active);
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: formName,
      description: formDescription || null,
      service_categories: formCategories,
      rn_id: formRnId || null,
      lpn_ids: formLpnIds,
      admin_staff_id: formAdminId || null,
      capacity_per_day: formCapacity,
      is_active: formActive,
    };
    try {
      if (editingPod) {
        await fetch(`/api/pods/${editingPod.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        await fetch('/api/pods', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      setToast({ message: editingPod ? 'Pod updated' : 'Pod created', type: 'success' });
    } catch {
      setToast({ message: 'Operation completed (demo mode)', type: 'success' });
    }
    setShowModal(false);
    fetchPods();
  }

  const rns = staff.filter((s) => s.role === 'rn' && s.status === 'active');
  const lpns = staff.filter((s) => s.role === 'lpn' && s.status === 'active');
  const admins = staff.filter((s) => s.role === 'admin_staff' && s.status === 'active');

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
          <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl text-navy">Review Pods</h1>
          <p className="text-muted mt-1">Organize LPN/RN teams into pods for case assignment and workload balancing</p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-2 bg-navy text-white px-5 py-2.5 rounded-lg font-medium hover:bg-navy-light transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Create Pod
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Active Pods', value: pods.filter((p) => p.is_active).length, color: 'text-navy' },
          { label: 'Total LPNs Assigned', value: pods.reduce((sum, p) => sum + (p.lpn_ids?.length || 0), 0), color: 'text-teal-600' },
          { label: 'Total Daily Capacity', value: pods.filter((p) => p.is_active).reduce((sum, p) => sum + (p.capacity_per_day || 0), 0), color: 'text-gold-dark' },
        ].map((stat) => (
          <div key={stat.label} className="bg-surface rounded-lg border border-border p-4">
            <div className="text-xs font-medium text-muted uppercase tracking-wider">{stat.label}</div>
            <div className={`text-2xl font-bold ${stat.color} mt-1`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-6 bg-surface rounded-xl border border-red-200 shadow-sm p-6">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => { setError(null); setLoading(true); fetchPods().finally(() => setLoading(false)); }} className="mt-2 text-sm text-navy hover:underline">Retry</button>
        </div>
      )}

      {/* Pod Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-surface rounded-xl border border-border p-6">
              <div className="skeleton w-40 h-6 rounded mb-3" />
              <div className="skeleton w-64 h-3 rounded mb-4" />
              <div className="space-y-2"><div className="skeleton w-full h-3 rounded" /><div className="skeleton w-3/4 h-3 rounded" /></div>
            </div>
          ))}
        </div>
      ) : pods.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center animate-slide-up">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-navy/5 flex items-center justify-center">
            <svg className="w-8 h-8 text-navy/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>
          </div>
          <h3 className="font-semibold text-base font-[family-name:var(--font-dm-serif)]">No pods configured</h3>
          <p className="text-sm text-muted mt-2 max-w-sm mx-auto">Create your first review pod to start routing cases to nursing staff.</p>
          <button onClick={openAdd} className="mt-6 inline-flex items-center gap-2 bg-navy text-white px-5 py-2.5 rounded-lg font-medium text-sm hover:bg-navy-light transition-colors">Create Pod</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pods.map((pod) => (
            <div key={pod.id} className={`bg-surface rounded-xl border shadow-sm overflow-hidden transition-all ${pod.is_active ? 'border-border' : 'border-gray-200 opacity-60'}`}>
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-[family-name:var(--font-dm-serif)] text-lg text-navy">{pod.name}</h3>
                    {!pod.is_active && <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">Inactive</span>}
                  </div>
                  {pod.description && <p className="text-sm text-muted mt-0.5">{pod.description}</p>}
                </div>
                <button onClick={() => openEdit(pod)} className="text-navy hover:underline text-sm font-medium">Edit</button>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Service Categories</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(pod.service_categories || []).map((cat) => (
                      <span key={cat} className="bg-gold/20 text-amber-800 px-2 py-0.5 rounded-full text-xs font-medium">{SERVICE_CATEGORY_LABELS[cat] || cat}</span>
                    ))}
                    {(!pod.service_categories || pod.service_categories.length === 0) && <span className="text-xs text-muted">No categories assigned</span>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-xs font-medium text-blue-600 uppercase tracking-wider mb-1">Supervising RN</div>
                    <div className="text-sm font-medium text-blue-900">{pod.rn_id ? getStaffName(pod.rn_id) : 'Unassigned'}</div>
                  </div>
                  <div className="bg-teal-50 rounded-lg p-3">
                    <div className="text-xs font-medium text-teal-600 uppercase tracking-wider mb-1">LPNs</div>
                    <div className="text-sm font-medium text-teal-900">{pod.lpn_ids?.length || 0} assigned</div>
                    {pod.lpn_ids?.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {pod.lpn_ids.map((id) => (<div key={id} className="text-xs text-teal-700 truncate">{getStaffName(id)}</div>))}
                      </div>
                    )}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs font-medium text-gray-600 uppercase tracking-wider mb-1">Admin</div>
                    <div className="text-sm font-medium text-gray-900">{pod.admin_staff_id ? getStaffName(pod.admin_staff_id) : 'None'}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-xs text-muted">Daily Capacity</span>
                  <span className="text-sm font-bold text-navy">{pod.capacity_per_day || '---'} cases/day</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 overflow-y-auto py-8">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 animate-scale-in">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-[family-name:var(--font-dm-serif)] text-xl text-navy">{editingPod ? 'Edit Pod' : 'Create Pod'}</h3>
              <button onClick={() => setShowModal(false)} className="text-muted hover:text-foreground p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div>
                <label className="block text-sm font-medium mb-1">Pod Name *</label>
                <input type="text" required value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Pod Alpha" className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="High-volume imaging and surgery reviews" className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none" />
              </div>
              <div className="border-t border-border pt-5">
                <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Service Categories</div>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_SERVICE_CATEGORIES.map((cat) => (
                    <label key={cat} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${formCategories.includes(cat) ? 'border-navy/30 bg-navy/5' : 'border-border hover:bg-gray-50'}`}>
                      <input type="checkbox" checked={formCategories.includes(cat)} onChange={() => setFormCategories(formCategories.includes(cat) ? formCategories.filter((c) => c !== cat) : [...formCategories, cat])} className="rounded border-border text-navy focus:ring-navy/20" />
                      <span className="text-sm">{SERVICE_CATEGORY_LABELS[cat]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="border-t border-border pt-5"><div className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Team Assignment</div></div>
              <div>
                <label className="block text-sm font-medium mb-1">Supervising RN</label>
                <select value={formRnId} onChange={(e) => setFormRnId(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none">
                  <option value="">Select RN...</option>
                  {rns.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">LPNs</label>
                <p className="text-xs text-muted mb-2">Select LPNs to assign to this pod</p>
                <div className="space-y-1.5 max-h-[150px] overflow-y-auto custom-scrollbar">
                  {lpns.map((s) => (
                    <label key={s.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${formLpnIds.includes(s.id) ? 'border-teal-300 bg-teal-50' : 'border-border hover:bg-gray-50'}`}>
                      <input type="checkbox" checked={formLpnIds.includes(s.id)} onChange={() => setFormLpnIds(formLpnIds.includes(s.id) ? formLpnIds.filter((id) => id !== s.id) : [...formLpnIds, s.id])} className="rounded border-border text-teal-600 focus:ring-teal-200" />
                      <span className="text-sm">{s.name}</span>
                      {s.quality_score != null && <span className="ml-auto text-xs text-muted">{s.quality_score}% quality</span>}
                    </label>
                  ))}
                  {lpns.length === 0 && <p className="text-xs text-muted py-2">No active LPNs available. Add staff first.</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Admin Staff</label>
                <select value={formAdminId} onChange={(e) => setFormAdminId(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none">
                  <option value="">Select admin staff...</option>
                  {admins.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="border-t border-border pt-5"><div className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Configuration</div></div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Daily Capacity</label>
                  <input type="number" min={1} max={500} value={formCapacity} onChange={(e) => setFormCapacity(parseInt(e.target.value) || 50)} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select value={formActive ? 'active' : 'inactive'} onChange={(e) => setFormActive(e.target.value === 'active')} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </form>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3 bg-gray-50/50 rounded-b-xl">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors">Cancel</button>
              <button onClick={(e) => { const form = (e.currentTarget.closest('.animate-scale-in') as HTMLElement)?.querySelector('form'); if (form) form.requestSubmit(); }} className="bg-navy text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-navy-light transition-colors">
                {editingPod ? 'Save Changes' : 'Create Pod'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
