'use client';

import { useEffect, useState } from 'react';
import type { Client, ClientType } from '@/lib/types';

const clientTypeLabels: Record<ClientType, string> = {
  tpa: 'TPA',
  health_plan: 'Health Plan',
  self_funded_employer: 'Self-Funded Employer',
  managed_care_org: 'Managed Care Org',
  workers_comp: 'Workers\' Comp',
  auto_med: 'Auto Med',
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'tpa' as ClientType,
    contact_name: '',
    contact_email: '',
    contact_phone: '',
  });

  useEffect(() => {
    fetchClients();
  }, []);

  async function fetchClients() {
    try {
      const res = await fetch('/api/clients');
      if (res.ok) setClients(await res.json());
    } catch (err) {
      console.error('Failed to fetch clients:', err);
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditingClient(null);
    setFormData({ name: '', type: 'tpa', contact_name: '', contact_email: '', contact_phone: '' });
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
    });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingClient) {
      await fetch(`/api/clients/${editingClient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
    } else {
      await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
    }
    setShowModal(false);
    fetchClients();
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl text-navy">Clients</h1>
          <p className="text-muted mt-1">Manage TPA and health plan clients</p>
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

      <div className="bg-surface rounded-lg border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted">Loading clients...</div>
        ) : clients.length === 0 ? (
          <div className="p-12 text-center text-muted">No clients yet. Add your first client.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50">
                <th className="text-left px-6 py-3 font-medium text-muted">Name</th>
                <th className="text-left px-6 py-3 font-medium text-muted">Type</th>
                <th className="text-left px-6 py-3 font-medium text-muted">Contact</th>
                <th className="text-left px-6 py-3 font-medium text-muted">Email</th>
                <th className="text-left px-6 py-3 font-medium text-muted">Phone</th>
                <th className="text-right px-6 py-3 font-medium text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-border hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium">{c.name}</td>
                  <td className="px-6 py-3">
                    <span className="bg-navy/10 text-navy px-2 py-0.5 rounded text-xs font-medium">
                      {c.type ? clientTypeLabels[c.type] : '—'}
                    </span>
                  </td>
                  <td className="px-6 py-3">{c.contact_name || '—'}</td>
                  <td className="px-6 py-3">{c.contact_email || '—'}</td>
                  <td className="px-6 py-3">{c.contact_phone || '—'}</td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => openEdit(c)} className="text-navy hover:underline text-sm">
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
                {editingClient ? 'Edit Client' : 'Add Client'}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Organization Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
              <div>
                <label className="block text-sm font-medium mb-1">Contact Name</label>
                <input
                  type="text"
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
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
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none"
                  />
                </div>
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
                  {editingClient ? 'Save Changes' : 'Add Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
