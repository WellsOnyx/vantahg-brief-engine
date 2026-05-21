'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase-browser';
import { EmptyState } from '@/components/EmptyState';

type Role = 'admin' | 'reviewer' | 'client' | 'builder' | 'ceo' | 'practice-lead' | 'slt';

interface TeamMember {
  id: string;
  name: string | null;
  email: string | null;
  role: Role;
  created_at: string;
}

const ROLE_OPTIONS: { value: Role; label: string; tone: string }[] = [
  { value: 'admin',          label: 'Admin',          tone: 'bg-navy/10 text-navy' },
  { value: 'reviewer',       label: 'Reviewer',       tone: 'bg-blue-100 text-blue-800' },
  { value: 'client',         label: 'Client (TPA)',   tone: 'bg-emerald-100 text-emerald-800' },
  { value: 'builder',        label: 'Builder',        tone: 'bg-purple-100 text-purple-800' },
  { value: 'ceo',            label: 'CEO',            tone: 'bg-gold/20 text-gold-dark' },
  { value: 'practice-lead',  label: 'Practice Lead',  tone: 'bg-teal-100 text-teal-800' },
  { value: 'slt',            label: 'SLT',            tone: 'bg-amber-100 text-amber-800' },
];

function roleTone(role: Role): string {
  return ROLE_OPTIONS.find((r) => r.value === role)?.tone ?? 'bg-gray-100 text-gray-700';
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [accessChecked, setAccessChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  const loadTeam = useCallback(async () => {
    try {
      const res = await fetch('/api/team');
      if (res.status === 403) {
        setHasAccess(false);
        return;
      }
      if (!res.ok) {
        setError(`Failed to load team (${res.status})`);
        return;
      }
      const data = (await res.json()) as TeamMember[];
      setMembers(data);
      setHasAccess(true);
    } catch {
      setError('Failed to load team');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      // Client-side role probe so we can render an access-denied panel
      // instead of bouncing to login when the user is signed in but not
      // a permitted role.
      const browser = createBrowserClient();
      if (!browser) {
        // Demo mode — treat as admin.
        if (!cancelled) {
          setHasAccess(true);
          setAccessChecked(true);
          await loadTeam();
        }
        return;
      }
      const { data: { user } } = await browser.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setHasAccess(false);
          setAccessChecked(true);
        }
        return;
      }
      const { data: profile } = await browser
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      const role = (profile?.role as Role) ?? 'reviewer';
      const allowed = role === 'admin' || role === 'ceo' || role === 'slt';
      if (!cancelled) {
        setHasAccess(allowed);
        setAccessChecked(true);
        if (allowed) await loadTeam();
      }
    }
    init();
    return () => { cancelled = true; };
  }, [loadTeam]);

  async function changeRole(memberId: string, newRole: Role) {
    setSavingId(memberId);
    try {
      const res = await fetch(`/api/team/${memberId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Role change failed (${res.status})`);
        return;
      }
      // Optimistic update so the UI feels snappy.
      setMembers((prev) => prev?.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)) ?? null);
    } catch {
      setError('Role change failed');
    } finally {
      setSavingId(null);
    }
  }

  if (!accessChecked) {
    return <Frame><div className="text-muted">Loading…</div></Frame>;
  }

  if (!hasAccess) {
    return (
      <Frame>
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-10 text-center">
 <h1 className="text-2xl text-navy mb-2">
            Team Access Management
          </h1>
          <p className="text-muted">
            This page requires admin or executive role. Contact your system administrator
            if you need access.
          </p>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
 <h1 className="text-3xl md:text-4xl text-navy">
            Team Access
          </h1>
          <p className="text-muted mt-1 text-lg">
            Manage who can sign in and what they see. Distinct from{' '}
            <Link href="/staff" className="text-gold-dark underline decoration-dotted hover:text-gold">
              clinical staff
            </Link>
            {' '}(LPN/RN/MD reviewers).
          </p>
        </div>
        <button
          onClick={() => loadTeam()}
          className="text-sm text-navy hover:text-gold-dark font-medium"
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-700 hover:underline">Dismiss</button>
        </div>
      )}

      {/* Invite — Phase 1 stub */}
      <InvitePanel />

      {/* Roster */}
      <section className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
        <header className="px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-sm text-navy uppercase tracking-wide">
            Roster ({members?.length ?? 0})
          </h2>
        </header>
        {!members ? (
          <div className="p-6 text-muted text-sm">Loading roster…</div>
        ) : members.length === 0 ? (
          <EmptyState
            title="No teammates inside yet."
            body="The first user to sign in lands here as a reviewer. Promote, demote, and reassign roles from this page."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Joined</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <Td>
                      <div className="font-medium text-navy">{m.name || '—'}</div>
                    </Td>
                    <Td>
                      <div className="text-muted text-xs font-mono">{m.email || '—'}</div>
                    </Td>
                    <Td>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${roleTone(m.role)}`}>
                        {ROLE_OPTIONS.find((r) => r.value === m.role)?.label ?? m.role}
                      </span>
                    </Td>
                    <Td>
                      <div className="text-xs text-muted">
                        {new Date(m.created_at).toLocaleDateString()}
                      </div>
                    </Td>
                    <Td className="text-right">
                      <select
                        value={m.role}
                        disabled={savingId === m.id}
                        onChange={(e) => changeRole(m.id, e.target.value as Role)}
                        className="px-2 py-1 border border-border rounded text-xs bg-white focus:outline-none focus:ring-2 focus:ring-gold/50"
                        aria-label="Change role"
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      {savingId === m.id && (
                        <div className="text-[10px] text-muted mt-1">Saving…</div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11px] text-muted mt-6">
        Role changes write a <code className="bg-gray-100 px-1 py-0.5 rounded">security:team_role_changed</code> audit
        event with before/after values. The trail is in the <code className="bg-gray-100 px-1 py-0.5 rounded">audit_log</code> table.
      </p>
    </Frame>
  );
}

function InvitePanel() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('reviewer');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, role }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(body.error ?? `Invite failed (${res.status})`);
        return;
      }
      setResult(body.message ?? 'Invitation queued.');
      setEmail('');
      setName('');
    } catch {
      setResult('Invite failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="bg-surface rounded-xl border border-border shadow-sm p-6 mb-6">
      <h2 className="font-semibold text-sm text-navy uppercase tracking-wide mb-1">Invite Team Member</h2>
      <p className="text-xs text-muted mb-4">
        Sends an invitation email (via Supabase Auth) when SUPABASE_SERVICE_ROLE_KEY is configured,
        otherwise records the intended role for the next user that signs up with this email.
      </p>
      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          type="text"
          required
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/50"
        />
        <input
          type="email"
          required
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/50"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/50"
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={submitting}
          className="bg-navy text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-navy-light transition-colors disabled:opacity-50"
        >
          {submitting ? 'Sending…' : 'Send Invitation'}
        </button>
      </form>
      {result && (
        <div className="mt-3 text-xs text-navy/80">{result}</div>
      )}
    </section>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-10 md:py-16 bg-background min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 text-left font-semibold ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
