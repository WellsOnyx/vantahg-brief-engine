'use client';

import { useEffect, useState } from 'react';

interface ConfigBundle {
  version: string;
  system_prompt: string;
  tools: Array<{ name: string; description: string }>;
  endpoints: Array<{ tool: string; method: string; path: string }>;
  notes: string[];
  overflow: { mode: string; active: boolean; reason: string };
  gravity_rails: { configured: boolean; workspace_id: string | null };
  api_key_set: boolean;
  prompt_version: string;
}

interface ConnectionStatus {
  ready: boolean;
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
  webhook_url: string;
  instructions: string[];
}

export default function GravityRailsAdminPage() {
  const [cfg, setCfg] = useState<ConfigBundle | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function loadAll() {
    setLoading(true);
    Promise.all([
      fetch('/api/firstmover/agent/config').then((r) => r.json()),
      fetch('/api/firstmover/agent/test-connection').then((r) => r.json()),
    ])
      .then(([c, s]) => {
        setCfg(c);
        setStatus(s);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }

  useEffect(loadAll, []);

  async function runTest() {
    setTesting(true);
    try {
      const res = await fetch('/api/firstmover/agent/test-connection');
      const data = await res.json();
      setStatus(data);
    } finally {
      setTesting(false);
    }
  }

  async function toggle(active: boolean | null) {
    setBusy(true);
    try {
      const res = await fetch('/api/firstmover/agent/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual_overflow: active }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed');
      }
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="text-sm text-slate-500">Loading config&hellip;</div>;
  if (error) return <div className="text-sm text-red-700">{error}</div>;
  if (!cfg || !status) return null;

  const baseUrl = (typeof window !== 'undefined') ? window.location.origin : '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl">Gravity Rails — overflow agent</h1>
        <p className="text-sm text-slate-600 mt-1">
          When all human concierges are busy (or after-hours), the AI agent takes intake.
          Drop in your GR account credentials below and the system is wired end-to-end.
        </p>
      </div>

      {/* ── Setup checklist ──────────────────────────────────── */}
      <Section title="1. Setup checklist">
        <div className="space-y-2">
          {status.checks.map((c) => (
            <div key={c.name} className="flex items-start gap-2 text-sm">
              <span className={`mt-0.5 inline-flex w-4 h-4 rounded-full items-center justify-center text-[10px] ${c.ok ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-slate-600'}`}>
                {c.ok ? '✓' : '·'}
              </span>
              <div>
                <span className="font-mono text-xs">{c.name}</span>
                {c.detail && <div className="text-xs text-slate-500 mt-0.5">{c.detail}</div>}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={runTest}
            disabled={testing}
            className="text-sm bg-[#0c2340] disabled:bg-slate-300 text-white rounded px-4 py-1.5 hover:bg-[#173869]"
          >
            {testing ? 'Testing…' : 'Re-test connection'}
          </button>
          {status.ready ? (
            <span className="text-sm text-emerald-700 font-medium">All systems go.</span>
          ) : (
            <span className="text-sm text-amber-700">Some prerequisites missing — see above.</span>
          )}
        </div>
      </Section>

      {/* ── Webhook URL ─────────────────────────────────────── */}
      <Section title="2. Paste this webhook URL into your GR workflow">
        <CopyBox text={status.webhook_url} oneLine />
        <p className="text-xs text-slate-500 mt-2">
          GR posts to this URL when the agent finishes a conversation. We verify the HMAC
          signature using <code>GRAVITY_RAIL_WEBHOOK_SECRET</code>, run the captured intake
          through validation + eligibility, and create a case. The case shows up in the
          clinician queue with <code>intake_channel = ai_agent</code>.
        </p>
      </Section>

      {/* ── Workflow scaffold ─────────────────────────────────── */}
      <Section title="3. Import this workflow scaffold into Gravity Rails">
        <p className="text-sm text-slate-600 mb-3">
          One-click setup: download this JSON, import it as a workflow in your GR workspace.
          Prompt, tool definitions, channels, and webhook are all pre-bound.
        </p>
        <div className="flex items-center gap-2">
          <a
            href="/api/firstmover/agent/workflow-scaffold?download=1"
            className="text-sm bg-[#c9a227] text-[#0c2340] font-medium rounded px-4 py-1.5 hover:brightness-110"
          >
            Download workflow JSON
          </a>
          <a
            href="/api/firstmover/agent/workflow-scaffold"
            target="_blank"
            rel="noreferrer"
            className="text-sm border border-slate-300 rounded px-4 py-1.5 hover:bg-slate-50"
          >
            Preview JSON
          </a>
        </div>
      </Section>

      {/* ── Status ───────────────────────────────────────────── */}
      <Section title="Status">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <Stat
            label="Overflow mode"
            value={cfg.overflow.mode}
            sub={cfg.overflow.reason}
            tone={cfg.overflow.active ? 'amber' : 'slate'}
          />
          <Stat
            label="Prompt version"
            value={cfg.prompt_version}
            tone="slate"
          />
          <Stat
            label="Connection"
            value={status.ready ? 'Ready' : 'Setup needed'}
            tone={status.ready ? 'emerald' : 'amber'}
          />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggle(true)}
            disabled={busy || cfg.overflow.mode !== 'manual'}
            className="text-xs bg-amber-500 disabled:bg-slate-300 text-white rounded px-3 py-1.5 hover:bg-amber-600"
          >
            Enable overflow now
          </button>
          <button
            type="button"
            onClick={() => toggle(false)}
            disabled={busy || cfg.overflow.mode !== 'manual'}
            className="text-xs border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-50"
          >
            Disable
          </button>
          <button
            type="button"
            onClick={() => toggle(null)}
            disabled={busy || cfg.overflow.mode !== 'manual'}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            Reset
          </button>
        </div>
        {cfg.overflow.mode !== 'manual' && (
          <p className="text-xs text-slate-500 mt-2">
            Overflow controlled by env <code>FIRSTMOVER_AGENT_OVERFLOW</code> = <code>{cfg.overflow.mode}</code>.
            Unset it to use manual toggle.
          </p>
        )}
      </Section>

      {/* ── Reference: prompt + tools ───────────────────────────── */}
      <Section title="Reference — system prompt">
        <CopyBox text={cfg.system_prompt} />
      </Section>

      <Section title="Reference — tool specs">
        <CopyBox text={JSON.stringify(cfg.tools, null, 2)} />
      </Section>

      <Section title="Reference — endpoint URLs">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left py-1">Tool</th>
              <th className="text-left py-1">Method</th>
              <th className="text-left py-1">Full URL</th>
            </tr>
          </thead>
          <tbody>
            {cfg.endpoints.map((e) => (
              <tr key={e.tool} className="border-t border-slate-100">
                <td className="py-2 font-mono text-xs">{e.tool}</td>
                <td className="py-2">{e.method}</td>
                <td className="py-2 font-mono text-xs">{baseUrl}{e.path}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4">
      <h2 className="font-serif text-lg mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'emerald' | 'amber' | 'slate' }) {
  const colors = {
    emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    amber: 'text-amber-700 bg-amber-50 border-amber-200',
    slate: 'text-slate-700 bg-slate-50 border-slate-200',
  };
  return (
    <div className={`border rounded p-3 ${colors[tone]}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="font-medium mt-0.5">{value}</div>
      {sub && <div className="text-xs opacity-80 mt-1">{sub}</div>}
    </div>
  );
}

function CopyBox({ text, oneLine }: { text: string; oneLine?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className={`bg-slate-50 border border-slate-200 rounded p-3 text-xs font-mono ${oneLine ? 'whitespace-nowrap overflow-x-auto' : 'whitespace-pre-wrap max-h-96 overflow-y-auto'}`}>{text}</pre>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="absolute top-2 right-2 text-xs bg-white border border-slate-300 rounded px-2 py-1 hover:bg-slate-100"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
