// ---------------------------------------------------------------------------
// Shareable scenario links.
//
// The whole studio runs client-side, so a scenario is fully described by the
// company profile + levers + horizon. We serialize that into the URL hash so a
// configured scenario can be copied and sent — "here's the plan, open the
// link" — and rebuilt exactly on the other end. No backend, no persistence.
// ---------------------------------------------------------------------------

import {
  ADD_ONS,
  AddOnKey,
  CompanyProfile,
  Horizon,
  HORIZONS,
  Levers,
} from "./model";

export type StudioState = {
  company: CompanyProfile;
  levers: Levers;
  horizon: Horizon;
};

/** URL-safe base64 that round-trips UTF-8 (company names may be non-ASCII). */
function toBase64Url(json: string): string {
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(escape(atob(b64)));
}

export function encodeState(state: StudioState): string {
  return toBase64Url(JSON.stringify(state));
}

// --- Defensive decoding ------------------------------------------------------
// A hash can be edited, truncated, or stale. Every field is validated and
// coerced so a malformed link degrades to `null` instead of crashing the app.

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function unit(v: unknown): number {
  return clamp(num(v, 0), 0, 1);
}

function decodeCompany(raw: unknown): CompanyProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  return {
    name: typeof c.name === "string" ? c.name.slice(0, 80) : "Sample Employer",
    employees: clamp(Math.round(num(c.employees, 0)), 1_000, 2_000_000),
    avgSalary: clamp(Math.round(num(c.avgSalary, 0)), 20_000, 250_000),
    spendPerEmployee: clamp(Math.round(num(c.spendPerEmployee, 0)), 1_000, 40_000),
    participation: unit(c.participation),
  };
}

function decodeAddOns(raw: unknown): Record<AddOnKey, boolean> {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  return ADD_ONS.reduce(
    (acc, a) => {
      acc[a.key] = src[a.key] === true;
      return acc;
    },
    {} as Record<AddOnKey, boolean>,
  );
}

function decodeLevers(raw: unknown): Levers | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Record<string, unknown>;
  return {
    participation: unit(l.participation),
    architecture: unit(l.architecture),
    planMix: unit(l.planMix),
    reinvestment: unit(l.reinvestment),
    addOns: decodeAddOns(l.addOns),
  };
}

export function decodeState(encoded: string): StudioState | null {
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as Record<string, unknown>;
    const company = decodeCompany(parsed.company);
    const levers = decodeLevers(parsed.levers);
    if (!company || !levers) return null;
    const horizon = HORIZONS.includes(parsed.horizon as Horizon)
      ? (parsed.horizon as Horizon)
      : 1;
    return { company, levers, horizon };
  } catch {
    return null;
  }
}

/** Read a shared scenario out of the current URL hash, if any. */
export function readStateFromHash(): StudioState | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#s=/, "");
  if (!hash || hash === window.location.hash) return null;
  return decodeState(hash);
}

/** Build the absolute shareable URL for a scenario. */
export function buildShareUrl(state: StudioState): string {
  if (typeof window === "undefined") return "";
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#s=${encodeState(state)}`;
}
