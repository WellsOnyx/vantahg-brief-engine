'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  PageDashboard,
  PageHero,
  PageEyebrow,
  PageSectionHeading,
  StatCard,
} from '@/components/layouts/PageLayouts';
import type { ConciergePing, TouchpointOutcome } from '@/lib/concierge/pings';

/**
 * Concierge front-line dashboard.
 *
 * Lives at /concierge. Surface stack:
 *   - Hero band (greeting + queue summary)
 *   - 4-up stat strip (load / queue / overdue / TPAs covered)
 *   - 8/4 body: queue on the left, capacity + lines + TPAs on the right
 *   - Help footer reinforcing the "AI brief, human gate" value prop
 *
 * Loads /api/concierge/me and /api/concierge/queue in parallel.
 * Demo-mode safe.
 */

interface Profile {
  id: string;
  name: string;
  email: string;
  ringcentral_phone: string | null;
  ringcentral_extension: string | null;
  intake_email: string | null;
  intake_efax: string | null;
  weekly_auth_cap: number;
  delivery_lead_id: string | null;
  active_clients: Array<{ id: string; name: string; contact_email: string | null }>;
  weekly_load: number;
  weekly_cap: number;
  cases_in_queue: number;
  cases_overdue: number;
}

interface QueueCase {
  id: string;
  case_number: string;
  status: string;
  priority: string;
  patient_name: string | null;
  procedure_description: string | null;
  client_name: string | null;
  created_at: string;
  turnaround_deadline: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  intake: 'Intake',
  processing: 'Processing',
  brief_ready: 'Brief Ready',
  lpn_review: 'LPN Review',
  rn_review: 'RN Review',
  md_review: 'MD Review',
  pend_missing_info: 'Pending Info',
};

const STATUS_PILL: Record<string, string> = {
  intake: 'bg-blue-50 text-blue-800 border-blue-200',
  processing: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  brief_ready: 'bg-teal-50 text-teal-800 border-teal-200',
  lpn_review: 'bg-teal-50 text-teal-800 border-teal-200',
  rn_review: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  md_review: 'bg-purple-50 text-purple-800 border-purple-200',
  pend_missing_info: 'bg-amber-50 text-amber-800 border-amber-200',
};

