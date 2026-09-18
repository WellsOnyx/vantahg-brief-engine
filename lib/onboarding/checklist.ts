/**
 * Cole runbook checklist — mirrors docs/customer-ready/02-onboarding.md phases A–E.
 * Sellable artifacts first. Software second. No tribal knowledge required.
 */

export const ONBOARDING_PHASES = ['A', 'B', 'C', 'D', 'E'] as const;
export type OnboardingPhase = (typeof ONBOARDING_PHASES)[number];

export const ONBOARDING_GATES = ['required', 'hard', 'client_dependent', 'optional'] as const;
export type OnboardingGate = (typeof ONBOARDING_GATES)[number];

export interface OnboardingChecklistItem {
  id: string;
  phase: OnboardingPhase;
  title: string;
  owner: string;
  artifact: string;
  gate: OnboardingGate;
  pointer: string;
  required: boolean;
}

export const ONBOARDING_CHECKLIST: readonly OnboardingChecklistItem[] = [
  // ── Phase A — Commercial & legal (before any PHI) ────────────────────────
  {
    id: 'A1',
    phase: 'A',
    title: 'MSA + fee schedule signed',
    owner: 'Jonah / commercial',
    artifact: 'Signed MSA (clients/{client_id}/msa.pdf)',
    gate: 'required',
    pointer: 'docs/customer-ready/02-onboarding.md Phase A · docs/customer-ready/07-billing-and-tracking.md',
    required: true,
  },
  {
    id: 'A2',
    phase: 'A',
    title: 'BAA executed (covered entity ↔ Vanta)',
    owner: 'Legal',
    artifact: 'Executed BAA (clients/{client_id}/baa.pdf)',
    gate: 'hard',
    pointer: 'docs/customer-ready/06-hipaa-baa-path.md — hard gate for live PHI. Code does not claim HIPAA complete.',
    required: true,
  },
  {
    id: 'A3',
    phase: 'A',
    title: 'Subprocessor BAAs on file',
    owner: 'Ops',
    artifact: 'Anthropic (if clinical) / fax / e-sign / hosting BAAs as applicable',
    gate: 'hard',
    pointer: 'docs/customer-ready/06-hipaa-baa-path.md subprocessors',
    required: true,
  },
  {
    id: 'A4',
    phase: 'A',
    title: 'Security questionnaire / SOC pack',
    owner: 'Cole / ops',
    artifact: 'Completed pack (client-dependent)',
    gate: 'client_dependent',
    pointer: 'docs/customer-ready/06-hipaa-baa-path.md',
    required: false,
  },
  {
    id: 'A5',
    phase: 'A',
    title: 'Invoice entity + billing contact',
    owner: 'Finance',
    artifact: 'Meow / QB customer id (not Stripe)',
    gate: 'required',
    pointer: 'docs/customer-ready/07-billing-and-tracking.md · docs/meow-bootstrap-resume.md',
    required: true,
  },

  // ── Phase B — Client configuration (SoR) ─────────────────────────────────
  {
    id: 'B1',
    phase: 'B',
    title: 'client_id published',
    owner: 'CX',
    artifact: 'client_config vN.client_id',
    gate: 'required',
    pointer: 'GET/POST /api/client-config · lib/client-config',
    required: true,
  },
  {
    id: 'B2',
    phase: 'B',
    title: 'legal_name',
    owner: 'CX',
    artifact: 'client_config.legal_name',
    gate: 'required',
    pointer: 'docs/customer-ready/02-onboarding.md Phase B',
    required: true,
  },
  {
    id: 'B3',
    phase: 'B',
    title: 'lob[] lines of business',
    owner: 'CX',
    artifact: 'client_config.lob',
    gate: 'required',
    pointer: 'Day 0 kickoff — confirm LOBs',
    required: true,
  },
  {
    id: 'B4',
    phase: 'B',
    title: 'sla_hours_standard',
    owner: 'CX',
    artifact: 'client_config.sla_hours_standard',
    gate: 'required',
    pointer: 'Applied at ingest via lib/intake/spine-ingest.ts',
    required: true,
  },
  {
    id: 'B5',
    phase: 'B',
    title: 'sla_hours_urgent',
    owner: 'CX',
    artifact: 'client_config.sla_hours_urgent',
    gate: 'required',
    pointer: 'Applied at ingest via lib/intake/spine-ingest.ts',
    required: true,
  },
  {
    id: 'B6',
    phase: 'B',
    title: 'auto_vs_md_policy = always_md at go-live',
    owner: 'CX',
    artifact: 'client_config.auto_vs_md_policy',
    gate: 'required',
    pointer: 'docs/customer-ready/03-auth-workflow-rules.md R07–R09 — MD confirm required',
    required: true,
  },
  {
    id: 'B7',
    phase: 'B',
    title: 'notify_channels[]',
    owner: 'CX',
    artifact: 'portal | webhook | fax | email',
    gate: 'required',
    pointer: 'lib/fanout — F1–F4 honor contracted channels',
    required: true,
  },
  {
    id: 'B8',
    phase: 'B',
    title: 'determination_recipients',
    owner: 'CX',
    artifact: 'roles / endpoints (no member PHI)',
    gate: 'required',
    pointer: 'docs/customer-ready/05-determination-fanout.md',
    required: true,
  },
  {
    id: 'B9',
    phase: 'B',
    title: 'cm_handoff_enabled + optional webhook',
    owner: 'CX',
    artifact: 'client_config.cm_handoff_enabled / cm_webhook_url',
    gate: 'optional',
    pointer: 'docs/customer-ready/09-care-management.md · /portal/tpa/cm',
    required: false,
  },
  {
    id: 'B10',
    phase: 'B',
    title: 'intake_modes[]',
    owner: 'Ops',
    artifact: 'gravity_rail | api | sftp | fax',
    gate: 'required',
    pointer: 'docs/customer-ready/02-onboarding.md Phase D — pick one primary',
    required: true,
  },
  {
    id: 'B11',
    phase: 'B',
    title: 'timezone',
    owner: 'CX',
    artifact: 'client_config.timezone',
    gate: 'required',
    pointer: 'IANA tz used for SLA display',
    required: true,
  },
  {
    id: 'B12',
    phase: 'B',
    title: 'business_hours',
    owner: 'CX',
    artifact: 'client_config.business_hours',
    gate: 'required',
    pointer: 'Day 0 kickoff',
    required: true,
  },
  {
    id: 'B13',
    phase: 'B',
    title: 'escalation_contacts[]',
    owner: 'CX',
    artifact: 'name, role, phone/email — business contact; minimize PHI',
    gate: 'required',
    pointer: 'docs/customer-ready/02-onboarding.md Phase B',
    required: true,
  },
  {
    id: 'B14',
    phase: 'B',
    title: 'cx_owner named',
    owner: 'CX',
    artifact: 'client_config.cx_owner',
    gate: 'required',
    pointer: 'Internal MX Delivery Lead / CX bot id',
    required: true,
  },
  {
    id: 'B15',
    phase: 'B',
    title: 'reviewer_queue',
    owner: 'Ops',
    artifact: 'client_config.reviewer_queue',
    gate: 'required',
    pointer: '/med-review · GET /api/case-spine/md-queue',
    required: true,
  },
  {
    id: 'B16',
    phase: 'B',
    title: 'go_live_mode + shadow_mode + SLA rollback threshold',
    owner: 'Ops',
    artifact: 'client_config.go_live_mode / shadow_mode / sla_miss_rollback_threshold',
    gate: 'required',
    pointer: 'lib/client-config/go-live.ts · SLA_MISS_ROLLBACK_THRESHOLD env (default 0.2)',
    required: true,
  },
  {
    id: 'B17',
    phase: 'B',
    title: 'Config change control (append-only versions)',
    owner: 'CX',
    artifact: 'client_config vN + audit client_config_version_published',
    gate: 'required',
    pointer: 'PATCH/DELETE /api/client-config → 409. Confirm SLA/route changes in writing.',
    required: true,
  },

  // ── Phase C — Access ─────────────────────────────────────────────────────
  {
    id: 'C1',
    phase: 'C',
    title: 'Client admin invited',
    owner: 'CX',
    artifact: 'Cognito (ENABLE_AWS_AUTH) or hybrid invite; test login on staging',
    gate: 'required',
    pointer: 'app/api/team · STATE.md Phase 0.2. Flag stays false until staging tenant ready.',
    required: true,
  },
  {
    id: 'C2',
    phase: 'C',
    title: 'MFA enforced for clinical roles',
    owner: 'Ops',
    artifact: 'Cognito MFA / IdP policy',
    gate: 'required',
    pointer: 'docs/customer-ready/02-onboarding.md Phase C',
    required: true,
  },
  {
    id: 'C3',
    phase: 'C',
    title: 'Least-privilege roles assigned',
    owner: 'Ops',
    artifact: 'client / cx / med_review / superadmin',
    gate: 'required',
    pointer: 'lib/case-spine/rbac.ts · Phase 5 deny tests',
    required: true,
  },
  {
    id: 'C4',
    phase: 'C',
    title: 'Test login on staging',
    owner: 'CX',
    artifact: 'Staging session for client admin + MD',
    gate: 'required',
    pointer: '/login · /client · /med-review',
    required: true,
  },
  {
    id: 'C5',
    phase: 'C',
    title: 'CX lens access (non-PHI notes)',
    owner: 'CX',
    artifact: '/cx + /api/views/cx',
    gate: 'required',
    pointer: 'lib/views/cx.ts — clinical packet redacted',
    required: true,
  },
  {
    id: 'C6',
    phase: 'C',
    title: 'Med review / MD queue + sign',
    owner: 'Ops',
    artifact: '/med-review + POST /api/case-spine/[id]/sign',
    gate: 'required',
    pointer: 'docs/customer-ready/03-auth-workflow-rules.md — no silent auto-approve',
    required: true,
  },
  {
    id: 'C7',
    phase: 'C',
    title: 'Superadmin break-glass + audit',
    owner: 'Ops',
    artifact: 'Break-glass role + audit_events',
    gate: 'required',
    pointer: 'lib/case-spine audit writer',
    required: true,
  },

  // ── Phase D — Connectivity (staging until Phase E) ───────────────────────
  {
    id: 'D1',
    phase: 'D',
    title: 'Gravity Rail HMAC + callback',
    owner: 'Ops',
    artifact: 'GRAVITY_RAIL_WEBHOOK_SECRET slot (empty = synthetic allow)',
    gate: 'optional',
    pointer: 'POST /api/intake/gravity-rail — synthetic case < 2 min. Do not invent live keys.',
    required: false,
  },
  {
    id: 'D2',
    phase: 'D',
    title: 'External submit API + HMAC',
    owner: 'Ops',
    artifact: 'EXTERNAL_API_SECRET slot',
    gate: 'optional',
    pointer: 'POST /api/external/submit',
    required: false,
  },
  {
    id: 'D3',
    phase: 'D',
    title: 'Fax (Phaxio) number + webhook HMAC',
    owner: 'Ops',
    artifact: 'PHAXIO_CALLBACK_TOKEN slot',
    gate: 'optional',
    pointer: 'POST /api/intake/efax/phaxio · { synthetic: true }',
    required: false,
  },
  {
    id: 'D4',
    phase: 'D',
    title: 'SFTP folder + PGP (if required)',
    owner: 'Ops',
    artifact: 'connectivity.md — file drop → case',
    gate: 'optional',
    pointer: 'docs/customer-ready/02-onboarding.md Phase D. Not wired as a live connector yet.',
    required: false,
  },
  {
    id: 'D5',
    phase: 'D',
    title: 'Pick one primary intake for go-live',
    owner: 'CX / Ops',
    artifact: 'clients/{client_id}/connectivity.md',
    gate: 'required',
    pointer: 'Add secondary only after E1–E2 stable. Staging only until Phase E.',
    required: true,
  },

  // ── Phase E — Go-live gates ──────────────────────────────────────────────
  {
    id: 'E1',
    phase: 'E',
    title: 'Synthetic pack ≥ 10 (happy + missing clinicals + gray zone)',
    owner: 'Ops',
    artifact: 'npm run test:go-live-synthetic · POST /api/golive/synthetic',
    gate: 'required',
    pointer: 'lib/golive/packs.ts SYNTHETIC_PACK · assert via case-spine / intake',
    required: true,
  },
  {
    id: 'E2',
    phase: 'E',
    title: 'Shadow pack ≥ 10 (MD signs; no member/provider final send)',
    owner: 'Ops',
    artifact: 'POST /api/golive/shadow · go-live log',
    gate: 'required',
    pointer: 'client_config.shadow_mode / go_live_mode=shadow. Fan-out records intent only.',
    required: true,
  },
  {
    id: 'E3',
    phase: 'E',
    title: 'Live first N (default 25) + daily CX standup',
    owner: 'CX',
    artifact: 'Hypercare first-25 scorecard on /cx · clients/{id}/hypercare-notes.md',
    gate: 'required',
    pointer: 'lib/cx/hypercare.ts · agree N with client',
    required: true,
  },
  {
    id: 'E4',
    phase: 'E',
    title: 'Rollback: SLA miss rate > threshold → pause live, stay on shadow',
    owner: 'Ops',
    artifact: 'go-live log rollback note',
    gate: 'required',
    pointer: 'lib/golive/rollback.ts · SLA_MISS_ROLLBACK_THRESHOLD (default 0.2)',
    required: true,
  },
  {
    id: 'E5',
    phase: 'E',
    title: 'Secrets + encryption checklist signed (Cole + Jonah)',
    owner: 'Cole / Jonah',
    artifact: 'Phase 0.4 checkbox in go-live log',
    gate: 'required',
    pointer: 'docs/customer-ready/10-implementation-commits.md 0.4. ENABLE_AWS_* stay false until exported.',
    required: true,
  },
];

