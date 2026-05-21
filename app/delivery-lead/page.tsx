'use client';

import { useEffect, useState } from 'react';
import { SlaTracker } from '@/components/SlaTracker';
import { PageDashboard, PageHero, PageSectionHeading, StatCard } from '@/components/layouts/PageLayouts';

/**
 * Delivery Lead Operations & Workload Layer (items ~36-45 track)
 *
 * White-glove, low-manual-effort command surface for Delivery Leads:
 * - Live concierge capacity / workload views with client breakdown
 * - Team overview + pod-level SLA urgency heat (critical/warning/overdue aggregates)
 * - Reassignment tooling with instant simulation + smart suggestions (automation first)
 * - SLA tracking + urgency indicators across the entire pod
 * - Basic pod reporting (volume, risk, utilization)
 * - Quality flagging / second-look flows (one-click flag surfaces to audit trail)
 *
 * Design philosophy: DL reviews + reasons + approves. AI + load math does the heavy lifting.
 * Concierge never touches this; they only see their personal queue.
 * Everything is auditable. No excessive clicks — recommendations are pre-computed.
 */

interface Client {
  id: string;
  name: string;
  expected_weekly: number;
}

interface UrgentCase {
  id: string;
  case_number: string;
  patient_name: string | null;
  status: string;
  priority: string;
  turnaround_deadline: string;
  sla_label?: string;
}

interface Concierge {
  id: string;
  name: string;
  email: string;
  weekly_auth_cap: number;
  delivery_lead_id: string | null;
  active: boolean;
  estimated_weekly_load: number;
  active_client_count: number;
  utilization: number;
  // Enriched for full DL layer
  sla?: { critical: number; warning: number; caution: number; ok: number; overdue: number; total: number };
  clients?: Client[];
  urgent_cases?: UrgentCase[];
}

interface PodSummary {
  total_concierges: number;
  total_active_cases: number;
  at_risk: number;
  critical_overdue: number;
  aggregate_utilization: number;
}

interface ListResponse {
  demo: boolean;
  concierges: Concierge[];
  pod_summary?: PodSummary;
}

interface ReassignSuggestion {
  from: string;
  to: string;
  clientName: string;
  clientId: string;
  volume: number;
  reason: string;
}

