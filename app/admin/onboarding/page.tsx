'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  COLE_DAY_SCRIPT,
  E1_SYNTHETIC_COMMAND,
  E2_SHADOW_COMMAND,
  HARD_CONSTRAINTS,
  ONBOARDING_RUNBOOK_PATH,
  PACKAGING_LOCK,
  PUBLISH_SYNTHETIC_CONFIG_COMMAND,
  RELATED_SURFACES,
  SYNTHETIC_CLIENT_CONFIG_FIXTURE,
} from '@/lib/onboarding/runbook';

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
  how_to?: string[];
  href?: string;
  command?: string;
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

function gatePill(gate: string) {
  if (gate === 'hard') return 'bg-red-50 text-red-800 border-red-200';
  if (gate === 'required') return 'bg-navy/5 text-navy border-border';
  if (gate === 'client_dependent') return 'bg-amber-50 text-amber-900 border-amber-200';
  return 'bg-gray-50 text-gray-700 border-gray-200';
}

export default function AdminOnboardingPage() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [phases, setPhases] = useState<Record<string, PhaseMeta>>({});
  const [golive, setGolive] = useState<GoLiveStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [configVersion, setConfigVersion] = useState<number | null>(null);

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
    setNotice(null);
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

  async function publishFixture() {
    setBusy('config');
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/client-config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(SYNTHETIC_CLIENT_CONFIG_FIXTURE),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'Could not publish synthetic client_config.');
        return;
      }
      setConfigVersion(body.version?.version ?? body.version ?? null);
      setNotice(
        `Published synthetic client_config v${body.version?.version ?? body.version ?? '?'} for ${SYNTHETIC_CLIENT_CONFIG_FIXTURE.client_id}. Append-only — PATCH is 409.`,
      );
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
          <p className="text-xs uppercase tracking-wide text-muted font-semibold">Phase 7.1 · Customer-ready</p>
          <h1 className="text-3xl md:text-4xl font-bold text-navy mt-1">Onboarding runbook A→E</h1>
          <p className="text-sm text-muted mt-2 max-w-3xl">
            Cole can run commercial/legal → client_config → access → connectivity → go-live
            gates without tribal knowledge. Every item has how-to steps. Synthetic only.
            Code gates — not a HIPAA attestation.
          </p>
          <p className="text-xs text-muted mt-1">
            {items.length === 0
              ? 'Loading checklist…'
              : `${requiredLeft} required items remaining`}{' '}
            · runbook <code className="text-[11px]">{ONBOARDING_RUNBOOK_PATH}</code>
          </p>
        </header>

        <section className="rounded-xl border border-gold/40 bg-gold/5 p-5 text-navy">
          <p className="text-xs uppercase tracking-wide font-semibold text-muted">Packaging lock</p>
          <p className="text-sm mt-1">
            Paid door = <strong>{PACKAGING_LOCK.paid_door}</strong>. {PACKAGING_LOCK.brief_engine}.
            Not a standalone free UM SKU. Not free with another shop’s med review.{' '}
            <span className="text-muted">{PACKAGING_LOCK.pointer}</span>
          </p>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold text-navy">Hard constraints</h2>
          <ol className="mt-2 space-y-1.5 text-sm text-navy/80 list-decimal list-inside">
            {HARD_CONSTRAINTS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </section>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">{error}</div>
        )}
        {notice && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm px-4 py-3">{notice}</div>
        )}

        {golive?.hypercare?.breached && (
          <section className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
            <p className="font-semibold">Rollback — stay on shadow</p>
            <p className="text-sm mt-1">{golive.hypercare.note}</p>
          </section>
        )}

        <section className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <header className="px-5 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-navy">Day script</h2>
            <p className="text-sm text-muted">Same cadence as 02-onboarding.md. Expand a day for the exact steps.</p>
          </header>
          <ul className="divide-y divide-border">
            {COLE_DAY_SCRIPT.map((day) => (
              <li key={day.id}>
                <details className="group">
                  <summary className="cursor-pointer px-5 py-3 hover:bg-background list-none flex items-baseline gap-3">
                    <span className="text-xs uppercase tracking-wide text-muted font-semibold w-20 shrink-0">{day.when}</span>
                    <span className="font-semibold text-navy">{day.title}</span>
                    <span className="ml-auto text-[11px] text-muted">Phases {day.phases.join(' · ')}</span>
                  </summary>
                  <ol className="px-5 pb-4 pl-9 text-sm text-navy/80 space-y-1.5 list-decimal">
                    {day.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </details>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid md:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => void publishFixture()}
            disabled={!!busy}
            className="rounded-xl border border-border bg-surface px-4 py-3 text-left hover:border-gold disabled:opacity-50"
          >
            <p className="text-xs uppercase tracking-wide text-muted">Phase B</p>
            <p className="font-semibold text-navy">Publish synthetic client_config</p>
            <p className="text-xs text-muted mt-1">
              {configVersion
                ? `Last published v${configVersion} · append-only`
                : 'Fixture tenant 11111111-… · always_md · go_live_mode=synthetic'}
            </p>
          </button>
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

        <section className="rounded-xl border border-border bg-surface p-5 space-y-3">
          <h2 className="text-lg font-semibold text-navy">Copy-paste commands</h2>
          <p className="text-xs text-muted">Local demo. No secrets. Do not point these at production with live PHI.</p>
          <pre className="text-[11px] bg-background border border-border rounded-md p-3 overflow-x-auto whitespace-pre-wrap">{PUBLISH_SYNTHETIC_CONFIG_COMMAND}</pre>
          <pre className="text-[11px] bg-background border border-border rounded-md p-3 overflow-x-auto whitespace-pre-wrap">{E1_SYNTHETIC_COMMAND}</pre>
          <pre className="text-[11px] bg-background border border-border rounded-md p-3 overflow-x-auto whitespace-pre-wrap">{E2_SHADOW_COMMAND}</pre>
        </section>

        {PHASES.map((phase) => {
          const meta = phases[phase];
          const rows = items.filter((i) => i.phase === phase);
          const remaining = rows.filter((i) => i.required && !i.done).length;
          return (
            <section key={phase} className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
              <header className="px-5 py-4 border-b border-border">
                <p className="text-xs uppercase tracking-wide text-muted">
                  Phase {phase} · {meta?.days} · {remaining} required left
                </p>
                <h2 className="text-lg font-semibold text-navy">{meta?.title ?? phase}</h2>
                <p className="text-sm text-muted">{meta?.blurb}</p>
              </header>
              <ul className="divide-y divide-border">
                {rows.map((item) => (
                  <li key={item.id} className="px-5 py-3">
                    <div className="flex gap-3 items-start">
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
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold ${item.done ? 'text-muted line-through' : 'text-navy'}`}>
                          {item.id} · {item.title}
                        </p>
                        <p className="text-xs text-muted mt-0.5">
                          {item.owner} · {item.artifact}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${gatePill(item.gate)}`}>
                            {item.gate}
                          </span>
                          {item.required ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-navy/5 text-navy border-border">
                              required
                            </span>
                          ) : null}
                        </div>
                        <details className="mt-2" open={!item.done}>
                          <summary className="cursor-pointer text-xs font-semibold text-navy/70 hover:text-navy">
                            How to run this
                          </summary>
                          <ol className="mt-1.5 text-sm text-navy/80 space-y-1 list-decimal list-inside">
                            {(item.how_to ?? []).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                          {item.command ? (
                            <pre className="mt-2 text-[11px] bg-background border border-border rounded-md p-2 overflow-x-auto whitespace-pre-wrap">
                              {item.command}
                            </pre>
                          ) : null}
                          <p className="text-[11px] text-muted mt-1">{item.pointer}</p>
                          {item.href ? (
                            <p className="text-xs mt-1">
                              <Link href={item.href} className="underline text-navy">
                                Open {item.href}
                              </Link>
                            </p>
                          ) : null}
                        </details>
                      </div>
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
            Related:{' '}
            {RELATED_SURFACES.map((s, idx) => (
              <span key={s.href}>
                {idx > 0 ? ' · ' : null}
                <Link href={s.href} className="underline">
                  {s.label}
                </Link>
              </span>
            ))}
          </p>
        </section>
      </div>
    </div>
  );
}