export const ONBOARDING_PHASE_META: Record<
  OnboardingPhase,
  { title: string; blurb: string; days: string }
> = {
  A: {
    title: 'Commercial & legal',
    blurb: 'Before any PHI. MSA, BAA (hard gate), subprocessors, billing entity.',
    days: 'Before Day 0',
  },
  B: {
    title: 'Client configuration',
    blurb: 'Versioned client_config in SoR. Every change is a new version + audit.',
    days: 'Day 1–2',
  },
  C: {
    title: 'Access',
    blurb: 'Invite client admin, MFA for clinical, least-privilege, staging login.',
    days: 'Day 1–2',
  },
  D: {
    title: 'Connectivity',
    blurb: 'One primary intake. Staging only until Phase E.',
    days: 'Day 1–2',
  },
  E: {
    title: 'Go-live gates',
    blurb: 'E1 synthetic ≥10 → E2 shadow ≥10 → E3 live first 25 with rollback.',
    days: 'Day 3–8+',
  },
};

export function checklistByPhase(phase?: OnboardingPhase): OnboardingChecklistItem[] {
  return ONBOARDING_CHECKLIST.filter((item) => !phase || item.phase === phase);
}

export function requiredChecklistIds(): string[] {
  return ONBOARDING_CHECKLIST.filter((item) => item.required).map((item) => item.id);
}

export function assertChecklistComplete(): { ok: true; phases: OnboardingPhase[]; ids: string[] } {
  const phases = [...new Set(ONBOARDING_CHECKLIST.map((i) => i.phase))];
  if (phases.join('') !== 'ABCDE') {
    throw new Error('Onboarding checklist must cover phases A–E');
  }
  return { ok: true, phases, ids: ONBOARDING_CHECKLIST.map((i) => i.id) };
}