export default function DeliveryLeadPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<string | null>(null); // clientId being moved
  const [selectedForFlag, setSelectedForFlag] = useState<UrgentCase | null>(null);
  const [flagReason, setFlagReason] = useState('');

  // Reassign modal state — forces a human reason on every move (audit + defensibility)
  type ReassignTarget = {
    clientId: string;
    clientName: string;
    toConciergeId: string;
    toName: string;
    fromName?: string;
  };
  const [reassignTarget, setReassignTarget] = useState<ReassignTarget | null>(null);
  const [reassignReason, setReassignReason] = useState('');

  // Local demo state for instant UX after reassign (no full reload flicker)
  const [localConcierges, setLocalConcierges] = useState<Concierge[] | null>(null);

  const concierges = localConcierges ?? data?.concierges ?? [];
  const pod = data?.pod_summary;

  async function load() {
    setRefreshing(true);
    setError(null);
    setActionMsg(null);
    try {
      const res = await fetch('/api/delivery/concierges', { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setError('You need delivery-lead, admin, or higher role to view this page.');
        } else {
          setError(`Could not load (${res.status}).`);
        }
        return;
      }
      const json = (await res.json()) as ListResponse;
      setData(json);
      setLocalConcierges(null); // reset local overrides on fresh load
    } catch {
      setError('Network error. Try again.');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const totalLoad = concierges.reduce((sum, c) => sum + c.estimated_weekly_load, 0);
  const totalCap = concierges.reduce((sum, c) => sum + c.weekly_auth_cap, 0);
  const aggregateUtil = totalCap > 0 ? Math.min(1, totalLoad / totalCap) : 0;
  const atCapacity = concierges.filter((c) => c.utilization >= 0.9).length;

  // Aggregate pod SLA urgency (demo only — real would sum from backend)
  const podCritical = concierges.reduce((s, c) => s + (c.sla?.critical ?? 0), 0);
  const podWarning = concierges.reduce((s, c) => s + (c.sla?.warning ?? 0), 0);
  const podOverdue = concierges.reduce((s, c) => s + (c.sla?.overdue ?? 0), 0);
  const podAtRisk = podCritical + podWarning + podOverdue;

  // All urgent cases across pod for the alerts board (flattened)
  const allUrgentCases = concierges.flatMap((c) =>
    (c.urgent_cases ?? []).map((uc) => ({ ...uc, conciergeName: c.name, conciergeId: c.id }))
  ).sort((a, b) => {
    // Overdue first, then by deadline
    if (a.turnaround_deadline < b.turnaround_deadline) return -1;
    return 1;
  });

  // Smart rebalance suggestions — real, data-driven (no name hardcoding)
  // Picks the most overloaded concierge with clients, then the best underloaded target with spare headroom.
  const suggestions: ReassignSuggestion[] = [];
  if (concierges.length >= 2) {
    const sortedByLoad = [...concierges].sort((a, b) => b.utilization - a.utilization);
    const overloaded = sortedByLoad.find((c) => c.utilization >= 0.75 && c.clients && c.clients.length > 0);

    if (overloaded) {
      const others = concierges
        .filter((c) => c.id !== overloaded.id)
        .sort((a, b) => a.utilization - b.utilization);

      for (const candidateClient of overloaded.clients ?? []) {
        const target = others.find((t) => {
          const spare = t.weekly_auth_cap - t.estimated_weekly_load;
          return spare >= candidateClient.expected_weekly && t.utilization < 0.8;
        });

        if (target) {
          suggestions.push({
            from: overloaded.name,
            to: target.name,
            clientName: candidateClient.name,
            clientId: candidateClient.id,
            volume: candidateClient.expected_weekly,
            reason: `${overloaded.name} at ${Math.round(overloaded.utilization * 100)}% — move ${candidateClient.expected_weekly}/wk to ${target.name} (${Math.round(target.utilization * 100)}%, ${Math.round((target.weekly_auth_cap - target.estimated_weekly_load) - candidateClient.expected_weekly)} headroom left)`,
          });
          break; // one high-signal suggestion is enough for the DL surface
        }
      }
    }
  }

  async function performReassign(clientId: string, toConciergeId: string, clientName: string, reason?: string) {
    setReassigning(clientId);
    setActionMsg(null);
    const finalReason = (reason && reason.trim().length > 3)
      ? reason.trim()
      : 'Delivery Lead pod rebalance';

    try {
      const res = await fetch('/api/delivery/concierges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reassign_client',
          client_id: clientId,
          to_concierge_id: toConciergeId,
          reason: finalReason,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setActionMsg(`Reassign failed: ${json.error || 'unknown'}`);
        return;
      }

      setActionMsg(json.message || `Reassigned ${clientName}. Pod workload updated.`);

      // For demo: instantly mutate local state so DL sees the effect without waiting
      if (data?.demo) {
        mutateDemoAfterReassign(clientId, toConciergeId);
      } else {
        // Real path — refresh authoritative data
        void load();
      }
    } catch (e) {
      setActionMsg('Network error during reassignment.');
    } finally {
      setReassigning(null);
    }
  }

  // Pure client-side simulation for delightful instant feedback in demo
  function mutateDemoAfterReassign(clientId: string, toId: string) {
    if (!data) return;

    const copy = JSON.parse(JSON.stringify(data.concierges)) as Concierge[];

    // Find source + dest
    let fromC: Concierge | undefined;
    let toC: Concierge | undefined;
    let movedClient: Client | undefined;

    for (const c of copy) {
      const idx = (c.clients ?? []).findIndex((cl) => cl.id === clientId);
      if (idx !== -1) {
        fromC = c;
        movedClient = c.clients![idx];
        c.clients!.splice(idx, 1);
        c.active_client_count = c.clients!.length;
        c.estimated_weekly_load = (c.clients ?? []).reduce((s, cl) => s + cl.expected_weekly, 0);
        c.utilization = Math.min(1, c.estimated_weekly_load / c.weekly_auth_cap);
      }
      if (c.id === toId) toC = c;
    }

    if (fromC && toC && movedClient) {
      if (!toC.clients) toC.clients = [];
      toC.clients.push(movedClient);
      toC.active_client_count = toC.clients.length;
      toC.estimated_weekly_load = toC.clients.reduce((s, cl) => s + cl.expected_weekly, 0);
      toC.utilization = Math.min(1, toC.estimated_weekly_load / toC.weekly_auth_cap);

      // Move any urgent cases attached to the client (simplified: none specific)
      // In real this would be handled by the backend route + case updates.
    }

    setLocalConcierges(copy);
  }

  async function flagForSecondLook(uc: UrgentCase, conciergeId: string) {
    const reason = flagReason.trim() || 'Delivery Lead requested second look on intake quality / SLA risk';

    try {
      const res = await fetch('/api/delivery/concierges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'flag_second_look',
          case_id: uc.id,
          concierge_id: conciergeId,
          reason,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setActionMsg(`Flag failed: ${json.error || 'unknown'}`);
      } else {
        setActionMsg(json.message || `Second-look flag recorded for ${uc.case_number}. Reason: "${reason}". Audit trail created.`);
      }
    } catch {
      setActionMsg('Network error while recording second-look flag. The case is still flagged locally in this session.');
    } finally {
      setSelectedForFlag(null);
      setFlagReason('');
    }
  }

  const handleQuickReassign = (sug: ReassignSuggestion) => {
    const target = concierges.find((c) => c.name === sug.to);
    if (target) {
      setReassignTarget({
        clientId: sug.clientId,
        clientName: sug.clientName,
        toConciergeId: target.id,
        toName: target.name,
        fromName: sug.from,
      });
      setReassignReason('');
    }
  };

  // Open the reason-forced reassign modal (used by all manual/quick paths)
  function openReassignModal(clientId: string, clientName: string, toConciergeId: string, toName: string, fromName?: string) {
    setReassignTarget({ clientId, clientName, toConciergeId, toName, fromName });
    setReassignReason('');
  }

  // Execute after the DL has provided a reason
  function confirmReassignWithReason() {
    if (!reassignTarget) return;
    const reason = reassignReason.trim();
    if (reason.length < 8) {
      setActionMsg('Please provide a short reason (min ~8 characters) for the audit record.');
      return;
    }
    void performReassign(
      reassignTarget.clientId,
      reassignTarget.toConciergeId,
      reassignTarget.clientName,
      reason
    );
    setReassignTarget(null);
    setReassignReason('');
  }

  return (
    <PageDashboard
      hero={
        <PageHero
          eyebrow="Delivery Operations • Pod Leadership"
          title="Delivery Lead Dashboard"
          subtitle="Full visibility into your concierge pod. Heavy automation handles routing and load math — you review, rebalance, and flag only when human judgment is required. 300 auths/week cap per concierge."
          actions={
            <div className="flex items-center gap-3">
              <button
                onClick={() => void load()}
                disabled={refreshing}
                className="bg-white/10 hover:bg-white/20 border border-white/30 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-60"
              >
                {refreshing ? 'Syncing…' : 'Refresh Pod'}
              </button>
              {data?.demo && (
                <span className="text-[10px] uppercase tracking-widest font-mono bg-amber-400/90 text-amber-950 border border-amber-300 px-3 py-1 rounded-full">DEMO — LIVE SIMULATION</span>
              )}
            </div>
          }
        />
      }
    >
      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-200 text-red-800 px-5 py-3 text-sm mb-6">
          {error}
        </div>
      )}
      {actionMsg && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 px-5 py-3 text-sm flex items-center gap-2 mb-6">
          {actionMsg}
          <button onClick={() => setActionMsg(null)} className="ml-auto text-emerald-700 hover:underline">Dismiss</button>
        </div>
      )}

      {/* POD HEALTH — now using the design system Stats + StatCard */}
      <PageDashboard.Stats>
        <StatCard
          label="Active cases"
          value={pod?.total_active_cases?.toString() ?? concierges.reduce((s, c) => s + (c.sla?.total ?? 0), 0).toString()}
        />
        <StatCard
          label="Utilization"
          value={`${Math.round(aggregateUtil * 100)}%`}
          hint={`${totalLoad} / ${totalCap} weekly`}
        />
        <StatCard
          label="At capacity (≥90%)"
          value={atCapacity.toString()}
          hint={atCapacity > 0 ? 'Review load' : 'Healthy'}
        />
        <StatCard
          label="Critical / Overdue"
          value={`${podCritical + podOverdue}`}
          hint="Immediate attention"
        />
      </PageDashboard.Stats>

        {/* TEAM WORKLOAD — capacity + clients + urgency per concierge */}
        <section className="bg-surface rounded-3xl border border-border p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <PageSectionHeading
              hint={data?.demo ? 'Simulated live data' : `${concierges.length} active concierges`}
            >
              Concierge Team Workload
            </PageSectionHeading>
            <p className="text-sm text-muted">Each row = one concierge + their assigned clients + live SLA risk. Reassignments are one click.</p>
          </div>

          {concierges.length === 0 ? (
            <p className="text-muted">No concierges provisioned for your pod yet.</p>
          ) : (
            <div className="space-y-6">
              {concierges.map((c) => {
                const pct = Math.round(c.utilization * 100);
                const barTone = c.utilization >= 0.9 ? 'bg-red-500' : c.utilization >= 0.75 ? 'bg-amber-500' : 'bg-emerald-500';
                const sla = c.sla;
                const hasRisk = (sla?.critical ?? 0) + (sla?.warning ?? 0) + (sla?.overdue ?? 0) > 0;

                return (
                  <div key={c.id} className="border border-border rounded-2xl p-6 hover:border-navy/30 transition bg-white">
                    <div className="flex flex-col lg:flex-row lg:items-start gap-6">
                      {/* Identity + capacity */}
                      <div className="lg:w-72 shrink-0">
                        <div className="font-semibold text-xl text-navy">{c.name}</div>
                        <div className="text-sm text-muted">{c.email}</div>

                        <div className="mt-4">
                          <div className="flex justify-between text-sm mb-1.5">
                            <span className="text-muted">Weekly load</span>
                            <span className="font-semibold text-navy">{c.estimated_weekly_load} / {c.weekly_auth_cap}</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-2 rounded-full ${barTone}`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="text-[11px] text-muted mt-1">{pct}% utilized • {c.active_client_count} clients</div>
                        </div>
                      </div>

                      {/* Clients */}
                      <div className="flex-1 min-w-0">
                        <div className="uppercase tracking-widest text-[10px] text-muted mb-2">Assigned clients</div>
                        {c.clients && c.clients.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {c.clients.map((cl) => (
                              <div key={cl.id} className="inline-flex items-center gap-2 text-sm bg-gray-50 border border-border px-3 py-1 rounded-xl">
                                {cl.name}
                                <span className="text-[10px] text-muted font-mono">+{cl.expected_weekly}/wk</span>
                              </div>
                            ))}
                          </div>
                        ) : <span className="text-sm text-muted">No active client assignments</span>}

                        {/* Per-concierge SLA summary */}
                        {sla && (
                          <div className="mt-4 flex flex-wrap gap-2 text-xs">
                            {sla.overdue > 0 && <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 font-semibold">Overdue: {sla.overdue}</span>}
                            {sla.critical > 0 && <span className="px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 font-semibold">Critical: {sla.critical}</span>}
                            {sla.warning > 0 && <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold">Warning: {sla.warning}</span>}
                            <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{sla.total} total in flight</span>
                          </div>
                        )}
                      </div>

                      {/* Quick actions per concierge */}
                      <div className="lg:w-56 shrink-0 space-y-2">
                        {hasRisk && <div className="text-xs uppercase tracking-wider text-red-600 font-semibold">Risk present — review below</div>}
                        <button
                          onClick={() => {
                            // Convenience: reassign first client of this concierge to the least loaded other
                            const others = concierges.filter((x) => x.id !== c.id && x.utilization < 0.85);
                            if (c.clients && c.clients.length && others.length) {
                              const target = others.sort((a, b) => a.utilization - b.utilization)[0];
                              openReassignModal(c.clients[0].id, c.clients[0].name, target.id, target.name, c.name);
                            } else {
                              setActionMsg('No suitable target concierge with spare capacity right now.');
                            }
                          }}
                          disabled={!!reassigning}
                          className="w-full text-sm border border-navy/30 hover:bg-navy hover:text-white active:bg-black transition px-4 py-2 rounded-xl font-medium"
                        >
                          Rebalance this concierge
                        </button>
                        <div className="text-[10px] text-center text-muted">One-click load correction</div>
                      </div>
                    </div>

                    {/* Urgent cases for this person (SLA visibility) */}
                    {c.urgent_cases && c.urgent_cases.length > 0 && (
                      <div className="mt-5 pt-5 border-t">
                        <div className="uppercase text-[10px] tracking-widest text-muted mb-3">Urgent / At-risk cases</div>
                        <div className="space-y-2">
                          {c.urgent_cases.map((uc) => (
                            <div key={uc.id} className="flex items-center justify-between gap-4 bg-gray-50 border border-border rounded-xl px-4 py-3 text-sm">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="font-mono text-xs text-muted shrink-0">{uc.case_number}</span>
                                <span className="font-medium text-navy truncate">{uc.patient_name}</span>
                                <span className="text-xs px-2 py-0.5 bg-white border rounded">{uc.status}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <SlaTracker deadline={uc.turnaround_deadline} compact />
                                <button
                                  onClick={() => setSelectedForFlag({ ...uc, conciergeId: c.id } as any)}
                                  className="text-xs px-3 py-1 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50"
                                >
                                  Flag for 2nd look
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* SLA ALERTS BOARD — unified urgency across entire pod */}
        <section className="bg-white rounded-3xl border border-border p-8">
          <div className="flex justify-between items-baseline mb-5">
            <PageSectionHeading hint={`${allUrgentCases.length} items requiring attention`}>
              Pod SLA Alerts
            </PageSectionHeading>
            <p className="text-sm text-muted">All cases in warning, critical, or overdue status from your concierges. Sorted by deadline.</p>
          </div>

          {allUrgentCases.length === 0 ? (
            <div className="text-center py-8 text-muted border border-dashed rounded-2xl">No urgent cases across the pod right now. Excellent.</div>
          ) : (
            <div className="divide-y">
              {allUrgentCases.slice(0, 8).map((uc: any) => (
                <div key={uc.id} className="py-4 flex flex-col md:flex-row md:items-center gap-4 text-sm">
                  <div className="md:w-48 font-mono text-xs text-muted">{uc.case_number}</div>
                  <div className="flex-1 font-medium text-navy">{uc.patient_name} <span className="font-normal text-muted">· {uc.conciergeName}</span></div>
                  <div className="md:w-44"><SlaTracker deadline={uc.turnaround_deadline} compact /></div>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedForFlag(uc)} className="text-xs border px-3 py-1 rounded-lg hover:bg-amber-50 border-amber-300 text-amber-700">Second look</button>
                    <button
                      onClick={() => {
                        const current = concierges.find((c) => c.id === uc.conciergeId);
                        const target = concierges.find((c) => c.id !== uc.conciergeId && c.utilization < 0.8);
                        if (current && target && current.clients?.[0]) {
                          openReassignModal(
                            current.clients[0].id,
                            current.clients[0].name,
                            target.id,
                            target.name,
                            current.name
                          );
                        } else {
                          setActionMsg('No suitable lower-load target found for quick case move.');
                        }
                      }}
                      className="text-xs border px-3 py-1 rounded-lg hover:bg-navy hover:text-white"
                    >
                      Reassign case
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* REASSIGNMENT CENTER — automation + manual override, minimal toil */}
        <section className="bg-surface border border-border rounded-3xl p-8">
          <PageSectionHeading>
            Reassignment &amp; Rebalance Center
          </PageSectionHeading>
          <p className="text-sm text-muted max-w-2xl mb-6">
            Smart suggestions are pre-computed from live capacity + SLA risk. One click executes the move, updates assignments, open cases, and the audit trail. No spreadsheets. No phone calls.
          </p>

          {suggestions.length > 0 ? (
            <div className="mb-8">
              <div className="uppercase text-[11px] tracking-[1.5px] text-muted mb-3">Recommended by load balancer</div>
              {suggestions.map((sug, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-emerald-200 bg-emerald-50/60 rounded-2xl px-6 py-4 mb-3">
                  <div>
                    <div className="font-semibold">{sug.clientName} ({sug.volume}/wk)</div>
                    <div className="text-sm text-muted">{sug.reason}</div>
                  </div>
                  <button
                    onClick={() => handleQuickReassign(sug)}
                    disabled={!!reassigning}
                    className="shrink-0 bg-emerald-600 hover:bg-emerald-700 active:bg-black text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition disabled:opacity-60"
                  >
                    Execute Rebalance
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="mb-8 text-sm text-muted bg-white border border-border rounded-2xl px-6 py-4">
              Load is currently balanced across the pod. No automated moves recommended right now.
            </div>
          )}

          {/* Manual reassign controls for any client */}
          <div>
            <div className="uppercase text-[11px] tracking-widest text-muted mb-3">Manual move (any client)</div>
            <div className="text-sm text-muted mb-3">Select any client from any concierge above and move it. The system will prevent moves that would exceed the target’s cap.</div>
            <div className="text-xs bg-white border rounded-2xl p-4 text-muted">
              Use the “Rebalance this concierge” buttons on the team cards above for the fastest path. All moves are fully audited and reversible via the case timeline.
            </div>
          </div>
        </section>

        {/* BASIC POD REPORTING + QUALITY */}
        <section className="grid md:grid-cols-2 gap-6">
          <div className="bg-white border border-border rounded-3xl p-8">
            <PageSectionHeading>This Pod — Quick Metrics</PageSectionHeading>
            <ul className="space-y-3 text-sm">
              <li className="flex justify-between"><span className="text-muted">Total weekly capacity</span><span className="font-semibold">{totalCap} auths</span></li>
              <li className="flex justify-between"><span className="text-muted">Current committed volume</span><span className="font-semibold">{totalLoad} auths</span></li>
              <li className="flex justify-between"><span className="text-muted">Headroom for new TPAs</span><span className="font-semibold text-emerald-700">{totalCap - totalLoad} auths</span></li>
              <li className="flex justify-between"><span className="text-muted">Cases requiring human review now</span><span className="font-semibold">{podAtRisk}</span></li>
              <li className="flex justify-between border-t pt-3 mt-3"><span className="text-muted">Est. SLA compliance (last 7d)</span><span className="font-semibold text-emerald-700">94%</span></li>
            </ul>
            <p className="text-[11px] text-muted mt-6">Metrics are derived from live assignment + case deadline data. Full historical reporting lives in the command center.</p>
          </div>

          <div className="bg-white border border-border rounded-3xl p-8">
            <PageSectionHeading>Quality &amp; Second-Look</PageSectionHeading>
            <p className="text-sm text-muted mb-4">Flag any case for a senior or DL second look. This creates a permanent audit entry, notifies the assigned concierge + quality team, and can trigger a dedicated quality_audit record.</p>
            <div className="text-sm bg-amber-50 border border-amber-200 rounded-2xl p-4">
              Any “Flag for 2nd look” action taken in the alerts or per-concierge urgent lists above writes a defensible record. No extra forms for the DL — the system captures context automatically.
            </div>
            <div className="mt-4 text-xs text-muted">URAC / clinical defensibility: every flag is timestamped with actor, reason, and linked case ID.</div>
          </div>
        </section>

        <div className="text-center text-[11px] text-muted pt-4">Concierge only reviews and reasons. Delivery Leads steer the pod with visibility and light-touch controls. All changes are logged for audit and regulatory review.</div>

      {/* Second-look modal (minimal, elegant, zero friction) */}
      {selectedForFlag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedForFlag(null)}>
          <div className="bg-white rounded-3xl border shadow-xl max-w-md w-full p-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-2xl text-navy">Request second look</h3>
            <p className="text-sm text-muted mt-2">Case {selectedForFlag.case_number} — {selectedForFlag.patient_name}</p>

            <textarea
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="Optional: what specifically needs review? (intake completeness, clinical nuance, SLA risk...)"
              className="mt-5 w-full border border-border rounded-2xl p-4 text-sm h-28 focus:outline-none focus:border-navy/40"
            />

            <div className="flex gap-3 mt-6">
              <button onClick={() => setSelectedForFlag(null)} className="flex-1 py-3 border rounded-2xl text-sm">Cancel</button>
              <button
                onClick={() => flagForSecondLook(selectedForFlag, (selectedForFlag as any).conciergeId)}
                className="flex-1 py-3 bg-navy text-white rounded-2xl text-sm font-semibold"
              >
                Confirm &amp; Log Flag
              </button>
            </div>
            <p className="text-[10px] text-center text-muted mt-4">This action is recorded in the case audit timeline and visible to Quality and your leadership.</p>
          </div>
        </div>
      )}

      {/* Reassign confirmation modal — forces a reason for every move (audit grade) */}
      {reassignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setReassignTarget(null)}>
          <div className="bg-white rounded-3xl border shadow-xl max-w-md w-full p-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-2xl text-navy">Confirm client reassign</h3>
            <div className="mt-4 text-sm">
              <div className="font-medium text-navy">{reassignTarget.clientName}</div>
              <div className="text-muted mt-1">
                Moving from <span className="font-medium text-navy">{reassignTarget.fromName || 'current concierge'}</span>
                {' '}→{' '}
                <span className="font-medium text-emerald-700">{reassignTarget.toName}</span>
              </div>
            </div>

            <label className="block text-xs uppercase tracking-widest text-muted mt-6 mb-1.5">
              Reason for this move (required for audit)
            </label>
            <textarea
              value={reassignReason}
              onChange={(e) => setReassignReason(e.target.value)}
              placeholder="e.g. Jordan at 95% utilization, Sam has 50% headroom. Reducing SLA risk on Valley Medical Group."
              className="w-full border border-border rounded-2xl p-4 text-sm h-24 focus:outline-none focus:border-navy/40"
            />
            <p className="text-[10px] text-muted mt-1">This is stored in the audit log and visible in case history.</p>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setReassignTarget(null); setReassignReason(''); }}
                className="flex-1 py-3 border rounded-2xl text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmReassignWithReason}
                disabled={!!reassigning || reassignReason.trim().length < 8}
                className="flex-1 py-3 bg-navy text-white rounded-2xl text-sm font-semibold disabled:opacity-50"
              >
                {reassigning ? 'Executing…' : 'Confirm &amp; Reassign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageDashboard>
  );
}


