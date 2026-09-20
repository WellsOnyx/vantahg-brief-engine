/**
 * Cole A→E operator runbook — Phase 7.1.
 * Single source of truth for constraints, day script, and the synthetic
 * client_config fixture. No live PHI. No production secrets.
 */

import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';
import type { ClientConfigFields } from '@/lib/client-config/types';

export const ONBOARDING_RUNBOOK_PATH = 'docs/customer-ready/11-cole-onboarding-runbook.md';
export const ONBOARDING_UI_PATH = '/admin/onboarding';

/** LOCKED 2026-09-20 — packaging / GTM. Not a new build phase. */
export const PACKAGING_LOCK = {
  paid_door: 'Med Review (VantaHG)',
  brief_engine: 'Included free only with Vanta med review',
  not_standalone_free_um: true,
  not_free_with_other_shop_med_review: true,
  pointer: 'docs/customer-ready/01-product-boundary.md',
} as const;

export const HARD_CONSTRAINTS = [
  'Synthetic fixtures only. Tokenized refs. No live PHI in this runbook, UI, or packs.',
  'Do not flip ENABLE_AWS_AUTH or any ENABLE_AWS_* default. Do not invent production vendor keys.',
  'Paid door = Med Review (VantaHG). Brief Engine / UM is free only with Vanta med review — not a standalone free UM SKU, not free with another shop’s med review.',
  'Checking boxes is a code / ops gate, not a HIPAA attestation. BAA is a hard gate before live PHI.',
  'Every live determination is human MD-signed. No silent auto-approve.',
] as const;

export interface RunbookDay {
  id: string;
  when: string;
  title: string;
  phases: Array<'A' | 'B' | 'C' | 'D' | 'E'>;
  steps: string[];
}

export const COLE_DAY_SCRIPT: readonly RunbookDay[] = [
  {
    id: 'day0',
    when: 'Day 0',
    title: 'Kickoff',
    phases: ['A', 'B'],
    steps: [
      'Confirm LOBs, SLAs, one primary intake mode, determination channels, CX owner, reviewer queue.',
      'Confirm packaging: buyer is on Vanta med review (paid door). Brief Engine is included under that contract only.',
      'Write it down, then publish client_config v1 from the synthetic fixture (or a real staging tenant with synthetic data).',
    ],
  },
  {
    id: 'day12',
    when: 'Day 1–2',
    title: 'Config + users + connectivity (staging)',
    phases: ['B', 'C', 'D'],
    steps: [
      'Phase A artifacts on file (MSA, BAA, subprocessors, Meow billing contact) before any PHI path.',
      'Publish / confirm client_config (append-only). PATCH/DELETE → 409; SLA or route changes need a new version + written CX confirm.',
      'Invite client admin. Do not flip ENABLE_AWS_AUTH. Test /client, /cx, /med-review on staging.',
      'Pick one primary intake. Empty HMAC slots = synthetic allow. Document it in clients/{id}/connectivity.md.',
    ],
  },
  {
    id: 'day34',
    when: 'Day 3–4',
    title: 'E1 synthetic pack',
    phases: ['E'],
    steps: [
      'Run npm run test:go-live-synthetic or click Run synthetic pack on this page.',
      'Expect ≥10 cases: happy path + missing clinicals (R01 → intake_incomplete, SLA paused) + gray zone (md_queue).',
      'Client watches /client and /med-review. Still synthetic.',
    ],
  },
  {
    id: 'day57',
    when: 'Day 5–7',
    title: 'E2 shadow',
    phases: ['E'],
    steps: [
      'POST /api/golive/shadow or click Run shadow pack.',
      '≥10 live-shaped synthetic packets. MD signs. Fan-out records intent only.',
      'member_provider_final_sends must be 0. go_live_mode=shadow / shadow_mode=true.',
    ],
  },
  {
    id: 'day8',
    when: 'Day 8+',
    title: 'E3 live hypercare (first 25)',
    phases: ['E'],
    steps: [
      'Agree N with the client (default 25). Full fan-out. MD on every determination.',
      'Daily CX standup until first 25 clear. Scorecard: /cx + go-live log.',
      'If first-25 SLA miss rate > sla_miss_rollback_threshold (default 0.2): pause live intake, stay on shadow, root-cause.',
    ],
  },
];

/** Well-known synthetic staging tenant. Tokenized — no live PHI. */
export const SYNTHETIC_CLIENT_CONFIG_FIXTURE: ClientConfigFields = {
  client_id: SYNTHETIC_CLIENT_ID,
  legal_name: 'VantaUM Synthetic Staging TPA',
  lob: ['medical'],
  sla_hours_standard: 72,
  sla_hours_urgent: 24,
  auto_vs_md_policy: 'always_md',
  notify_channels: ['portal'],
  determination_recipients: ['tpa_portal'],
  cm_handoff_enabled: false,
  cm_webhook_url: null,
  cm_webhook_secret: null,
  determination_webhook_url: null,
  determination_webhook_secret: null,
  intake_modes: ['api'],
  timezone: 'America/New_York',
  business_hours: { start: '09:00', end: '17:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  escalation_contacts: [
    { name: 'Synthetic CX', role: 'cx_owner', email: 'cx-synth@example.com' },
  ],
  cx_owner: 'cx_synth',
  reviewer_queue: 'med_review_synth',
  go_live_mode: 'synthetic',
  shadow_mode: false,
  sla_miss_rollback_threshold: 0.2,
};

export const PUBLISH_SYNTHETIC_CONFIG_COMMAND = `curl -s -X POST http://localhost:3000/api/client-config \\
  -H 'content-type: application/json' \\
  -d @docs/customer-ready/fixtures/client-config-synthetic.json`;

export const E1_SYNTHETIC_COMMAND = 'npm run test:go-live-synthetic';

export const E2_SHADOW_COMMAND = `curl -s -X POST http://localhost:3000/api/golive/shadow \\
  -H 'content-type: application/json' \\
  -d '{}'`;

export const RELATED_SURFACES = [
  { href: '/client', label: 'Client lens' },
  { href: '/cx', label: 'CX first-25 scorecard' },
  { href: '/med-review', label: 'Med review queue' },
  { href: '/admin/setup', label: 'Production setup' },
  { href: '/admin/signups', label: 'TPA signups' },
  { href: '/portal/tpa/reports', label: 'Client reports' },
] as const;
