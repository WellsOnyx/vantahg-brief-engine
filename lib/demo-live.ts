/**
 * Synthetic real-time operations stream for demo mode.
 *
 * Everything here is DETERMINISTIC GIVEN THE CLOCK: counts follow a diurnal
 * intake curve scaled to the platform target (333k supported lives ≈ 1,400
 * auths/day), and the event feed is generated from fixed template pools
 * keyed by time slot — so every poll advances the story, two viewers see
 * the same numbers, and nothing needs a database.
 *
 * CLIENT-SAFE BY CONSTRUCTION: this module must never import anything that
 * reaches lib/supabase (the pg dependency chain cannot enter a browser
 * bundle). Server-only demo derivations live in lib/demo-live-queue.ts.
 *
 * Demo-layer only. Real deployments never route through this module —
 * demo surfaces are gated upstream by isDemoMode() / the demo cookie.
 * All figures rendered from here are presented under the demo banner
 * ("synthetic data") and perf-style metrics carry
 * estimated_pending_calibration labels at the UI layer.
 */

// ---------------------------------------------------------------------------
// Scale model
// ---------------------------------------------------------------------------

export const LIVES_SUPPORTED = 333_000;
export const DAILY_AUTH_TARGET = 1_400;

/** Channel share of intake volume (sums to 1). */
const CHANNEL_SHARE = { efax: 0.45, portal: 0.25, phone: 0.18, email: 0.12 } as const;
export type LiveChannel = keyof typeof CHANNEL_SHARE;

/**
 * Diurnal curve: fraction of the day's volume that has arrived by hour h
 * (local clock). Intake concentrates 7a–7p with a lunch shoulder.
 */
function cumulativeFractionOfDay(now: Date): number {
  const h = now.getHours() + now.getMinutes() / 60;
  // Piecewise-linear cumulative curve. (hour, cumulative fraction)
  // Small overnight floor: faxes and portal submissions queue overnight,
  // so the board never reads zero — even at 00:05 the day has begun.
  const pts: Array<[number, number]> = [
    [0, 0.008], [6, 0.03], [8, 0.09], [10, 0.24], [12, 0.42],
    [14, 0.58], [16, 0.75], [18, 0.89], [20, 0.96], [24, 1],
  ];
  for (let i = 1; i < pts.length; i++) {
    const [h1, f1] = pts[i - 1];
    const [h2, f2] = pts[i];
    if (h <= h2) return f1 + ((h - h1) / (h2 - h1)) * (f2 - f1);
  }
  return 1;
}

/** Deterministic PRNG so time-slot content is stable across observers. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface VolumeSnapshot {
  lives_supported: number;
  daily_target: number;
  auths_today: number;
  by_channel: Record<LiveChannel, number>;
  pages_ocr_today: number;
  briefs_generated_today: number;
  fact_checks_passed_today: number;
  determinations_today: number;
  avg_brief_seconds: number;
  on_time_rate_pct: number;
  /** Current arrival rate, auths per hour — lets clients tick between polls. */
  arrivals_per_hour: number;
  in_flight: Array<{ stage: string; label: string; count: number }>;
}

export function volumeSnapshot(nowMs?: number): VolumeSnapshot {
  const now = new Date(nowMs ?? Date.now());
  const frac = cumulativeFractionOfDay(now);
  const authsToday = Math.floor(DAILY_AUTH_TARGET * frac);

  const by_channel = Object.fromEntries(
    (Object.keys(CHANNEL_SHARE) as LiveChannel[]).map((ch) => [
      ch,
      Math.floor(authsToday * CHANNEL_SHARE[ch]),
    ]),
  ) as Record<LiveChannel, number>;

  // Downstream counts trail intake slightly (work in flight).
  const briefs = Math.floor(authsToday * 0.93);
  const determinations = Math.floor(authsToday * 0.81);

  // Arrival rate now (derivative of the curve, per hour) — for client ticking.
  const fracPlus = cumulativeFractionOfDay(new Date(now.getTime() + 30 * 60_000));
  const arrivalsPerHour = Math.max(2, Math.round((fracPlus - frac) * 2 * DAILY_AUTH_TARGET));

  // Small deterministic oscillation so in-flight numbers breathe.
  const slot = Math.floor(now.getTime() / 45_000);
  const rnd = mulberry32(slot);
  const wob = (base: number, spread: number) => Math.max(0, Math.round(base + (rnd() - 0.5) * 2 * spread));

  return {
    lives_supported: LIVES_SUPPORTED,
    daily_target: DAILY_AUTH_TARGET,
    auths_today: authsToday,
    by_channel,
    pages_ocr_today: Math.floor(by_channel.efax * 7.4 + by_channel.email * 2.2),
    briefs_generated_today: briefs,
    fact_checks_passed_today: Math.floor(briefs * 0.97),
    determinations_today: determinations,
    avg_brief_seconds: wob(114, 9),
    on_time_rate_pct: 99 - Math.floor(rnd() * 2),
    arrivals_per_hour: arrivalsPerHour,
    in_flight: [
      { stage: 'intake', label: 'In intake / extraction', count: wob(38, 6) },
      { stage: 'dedup', label: 'Fingerprint dedup', count: wob(4, 2) },
      { stage: 'brief', label: 'Brief engine (multi-pass)', count: wob(21, 5) },
      { stage: 'concierge', label: 'Concierge validation gate', count: wob(17, 4) },
      { stage: 'lpn', label: 'LPN review', count: wob(46, 7) },
      { stage: 'rn', label: 'RN review / oversight', count: wob(29, 5) },
      { stage: 'md', label: 'MD determination', count: wob(18, 4) },
      { stage: 'delivery', label: 'Delivery + acknowledgment', count: wob(12, 3) },
    ],
  };
}

