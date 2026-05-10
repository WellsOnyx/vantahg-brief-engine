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

export default function GravityRailsAdminPage() {
  const [cfg, setCfg] = useState<ConfigBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    fetch('/api/firstmover/agent/config')
      .then((r) => r.json())
      .then((data) => setCfg(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

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
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="text-sm text-slate-500">Loading config&hellip;</div>;
  if (error) return <div className="text-sm text-red-700">{error}</div>;
  if (!cfg) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl">Gravity Rails — overflow agent</h1>
        <p className="text-sm text-slate-600 mt-1">
          When all human concierges are busy (or after-hours), the AI agent takes intake. Paste the
          prompt and tool definitions below into your Gravity Rails workflow. The agent calls our
          endpoints; we enforce the same gates a human concierge runs.
        </p>
      </div>

      <Section title="Status">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <Stat
            label="Overflow mode"
            value={cfg.overflow.mode}
            sub={cfg.overflow.reason}
            tone={cfg.overflow.active ? 'amber' : 'slate'}
          />
          <Stat
            label="Gravity Rails configured"
            value={cfg.gravity_rails.configured ? 'Yes' : 'No'}
            sub={cfg.gravity_rails.workspace_id ? `workspace: ${cfg.gravity_rails.workspace_id}` : 'Set GRAVITY_RAIL_API_KEY + GRAVITY_RAIL_WORKSPACE_ID'}
            tone={cfg.gravity_rails.configured ? 'emerald' : 'amber'}
          />
          <Stat
            label="API key for tools"
            value={cfg.api_key_set ? 'Set' : 'Not set'}
            sub={cfg.api_key_set ? '' : 'Set VANTAHG_API_KEY in env to authorize agent calls'}
            tone={cfg.api_key_set ? 'emerald' : 'amber'}
          />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggle(true)}
            disabled={busy || cfg.overflow.mode !== 'manual'}
            className="text-xs bg-amber-500 disabled:bg-slate-300 text-white rounded px-3 py-1.5 hover:bg-amber-600"
            title={cfg.overflow.mode === 'manual' ? '' : 'Manual toggle only available when FIRSTMOVER_AGENT_OVERFLOW is unset.'}
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

      <Section title={`System prompt — ${cfg.prompt_version}`}>
        <CopyBox text={cfg.system_prompt} />
        <p className="text-xs text-slate-500 mt-2">
          Paste into your Gravity Rails workflow agent prompt field. Update version when you change the prompt semantically.
        </p>
      </Section>

      <Section title="Tool specs (Anthropic format)">
        <CopyBox text={JSON.stringify(cfg.tools, null, 2)} />
        <p className="text-xs text-slate-500 mt-2">
          Three tools: <code>check_eligibility</code>, <code>submit_intake</code>, <code>escalate_to_human</code>.
        </p>
      </Section>

      <Section title="Endpoint wiring">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left py-1">Tool</th>
              <th className="text-left py-1">Method</th>
              <th className="text-left py-1">Path</th>
            </tr>
          </thead>
          <tbody>
            {cfg.endpoints.map((e) => (
              <tr key={e.tool} className="border-t border-slate-100">
                <td className="py-2 font-mono text-xs">{e.tool}</td>
                <td className="py-2">{e.method}</td>
                <td className="py-2 font-mono text-xs">{e.path}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-slate-500 mt-2">
          Bind each tool's HTTP call with header <code>Authorization: Bearer {'${VANTAHG_API_KEY}'}</code>.
        </p>
      </Section>

      <Section title="Setup notes">
        <ul className="text-sm text-slate-700 space-y-1">
          {cfg.notes.map((n) => <li key={n}>• {n}</li>)}
        </ul>
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

function CopyBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="bg-slate-50 border border-slate-200 rounded p-3 text-xs font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">{text}</pre>
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
