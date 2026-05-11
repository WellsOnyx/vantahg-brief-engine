/**
 * Lightweight usage + cost aggregation for the admin dashboard.
 *
 * Data sources (all already populated by the existing pipeline):
 *   - audit_log entries with action='brief_generation_completed' carry the
 *     per-call token counts in details.input_tokens / output_tokens /
 *     cache_read_tokens (written by lib/generate-brief.ts).
 *   - intake_log has one row per inbound case attempt, with channel.
 *   - cases has status, turnaround_deadline, determination_at.
 *
 * No new tables, no new instrumentation. If the audit-log details payload
 * shape changes, only the SUM_TOKEN_SQL fragment below needs updating.
 */

import { getServiceClient } from './supabase';
import { isDemoMode } from './demo-mode';
import { demoCases } from './demo-data';

// ── Pricing (Claude Opus 4.6 — keep in sync with shared/models.md) ────────
// USD per 1M tokens. Cache reads are ~0.1x input price.
const PRICE_PER_M_INPUT_USD = 5;
const PRICE_PER_M_OUTPUT_USD = 25;
const PRICE_PER_M_CACHE_READ_USD = 0.5;

const TERMINAL_STATUSES = new Set(['delivered']);

export interface UsageMetricsPeriod {
  start: string;
  end: string;
  label: string;
}

export interface BriefUsage {
  generated_count: number;
  failed_count: number;
}

export interface TokenUsage {
  input: number;
  output: number;
  cache_read: number;
  estimated_cost_usd: number;
}

export interface IntakeUsage {
  total: number;
  by_channel: Array<{ channel: string; count: number }>;
}

export interface CaseUsage {
  active_count: number;
  by_status: Array<{ status: string; count: number }>;
  sla: {
    total_with_deadline: number;
    on_time: number;
    breached: number;
    compliance_pct: number;
  };
}

export interface UsageMetrics {
  period: UsageMetricsPeriod;
  briefs: BriefUsage;
  tokens: TokenUsage;
  intake: IntakeUsage;
  cases: CaseUsage;
  generated_at: string;
  source: 'live' | 'demo';
}

/**
 * Compute the [start, end) bounds for "this calendar month, UTC".
 */
export function monthToDateRange(now: Date = new Date()): UsageMetricsPeriod {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    start: start.toISOString(),
    end: now.toISOString(),
    label: start.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  };
}

export function estimateCostUsd(tokens: { input: number; output: number; cache_read: number }): number {
  const cost =
    (tokens.input / 1_000_000) * PRICE_PER_M_INPUT_USD +
    (tokens.output / 1_000_000) * PRICE_PER_M_OUTPUT_USD +
    (tokens.cache_read / 1_000_000) * PRICE_PER_M_CACHE_READ_USD;
  return Math.round(cost * 100) / 100;
}

