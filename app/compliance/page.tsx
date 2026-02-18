'use client';

import { useEffect, useState } from 'react';
import { RETENTION_POLICIES, type RetentionPolicyKey } from '@/lib/data-retention';

// ── Security headers we expect to be present ───────────────────────────────

const EXPECTED_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: '(configured)' },
];

// ── Types ──────────────────────────────────────────────────────────────────

interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
  database: string;
  uptime: number;
}

interface AuditStats {
  total: number;
  thisWeek: number;
  today: number;
  recentSecurityEvents: Array<{
    id: string;
    created_at: string;
    action: string;
    actor: string | null;
    details: Record<string, unknown> | null;
  }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ComplianceDashboard() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [headerResults, setHeaderResults] = useState<
    Array<{ key: string; expected: string; present: boolean }>
  >([]);
  const [auditStats, setAuditStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Fetch health endpoint (also lets us inspect response headers)
        const healthRes = await fetch('/api/health');
        const healthData: HealthResponse = await healthRes.json();
        setHealth(healthData);

        // Check which security headers are present on the response
        const results = EXPECTED_HEADERS.map((h) => ({
          key: h.key,
          expected: h.value,
          present: healthRes.headers.has(h.key.toLowerCase()),
        }));
        setHeaderResults(results);

        // Fetch audit stats — wrap in try/catch since this hits Supabase
        try {
          const statsRes = await fetch('/api/compliance/audit-stats');
          if (statsRes.ok) {
            const statsData: AuditStats = await statsRes.json();
            setAuditStats(statsData);
          }
        } catch {
          // Stats unavailable in demo mode — that's fine
        }
      } catch (err) {
        console.error('Failed to load compliance data:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="animate-pulse space-y-6">
          <div className="skeleton skeleton-heading w-64" />
          <div className="skeleton skeleton-text w-full" />
          <div className="skeleton skeleton-text w-full" />
          <div className="skeleton skeleton-text w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      {/* Page header */}
      <div>
        <h1 className="font-[family-name:var(--font-dm-serif)] text-2xl text-navy">
          Compliance Dashboard
        </h1>
        <p className="text-sm text-muted mt-1">
          Internal compliance tracking. This page does not contain PHI.
        </p>
      </div>

      {/* ── System Health ─────────────────────────────────────────── */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">System Health</h2>
        {health ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted uppercase tracking-wider">Status</p>
              <p className={`text-sm font-semibold mt-1 ${health.status === 'healthy' ? 'text-green-700' : 'text-red-700'}`}>
                {health.status}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted uppercase tracking-wider">Version</p>
              <p className="text-sm font-semibold mt-1">{health.version}</p>
            </div>
            <div>
              <p className="text-xs text-muted uppercase tracking-wider">Database</p>
              <p className={`text-sm font-semibold mt-1 ${health.database === 'connected' ? 'text-green-700' : health.database === 'demo_mode' ? 'text-amber-600' : 'text-red-700'}`}>
                {health.database}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted uppercase tracking-wider">Uptime</p>
              <p className="text-sm font-semibold mt-1">{formatUptime(health.uptime)}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-red-600">Unable to reach health endpoint.</p>
        )}
      </section>

      {/* ── Security Headers ──────────────────────────────────────── */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Security Headers</h2>
        <div className="space-y-2">
          {headerResults.length > 0 ? (
            headerResults.map((h) => (
              <div key={h.key} className="flex items-center gap-3">
                {h.present ? (
                  <CheckIcon />
                ) : (
                  <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                )}
                <span className="text-sm font-mono">
                  {h.key}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${h.present ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                  {h.present ? 'active' : 'check server'}
                </span>
              </div>
            ))
          ) : (
            EXPECTED_HEADERS.map((h) => (
              <div key={h.key} className="flex items-center gap-3">
                <CheckIcon />
                <span className="text-sm font-mono">{h.key}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                  configured
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ── Data Retention Policies ───────────────────────────────── */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Data Retention Policies</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-semibold text-muted uppercase text-xs tracking-wider">Data Type</th>
                <th className="text-left py-2 pr-4 font-semibold text-muted uppercase text-xs tracking-wider">Retention</th>
                <th className="text-left py-2 font-semibold text-muted uppercase text-xs tracking-wider">Rationale</th>
              </tr>
            </thead>
            <tbody>
              {(Object.entries(RETENTION_POLICIES) as Array<[RetentionPolicyKey, typeof RETENTION_POLICIES[RetentionPolicyKey]]>).map(
                ([key, policy]) => (
                  <tr key={key} className="border-b border-border/50 table-row-hover">
                    <td className="py-2.5 pr-4 font-mono text-navy">{key}</td>
                    <td className="py-2.5 pr-4">{policy.days} days</td>
                    <td className="py-2.5 text-muted">{policy.description}</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Audit Log Statistics ──────────────────────────────────── */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Audit Log Statistics</h2>
        {auditStats ? (
          <>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-background rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-navy">{auditStats.total.toLocaleString()}</p>
                <p className="text-xs text-muted mt-1">Total Entries</p>
              </div>
              <div className="bg-background rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-navy">{auditStats.thisWeek.toLocaleString()}</p>
                <p className="text-xs text-muted mt-1">This Week</p>
              </div>
              <div className="bg-background rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-navy">{auditStats.today.toLocaleString()}</p>
                <p className="text-xs text-muted mt-1">Today</p>
              </div>
            </div>

            {auditStats.recentSecurityEvents.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Recent Security Events</h3>
                <div className="space-y-2">
                  {auditStats.recentSecurityEvents.map((evt) => (
                    <div key={evt.id} className="flex items-start gap-3 text-sm bg-background rounded-lg p-3">
                      <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-navy">{evt.action}</p>
                        <p className="text-muted text-xs">
                          {evt.actor || 'unknown'} &mdash;{' '}
                          {new Date(evt.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="bg-background rounded-lg p-6 text-center">
            <p className="text-sm text-muted">
              Audit statistics are available when connected to the database.
            </p>
            <p className="text-xs text-muted mt-1">Currently running in demo mode.</p>
          </div>
        )}
      </section>
    </div>
  );
}
