'use client';

import { useEffect, useState } from 'react';
import type { Reviewer, ReviewerStatus, ServiceCategory } from '@/lib/types';

const SPECIALTIES = [
  'Internal Medicine',
  'Family Medicine',
  'Orthopedic Surgery',
  'General Surgery',
  'Cardiology',
  'Pulmonology',
  'Neurology',
  'Psychiatry',
  'Radiology',
  'Anesthesiology',
  'Pain Management',
  'Oncology',
  'Physical Medicine & Rehabilitation',
  'Emergency Medicine',
  'Other',
];

const SERVICE_CATEGORIES: { value: ServiceCategory; label: string; color: string }[] = [
  { value: 'imaging', label: 'Imaging', color: 'bg-blue-100 text-blue-800' },
  { value: 'surgery', label: 'Surgery', color: 'bg-red-100 text-red-800' },
  { value: 'specialty_referral', label: 'Specialty Referral', color: 'bg-purple-100 text-purple-800' },
  { value: 'dme', label: 'DME', color: 'bg-amber-100 text-amber-800' },
  { value: 'infusion', label: 'Infusion', color: 'bg-cyan-100 text-cyan-800' },
  { value: 'behavioral_health', label: 'Behavioral Health', color: 'bg-pink-100 text-pink-800' },
  { value: 'rehab_therapy', label: 'Rehab Therapy', color: 'bg-lime-100 text-lime-800' },
  { value: 'home_health', label: 'Home Health', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'skilled_nursing', label: 'Skilled Nursing', color: 'bg-teal-100 text-teal-800' },
  { value: 'transplant', label: 'Transplant', color: 'bg-violet-100 text-violet-800' },
  { value: 'genetic_testing', label: 'Genetic Testing', color: 'bg-fuchsia-100 text-fuchsia-800' },
  { value: 'pain_management', label: 'Pain Management', color: 'bg-orange-100 text-orange-800' },
  { value: 'cardiology', label: 'Cardiology', color: 'bg-rose-100 text-rose-800' },
  { value: 'oncology', label: 'Oncology', color: 'bg-indigo-100 text-indigo-800' },
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

const STATUS_OPTIONS: { value: ReviewerStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'pending', label: 'Pending' },
  { value: 'credentialing', label: 'Credentialing' },
];

function statusBadgeClass(status: ReviewerStatus): string {
  switch (status) {
    case 'active': return 'bg-green-100 text-green-800';
    case 'inactive': return 'bg-gray-100 text-gray-600';
    case 'pending': return 'bg-yellow-100 text-yellow-800';
    case 'credentialing': return 'bg-blue-100 text-blue-800';
    default: return 'bg-gray-100 text-gray-600';
  }
}

function getCategoryColor(cat: string): string {
  const found = SERVICE_CATEGORIES.find((c) => c.value === cat);
  return found ? found.color : 'bg-gray-100 text-gray-700';
}

function getCategoryLabel(cat: string): string {
  const found = SERVICE_CATEGORIES.find((c) => c.value === cat);
  return found ? found.label : cat;
}

interface FormData {
  name: string;
  credentials: string;
  specialty: string;
  subspecialty: string;
  board_certifications: string[];
  license_states: string[];
  dea_number: string;
  email: string;
  phone: string;
  approved_service_categories: string[];
  max_cases_per_day: number;
  status: ReviewerStatus;
}

const emptyForm: FormData = {
  name: '',
  credentials: '',
  specialty: '',
  subspecialty: '',
  board_certifications: [],
  license_states: [],
  dea_number: '',
  email: '',
  phone: '',
  approved_service_categories: [],
  max_cases_per_day: 10,
  status: 'active',
};

