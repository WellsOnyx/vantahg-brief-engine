'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Practice {
  id: string;
  name: string;
  specialty: string | null;
  address_city: string | null;
  address_state: string | null;
  phone: string | null;
  estimated_weekly_auths: number;
  active: boolean;
  npi: string | null;
}

/**
 * TPA-side practice management: list, add, and invite users.
 *
 * The "add practice" form is inline at the top. The list shows each
 * practice with an "Invite user" button that opens a small inline form.
 */
export default function TpaPracticesPage() {
  const [practices, setPractices] = useState<Practice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Add-practice form
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', npi: '', specialty: '', address_city: '', address_state: '', phone: '', estimated_weekly_auths: '' });
  const [adding, setAdding] = useState(false);

  // Invite form (per-practice)
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'staff'>('staff');
  const [inviting, setInviting] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/tpa/practices', { cache: 'no-store' });
      if (!res.ok) {
        setError(`Could not load (${res.status})`);
        return;
      }
      const data = await res.json();
      setPractices(data.practices ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null); setAdding(true);
    try {
      const body: Record<string, unknown> = {
        name: addForm.name,
        npi: addForm.npi || undefined,
        specialty: addForm.specialty || undefined,
        address_city: addForm.address_city || undefined,
        address_state: addForm.address_state.toUpperCase() || undefined,
        phone: addForm.phone || undefined,
      };
      if (addForm.estimated_weekly_auths) {
        body.estimated_weekly_auths = Number(addForm.estimated_weekly_auths);
      }
      const res = await fetch('/api/tpa/practices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setSuccess(`Added ${data.name}`);
      setAddForm({ name: '', npi: '', specialty: '', address_city: '', address_state: '', phone: '', estimated_weekly_auths: '' });
      setShowAdd(false);
      await load();
    } catch {
      setError('Network error');
    } finally {
      setAdding(false);
    }
  }

  async function submitInvite(practiceId: string) {
    if (!inviteEmail.trim()) {
      setError('Email required');
      return;
    }
    setError(null); setSuccess(null); setInviting(true);
    try {
      const res = await fetch(`/api/tpa/practices/${practiceId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setSuccess(data.message ?? `Invited ${inviteEmail}`);
      setInviteEmail('');
      setInviteFor(null);
    } catch {
      setError('Network error');
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="py-10 md:py-16 bg-background min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <Link href="/portal/tpa" className="text-sm text-navy underline">← Portal</Link>
            <h1 className="text-2xl md:text-3xl font-bold text-navy mt-2">Practices in your network</h1>
            <p className="text-sm text-muted mt-1">Add physician offices, invite their staff, and monitor weekly auth volume.</p>
          </div>
          <button
            onClick={() => setShowAdd((s) => !s)}
            className="bg-navy text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-navy/90"
          >
            {showAdd ? 'Cancel' : '+ Add practice'}
          </button>
        </header>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">{error}</div>}
        {success && <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 text-sm">{success}</div>}

        {showAdd && (
          <section className="bg-surface rounded-xl border border-border shadow-sm p-6">
            <h2 className="text-base font-bold text-navy mb-4">New practice</h2>
            <form onSubmit={submitAdd} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input required placeholder="Practice name *" value={addForm.name} onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                       className="bg-white border border-border rounded-lg px-3 py-2 text-sm" />
                <input placeholder="NPI (10 digits)" value={addForm.npi} onChange={(e) => setAddForm((p) => ({ ...p, npi: e.target.value }))}
                       className="bg-white border border-border rounded-lg px-3 py-2 text-sm font-mono" />
                <input placeholder="Specialty" value={addForm.specialty} onChange={(e) => setAddForm((p) => ({ ...p, specialty: e.target.value }))}
                       className="bg-white border border-border rounded-lg px-3 py-2 text-sm" />
                <input placeholder="Phone" value={addForm.phone} onChange={(e) => setAddForm((p) => ({ ...p, phone: e.target.value }))}
                       className="bg-white border border-border rounded-lg px-3 py-2 text-sm" />
                <input placeholder="City" value={addForm.address_city} onChange={(e) => setAddForm((p) => ({ ...p, address_city: e.target.value }))}
                       className="bg-white border border-border rounded-lg px-3 py-2 text-sm" />
                <input placeholder="State (2 letters)" maxLength={2} value={addForm.address_state} onChange={(e) => setAddForm((p) => ({ ...p, address_state: e.target.value }))}
                       className="bg-white border border-border rounded-lg px-3 py-2 text-sm uppercase" />
                <input type="number" min={0} placeholder="Estimated weekly auths" value={addForm.estimated_weekly_auths} onChange={(e) => setAddForm((p) => ({ ...p, estimated_weekly_auths: e.target.value }))}
                       className="bg-white border border-border rounded-lg px-3 py-2 text-sm" />
              </div>
              <button type="submit" disabled={adding} className="bg-navy text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-navy/90 disabled:opacity-50">
                {adding ? 'Adding…' : 'Add practice'}
              </button>
            </form>
          </section>
        )}

        <section className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-6 text-sm text-muted">Loading practices…</div>
          ) : practices.length === 0 ? (
            <div className="p-6 text-sm text-muted">No practices yet. Click <strong>+ Add practice</strong> to get started.</div>
          ) : (
            <ul className="divide-y divide-border">
              {practices.map((p) => (
                <li key={p.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-navy">{p.name}</p>
                      <p className="text-xs text-muted">
                        {p.specialty && <>{p.specialty} · </>}
                        {(p.address_city || p.address_state) && <>{[p.address_city, p.address_state].filter(Boolean).join(', ')} · </>}
                        {p.npi && <>NPI {p.npi} · </>}
                        ~{p.estimated_weekly_auths}/wk
                      </p>
                    </div>
                    <button
                      onClick={() => { setInviteFor(inviteFor === p.id ? null : p.id); setInviteEmail(''); setInviteRole('staff'); }}
                      className="bg-white border border-navy/30 text-navy px-3 py-1.5 rounded-lg text-xs font-semibold hover:border-navy"
                    >
                      {inviteFor === p.id ? 'Cancel' : 'Invite user'}
                    </button>
                  </div>
                  {inviteFor === p.id && (
                    <div className="mt-3 bg-background rounded-lg p-3 flex flex-wrap gap-2 items-end">
                      <input
                        type="email"
                        placeholder="user@practice.test"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="flex-1 min-w-[200px] bg-white border border-border rounded px-3 py-2 text-sm"
                      />
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as 'admin' | 'staff')}
                        className="bg-white border border-border rounded px-3 py-2 text-sm"
                      >
                        <option value="staff">Staff (submit cases)</option>
                        <option value="admin">Admin (manage practice)</option>
                      </select>
                      <button
                        onClick={() => submitInvite(p.id)}
                        disabled={inviting}
                        className="bg-navy text-white px-4 py-2 rounded text-sm font-semibold hover:bg-navy/90 disabled:opacity-50"
                      >
                        {inviting ? 'Inviting…' : 'Send invite'}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