export async function getUsageMetrics(): Promise<UsageMetrics> {
  const period = monthToDateRange();
  const generatedAt = new Date().toISOString();

  if (isDemoMode()) {
    return demoUsageMetrics(period, generatedAt);
  }

  const supabase = getServiceClient();

  // ── Briefs + token counts (audit_log) ────────────────────────────────
  // brief_generation_completed details: { attempt, model, input_tokens,
  // output_tokens, cache_read_tokens } per lib/generate-brief.ts.
  const { data: briefRows } = await supabase
    .from('audit_log')
    .select('action, details')
    .in('action', ['brief_generation_completed', 'brief_generation_failed'])
    .gte('created_at', period.start)
    .lte('created_at', period.end);

  let generated = 0;
  let failed = 0;
  const tokens = { input: 0, output: 0, cache_read: 0 };

  for (const row of briefRows ?? []) {
    if (row.action === 'brief_generation_completed') {
      generated += 1;
      const d = (row.details as Record<string, unknown>) ?? {};
      tokens.input += numberField(d.input_tokens);
      tokens.output += numberField(d.output_tokens);
      tokens.cache_read += numberField(d.cache_read_tokens);
    } else {
      failed += 1;
    }
  }

  // ── Intake volume by channel (intake_log) ────────────────────────────
  const { data: intakeRows } = await supabase
    .from('intake_log')
    .select('channel')
    .gte('created_at', period.start)
    .lte('created_at', period.end);

  const intakeCounts = new Map<string, number>();
  for (const row of intakeRows ?? []) {
    intakeCounts.set(row.channel, (intakeCounts.get(row.channel) ?? 0) + 1);
  }
  const intakeByChannel = Array.from(intakeCounts.entries())
    .map(([channel, count]) => ({ channel, count }))
    .sort((a, b) => b.count - a.count);
  const intakeTotal = Array.from(intakeCounts.values()).reduce((a, b) => a + b, 0);

  // ── Active cases + SLA compliance (cases) ───────────────────────────
  // Pull only the fields we need — case rows can be wide.
  const { data: caseRows } = await supabase
    .from('cases')
    .select('status, turnaround_deadline, determination_at, created_at');

  const statusCounts = new Map<string, number>();
  let activeCount = 0;
  const sla = { total_with_deadline: 0, on_time: 0, breached: 0 };
  const nowMs = Date.now();

  for (const row of caseRows ?? []) {
    const status = String(row.status ?? 'unknown');
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    if (!TERMINAL_STATUSES.has(status)) activeCount += 1;

    if (row.turnaround_deadline) {
      sla.total_with_deadline += 1;
      const deadlineMs = new Date(row.turnaround_deadline).getTime();
      const decidedMs = row.determination_at ? new Date(row.determination_at).getTime() : null;
      const breached =
        decidedMs !== null ? decidedMs > deadlineMs : nowMs > deadlineMs;
      if (breached) sla.breached += 1;
      else sla.on_time += 1;
    }
  }

  const compliance_pct =
    sla.total_with_deadline > 0
      ? Math.round((sla.on_time / sla.total_with_deadline) * 1000) / 10
      : 100;

  return {
    period,
    briefs: { generated_count: generated, failed_count: failed },
    tokens: { ...tokens, estimated_cost_usd: estimateCostUsd(tokens) },
    intake: {
      total: intakeTotal,
      by_channel: intakeByChannel,
    },
    cases: {
      active_count: activeCount,
      by_status: Array.from(statusCounts.entries())
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
      sla: { ...sla, compliance_pct },
    },
    generated_at: generatedAt,
    source: 'live',
  };
}

function numberField(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

// ── Demo mode ─────────────────────────────────────────────────────────────

function demoUsageMetrics(period: UsageMetricsPeriod, generatedAt: string): UsageMetrics {
  // Synthesize plausible numbers from the static demo case fixtures.
  const briefsGenerated = demoCases.filter((c) => c.ai_brief !== null).length;
  const briefsFailed = 0;
  // Rough per-brief token estimate based on real measurements from the
  // tool-use path with the AIBrief schema (~3500 input, ~1500 output).
  const tokens = {
    input: briefsGenerated * 3500,
    output: briefsGenerated * 1500,
    cache_read: 0,
  };

  const intakeByChannel = demoCases.reduce<Record<string, number>>((acc, c) => {
    const channel = c.intake_channel ?? 'portal';
    acc[channel] = (acc[channel] ?? 0) + 1;
    return acc;
  }, {});

  const statusCounts = demoCases.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  const casesWithDeadline = demoCases.filter((c) => c.turnaround_deadline);
  const nowMs = Date.now();
  let on_time = 0;
  let breached = 0;
  for (const c of casesWithDeadline) {
    const deadlineMs = new Date(c.turnaround_deadline!).getTime();
    const decidedMs = c.determination_at ? new Date(c.determination_at).getTime() : null;
    const isBreached = decidedMs !== null ? decidedMs > deadlineMs : nowMs > deadlineMs;
    if (isBreached) breached += 1;
    else on_time += 1;
  }
  const compliance_pct =
    casesWithDeadline.length > 0
      ? Math.round((on_time / casesWithDeadline.length) * 1000) / 10
      : 100;

  return {
    period,
    briefs: { generated_count: briefsGenerated, failed_count: briefsFailed },
    tokens: { ...tokens, estimated_cost_usd: estimateCostUsd(tokens) },
    intake: {
      total: Object.values(intakeByChannel).reduce((a, b) => a + b, 0),
      by_channel: Object.entries(intakeByChannel)
        .map(([channel, count]) => ({ channel, count }))
        .sort((a, b) => b.count - a.count),
    },
    cases: {
      active_count: demoCases.filter((c) => !TERMINAL_STATUSES.has(c.status)).length,
      by_status: Object.entries(statusCounts)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
      sla: { total_with_deadline: casesWithDeadline.length, on_time, breached, compliance_pct },
    },
    generated_at: generatedAt,
    source: 'demo',
  };
}
