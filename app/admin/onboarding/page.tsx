'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface ChecklistItem {
  id: string;
  phase: 'A' | 'B' | 'C' | 'D' | 'E';
  title: string;
  owner: string;
  artifact: string;
  gate: string;
  pointer: string;
  required: boolean;
  done: boolean;
}

interface PhaseMeta {
  title: string;
  blurb: string;
  days: string;
}

interface GoLiveStatus {
  go_live_mode: string;
  shadow_mode: boolean;
  threshold: number;
  log: Array<{ entry_id: string; at: string; kind: string; message: string }>;
  last_synthetic: { passed: boolean; count: number; signed: number } | null;
  last_shadow: { passed: boolean; count: number; signed: number; member_provider_final_sends: number } | null;
  hypercare: {
    miss_rate: number;
    threshold: number;
    breached: boolean;
    action: string;
    note: string;
    sample_size: number;
  } | null;
}

const PHASES: Array<'A' | 'B' | 'C' | 'D' | 'E'> = ['A', 'B', 'C', 'D', 'E'];

export default function AdminOnboardingPage() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [phases, setPhases] = useState<Record<string, PhaseMeta>>({});
  const [golive, setGolive] = useState<GoLiveStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch('/api/admin/onboarding', { cache: 'no-store' });
    if (!res.ok) {
      setError(res.status === 403 || res.status === 401 ? 'CX or admin role required.' : `Load failed (${res.status})`);
      return;
    }
    const body = await res.json();
    setItems(body.progress.items);
    setPhases(body.phases);
    setGolive(body.golive);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(item: ChecklistItem) {
    setBusy(item.id);
    try {
      const res = await fetch('/api/admin/onboarding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ item_id: item.id, done: !item.done }),
      });
      if (!res.ok) {
        setError('Could not update checklist item.');
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function runPack(kind: 'synthetic' | 'shadow') {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/api/golive/${kind}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const body = await res.json();
      if (!res.ok && res.status !== 422) {
        setError(body.error || `${kind} pack failed`);
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function evaluate() {
    setBusy('eval');
    try {
      await fetch('/api/golive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const requiredLeft = items.filter((i) => i.required && !i.done).length;

  return (
    <div className="py-10 md:py-16 bg-background min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <header>
          <p className="text-xs uppercase tracking-wide text-muted font-semibold">Phase 7 · Customer-ready</p>
          <h1 className="text-3xl md:text-4xl font-bold text-navy mt-1">Onboarding runbook A→E</h1>
          <p className="text-sm text-muted mt-2 max-w-3xl">
            Cole can run commercial/legal → client_config → access → connectivity → go-live
            gates without tribal knowledge. Synthetic only. Code gates — not a HIPAA attestation.
            Runbook: <code className="text-xs">docs/onboarding/README.md</code>.
          </p>
          <p className="text-xs text-muted mt-1">{requiredLeft} required items remaining</p>
        </header>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">{error}</div>
        )}

        {golive?.hypercare?.breached && (
          <section className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
            <p className="font-semibold">Rollback — stay on shadow</p>
            <p className="text-sm mt-1">{golive.hypercare.note}</p>
          </section>
        )}

        <section className="grid md:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => void runPack('synthetic')}
            disabled={!!busy}
            className="rounded-xl border border-border bg-surface px-4 py-3 text-left hover:border-gold disabled:opacity-50"
          >
            <p className="text-xs uppercase tracking-wide text-muted">E1</p>
            <p className="font-semibold text-navy">Run synthetic pack</p>
            <p className="text-xs text-muted mt-1">
              {golive?.last_synthetic
                ? `${golive.last_synthetic.passed ? 'Passed' : 'Failed'} · ${golive.last_synthetic.count} cases`
                : 'Happy path + missing clinicals + gray zone (≥10)'}
            </p>
          </button>
          <button
            type="button"
            onClick={() => void runPack('shadow')}
            disabled={!!busy}
            className="rounded-xl border border-border bg-surface px-4 py-3 text-left hover:border-gold disabled:opacity-50"
          >
            <p className="text-xs uppercase tracking-wide text-muted">E2</p>
            <p className="font-semibold text-navy">Run shadow pack</p>
            <p className="text-xs text-muted mt-1">
              {golive?.last_shadow
                ? `${golive.last_shadow.passed ? 'Passed' : 'Failed'} · ${golive.last_shadow.signed} signed · final sends ${golive.last_shadow.member_provider_final_sends}`
                : 'MD signs; no member/provider final outbound'}
            </p>
          </button>
          <button
            type="button"
            onClick={() => void evaluate()}
            disabled={!!busy}
            className="rounded-xl border border-border bg-surface px-4 py-3 text-left hover:border-gold disabled:opacity-50"
          >
            <p className="text-xs uppercase tracking-wide text-muted">E4</p>
            <p className="font-semibold text-navy">Evaluate first-25 SLA</p>
            <p className="text-xs text-muted mt-1">
              Threshold {golive?.threshold ?? 0.2} · mode {golive?.go_live_mode ?? 'synthetic'}
            </p>
          </button>
        </section>

        {PHASES.map((phase) => {
          const meta = phases[phase];
          const rows = items.filter((i) => i.phase === phase);
          return (
            <section key={phase} className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
              <header className="px-5 py-4 border-b border-border">
                <p className="text-xs uppercase tracking-wide text-muted">
                  Phase {phase} · {meta?.days}
                </p>
                <h2 className="text-lg font-semibold text-navy">{meta?.title ?? phase}</h2>
                <p className="text-sm text-muted">{meta?.blurb}</p>
              </header>
              <ul className="divide-y divide-border">
                {rows.map((item) => (
                  <li key={item.id} className="px-5 py-3 flex gap-3 items-start">
                    <button
                      type="button"
                      onClick={() => void toggle(item)}
                      disabled={busy === item.id}
                      className={`mt-0.5 w-5 h-5 rounded border shrink-0 ${
                        item.done ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-border bg-white'
                      }`}
                      aria-label={`Toggle ${item.id}`}
                    >
                      {item.done ? '✓' : ''}
                    </button>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${item.done ? 'text-muted line-through' : 'text-navy'}`}>
                        {item.id} · {item.title}
                      </p>
                      <p className="text-xs text-muted">
                        {item.owner} · {item.artifact} · {item.gate}
                        {item.required ? ' · required' : ''}
                      </p>
                      <p className="text-[11px] text-muted mt-0.5">{item.pointer}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <section className="bg-surface rounded-xl border border-border p-5">
          <h2 className="text-lg font-semibold text-navy">Go-live log</h2>
          <p className="text-xs text-muted mb-3">Non-PHI. Also written to memory SoR for this process.</p>
          {!golive?.log.length ? (
            <p className="text-sm text-muted">No entries yet. Run E1 / E2 / E4.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {golive.log.map((e) => (
                <li key={e.entry_id}>
                  <span className="font-mono text-[11px] text-muted">{e.kind}</span> {e.message}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted mt-4">
            Related: <Link href="/cx" className="underline">CX first-25 scorecard</Link> ·{' '}
            <Link href="/admin/setup" className="underline">Production setup</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
