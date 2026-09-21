/**
 * Cole runbook checklist — mirrors docs/customer-ready/02-onboarding.md phases A–E.
 * Sellable artifacts first. Software second. Every item has how_to so Cole
 * can run A→E without tribal knowledge (Phase 7.1).
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
  /** Exact operator steps. Required — a pointer path is not enough. */
  how_to: readonly string[];
  /** In-app page Cole should open, when one exists. */
  href?: string;
  /** Copy-paste command for this step. */
  command?: string;
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
    how_to: [
      'Commercial executes the MSA with fee schedule minimums: per prior auth, per first-level appeal, optional rush / after-hours multiplier, monthly minimum.',
      'Store the signed PDF at clients/{client_id}/msa.pdf (Drive or S3 signup-contracts). No PHI in the filename.',
      'Paid door is Med Review — Brief Engine / UM is included only under a Vanta med-review contract. Not a standalone free UM SKU.',
      'Check this box only when the signed file exists. Billing path is Meow, not Stripe.',
    ],
    href: '/admin/signups',
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
    how_to: [
      'Legal executes the covered-entity ↔ Vanta BAA. Live PHI is illegal without this.',
      'File at clients/{client_id}/baa.pdf. Checking this box is a code gate, not a HIPAA attestation.',
      'Do not send live PHI through this UI, Grok, or agent boxes even after the BAA is signed.',
    ],
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
    how_to: [
      'Collect applicable subprocessor BAAs/DPAs: Anthropic (if clinical briefs), Phaxio/eFax, HelloSign, AWS hosting.',
      'Empty vendor slots stay empty — do not invent production keys to “complete” this step.',
      'File copies next to the client BAA. Hard gate before live PHI.',
    ],
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
    how_to: [
      'If the client requires a security / SOC pack, complete it and store under clients/{client_id}/.',
      'Skip and leave unchecked when the client does not require it. Not a go-live blocker by default.',
    ],
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
    how_to: [
      'Create the Meow (or QB) customer for the invoice entity. Locked decision: Meow, not Stripe.',
      'Record billing contact on the client record. Production Meow keys stay empty until Jonah’s dedicated VantaUM account exists.',
      'Open /admin/billing only to confirm the stub — do not enable ENABLE_REAL_MEOW from this runbook.',
    ],
    href: '/admin/billing',
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
    how_to: [
      'Staging: click “Publish synthetic client_config” on this page, or POST the fixture JSON.',
      'Confirm GET /api/client-config?client_id=11111111-1111-1111-1111-111111111111 returns vN.',
      'Real tenant: use a staging UUID — never a live member id. Synthetic only until Phase E.',
    ],
    command:
      "curl -s -X POST http://localhost:3000/api/client-config -H 'content-type: application/json' -d @docs/customer-ready/fixtures/client-config-synthetic.json",
    href: '/admin/onboarding',
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
    how_to: [
      'Set legal_name to the contracted entity (fixture: “VantaUM Synthetic Staging TPA”).',
      'Publish a new client_config version if the name changes. PATCH is 409.',
    ],
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
    how_to: [
      'Day 0: confirm covered LOBs with the client (medical, pharmacy, …).',
      'Write them on client_config.lob. Fixture default is ["medical"].',
    ],
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
    how_to: [
      'Confirm standard SLA hours at kickoff. Fixture default is 72.',
      'SLA hours from the latest version are applied at ingest. A change requires a new version + written CX confirm.',
    ],
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
    how_to: [
      'Confirm urgent SLA hours at kickoff. Fixture default is 24.',
      'Same change-control as standard: new version + written confirm. Do not PATCH.',
    ],
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
    how_to: [
      'Leave auto_vs_md_policy = always_md for go-live. R07–R09 attach a draft brief then queue MD — they do not determine.',
      'No silent auto-approve. Sign is POST /api/case-spine/[id]/sign only.',
    ],
    href: '/med-review',
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
    how_to: [
      'Kickoff: pick contracted notify channels (portal, webhook, fax, email).',
      'Fixture uses ["portal"] only. Do not enable member/provider final send until E3 live.',
    ],
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
    how_to: [
      'List roles / endpoints that receive signed determinations (e.g. tpa_portal). No member names.',
      'Shadow mode records intent only — no final outbound to member or requesting provider.',
    ],
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
    how_to: [
      'Enable only if the contract includes CM handoff. Unflagged determinations never post.',
      'If enabled, set cm_webhook_url + secret (empty slot until a real HMAC exists). Check /portal/tpa/cm.',
    ],
    href: '/portal/tpa/cm',
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
    how_to: [
      'Pick one primary intake for go-live (Gravity Rail, external API, fax, or SFTP). Add secondary only after E1–E2 are stable.',
      'Fixture default is ["api"]. Write the choice in clients/{id}/connectivity.md.',
    ],
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
    how_to: [
      'Set IANA timezone from kickoff (fixture: America/New_York). Used for SLA display, not PHI.',
    ],
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
    how_to: [
      'Record business_hours.start / end / days from kickoff. Fixture is 09:00–17:00 weekdays.',
    ],
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
    how_to: [
      'Add business contacts only (name, role, phone/email). No member or clinical names.',
      'Fixture uses cx-synth@example.com. Real contacts go in the next config version.',
    ],
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
    how_to: [
      'Name the internal CX / Delivery Lead (fixture: cx_synth). This is an id, not a clinical note.',
      'CX notes stay on /cx — never on the case object.',
    ],
    href: '/cx',
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
    how_to: [
      'Set reviewer_queue to the med-review team id (fixture: med_review_synth).',
      'Confirm the queue at /med-review (SLA due-at ascending). Paid door = Med Review.',
    ],
    href: '/med-review',
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
    how_to: [
      'Start at go_live_mode=synthetic, shadow_mode=false. Move to shadow for E2, live only for E3.',
      'Leave sla_miss_rollback_threshold at 0.2 unless the client agreed a different first-25 rate.',
      'Do not set live until E1 and E2 pass. Do not flip ENABLE_AWS_* from this field.',
    ],
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
    how_to: [
      'Every change is POST /api/client-config (new version) or PUT /api/client-config/{clientId}. PATCH/DELETE return 409.',
      'CX confirms SLA or route changes with the client in writing (non-PHI). History: GET /api/client-config?client_id=…&history=1',
    ],
    command: 'curl -s "http://localhost:3000/api/client-config?client_id=11111111-1111-1111-1111-111111111111&history=1"',
  },
  {
    id: 'B18',
    phase: 'B',
    title: 'vanta_med_review_contract (free UM Brief Engine gate)',
    owner: 'CX / commercial',
    artifact: 'client_config.vanta_med_review_contract + med_review_provider',
    gate: 'required',
    pointer:
      'lib/entitlements/um-brief-engine.ts · Paid door is VantaHG Med Review. Flip true only when the buyer uses Vanta med review. Never standalone UM; never third_party.',
    required: true,
    how_to: [
      'Paid door is VantaHG Med Review. Free UM Brief Engine is granted only when vanta_med_review_contract is true and med_review_provider is vanta.',
      'Leave the flag false for a new published config. The synthetic staging seed is already true / vanta so demo packs keep working.',
      'Never grant standalone free UM. Never set med_review_provider=third_party and expect Brief Engine access — that combination is always denied.',
      'Do not invent a UM price. Do not flip ENABLE_AWS_* from this item.',
    ],
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
    how_to: [
      'Invite via POST /api/team/invite (hybrid default). Do not export ENABLE_AWS_AUTH=true from this runbook.',
      'Cognito path exists but stays off until a staging tenant is ready. Fargate leaves the flag false unless exported at deploy.',
      'Use a synthetic / staging email. No live member accounts.',
    ],
    command:
      "curl -s -X POST http://localhost:3000/api/team/invite -H 'content-type: application/json' -d '{\"email\":\"client-admin-synth@example.com\",\"role\":\"client\"}'",
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
    how_to: [
      'When Cognito is eventually enabled for a staging tenant, require MFA for med_review / MD.',
      'Until then, record the policy intent in the go-live log. Do not flip ENABLE_AWS_AUTH here.',
    ],
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
    how_to: [
      'Assign client / CX / med_review / superadmin only. Client of tenant B must 404 on tenant A.',
      'Client 403 on /api/cx/notes and /api/views/cx. Confirm with existing Phase 5 deny tests if unsure.',
    ],
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
    how_to: [
      'Log in as the invited client admin → /client. Log in as MD → /med-review.',
      'Demo / local: NEXT_PUBLIC_DEMO_MODE=true, no secrets required. Still synthetic.',
    ],
    href: '/login',
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
    how_to: [
      'Open /cx. Confirm account health, stuck cases, first-25 hypercare. Notes are non-PHI only.',
      'Never paste clinical text into CX notes, tickets, or chat.',
    ],
    href: '/cx',
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
    how_to: [
      'Open /med-review. Queue sorts by SLA due-at, then priority. Row opens packet + brief.',
      'Sign is the only determination path. Brief is required before md_queue (409 brief_required otherwise).',
    ],
    href: '/med-review',
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
    how_to: [
      'Break-glass is time-boxed + reason-coded. Every transition writes audit_events.',
      'Review GET /api/case-spine/{id}/audit on a synthetic case. No PHI in audit payloads.',
    ],
  },

  // ── Phase D — Connectivity (staging until Phase E) ───────────────────────
  {
    id: 'D1',
    phase: 'D',
    title: 'Gravity Rail HMAC + callback',
    owner: 'Ops',
    artifact: 'GRAVITY_RAIL_WEBHOOK_SECRET slot (empty = synthetic/dev allow; production fails closed)',
    gate: 'optional',
    pointer: 'POST /api/intake/gravity-rail — synthetic case < 2 min. Do not invent live keys.',
    required: false,
    how_to: [
      'Only if Gravity Rail is the primary intake. Empty GRAVITY_RAIL_WEBHOOK_SECRET = synthetic allow on local/dev/test.',
      'Production with no webhook secret fails closed (500 webhook_secret_not_configured). Not live-keyed.',
      'POST a synthetic payload; the case must appear on GET /api/case-spine in the same request (≪ 2 min).',
      'Do not invent a production key to check this box.',
    ],
    command:
      `curl -s -X POST http://localhost:3000/api/intake/gravity-rail -H 'content-type: application/json' -d '{"synthetic":true,"member_ref":"memb_synth_001","requesting_provider":"prov_synth_001","service_or_rx":"CPT-73721","place_of_service":"office","urgency":"standard","clinicals_pointer":"s3://synth/packet/001.pdf","external_id":"gr-cole-1","benefit_type":"medical"}'`,
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
    how_to: [
      'Only if external API is the primary intake. Empty EXTERNAL_API_SECRET = HMAC not required.',
      'POST /api/external/submit with a tokenized payload (no raw member name on the spine object).',
    ],
    command:
      `curl -s -X POST http://localhost:3000/api/external/submit -H 'content-type: application/json' -d '{"synthetic":true,"member_ref":"memb_synth_002","requesting_provider":"prov_synth_002","service_or_rx":"CPT-73721","urgency":"standard","clinicals_pointer":"s3://synth/packet/002.pdf"}'`,
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
    how_to: [
      'Only if fax is the primary intake. Empty PHAXIO_CALLBACK_TOKEN stays empty — do not invent a token.',
      'POST { synthetic: true, fax, intake } to the Phaxio webhook. Live OCR stays on the cron / ENABLE_REAL_EFAX path.',
    ],
    command:
      `curl -s -X POST http://localhost:3000/api/intake/efax/phaxio -H 'content-type: application/json' -d '{"synthetic":true,"fax":{"from_number":"+15555550100"},"intake":{"member_ref":"memb_synth_fax","service_or_rx":"CPT-73721"}}'`,
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
    how_to: [
      'SFTP is not a live connector yet. If the client requires it, document folder + PGP in clients/{id}/connectivity.md and keep intake on API/fax/Gravity Rail for go-live.',
      'Do not claim a file-drop → case path exists in code.',
    ],
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
    how_to: [
      'Write the primary mode + acceptance command in clients/{client_id}/connectivity.md.',
      'Run that one synthetic command (D1, D2, or D3) and confirm a case-spine row. Staging only until Phase E.',
    ],
  },

  // ── Phase E — Go-live gates ──────────────────────────────────────────────
  {
    id: 'E1',
    phase: 'E',
    title: 'Synthetic pack ≥ 10 (happy + missing clinicals + gray zone)',
    owner: 'Ops',
    artifact: 'npm run test:synthetic-golive-pack · npm run test:go-live-synthetic · POST /api/golive/synthetic',
    gate: 'required',
    pointer: 'fixtures/golive/synthetic-e1.json · assert via case-spine / intake APIs',
    required: true,
    how_to: [
      'Click “Run synthetic pack” above, or run the command. Expect ≥10 cases.',
      'Happy path + missing clinicals (R01 → intake_incomplete, SLA paused) + gray zone (md_queue, no auto-approve).',
      'Client can watch /client and /med-review. Synthetic only.',
    ],
    command: 'npm run test:go-live-synthetic',
    href: '/med-review',
  },
  {
    id: 'E2',
    phase: 'E',
    title: 'Shadow pack ≥ 10 (MD signs; no member/provider final send)',
    owner: 'Ops',
    artifact: 'npm run test:shadow-golive-pack · POST /api/golive/shadow · go-live log',
    gate: 'required',
    pointer: 'fixtures/golive/shadow-e2.json · client_config.shadow_mode / go_live_mode=shadow. Fan-out records intent only.',
    required: true,
    how_to: [
      'Click “Run shadow pack” or POST /api/golive/shadow. ≥10 live-shaped synthetic packets. MD signs.',
      'Assert member_provider_final_sends === 0. Fan-out may record intent only (shadow_mode / go_live_mode=shadow).',
      'Never a final send to member or requesting provider from this pack.',
    ],
    command: "curl -s -X POST http://localhost:3000/api/golive/shadow -H 'content-type: application/json' -d '{}'",
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
    how_to: [
      'Agree N with the client (default 25). Full fan-out. MD on every determination.',
      'Daily CX standup until first 25 clear. Scorecard lives on /cx. Notes in clients/{id}/hypercare-notes.md — non-PHI.',
      'Human ops still required before real live PHI: SES verify, Fargate rebuild, BAA, production keys.',
    ],
    href: '/cx',
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
    how_to: [
      'Click “Evaluate first-25 SLA” (POST /api/golive). Threshold is client_config.sla_miss_rollback_threshold or env default 0.2.',
      'On breach: pause live intake, stay on shadow, root-cause. A rollback note is written to the go-live log.',
      'This is a code gate. It does not mean HIPAA is complete.',
    ],
    command: "curl -s -X POST http://localhost:3000/api/golive -H 'content-type: application/json' -d '{}'",
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
    how_to: [
      'Cole + Jonah sign the secrets + encryption checklist in clients/{id}/go-live-log.md (template: docs/onboarding/go-live-log.md).',
      'ENABLE_AWS_AUTH / ENABLE_AWS_DB / ENABLE_AWS_STORAGE / ENABLE_AWS_EMAIL stay false until an operator exports them at deploy. This runbook does not flip them.',
      'Production vendor keys remain empty slots. Do not paste secrets into git, chat, or this UI.',
    ],
  },
];

export const ONBOARDING_PHASE_META: Record<
  OnboardingPhase,
  { title: string; blurb: string; days: string }
> = {
  A: {
    title: 'Commercial & legal',
    blurb: 'Before any PHI. MSA, BAA (hard gate), subprocessors, billing entity. Paid door is VantaHG Med Review.',
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

/** Phase 7.1 — every item is runnable without tribal knowledge. */
export function assertChecklistOperational(): {
  ok: true;
  phases: OnboardingPhase[];
  ids: string[];
  how_to_steps: number;
} {
  const complete = assertChecklistComplete();
  let how_to_steps = 0;
  for (const item of ONBOARDING_CHECKLIST) {
    if (!item.how_to?.length) {
      throw new Error(`${item.id} is missing how_to — Cole cannot run this without tribal knowledge`);
    }
    if (!item.owner?.trim() || !item.artifact?.trim() || !item.pointer?.trim()) {
      throw new Error(`${item.id} is missing owner, artifact, or pointer`);
    }
    how_to_steps += item.how_to.length;
  }
  return { ...complete, how_to_steps };
}
