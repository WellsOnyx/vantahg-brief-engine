'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import {
  BIZ, MILESTONES,
  calcRevenue, calcAuths, calcHeadcount, calcDeliveryCost, calcConstellationPL,
} from './constants';

// ── Formatters ────────────────────────────────────────────────────────────────

const fmt$ = (n: number, compact = true) =>
  compact
    ? n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
        ? `$${(n / 1_000).toFixed(0)}K`
        : `$${Math.round(n)}`
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const fmtN = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}K`
      : Math.round(n).toLocaleString();

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

// ── Shared Components ─────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent = false, dim = false,
}: { label: string; value: string; sub?: string; accent?: boolean; dim?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${
      accent ? 'border-gold/40 bg-navy/60' : dim ? 'border-white/5 bg-white/2' : 'border-white/10 bg-white/5'
    }`}>
      <p className="text-xs text-white/40 uppercase tracking-widest">{label}</p>
      <p className={`text-2xl font-bold ${accent ? 'text-gold' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-white/40">{sub}</p>}
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-white tracking-tight">{title}</h2>
      {sub && <p className="text-sm text-white/40 mt-0.5">{sub}</p>}
    </div>
  );
}

function MilestoneBar({ lives }: { lives: number }) {
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-white/40 uppercase tracking-widest">Progress to Full Scale</span>
        <span className="text-xs text-white/60">{fmtN(lives)} / {fmtN(BIZ.MAX_LIVES)} lives</span>
      </div>
      <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full bg-gold rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, (lives / BIZ.MAX_LIVES) * 100)}%` }}
        />
        {MILESTONES.map((m) => (
          <div
            key={m.key}
            className="absolute top-0 h-full w-px bg-white/30"
            style={{ left: `${(m.lives / BIZ.MAX_LIVES) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-3">
        {MILESTONES.map((m) => {
          const reached = lives >= m.lives;
          return (
            <div key={m.key} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${reached ? 'bg-gold' : 'bg-white/20'}`} />
              <span className={`text-xs ${reached ? 'text-white' : 'text-white/40'}`}>{m.label}</span>
              {!reached && (
                <span className="text-xs text-white/25">
                  ({fmtN(m.lives - lives)} more)
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── TPA Pipeline State ────────────────────────────────────────────────────────

type PipelineStage = 'outreach' | 'meeting' | 'proposal' | 'signed';

interface TPA {
  id: string;
  name: string;
  lives: number;
  stage: PipelineStage;
}

const STAGE_ORDER: PipelineStage[] = ['outreach', 'meeting', 'proposal', 'signed'];
const STAGE_LABELS: Record<PipelineStage, string> = {
  outreach: 'Outreach',
  meeting: 'Meeting',
  proposal: 'Proposal',
  signed: 'Signed',
};
const STAGE_COLORS: Record<PipelineStage, string> = {
  outreach: 'bg-white/10 text-white/50',
  meeting: 'bg-blue-500/20 text-blue-300',
  proposal: 'bg-gold/20 text-gold',
  signed: 'bg-green-500/20 text-green-300',
};

// ── Revenue Chart Data ────────────────────────────────────────────────────────

function buildRevenueChartData() {
  const points = [];
  for (let l = 0; l <= BIZ.MAX_LIVES; l += 20_000) {
    const rev = calcRevenue(l);
    const del = calcDeliveryCost(l);
    points.push({
      lives: l,
      livesLabel: fmtN(l),
      gross: rev.grossAnnual,
      net: rev.netAfterTax,
      delivery: del.totalDeliveryAnnual,
    });
  }
  return points;
}

const REVENUE_CHART_DATA = buildRevenueChartData();

// ── Hiring Chart Data ─────────────────────────────────────────────────────────

function buildHiringData() {
  return [0, 10_000, 25_000, 50_000, 100_000, 150_000, 200_000, 300_000, 400_000, 584_000].map((l) => {
    const hc = calcHeadcount(l);
    return {
      lives: fmtN(l),
      pls: hc.concierge_pls,
      leads: hc.concierge_delivery_leads,
      clinicians: hc.clinicians,
      medLead: hc.medical_delivery_lead,
    };
  });
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy-dark border border-white/10 rounded-lg p-3 text-xs">
      <p className="text-white/60 mb-1">{label} lives</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.dataKey.startsWith('lives') ? fmtN(p.value) : fmt$(p.value)}
        </p>
      ))}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function OpsPage() {
  const [lives, setLives] = useState(0);
  const [tpas, setTpas] = useState<TPA[]>([]);
  const [newTpa, setNewTpa] = useState({ name: '', lives: '', stage: 'outreach' as PipelineStage });
  const [activeModule, setActiveModule] = useState<number>(1);

  // Persist to localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('vantaum-ops-state');
      if (saved) {
        const state = JSON.parse(saved);
        if (typeof state.lives === 'number') setLives(state.lives);
        if (Array.isArray(state.tpas)) setTpas(state.tpas);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('vantaum-ops-state', JSON.stringify({ lives, tpas }));
    } catch {}
  }, [lives, tpas]);

  // Derived state — all recalculated on every render (pure functions, fast)
  const rev = calcRevenue(lives);
  const auths = calcAuths(lives);
  const hc = calcHeadcount(lives);
  const delivery = calcDeliveryCost(lives);
  const pl = calcConstellationPL(lives);

  const signedLives = tpas.filter((t) => t.stage === 'signed').reduce((s, t) => s + t.lives, 0);
  const pipelineLives = tpas.reduce((s, t) => s + t.lives, 0);
  const gapToFull = Math.max(0, BIZ.MAX_LIVES - signedLives);

  const addTpa = useCallback(() => {
    const l = parseInt(newTpa.lives.replace(/,/g, ''), 10);
    if (!newTpa.name.trim() || isNaN(l) || l <= 0) return;
    setTpas((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: newTpa.name.trim(), lives: l, stage: newTpa.stage },
    ]);
    // Auto-update lives to signed total
    setNewTpa({ name: '', lives: '', stage: 'outreach' });
  }, [newTpa]);

  const updateTpaStage = (id: string, stage: PipelineStage) => {
    setTpas((prev) => prev.map((t) => (t.id === id ? { ...t, stage } : t)));
  };

  const removeTpa = (id: string) => setTpas((prev) => prev.filter((t) => t.id !== id));

  // Sync signed lives → main lives input
  useEffect(() => {
    if (signedLives > 0) setLives(signedLives);
  }, [signedLives]);

  const MODULES = [
    { n: 1, label: 'Revenue' },
    { n: 2, label: 'Auth Volume' },
    { n: 3, label: 'Delivery P&L' },
    { n: 4, label: 'Hiring Ramp' },
    { n: 5, label: 'TPA Pipeline' },
    { n: 6, label: 'Constellation' },
  ];

  return (
    <div className="min-h-screen bg-navy text-white">
      {/* ── Top Bar ── */}
      <div className="border-b border-white/10 bg-navy-dark sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-sm font-semibold text-gold tracking-wider uppercase">VantaUM Ops Dashboard</h1>
            <p className="text-xs text-white/30 mt-0.5">Wells Onyx Internal · Confidential</p>
          </div>

          {/* Lives input */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-white/40 uppercase tracking-widest">Lives Under Contract</label>
            <input
              type="number"
              value={lives || ''}
              onChange={(e) => setLives(Math.max(0, parseInt(e.target.value || '0', 10)))}
              placeholder="0"
              className="w-32 bg-white/5 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white text-right tabular-nums focus:outline-none focus:border-gold/60"
            />
          </div>

          {/* Module tabs */}
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
            {MODULES.map((m) => (
              <button
                key={m.n}
                onClick={() => setActiveModule(m.n)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeModule === m.n
                    ? 'bg-gold text-navy-dark'
                    : 'text-white/50 hover:text-white hover:bg-white/10'
                }`}
              >
                {m.n}. {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <MilestoneBar lives={lives} />

        <div className="mt-10">
          {/* ════════════════════════════════════════════════════
              MODULE 1 — Revenue Dashboard
          ════════════════════════════════════════════════════ */}
          {activeModule === 1 && (
            <div className="animate-fade-in">
              <SectionHeader
                title="Revenue Dashboard"
                sub={`$${BIZ.PEPM} PEPM · ${fmtN(lives)} lives · All figures annual unless noted`}
              />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <StatCard label="Gross Revenue" value={fmt$(rev.grossAnnual)} sub={`${fmt$(rev.grossMonthly)}/mo`} />
                <StatCard label="Tithe (10%)" value={fmt$(rev.titheAnnual)} sub={`${fmt$(rev.titheMonthly)}/mo`} />
                <StatCard label="Net After Tithe" value={fmt$(rev.netBeforeTax)} sub="before tax" />
                <StatCard label="Net After Tax" value={fmt$(rev.netAfterTax)} sub="~37% effective rate" accent />
              </div>

              {/* Revenue chart */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-5 mb-8">
                <p className="text-xs text-white/40 uppercase tracking-widest mb-4">Revenue vs Delivery Cost Curve</p>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={REVENUE_CHART_DATA} margin={{ top: 5, right: 5, bottom: 5, left: 10 }}>
                    <defs>
                      <linearGradient id="grossGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#c9a227" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#c9a227" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4ade80" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="livesLabel" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} />
                    <YAxis tickFormatter={(v) => fmt$(v)} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine
                      x={fmtN(lives)}
                      stroke="rgba(201,162,39,0.6)"
                      strokeDasharray="4 4"
                      label={{ value: 'Now', fill: '#c9a227', fontSize: 10 }}
                    />
                    <Area type="monotone" dataKey="gross" name="Gross" stroke="#c9a227" fill="url(#grossGrad)" strokeWidth={2} />
                    <Area type="monotone" dataKey="net" name="Net" stroke="#4ade80" fill="url(#netGrad)" strokeWidth={2} />
                    <Area type="monotone" dataKey="delivery" name="Delivery Cost" stroke="#f87171" fill="none" strokeWidth={1.5} strokeDasharray="4 4" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Milestone table */}
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5">
                      <th className="text-left px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">Milestone</th>
                      <th className="text-right px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">Lives Needed</th>
                      <th className="text-right px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">Gap</th>
                      <th className="text-right px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">Gross at Target</th>
                      <th className="text-right px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">Net at Target</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {MILESTONES.map((m) => {
                      const reached = lives >= m.lives;
                      const r = calcRevenue(m.lives);
                      const gap = Math.max(0, m.lives - lives);
                      return (
                        <tr key={m.key} className={`border-b border-white/5 ${reached ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-white">{m.label}</p>
                            <p className="text-xs text-white/30">{m.description}</p>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-white/70">{fmtN(m.lives)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-white/50 text-xs">
                            {gap === 0 ? '—' : `+${fmtN(gap)}`}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-white/70">{fmt$(r.grossAnnual)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-white">{fmt$(r.netAfterTax)}</td>
                          <td className="px-4 py-3 text-right">
                            {reached ? (
                              <span className="inline-block w-2 h-2 rounded-full bg-gold" />
                            ) : (
                              <span className="inline-block w-2 h-2 rounded-full bg-white/15" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════
              MODULE 2 — Auth Volume Tracker
          ════════════════════════════════════════════════════ */}
          {activeModule === 2 && (
            <div className="animate-fade-in">
              <SectionHeader
                title="Auth Volume Tracker"
                sub={`${fmtN(lives)} lives · ${BIZ.AUTHS_PER_MEMBER_PER_YEAR} auths/member/yr · ${pct(BIZ.AI_AUTOMATION_RATE)} AI-handled`}
              />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <StatCard label="Total Auths / Year" value={fmtN(auths.authsPerYear)} sub={`${fmtN(auths.authsPerMonth)}/mo`} />
                <StatCard label="AI-Handled" value={fmtN(auths.aiHandled)} sub={pct(BIZ.AI_AUTOMATION_RATE)} />
                <StatCard label="Clinician Review" value={fmtN(auths.clinicianReview)} sub={`${pct(BIZ.HUMAN_REVIEW_RATE)} · <10 min each`} />
                <StatCard label="P2P Reviews" value={fmtN(auths.p2pReview)} sub={`${pct(BIZ.P2P_RATE)} · ${fmt$(auths.p2pCostAnnual)}/yr`} accent />
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <StatCard label="Follow-up Contacts / Year" value={fmtN(auths.contacts)} sub={`${pct(BIZ.FOLLOWUP_RATE)} of auths → contact · ${fmtN(auths.contactsPerMonth)}/mo`} />
                <StatCard label="P2P Contract Cost" value={fmt$(auths.p2pCostAnnual)} sub={`${fmtN(auths.p2pReview)} reviews × $${BIZ.P2P_COST_PER_REVIEW}`} />
              </div>

              {/* Auth mix chart */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-5 mb-8">
                <p className="text-xs text-white/40 uppercase tracking-widest mb-4">Auth Volume by Handling Type</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={[
                      { name: 'AI Automated', value: auths.aiHandled, fill: '#4ade80' },
                      { name: 'Clinician Review', value: auths.clinicianReview, fill: '#c9a227' },
                      { name: 'P2P Physician', value: auths.p2pReview, fill: '#f87171' },
                    ]}
                    margin={{ top: 5, right: 5, bottom: 5, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                    <YAxis tickFormatter={fmtN} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      content={({ active, payload }) =>
                        active && payload?.length ? (
                          <div className="bg-navy-dark border border-white/10 rounded-lg p-3 text-xs">
                            <p className="text-white">{payload[0].payload.name}</p>
                            <p className="text-white/60">{fmtN(payload[0].value as number)} auths/yr</p>
                          </div>
                        ) : null
                      }
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {[{ fill: '#4ade80' }, { fill: '#c9a227' }, { fill: '#f87171' }].map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Scale table */}
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5">
                      <th className="text-left px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">Lives</th>
                      <th className="text-right px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">Auths/Yr</th>
                      <th className="text-right px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">AI</th>
                      <th className="text-right px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">Clinician</th>
                      <th className="text-right px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">P2P</th>
                      <th className="text-right px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">Contacts/Yr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[0, 10_000, 50_000, 100_000, 200_000, 400_000, 584_000].map((l) => {
                      const a = calcAuths(l);
                      const isNow = l <= lives && (l === 0 || l === [0, 10_000, 50_000, 100_000, 200_000, 400_000, 584_000].filter((x) => x <= lives).at(-1));
                      return (
                        <tr key={l} className={`border-b border-white/5 ${isNow ? 'bg-gold/5' : ''}`}>
                          <td className="px-4 py-2.5 tabular-nums text-white/70">{fmtN(l)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-white/70">{fmtN(a.authsPerYear)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-green-400 text-xs">{fmtN(a.aiHandled)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gold text-xs">{fmtN(a.clinicianReview)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-red-400 text-xs">{fmtN(a.p2pReview)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-white/50 text-xs">{fmtN(a.contacts)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════
              MODULE 3 — Delivery Org P&L
          ════════════════════════════════════════════════════ */}
          {activeModule === 3 && (
            <div className="animate-fade-in">
              <SectionHeader
                title="Delivery Org P&L"
                sub={`Fully loaded costs · ${fmtN(lives)} lives · ${hc.medical_delivery_lead + hc.clinicians + hc.concierge_delivery_leads + hc.concierge_pls} people on staff`}
              />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <StatCard label="Total Staff Cost" value={fmt$(delivery.totalStaffAnnual)} sub={`${fmt$(delivery.totalStaffMonthly)}/mo`} />
                <StatCard label="P2P Contract Cost" value={fmt$(delivery.p2pAnnual)} sub={`${fmtN(auths.p2pReview)} reviews`} />
                <StatCard label="Total Delivery Cost" value={fmt$(delivery.totalDeliveryAnnual)} sub={`${fmt$(delivery.totalDeliveryMonthly)}/mo`} />
                <StatCard
                  label="Gross Margin"
                  value={rev.grossAnnual > 0 ? pct((rev.grossAnnual - delivery.totalDeliveryAnnual) / rev.grossAnnual) : '—'}
                  sub={fmt$(rev.grossAnnual - delivery.totalDeliveryAnnual)}
                  accent={rev.grossAnnual > delivery.totalDeliveryAnnual}
                />
              </div>

              {/* Staff breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                  <p className="text-xs text-white/40 uppercase tracking-widest mb-4">Staff Cost Breakdown</p>
                  <div className="space-y-3">
                    {[
                      { label: 'Medical Delivery Lead', count: hc.medical_delivery_lead, rate: BIZ.COMP.medical_delivery_lead, color: 'bg-purple-400' },
                      { label: 'Clinicians', count: hc.clinicians, rate: BIZ.COMP.clinician, color: 'bg-blue-400' },
                      { label: 'Concierge Delivery Leads', count: hc.concierge_delivery_leads, rate: BIZ.COMP.concierge_delivery_lead, color: 'bg-gold' },
                      { label: 'Concierge Practice Leads', count: hc.concierge_pls, rate: BIZ.COMP.concierge_pl, color: 'bg-green-400' },
                    ].map((row) => {
                      const cost = row.count * row.rate;
                      const share = delivery.totalStaffAnnual > 0 ? cost / delivery.totalStaffAnnual : 0;
                      return (
                        <div key={row.label}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${row.color}`} />
                              <span className="text-sm text-white/70">{row.label}</span>
                              <span className="text-xs text-white/30">×{row.count}</span>
                            </div>
                            <span className="text-sm text-white tabular-nums">{fmt$(cost)}</span>
                          </div>
                          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                            <div className={`h-full ${row.color} rounded-full`} style={{ width: `${share * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Revenue vs cost at-a-glance */}
                <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                  <p className="text-xs text-white/40 uppercase tracking-widest mb-4">Revenue vs Costs</p>
                  <div className="space-y-4">
                    {[
                      { label: 'Gross Revenue', value: rev.grossAnnual, color: '#c9a227' },
                      { label: 'Tithe', value: -rev.titheAnnual, color: '#94a3b8' },
                      { label: 'Staff Costs', value: -delivery.totalStaffAnnual, color: '#f87171' },
                      { label: 'P2P Contract', value: -delivery.p2pAnnual, color: '#fb923c' },
                      { label: 'Tax (~37%)', value: -(rev.netBeforeTax - delivery.totalDeliveryAnnual > 0 ? (rev.netBeforeTax - delivery.totalDeliveryAnnual) * BIZ.EFFECTIVE_TAX_RATE : 0), color: '#94a3b8' },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: row.color }} />
                          <span className="text-sm text-white/60">{row.label}</span>
                        </div>
                        <span className={`text-sm font-medium tabular-nums ${row.value >= 0 ? 'text-white' : 'text-red-400'}`}>
                          {row.value >= 0 ? '+' : ''}{fmt$(row.value)}
                        </span>
                      </div>
                    ))}
                    <div className="border-t border-white/10 pt-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">Net to Constellation</span>
                      <span className={`text-base font-bold tabular-nums ${pl.netToConstellation >= 0 ? 'text-gold' : 'text-red-400'}`}>
                        {fmt$(pl.netToConstellation)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Comp reference */}
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5">
                      <th className="text-left px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">Role</th>
                      <th className="text-right px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">Comp</th>
                      <th className="text-right px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">Current HC</th>
                      <th className="text-right px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">Max HC</th>
                      <th className="text-right px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { role: 'Medical Delivery Lead', comp: BIZ.COMP.medical_delivery_lead, cur: hc.medical_delivery_lead, max: BIZ.HEAD.medical_delivery_lead },
                      { role: 'Clinician', comp: BIZ.COMP.clinician, cur: hc.clinicians, max: BIZ.HEAD.clinicians },
                      { role: 'Concierge Delivery Lead', comp: BIZ.COMP.concierge_delivery_lead, cur: hc.concierge_delivery_leads, max: BIZ.HEAD.concierge_delivery_leads },
                      { role: 'Concierge Practice Lead', comp: BIZ.COMP.concierge_pl, cur: hc.concierge_pls, max: BIZ.HEAD.concierge_pls },
                    ].map((r) => (
                      <tr key={r.role} className="border-b border-white/5">
                        <td className="px-4 py-2.5 text-white/70">{r.role}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-white/60">{fmt$(r.comp, false)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-white">{r.cur}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-white/30">{r.max}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gold">{fmt$(r.cur * r.comp)}</td>
                      </tr>
                    ))}
                    <tr className="bg-white/5">
                      <td className="px-4 py-2.5 font-semibold text-white" colSpan={4}>Total Staff</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-gold">{fmt$(delivery.totalStaffAnnual)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════
              MODULE 4 — Hiring Ramp Planner
          ════════════════════════════════════════════════════ */}
          {activeModule === 4 && (
            <div className="animate-fade-in">
              <SectionHeader
                title="Hiring Ramp Planner"
                sub={`Current: ${hc.medical_delivery_lead + hc.clinicians + hc.concierge_delivery_leads + hc.concierge_pls} people needed at ${fmtN(lives)} lives`}
              />

              {/* Current state */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <StatCard label="Concierge PLs" value={String(hc.concierge_pls)} sub={`/ ${BIZ.HEAD.concierge_pls} max`} />
                <StatCard label="Delivery Leads" value={String(hc.concierge_delivery_leads)} sub={`/ ${BIZ.HEAD.concierge_delivery_leads} max`} />
                <StatCard label="Clinicians" value={String(hc.clinicians)} sub={`/ ${BIZ.HEAD.clinicians} max`} />
                <StatCard label="Medical Lead" value={String(hc.medical_delivery_lead)} sub="/ 1 max" accent={hc.medical_delivery_lead === 1} />
              </div>

              {/* Hiring triggers */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-5 mb-8">
                <p className="text-xs text-white/40 uppercase tracking-widest mb-4">Next Hire Trigger Points</p>
                <div className="space-y-2">
                  {(() => {
                    const triggers: { lives: number; role: string; from: number; to: number }[] = [];
                    let prev = calcHeadcount(0);
                    for (let l = 1000; l <= BIZ.MAX_LIVES; l += 1000) {
                      const cur = calcHeadcount(l);
                      if (cur.concierge_pls > prev.concierge_pls)
                        triggers.push({ lives: l, role: 'Concierge Practice Lead', from: prev.concierge_pls, to: cur.concierge_pls });
                      if (cur.concierge_delivery_leads > prev.concierge_delivery_leads)
                        triggers.push({ lives: l, role: 'Concierge Delivery Lead', from: prev.concierge_delivery_leads, to: cur.concierge_delivery_leads });
                      if (cur.clinicians > prev.clinicians)
                        triggers.push({ lives: l, role: 'Clinician', from: prev.clinicians, to: cur.clinicians });
                      if (cur.medical_delivery_lead > prev.medical_delivery_lead)
                        triggers.push({ lives: l, role: 'Medical Delivery Lead', from: 0, to: 1 });
                      prev = cur;
                    }
                    return triggers.slice(0, 12).map((t) => {
                      const reached = lives >= t.lives;
                      return (
                        <div key={`${t.lives}-${t.role}`} className={`flex items-center justify-between py-2 px-3 rounded-lg ${reached ? 'bg-white/5 opacity-50' : 'bg-white/3'}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${reached ? 'bg-gold' : 'bg-white/20'}`} />
                            <span className="text-sm text-white/70">{t.role}</span>
                            <span className="text-xs text-white/30">#{t.to}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-xs text-white/40 tabular-nums">at {fmtN(t.lives)} lives</span>
                            {!reached && (
                              <span className="text-xs text-gold/60 tabular-nums">+{fmtN(t.lives - lives)} to go</span>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Headcount chart */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs text-white/40 uppercase tracking-widest mb-4">Headcount by Role as Lives Scale</p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={buildHiringData()} margin={{ top: 5, right: 5, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="lives" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} />
                    <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      content={({ active, payload, label }) =>
                        active && payload?.length ? (
                          <div className="bg-navy-dark border border-white/10 rounded-lg p-3 text-xs space-y-1">
                            <p className="text-white/50 mb-1">{label} lives</p>
                            {payload.map((p: any) => (
                              <p key={p.dataKey} style={{ color: p.fill }}>{p.name}: {p.value}</p>
                            ))}
                          </div>
                        ) : null
                      }
                    />
                    <Bar dataKey="pls" name="Practice Leads" stackId="a" fill="#4ade80" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="leads" name="Delivery Leads" stackId="a" fill="#c9a227" />
                    <Bar dataKey="clinicians" name="Clinicians" stackId="a" fill="#60a5fa" />
                    <Bar dataKey="medLead" name="Med Lead" stackId="a" fill="#c084fc" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════
              MODULE 5 — TPA Pipeline Tracker
          ════════════════════════════════════════════════════ */}
          {activeModule === 5 && (
            <div className="animate-fade-in">
              <SectionHeader
                title="TPA Pipeline Tracker"
                sub={`${fmtN(signedLives)} signed · ${fmtN(pipelineLives)} in pipeline · ${fmtN(gapToFull)} needed to close`}
              />

              {/* Pipeline summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {STAGE_ORDER.map((stage) => {
                  const stageTpas = tpas.filter((t) => t.stage === stage);
                  const stageLives = stageTpas.reduce((s, t) => s + t.lives, 0);
                  return (
                    <div key={stage} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs text-white/40 uppercase tracking-widest">{STAGE_LABELS[stage]}</p>
                      <p className="text-2xl font-bold text-white mt-1">{fmtN(stageLives)}</p>
                      <p className="text-xs text-white/30 mt-0.5">{stageTpas.length} TPA{stageTpas.length !== 1 ? 's' : ''}</p>
                    </div>
                  );
                })}
              </div>

              {/* Add TPA form */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-5 mb-6">
                <p className="text-xs text-white/40 uppercase tracking-widest mb-3">Add TPA</p>
                <div className="flex gap-3 flex-wrap">
                  <input
                    type="text"
                    placeholder="TPA Name"
                    value={newTpa.name}
                    onChange={(e) => setNewTpa((p) => ({ ...p, name: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && addTpa()}
                    className="flex-1 min-w-40 bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold/60"
                  />
                  <input
                    type="text"
                    placeholder="Est. Lives"
                    value={newTpa.lives}
                    onChange={(e) => setNewTpa((p) => ({ ...p, lives: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && addTpa()}
                    className="w-32 bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 tabular-nums text-right focus:outline-none focus:border-gold/60"
                  />
                  <select
                    value={newTpa.stage}
                    onChange={(e) => setNewTpa((p) => ({ ...p, stage: e.target.value as PipelineStage }))}
                    className="bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/60"
                  >
                    {STAGE_ORDER.map((s) => (
                      <option key={s} value={s} className="bg-navy-dark">{STAGE_LABELS[s]}</option>
                    ))}
                  </select>
                  <button
                    onClick={addTpa}
                    className="bg-gold text-navy-dark font-semibold px-4 py-2 rounded-lg text-sm hover:bg-gold-light transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* TPA table */}
              {tpas.length === 0 ? (
                <div className="rounded-xl border border-white/10 border-dashed p-12 text-center">
                  <p className="text-white/30 text-sm">No TPAs in pipeline yet.</p>
                  <p className="text-white/20 text-xs mt-1">Add your first TPA above.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5">
                        <th className="text-left px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">TPA</th>
                        <th className="text-right px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">Est. Lives</th>
                        <th className="text-right px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">Monthly Rev</th>
                        <th className="text-center px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">Stage</th>
                        <th className="text-right px-4 py-3 text-xs text-white/40 uppercase tracking-widest font-medium">Gap Closed</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {tpas.map((tpa) => {
                        const monthlyRev = tpa.lives * BIZ.PEPM;
                        const gapClosed = (tpa.lives / BIZ.MAX_LIVES) * 100;
                        return (
                          <tr key={tpa.id} className="border-b border-white/5 hover:bg-white/3">
                            <td className="px-4 py-3 font-medium text-white">{tpa.name}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-white/70">{fmtN(tpa.lives)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-gold">{fmt$(monthlyRev)}/mo</td>
                            <td className="px-4 py-3 text-center">
                              <select
                                value={tpa.stage}
                                onChange={(e) => updateTpaStage(tpa.id, e.target.value as PipelineStage)}
                                className={`rounded-full px-3 py-1 text-xs font-medium border-0 focus:outline-none cursor-pointer ${STAGE_COLORS[tpa.stage]}`}
                                style={{ background: 'transparent' }}
                              >
                                {STAGE_ORDER.map((s) => (
                                  <option key={s} value={s} className="bg-navy-dark text-white">{STAGE_LABELS[s]}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-white/40 text-xs">
                              {gapClosed.toFixed(1)}%
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => removeTpa(tpa.id)}
                                className="text-white/20 hover:text-red-400 text-xs transition-colors"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/10 bg-white/5">
                        <td className="px-4 py-3 font-semibold text-white">Pipeline Total</td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-white">{fmtN(pipelineLives)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-gold">{fmt$(pipelineLives * BIZ.PEPM)}/mo</td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Milestone unlock table */}
              {tpas.length > 0 && (
                <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
                  <p className="text-xs text-white/40 uppercase tracking-widest mb-3">Milestone Unlock Map</p>
                  <div className="space-y-2">
                    {MILESTONES.map((m) => {
                      const needed = Math.max(0, m.lives - signedLives);
                      const tpasThatFill = tpas
                        .filter((t) => t.stage !== 'signed')
                        .sort((a, b) => b.lives - a.lives)
                        .find((t) => t.lives >= needed);
                      return (
                        <div key={m.key} className="flex items-center justify-between py-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${signedLives >= m.lives ? 'bg-gold' : 'bg-white/15'}`} />
                            <span className="text-sm text-white/70">{m.label}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-right">
                            {needed === 0 ? (
                              <span className="text-gold">Reached</span>
                            ) : (
                              <>
                                <span className="text-white/30">Need {fmtN(needed)} more lives</span>
                                {tpasThatFill && (
                                  <span className="text-white/50">
                                    → signing <span className="text-white">{tpasThatFill.name}</span> unlocks this
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════
              MODULE 6 — Constellation P&L Summary
          ════════════════════════════════════════════════════ */}
          {activeModule === 6 && (
            <div className="animate-fade-in">
              <SectionHeader
                title="Constellation P&L Summary"
                sub={`Full cost stack · ${fmtN(lives)} lives · Kingdom-first financials`}
              />

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                <StatCard label="Gross Revenue" value={fmt$(rev.grossAnnual)} sub="annual" />
                <StatCard label="Tithe (10% first)" value={fmt$(rev.titheAnnual)} sub="to the house of God" />
                <StatCard label="Total Delivery Cost" value={fmt$(delivery.totalDeliveryAnnual)} sub="staff + P2P" />
                <StatCard label="Ops Buffer (5%)" value={fmt$(pl.opsBuffer)} sub="of gross" />
                <StatCard label="Net to Constellation" value={fmt$(pl.netToConstellation)} sub="after tithe, costs, tax" accent={pl.netToConstellation >= 0} />
                <StatCard
                  label="Per Principal"
                  value={fmt$(pl.netToConstellation / BIZ.NUM_PRINCIPALS)}
                  sub={`of $${(BIZ.PRINCIPAL_NET_TARGET / 1000).toFixed(0)}K target`}
                  accent={pl.netToConstellation / BIZ.NUM_PRINCIPALS >= BIZ.PRINCIPAL_NET_TARGET}
                />
              </div>

              {/* Waterfall */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-5 mb-8">
                <p className="text-xs text-white/40 uppercase tracking-widest mb-4">P&L Waterfall</p>
                <div className="space-y-2">
                  {[
                    { label: 'Gross Revenue', value: rev.grossAnnual, positive: true },
                    { label: 'Tithe (10%)', value: rev.titheAnnual, positive: false },
                    { label: 'Staff Costs', value: delivery.totalStaffAnnual, positive: false },
                    { label: 'P2P Contract Costs', value: delivery.p2pAnnual, positive: false },
                    { label: 'Estimated Tax', value: Math.max(0, rev.netBeforeTax - delivery.totalDeliveryAnnual) * BIZ.EFFECTIVE_TAX_RATE, positive: false },
                    { label: 'Ops Buffer (5% gross)', value: pl.opsBuffer, positive: false },
                  ].map((row, i) => {
                    const barWidth = rev.grossAnnual > 0 ? Math.min(100, (row.value / rev.grossAnnual) * 100) : 0;
                    return (
                      <div key={row.label} className="flex items-center gap-4">
                        <span className="w-44 text-sm text-white/60 text-right shrink-0">{row.label}</span>
                        <div className="flex-1 h-6 bg-white/5 rounded overflow-hidden relative">
                          <div
                            className={`h-full rounded transition-all duration-500 ${row.positive ? 'bg-gold/60' : 'bg-red-500/40'}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className={`w-24 text-sm tabular-nums text-right ${row.positive ? 'text-gold' : 'text-red-400'}`}>
                          {row.positive ? '+' : '-'}{fmt$(row.value)}
                        </span>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-4 border-t border-white/10 pt-3">
                    <span className="w-44 text-sm font-bold text-white text-right shrink-0">= Net to Constellation</span>
                    <div className="flex-1 h-6 bg-white/5 rounded overflow-hidden relative">
                      <div
                        className={`h-full rounded transition-all duration-500 ${pl.netToConstellation >= 0 ? 'bg-gold' : 'bg-red-500'}`}
                        style={{ width: `${rev.grossAnnual > 0 ? Math.min(100, Math.abs(pl.netToConstellation) / rev.grossAnnual * 100) : 0}%` }}
                      />
                    </div>
                    <span className={`w-24 text-base font-bold tabular-nums text-right ${pl.netToConstellation >= 0 ? 'text-gold' : 'text-red-400'}`}>
                      {fmt$(pl.netToConstellation)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Governance readiness */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <p className="text-xs text-white/40 uppercase tracking-widest mb-4">Governance Shift Readiness</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    {
                      label: 'Break Even',
                      ok: rev.grossAnnual >= delivery.totalDeliveryAnnual,
                      detail: `Gross ${fmt$(rev.grossAnnual)} vs Delivery ${fmt$(delivery.totalDeliveryAnnual)}`,
                    },
                    {
                      label: 'Tithe Current',
                      ok: rev.grossAnnual > 0,
                      detail: `${fmt$(rev.titheMonthly)}/mo committed`,
                    },
                    {
                      label: 'Staff Funded',
                      ok: delivery.totalStaffAnnual > 0 && rev.grossAnnual >= delivery.totalStaffAnnual,
                      detail: `${hc.medical_delivery_lead + hc.clinicians + hc.concierge_delivery_leads + hc.concierge_pls} people on payroll`,
                    },
                    {
                      label: 'P2P Panel Active',
                      ok: auths.p2pReview >= 1,
                      detail: `${fmtN(auths.p2pReview)} reviews/yr`,
                    },
                    {
                      label: 'Principals at $900K',
                      ok: pl.netToConstellation >= BIZ.PRINCIPAL_NET_TARGET * BIZ.NUM_PRINCIPALS,
                      detail: `${fmt$(pl.netToConstellation / BIZ.NUM_PRINCIPALS)} each`,
                    },
                    {
                      label: 'Full Scale (584K)',
                      ok: lives >= BIZ.MAX_LIVES,
                      detail: `${pct(lives / BIZ.MAX_LIVES)} deployed`,
                    },
                  ].map((item) => (
                    <div key={item.label} className={`rounded-lg p-4 border ${item.ok ? 'border-gold/30 bg-gold/5' : 'border-white/10 bg-white/3'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${item.ok ? 'bg-gold' : 'bg-white/20'}`} />
                        <span className={`text-sm font-medium ${item.ok ? 'text-white' : 'text-white/50'}`}>{item.label}</span>
                      </div>
                      <p className="text-xs text-white/30 pl-4">{item.detail}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                  <span className="text-sm text-white/40">Overall readiness</span>
                  <span className={`text-base font-bold ${
                    [
                      rev.grossAnnual >= delivery.totalDeliveryAnnual,
                      rev.grossAnnual > 0,
                      delivery.totalStaffAnnual > 0 && rev.grossAnnual >= delivery.totalStaffAnnual,
                      auths.p2pReview >= 1,
                      pl.netToConstellation >= BIZ.PRINCIPAL_NET_TARGET * BIZ.NUM_PRINCIPALS,
                      lives >= BIZ.MAX_LIVES,
                    ].filter(Boolean).length === 6 ? 'text-gold' : 'text-white/50'
                  }`}>
                    {[
                      rev.grossAnnual >= delivery.totalDeliveryAnnual,
                      rev.grossAnnual > 0,
                      delivery.totalStaffAnnual > 0 && rev.grossAnnual >= delivery.totalStaffAnnual,
                      auths.p2pReview >= 1,
                      pl.netToConstellation >= BIZ.PRINCIPAL_NET_TARGET * BIZ.NUM_PRINCIPALS,
                      lives >= BIZ.MAX_LIVES,
                    ].filter(Boolean).length} / 6 milestones green
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