// ---------------------------------------------------------------------------
// Rolling event stream
// ---------------------------------------------------------------------------

export interface LiveEvent {
  id: string;
  channel: LiveChannel;
  headline: string;
  detail: string;
  at: string; // ISO
  case_number: string;
}

const EVENT_SLOT_MS = 22_000; // one platform event every ~22s at demo scale

const FIRST = ['R.', 'A.', 'M.', 'J.', 'T.', 'L.', 'S.', 'D.', 'K.', 'P.', 'H.', 'C.'];
const LAST = ['Garcia', 'Patel', 'Wong', 'Kim', 'Alvarez', 'Nguyen', 'Broussard', 'Okafor', 'Whitfield', 'Castellanos', 'Moreau', 'Silva'];
const PROCS = [
  'MRI lumbar spine (CPT 72148)',
  'Total knee arthroplasty (CPT 27447)',
  'Infliximab infusion (J1745)',
  'CPAP device (HCPCS E0601)',
  'PET/CT staging (CPT 78815)',
  'Spinal cord stimulator trial (CPT 63650)',
  'Shoulder arthroscopy (CPT 29827)',
  'Home health skilled nursing',
  'Psychotherapy 53+ min (CPT 90837)',
  'CT abdomen/pelvis (CPT 74178)',
];
const ORGS = ['Coastal Ortho', 'Summit Spine & Sport', 'Riverbend Imaging', 'Lakeside Behavioral', 'North Peak Surgical', 'Harbor Pulmonology'];

type Template = (r: () => number, patient: string, proc: string, org: string) => { channel: LiveChannel; headline: string; detail: string };

const EVENT_TEMPLATES: Template[] = [
  (r, p, proc) => ({ channel: 'phone', headline: 'Voice intake completed — Gravity Rail', detail: `Caller verified for ${p}; transcript captured, structured fields extracted (${proc}). Case opened automatically.` }),
  (r, p, proc, org) => ({ channel: 'efax', headline: 'eFax OCR complete', detail: `${3 + Math.floor(r() * 9)}-page packet from ${org} — extraction confidence ${88 + Math.floor(r() * 10)}%, routed to brief engine.` }),
  (r, p, proc) => ({ channel: 'portal', headline: 'Portal submission received', detail: `${proc} with ${1 + Math.floor(r() * 3)} PDFs attached. Fingerprint dedup clean, receipt confirmation sent.` }),
  (r, p, proc) => ({ channel: 'email', headline: 'HIPAA email parsed', detail: `${proc} request extracted from secure message; confidence gate passed, queued for brief.` }),
  (r, p, proc) => ({ channel: 'portal', headline: 'AI brief passed fact-check', detail: `${proc} — multi-pass critique complete, deterministic fact-check ${90 + Math.floor(r() * 8)}/100, released to concierge gate.` }),
  (r, p) => ({ channel: 'phone', headline: 'Member callback completed', detail: `Status update delivered to ${p} — case in clinical review, decision expected within SLA.` }),
  (r, p, proc) => ({ channel: 'efax', headline: 'Missing-info packet received', detail: `Documentation for pended ${proc} case arrived — pend can be lifted after review.` }),
  (r, p, proc) => ({ channel: 'portal', headline: 'Determination delivered', detail: `${proc} — determination letter rendered and delivered; acknowledgment pending.` }),
  (r, p, proc) => ({ channel: 'portal', headline: 'SLA-aware routing', detail: `${proc} assigned by slack score — expected completion inside deadline with ${2 + Math.floor(r() * 20)}h to spare.` }),
];

/** The most recent `count` synthetic events as of `nowMs`, newest first. */
export function eventStream(count: number, nowMs?: number): LiveEvent[] {
  const now = nowMs ?? Date.now();
  const newestSlot = Math.floor(now / EVENT_SLOT_MS);
  const events: LiveEvent[] = [];
  for (let i = 0; i < count; i++) {
    const slot = newestSlot - i;
    const r = mulberry32(slot);
    const template = EVENT_TEMPLATES[Math.floor(r() * EVENT_TEMPLATES.length)];
    const patient = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
    const proc = PROCS[Math.floor(r() * PROCS.length)];
    const org = ORGS[Math.floor(r() * ORGS.length)];
    const { channel, headline, detail } = template(r, patient, proc, org);
    events.push({
      id: `live-${slot}`,
      channel,
      headline,
      detail,
      at: new Date(slot * EVENT_SLOT_MS).toISOString(),
      case_number: `VUM-2026-${String(100000 + (slot % 90000)).slice(-6)}`,
    });
  }
  return events;
}