function slaPill(deadline: string | null): { label: string; tone: string } {
  if (!deadline) return { label: 'No SLA', tone: 'bg-gray-50 text-gray-700 border-gray-200' };
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms < 0) return { label: 'OVERDUE', tone: 'bg-red-50 text-red-800 border-red-200' };
  const hours = ms / 3_600_000;
  if (hours < 4) return { label: `${hours.toFixed(1)}h left`, tone: 'bg-red-50 text-red-800 border-red-200' };
  if (hours < 24) return { label: `${hours.toFixed(1)}h left`, tone: 'bg-amber-50 text-amber-800 border-amber-200' };
  return { label: `${Math.round(hours)}h left`, tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
}

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function ConciergePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [queue, setQueue] = useState<QueueCase[]>([]);
  const [pings, setPings] = useState<ConciergePing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [profRes, queueRes, pingsRes] = await Promise.all([
        fetch('/api/concierge/me', { cache: 'no-store' }),
        fetch('/api/concierge/queue', { cache: 'no-store' }),
        fetch('/api/concierge/pings', { cache: 'no-store' }),
      ]);
      if (!profRes.ok) {
        if (profRes.status === 401) {
          setError('Sign in required.');
        } else if (profRes.status === 403) {
          setError('Your account is not linked to a concierge record. Contact your Delivery Lead.');
        } else {
          setError(`Could not load profile (${profRes.status}).`);
        }
        return;
      }
      const profData = (await profRes.json()) as Profile;
      setProfile(profData);
      if (queueRes.ok) {
        const q = (await queueRes.json()) as { cases: QueueCase[] };
        setQueue(q.cases ?? []);
      }
      if (pingsRes.ok) {
        const p = (await pingsRes.json()) as { pings: ConciergePing[] };
        setPings(p.pings ?? []);
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <PageDashboard
        hero={<PageHero eyebrow="Concierge" title="Loading…" subtitle="Pulling your lines and queue." />}
      >
        <PageDashboard.Stats>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-4">
              <div className="skeleton skeleton-text" />
              <div className="skeleton skeleton-heading" />
            </div>
          ))}
        </PageDashboard.Stats>
      </PageDashboard>
    );
  }

  if (error || !profile) {
    return (
      <PageDashboard
        hero={
          <PageHero
            eyebrow="Concierge"
            title="We hit a snag"
            subtitle={error ?? 'Could not load the concierge view.'}
          />
        }
      >
        <div className="card p-6 text-center">
          <button onClick={() => load(true)} className="btn btn-primary">
            Try again
          </button>
        </div>
      </PageDashboard>
    );
  }

  const firstName = profile.name.split(' ')[0] || profile.name;
  const utilPct = Math.min(100, Math.round((profile.weekly_load / Math.max(1, profile.weekly_cap)) * 100));
  const utilTone = utilPct >= 90 ? 'bg-red-500' : utilPct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <PageDashboard
      hero={
        <PageHero
          eyebrow="Concierge"
          title={`${timeOfDayGreeting()}, ${firstName}`}
          subtitle={
            <>
              {profile.cases_in_queue} active {profile.cases_in_queue === 1 ? 'case' : 'cases'} in your queue
              {profile.cases_overdue > 0 && (
                <span className="text-red-300 font-semibold"> · {profile.cases_overdue} overdue</span>
              )}
              {' '}across {profile.active_clients.length}{' '}
              {profile.active_clients.length === 1 ? 'TPA' : 'TPAs'}.
            </>
          }
          actions={
            <div className="flex items-center gap-2">
              <Link
                href="/concierge/review"
                className="inline-flex items-center gap-2 bg-gold text-navy px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gold-light transition-colors shadow-sm"
              >
                Brief review queue
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
              <button
                onClick={() => load(true)}
                disabled={refreshing}
                className="text-xs px-3 py-2 rounded-lg border border-white/20 text-white/70 hover:text-white hover:border-white/40 disabled:opacity-50 transition"
              >
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          }
        />
      }
    >
      {/* ── Stats ────────────────────────────────────────────── */}
      <PageDashboard.Stats>
        <StatCard
          label="Weekly load"
          value={`${profile.weekly_load} / ${profile.weekly_cap}`}
          hint={`${utilPct}% of cap`}
          accent={utilPct >= 75}
        />
        <StatCard label="In queue" value={profile.cases_in_queue} />
        <StatCard
          label="Overdue"
          value={profile.cases_overdue}
          accent={profile.cases_overdue > 0}
        />
        <StatCard label="TPAs covered" value={profile.active_clients.length} />
      </PageDashboard.Stats>

      {/* ── Body: queue + lines/capacity ─────────────────────── */}
      <PageDashboard.Body
        main={
          <div className="space-y-6">
          <FirstCallFeed
            pings={pings}
            onLogged={(caseId) => setPings((prev) => prev.filter((p) => p.case_id !== caseId))}
          />
          <div className="card p-5 md:p-6">
            <PageSectionHeading
              hint={<span className="text-xs text-muted">{queue.length} active</span>}
            >
              My queue
            </PageSectionHeading>
            {queue.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 mb-3">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="text-sm text-navy font-semibold">Nothing in your queue.</p>
                <p className="text-xs text-muted mt-1">Nice. Take a breath.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {queue.map((c) => {
                  const sla = slaPill(c.turnaround_deadline);
                  return (
                    <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                      <Link
                        href={`/cases/${c.id}`}
                        className="block hover:bg-background -mx-2 px-2 py-2 rounded-lg transition-colors"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-[11px] text-muted">
                              {c.case_number}
                              {c.client_name && <span> · {c.client_name}</span>}
                            </p>
                            <p className="font-semibold text-navy truncate">{c.patient_name ?? '(no name)'}</p>
                            <p className="text-xs text-muted truncate">{c.procedure_description ?? '—'}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                                STATUS_PILL[c.status] ?? 'bg-gray-50 text-gray-700 border-gray-200'
                              }`}
                            >
                              {STATUS_LABEL[c.status] ?? c.status}
                            </span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${sla.tone}`}>
                              {sla.label}
                            </span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          </div>
        }
        aside={
          <div className="space-y-4">
            {/* Capacity */}
            <div className="card p-5">
              <PageEyebrow>Capacity</PageEyebrow>
              <p className="font-[family-name:var(--font-display)] text-4xl text-navy mt-2">{utilPct}%</p>
              <p className="text-xs text-muted">
                {profile.weekly_load} of {profile.weekly_cap} auths this week
              </p>
              <div className="h-2 bg-border rounded-full overflow-hidden mt-3">
                <div className={`h-full ${utilTone} transition-all`} style={{ width: `${utilPct}%` }} />
              </div>
              {utilPct >= 90 && (
                <p className="text-xs text-red-700 mt-3 font-semibold">
                  Near cap. Flag your DL to redistribute.
                </p>
              )}
            </div>

            {/* Lines */}
            <div className="card p-5">
              <PageEyebrow>My lines</PageEyebrow>
              <ul className="text-sm space-y-2 mt-3">
                <Line label="Phone" value={profile.ringcentral_phone ?? '—'} mono />
                {profile.ringcentral_extension && (
                  <Line label="Ext" value={profile.ringcentral_extension} mono />
                )}
                <Line label="Email" value={profile.intake_email ?? '—'} mono />
                <Line label="eFax" value={profile.intake_efax ?? '—'} mono />
              </ul>
            </div>

            {/* TPAs */}
            <div className="card p-5">
              <PageEyebrow>My TPAs</PageEyebrow>
              {profile.active_clients.length === 0 ? (
                <p className="text-sm text-muted mt-3">No clients assigned yet.</p>
              ) : (
                <ul className="space-y-3 mt-3">
                  {profile.active_clients.map((c) => (
                    <li key={c.id} className="flex items-start gap-3">
                      <div className="mt-1 w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-navy text-sm leading-tight">{c.name}</p>
                        {c.contact_email && (
                          <p className="text-[11px] text-muted font-mono">{c.contact_email}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        }
      />

      {/* ── Help moment ──────────────────────────────────────── */}
      <PageDashboard.Help>
        <PageEyebrow>How it works on your side</PageEyebrow>
 <h3 className="text-xl text-navy mt-2">
          AI did 95%. Your reasoning is what makes it defensible.
        </h3>
        <p className="text-sm text-muted mt-2 max-w-2xl">
          When a case lands in <span className="font-semibold text-navy">brief_ready</span>, the
          AI has already extracted facts, matched them against the VantaUM Criteria Library — our
          own evidence-based criteria, not a licensed product — and drafted the brief.
          You validate — capture your reasoning (≥30 chars), flag concerns — and route to LPN/RN/MD.
          Your gate is the one that holds in audit.
        </p>
      </PageDashboard.Help>
    </PageDashboard>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted uppercase tracking-wide">{label}</span>
      <span className={`text-sm text-navy ${mono ? 'font-mono' : ''}`}>{value}</span>
    </li>
  );
}

// ── First-call ping feed ──────────────────────────────────────────────
//
// Every entry point (fax, Gravity Rails agent, live call, call center,
// client portal, manual entry) lands here as a ping. The brief engine
// is already working the auth by the time the concierge dials — the
// call is relationship, not data collection.

const CHANNEL_BADGE: Record<string, string> = {
  efax: 'bg-blue-50 text-blue-800 border-blue-200',
  api: 'bg-violet-50 text-violet-800 border-violet-200',
  phone: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  email: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  portal: 'bg-teal-50 text-teal-800 border-teal-200',
  batch_upload: 'bg-gray-50 text-gray-700 border-gray-200',
};

const PREP_TONE: Record<string, string> = {
  auth_prepared: 'text-emerald-700',
  in_motion: 'text-blue-700',
  just_arrived: 'text-navy',
  needs_info: 'text-amber-700',
};

const OUTCOME_OPTIONS: Array<{ value: TouchpointOutcome; label: string }> = [
  { value: 'reached', label: 'Reached them' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'left_message', label: 'Left message with office' },
  { value: 'scheduled_callback', label: 'Scheduled callback' },
  { value: 'email_sent', label: 'Followed up by email' },
];

function countdownLabel(minutes: number): { label: string; tone: string } {
  if (minutes < 0) {
    return { label: `${Math.abs(minutes)}m past target`, tone: 'bg-red-50 text-red-800 border-red-200' };
  }
  if (minutes <= 10) {
    return { label: `${minutes}m to call`, tone: 'bg-amber-50 text-amber-800 border-amber-200' };
  }
  return { label: `${minutes}m to call`, tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
}

function FirstCallFeed({
  pings,
  onLogged,
}: {
  pings: ConciergePing[];
  onLogged: (caseId: string) => void;
}) {
  const [openLogFor, setOpenLogFor] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<TouchpointOutcome>('reached');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  async function submitLog(caseId: string) {
    setSaving(true);
    setLogError(null);
    try {
      const res = await fetch('/api/concierge/touchpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_id: caseId, outcome, notes, is_first_contact: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Could not log the call (${res.status}).`);
      }
      setOpenLogFor(null);
      setOutcome('reached');
      setNotes('');
      onLogged(caseId);
    } catch (err) {
      setLogError(err instanceof Error ? err.message : 'Could not log the call.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5 md:p-6">
      <PageSectionHeading
        hint={
          <span className="text-xs text-muted">
            {pings.length === 0 ? 'all callers reached' : `${pings.length} to call · 30-min target`}
          </span>
        }
      >
        First call
      </PageSectionHeading>
      {pings.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-navy font-semibold">Every new intake has been called back.</p>
          <p className="text-xs text-muted mt-1">New pings land here from every channel — fax, Gravity Rails, calls, portal.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {pings.map((p) => {
            const cd = countdownLabel(p.minutes_to_target);
            const isOpen = openLogFor === p.case_id;
            return (
              <li key={p.case_id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                          CHANNEL_BADGE[p.intake_channel] ?? CHANNEL_BADGE.batch_upload
                        }`}
                      >
                        {p.channel_label}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cd.tone}`}>
                        {cd.label}
                      </span>
                      <span className="font-mono text-[11px] text-muted">
                        {p.case_number}
                        {p.client_name && <span> · {p.client_name}</span>}
                      </span>
                    </div>
                    <p className="font-semibold text-navy truncate mt-1">{p.patient_name ?? '(no name)'}</p>
                    <p className="text-xs text-muted truncate">{p.procedure_description ?? '—'}</p>
                    <p className={`text-xs mt-1 font-medium ${PREP_TONE[p.prep.level]}`}>{p.prep.line}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/cases/${p.case_id}`}
                      className="text-xs px-3 py-1.5 rounded-lg border border-border text-navy hover:border-navy/40 transition"
                    >
                      Open case
                    </Link>
                    <button
                      onClick={() => {
                        setOpenLogFor(isOpen ? null : p.case_id);
                        setLogError(null);
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-navy text-white font-semibold hover:bg-navy/90 transition"
                    >
                      {isOpen ? 'Close' : 'Log call'}
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="mt-3 rounded-lg border border-border bg-background p-3">
                    <div className="flex flex-wrap gap-2">
                      {OUTCOME_OPTIONS.map((o) => (
                        <button
                          key={o.value}
                          onClick={() => setOutcome(o.value)}
                          className={`px-2.5 py-1 text-xs rounded-full border transition ${
                            outcome === o.value
                              ? 'bg-navy text-white border-navy'
                              : 'bg-surface text-foreground border-border hover:border-navy/30'
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Call notes (optional) — who you spoke with, what they need, anything for the clinical team"
                      rows={2}
                      className="mt-2 w-full text-sm rounded-lg border border-border bg-surface p-2 focus:outline-none focus:ring-1 focus:ring-navy/30"
                    />
                    {logError && <p className="text-xs text-red-700 mt-1">{logError}</p>}
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={() => submitLog(p.case_id)}
                        disabled={saving}
                        className="text-xs px-4 py-1.5 rounded-lg bg-gold text-navy font-semibold hover:bg-gold-light disabled:opacity-50 transition"
                      >
                        {saving ? 'Saving…' : 'Save touchpoint'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