export default function ReviewersPage() {
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingReviewer, setEditingReviewer] = useState<Reviewer | null>(null);
  const [formData, setFormData] = useState<FormData>({ ...emptyForm });
  const [certInput, setCertInput] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Filters
  const [filterSpecialty, setFilterSpecialty] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterState, setFilterState] = useState('');

  useEffect(() => {
    fetchReviewers();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function fetchReviewers() {
    try {
      const res = await fetch('/api/reviewers');
      if (res.ok) setReviewers(await res.json());
    } catch (err) {
      console.error('Failed to fetch reviewers:', err);
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditingReviewer(null);
    setFormData({ ...emptyForm });
    setCertInput('');
    setShowModal(true);
  }

  function openEdit(reviewer: Reviewer) {
    setEditingReviewer(reviewer);
    setFormData({
      name: reviewer.name,
      credentials: reviewer.credentials || '',
      specialty: reviewer.specialty || '',
      subspecialty: reviewer.subspecialty || '',
      board_certifications: reviewer.board_certifications || [],
      license_states: reviewer.license_states?.length ? reviewer.license_states : (reviewer.license_state || []),
      dea_number: reviewer.dea_number || '',
      email: reviewer.email || '',
      phone: reviewer.phone || '',
      approved_service_categories: reviewer.approved_service_categories || [],
      max_cases_per_day: reviewer.max_cases_per_day || 10,
      status: reviewer.status,
    });
    setCertInput('');
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...formData,
      license_state: formData.license_states,
    };

    console.log(`[Demo] ${editingReviewer ? 'Updating' : 'Creating'} reviewer:`, payload);

    try {
      if (editingReviewer) {
        await fetch(`/api/reviewers/${editingReviewer.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch('/api/reviewers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      setToast({ message: editingReviewer ? 'Reviewer updated successfully' : 'Reviewer added successfully', type: 'success' });
    } catch {
      setToast({ message: 'Operation completed (demo mode)', type: 'success' });
    }

    setShowModal(false);
    fetchReviewers();
  }

  function handleCertKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && certInput.trim()) {
      e.preventDefault();
      if (!formData.board_certifications.includes(certInput.trim())) {
        setFormData({
          ...formData,
          board_certifications: [...formData.board_certifications, certInput.trim()],
        });
      }
      setCertInput('');
    }
  }

  function removeCert(cert: string) {
    setFormData({
      ...formData,
      board_certifications: formData.board_certifications.filter((c) => c !== cert),
    });
  }

  function toggleState(state: string) {
    setFormData({
      ...formData,
      license_states: formData.license_states.includes(state)
        ? formData.license_states.filter((s) => s !== state)
        : [...formData.license_states, state],
    });
  }

  function toggleCategory(cat: string) {
    setFormData({
      ...formData,
      approved_service_categories: formData.approved_service_categories.includes(cat)
        ? formData.approved_service_categories.filter((c) => c !== cat)
        : [...formData.approved_service_categories, cat],
    });
  }

  const filtered = reviewers.filter((r) => {
    if (filterSpecialty && r.specialty !== filterSpecialty) return false;
    if (filterCategory && !(r.approved_service_categories || []).includes(filterCategory)) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    if (filterState) {
      const states = r.license_states?.length ? r.license_states : (r.license_state || []);
      if (!states.includes(filterState)) return false;
    }
    return true;
  });

  const hasFilters = filterSpecialty || filterCategory || filterStatus || filterState;

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
          <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl text-navy">Reviewer Panel</h1>
          <p className="text-muted mt-1">Manage physician reviewers, credentials, and service categories</p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 bg-navy text-white px-5 py-2.5 rounded-lg font-medium hover:bg-navy-light transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Reviewer
        </button>
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-lg border border-border shadow-sm p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="text-sm font-medium text-muted">Filters</span>
          {hasFilters && (
            <button
              onClick={() => { setFilterSpecialty(''); setFilterCategory(''); setFilterStatus(''); setFilterState(''); }}
              className="ml-auto text-xs text-navy hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select
            value={filterSpecialty}
            onChange={(e) => setFilterSpecialty(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
          >
            <option value="">All Specialties</option>
            {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
          >
            <option value="">All Service Categories</option>
            {SERVICE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
          >
            <option value="">All States</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-lg border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted">Loading reviewers...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted">
            {hasFilters ? 'No reviewers match the current filters.' : 'No reviewers yet. Add your first reviewer.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium text-muted whitespace-nowrap">Name & Credentials</th>
                  <th className="text-left px-5 py-3 font-medium text-muted whitespace-nowrap">Specialty</th>
                  <th className="text-left px-5 py-3 font-medium text-muted whitespace-nowrap">Board Certifications</th>
                  <th className="text-left px-5 py-3 font-medium text-muted whitespace-nowrap">Licensed States</th>
                  <th className="text-left px-5 py-3 font-medium text-muted whitespace-nowrap">Service Categories</th>
                  <th className="text-left px-5 py-3 font-medium text-muted whitespace-nowrap">Status</th>
                  <th className="text-right px-5 py-3 font-medium text-muted whitespace-nowrap">Cases</th>
                  <th className="text-right px-5 py-3 font-medium text-muted whitespace-nowrap">Avg TAT</th>
                  <th className="text-right px-5 py-3 font-medium text-muted whitespace-nowrap">Capacity</th>
                  <th className="text-right px-5 py-3 font-medium text-muted whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const states = r.license_states?.length ? r.license_states : (r.license_state || []);
                  const casesToday = 0; // Placeholder -- would come from real-time data
                  const maxCases = r.max_cases_per_day || 10;

                  return (
                    <tr key={r.id} className="border-b border-border hover:bg-gray-50/70 transition-colors">
                      {/* Name + Credentials */}
                      <td className="px-5 py-3">
                        <div className="font-medium text-foreground">
                          {r.credentials ? `${r.name}, ${r.credentials}` : r.name}
                        </div>
                        {r.email && (
                          <div className="text-xs text-muted mt-0.5">{r.email}</div>
                        )}
                      </td>
                      {/* Specialty + Subspecialty */}
                      <td className="px-5 py-3">
                        <div>{r.specialty || '---'}</div>
                        {r.subspecialty && (
                          <div className="text-xs text-muted mt-0.5">{r.subspecialty}</div>
                        )}
                      </td>
                      {/* Board Certifications */}
                      <td className="px-5 py-3">
                        {(r.board_certifications || []).length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {r.board_certifications.map((cert) => (
                              <span key={cert} className="bg-navy/10 text-navy px-2 py-0.5 rounded-full text-xs font-medium">
                                {cert}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted">---</span>
                        )}
                      </td>
                      {/* Licensed States */}
                      <td className="px-5 py-3">
                        {states.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[180px]">
                            {states.slice(0, 6).map((s) => (
                              <span key={s} className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-xs font-medium">{s}</span>
                            ))}
                            {states.length > 6 && (
                              <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded text-xs font-medium">
                                +{states.length - 6}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted">---</span>
                        )}
                      </td>
                      {/* Service Categories */}
                      <td className="px-5 py-3">
                        {(r.approved_service_categories || []).length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {r.approved_service_categories.slice(0, 4).map((cat) => (
                              <span key={cat} className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(cat)}`}>
                                {getCategoryLabel(cat)}
                              </span>
                            ))}
                            {r.approved_service_categories.length > 4 && (
                              <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full text-xs font-medium">
                                +{r.approved_service_categories.length - 4}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted">---</span>
                        )}
                      </td>
                      {/* Status */}
                      <td className="px-5 py-3">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${statusBadgeClass(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                      {/* Cases Completed */}
                      <td className="px-5 py-3 text-right font-medium tabular-nums">{r.cases_completed ?? 0}</td>
                      {/* Avg TAT */}
                      <td className="px-5 py-3 text-right tabular-nums">
                        {r.avg_turnaround_hours != null ? `${r.avg_turnaround_hours.toFixed(1)} hrs` : '---'}
                      </td>
                      {/* Capacity */}
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="tabular-nums text-sm">
                            {casesToday} / {maxCases}
                          </span>
                          <span className="text-xs text-muted">today</span>
                        </div>
                      </td>
                      {/* Actions */}
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => openEdit(r)}
                          className="text-navy hover:underline text-sm font-medium"
                        >
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
        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border bg-gray-50/50 text-xs text-muted">
            Showing {filtered.length} of {reviewers.length} reviewers
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
                {editingReviewer ? 'Edit Reviewer' : 'Add Reviewer'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-muted hover:text-foreground p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {/* ── Basic Info ──────────────────────────────── */}
              <div className="text-xs font-semibold text-muted uppercase tracking-wider">Basic Information</div>

              <div>
                <label className="block text-sm font-medium mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Dr. James Richardson"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Credentials</label>
                  <input
                    type="text"
                    placeholder="MD, FACP"
                    value={formData.credentials}
                    onChange={(e) => setFormData({ ...formData, credentials: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">DEA Number</label>
                  <input
                    type="text"
                    placeholder="XX1234567"
                    value={formData.dea_number}
                    onChange={(e) => setFormData({ ...formData, dea_number: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                  />
                </div>
              </div>

              {/* ── Specialty ──────────────────────────────── */}
              <div className="border-t border-border pt-5">
                <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Specialty & Certifications</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Specialty</label>
                  <select
                    value={formData.specialty}
                    onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                  >
                    <option value="">Select specialty...</option>
                    {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Subspecialty</label>
                  <input
                    type="text"
                    placeholder="Interventional Cardiology..."
                    value={formData.subspecialty}
                    onChange={(e) => setFormData({ ...formData, subspecialty: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                  />
                </div>
              </div>

              {/* Board Certifications - multi-input */}
              <div>
                <label className="block text-sm font-medium mb-1">Board Certifications</label>
                <p className="text-xs text-muted mb-2">Type a certification and press Enter to add</p>
                <input
                  type="text"
                  placeholder="e.g., ABIM, ABP, ABS..."
                  value={certInput}
                  onChange={(e) => setCertInput(e.target.value)}
                  onKeyDown={handleCertKeyDown}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                />
                {formData.board_certifications.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {formData.board_certifications.map((cert) => (
                      <span key={cert} className="inline-flex items-center gap-1 bg-navy/10 text-navy px-2.5 py-1 rounded-full text-xs font-medium">
                        {cert}
                        <button type="button" onClick={() => removeCert(cert)} className="hover:text-red-600 ml-0.5">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* ── License States ──────────────────────────── */}
              <div className="border-t border-border pt-5">
                <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Licensed States</div>
                <p className="text-xs text-muted mb-3">Select all states where the reviewer holds an active medical license</p>
                <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5 max-h-[140px] overflow-y-auto custom-scrollbar p-1">
                  {US_STATES.map((state) => (
                    <button
                      key={state}
                      type="button"
                      onClick={() => toggleState(state)}
                      className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                        formData.license_states.includes(state)
                          ? 'bg-navy text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {state}
                    </button>
                  ))}
                </div>
                {formData.license_states.length > 0 && (
                  <div className="text-xs text-muted mt-2">{formData.license_states.length} state{formData.license_states.length !== 1 ? 's' : ''} selected</div>
                )}
              </div>

              {/* ── Contact ──────────────────────────────────── */}
              <div className="border-t border-border pt-5">
                <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Contact Information</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                  />
                </div>
              </div>

              {/* ── Service Categories ──────────────────────── */}
              <div className="border-t border-border pt-5">
                <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Approved Service Categories</div>
                <p className="text-xs text-muted mb-3">Select the categories this reviewer is approved to handle</p>
                <div className="grid grid-cols-2 gap-2">
                  {SERVICE_CATEGORIES.map((cat) => (
                    <label
                      key={cat.value}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                        formData.approved_service_categories.includes(cat.value)
                          ? 'border-navy/30 bg-navy/5'
                          : 'border-border hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.approved_service_categories.includes(cat.value)}
                        onChange={() => toggleCategory(cat.value)}
                        className="rounded border-border text-navy focus:ring-navy/20"
                      />
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cat.color}`}>{cat.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* ── Capacity & Status ────────────────────────── */}
              <div className="border-t border-border pt-5">
                <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Capacity & Status</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Max Cases Per Day</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={formData.max_cases_per_day}
                    onChange={(e) => setFormData({ ...formData, max_cases_per_day: parseInt(e.target.value) || 10 })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as ReviewerStatus })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
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
                {editingReviewer ? 'Save Changes' : 'Add Reviewer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
