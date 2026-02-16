'use client';

import { useEffect, useState } from 'react';
import type { Reviewer, ReviewerStatus } from '@/lib/types';

export default function ReviewersPage() {
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingReviewer, setEditingReviewer] = useState<Reviewer | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    credentials: '',
    specialty: '',
    license_state: '',
    email: '',
    phone: '',
    status: 'active' as ReviewerStatus,
  });

  useEffect(() => {
    fetchReviewers();
  }, []);

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
    setFormData({ name: '', credentials: '', specialty: '', license_state: '', email: '', phone: '', status: 'active' });
    setShowModal(true);
  }

  function openEdit(reviewer: Reviewer) {
    setEditingReviewer(reviewer);
    setFormData({
      name: reviewer.name,
      credentials: reviewer.credentials || '',
      specialty: reviewer.specialty || '',
      license_state: reviewer.license_state?.join(', ') || '',
      email: reviewer.email || '',
      phone: reviewer.phone || '',
      status: reviewer.status,
    });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...formData,
      license_state: formData.license_state.split(',').map((s) => s.trim()).filter(Boolean),
    };

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

    setShowModal(false);
    fetchReviewers();
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl text-navy">Reviewer Panel</h1>
          <p className="text-muted mt-1">Manage physician reviewers and credentials</p>
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

      <div className="bg-surface rounded-lg border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted">Loading reviewers...</div>
        ) : reviewers.length === 0 ? (
          <div className="p-12 text-center text-muted">No reviewers yet. Add your first reviewer.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50">
                <th className="text-left px-6 py-3 font-medium text-muted">Name</th>
                <th className="text-left px-6 py-3 font-medium text-muted">Credentials</th>
                <th className="text-left px-6 py-3 font-medium text-muted">Specialty</th>
                <th className="text-left px-6 py-3 font-medium text-muted">Licensed States</th>
                <th className="text-left px-6 py-3 font-medium text-muted">Status</th>
                <th className="text-left px-6 py-3 font-medium text-muted">Cases</th>
                <th className="text-left px-6 py-3 font-medium text-muted">Avg TAT</th>
                <th className="text-right px-6 py-3 font-medium text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reviewers.map((r) => (
                <tr key={r.id} className="border-b border-border hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium">{r.name}</td>
                  <td className="px-6 py-3">{r.credentials || '—'}</td>
                  <td className="px-6 py-3">{r.specialty || '—'}</td>
                  <td className="px-6 py-3">
                    {r.license_state?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {r.license_state.map((s) => (
                          <span key={s} className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-xs">{s}</span>
                        ))}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.status === 'active' ? 'bg-green-100 text-green-800' :
                      r.status === 'inactive' ? 'bg-gray-100 text-gray-600' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-3">{r.cases_completed}</td>
                  <td className="px-6 py-3">{r.avg_turnaround_hours ? `${r.avg_turnaround_hours.toFixed(1)}h` : '—'}</td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => openEdit(r)}
                      className="text-navy hover:underline text-sm"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="font-[family-name:var(--font-dm-serif)] text-xl text-navy">
                {editingReviewer ? 'Edit Reviewer' : 'Add Reviewer'}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Credentials</label>
                  <input
                    type="text"
                    placeholder="DDS, DMD, MD, DO, OD"
                    value={formData.credentials}
                    onChange={(e) => setFormData({ ...formData, credentials: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Specialty</label>
                  <input
                    type="text"
                    placeholder="Oral Surgery, Periodontics..."
                    value={formData.specialty}
                    onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Licensed States (comma-separated)</label>
                <input
                  type="text"
                  placeholder="CA, TX, NY"
                  value={formData.license_state}
                  onChange={(e) => setFormData({ ...formData, license_state: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                />
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
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as ReviewerStatus })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-navy text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-navy-light transition-colors"
                >
                  {editingReviewer ? 'Save Changes' : 'Add Reviewer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
