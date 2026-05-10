/**
 * Overflow trigger logic for First Mover.
 *
 * "Overflow" = when the AI agent (Gravity Rails-driven) takes intake
 * because human concierges aren't available. Three triggers, layered:
 *
 *   1. Hard env flag (FIRSTMOVER_AGENT_OVERFLOW=always) — agent runs all intake.
 *      Useful for load testing and after-hours coverage demos.
 *
 *   2. Schedule-based — agent runs outside business hours (configurable
 *      via FIRSTMOVER_BUSINESS_HOURS_TZ + start/end). Default 9-5 ET, M-F.
 *
 *   3. Manual toggle — admin flips an in-process flag via the
 *      `/firstmover/admin/gravity-rails` page. Persisted to a setting
 *      table when wired (Wedge B); for v1 we use a process-local flag.
 *
 * Capacity-based overflow (queue depth > N → AI takes next) is
 * deliberately NOT implemented yet. We need usage data first.
 */

export type OverflowMode = 'off' | 'always' | 'after_hours' | 'manual';

interface OverflowDecision {
  active: boolean;
  reason: string;
  mode: OverflowMode;
}

let manualFlag: boolean | null = null; // process-local; null = unset

export function setManualOverflow(active: boolean | null): void {
  manualFlag = active;
}

export function getOverflowMode(): OverflowMode {
  const env = (process.env.FIRSTMOVER_AGENT_OVERFLOW || '').toLowerCase();
  if (env === 'always') return 'always';
  if (env === 'after_hours') return 'after_hours';
  if (env === 'off') return 'off';
  return 'manual';
}

export function isOverflowActive(now: Date = new Date()): OverflowDecision {
  const mode = getOverflowMode();

  if (mode === 'off') {
    return { active: false, reason: 'Overflow disabled (FIRSTMOVER_AGENT_OVERFLOW=off).', mode };
  }

  if (mode === 'always') {
    return { active: true, reason: 'Overflow always active (env override).', mode };
  }

  if (mode === 'after_hours') {
    const inHours = isWithinBusinessHours(now);
    return {
      active: !inHours,
      reason: inHours
        ? 'Within business hours — humans handle intake.'
        : 'Outside business hours — agent handles overflow.',
      mode,
    };
  }

  // manual
  if (manualFlag === true) {
    return { active: true, reason: 'Manual overflow toggle is ON.', mode };
  }
  return { active: false, reason: 'Manual overflow toggle is off.', mode };
}

/**
 * Default business hours: 9am–5pm Eastern, Monday–Friday.
 * Tunable via FIRSTMOVER_BUSINESS_HOURS_TZ (IANA tz, default America/New_York)
 * and FIRSTMOVER_BUSINESS_HOURS (e.g., "9-17").
 */
function isWithinBusinessHours(now: Date): boolean {
  const tz = process.env.FIRSTMOVER_BUSINESS_HOURS_TZ || 'America/New_York';
  const range = process.env.FIRSTMOVER_BUSINESS_HOURS || '9-17';
  const [startStr, endStr] = range.split('-');
  const start = parseInt(startStr, 10);
  const end = parseInt(endStr, 10);
  if (Number.isNaN(start) || Number.isNaN(end)) return true;

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    weekday: 'short',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const weekday = parts.find((p) => p.type === 'weekday')?.value || '';

  const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
  return isWeekday && hour >= start && hour < end;
}
