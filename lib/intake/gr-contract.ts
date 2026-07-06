/**
 * Canonical Intake Contract — v1 (core-side).
 *
 * THE ENGINE DEFINES THIS CONTRACT; Gravity Rail (and any future sender)
 * conforms to it. The authoritative human-readable spec lives at
 * docs/INTAKE_CONTRACT.md — this module is its executable twin: the JSON
 * schema, the signing recipe, the replay window, and the error codes all
 * live here so the route, the unit tests, and scripts/gr-intake-verify.ts
 * can never drift from the doc without a test failing.
 *
 * PHI rule: nothing in this module logs payload contents. Validation
 * errors expose field PATHS and expectation messages, never received
 * values. submission_id is constrained to an opaque charset so PHI cannot
 * ride in on it (it appears in logs and audit rows by design).
 */

import crypto from 'crypto';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Contract constants
// ---------------------------------------------------------------------------

export const INTAKE_CONTRACT_VERSION = '1.0';

/** Header carrying `sha256=<hex hmac>` over `${timestamp}.${rawBody}`. */
export const SIGNATURE_HEADER = 'x-gr-signature';
/** Header carrying the sender's unix timestamp (seconds) used in the signature base. */
export const TIMESTAMP_HEADER = 'x-gr-timestamp';
/** Optional header marking a sandbox submission (only honored when INTAKE_SANDBOX_ENABLED=true). */
export const SANDBOX_HEADER = 'x-gr-sandbox';

/** Requests older or newer than this many seconds are rejected as replays. */
export const REPLAY_WINDOW_SECONDS = 300;

/** Case-number prefix that marks sandbox-created cases for later cleanup. */
export const SANDBOX_CASE_PREFIX = 'SBX';

// ---------------------------------------------------------------------------
// Error codes (the exact strings the GR side branches on)
// ---------------------------------------------------------------------------

export type IntakeErrorCode =
  | 'schema_invalid' // 400 — payload failed schema validation (field detail included)
  | 'signature_missing' // 401 — no signature header
  | 'signature_invalid' // 401 — HMAC mismatch against all active secrets
  | 'timestamp_missing' // 401 — no timestamp header
  | 'replay_rejected' // 401 — timestamp outside the replay window
  | 'duplicate' // 409 — submission_id (or content fingerprint) already processed
  | 'sandbox_disabled' // 403 — sandbox header sent but sandbox not enabled in this environment
  | 'rate_limited' // 429 — from the shared rate limiter
  | 'not_configured' // 503 — no webhook secret configured in a production environment
  | 'internal_error'; // 500 — engine-side failure; safe to retry with backoff

// ---------------------------------------------------------------------------
// Payload schema — shared envelope + phone channel body
// ---------------------------------------------------------------------------

/**
 * submission_id must be opaque: sender-generated, unique per logical
 * submission, retry-stable (a retry of the same submission reuses the same
 * id). Charset is restricted so PHI can never appear in it.
 */
const submissionIdSchema = z
  .string()
  .min(8, 'submission_id must be at least 8 characters')
  .max(128, 'submission_id must be at most 128 characters')
  .regex(
    /^[A-Za-z0-9._:-]+$/,
    'submission_id may only contain letters, digits, and . _ : - (opaque id — never PHI)',
  );

const transcriptMessageSchema = z.object({
  role: z.string().optional(),
  content: z.string(),
});

/**
 * Structured extraction from the GR assistant. All keys optional — the
 * engine falls back to transcript text extraction for anything missing.
 * Canonical key names only (see docs/INTAKE_CONTRACT.md §4.3).
 */
const fieldValuesSchema = z
  .object({
    patient_name: z.string().optional(),
    patient_dob: z.string().optional(),
    member_id: z.string().optional(),
    provider_name: z.string().optional(),
    provider_npi: z.string().optional(),
    facility_name: z.string().optional(),
    payer_name: z.string().optional(),
    procedure_codes: z.union([z.array(z.string()), z.string()]).optional(),
    diagnosis_codes: z.union([z.array(z.string()), z.string()]).optional(),
    clinical_summary: z.string().optional(),
    priority: z.enum(['standard', 'urgent', 'expedited']).optional(),
  })
  .passthrough(); // unknown keys are ignored, never fatal

/**
 * The shared intake envelope. Every channel (phone today; fax / portal /
 * api / batch when they adopt v1) reuses this skeleton and adds its
 * channel-specific body fields.
 */
export const voiceIntakeSchema = z
  .object({
    // ---- shared envelope -------------------------------------------------
    contract_version: z.literal(INTAKE_CONTRACT_VERSION),
    submission_id: submissionIdSchema,
    intake_channel: z.literal('phone'),
    event: z.string().optional(), // e.g. "intake.completed"
    occurred_at: z.string().datetime({ offset: true }).optional(),

    // ---- phone channel body ----------------------------------------------
    from_number: z
      .string()
      .regex(/^\+?[0-9]{7,15}$/, 'from_number must be E.164 (digits, optional leading +)'),
    chat_id: z.union([z.number(), z.string()]).optional(),
    workspace_id: z.string().optional(),
    workflow_id: z.union([z.number(), z.string()]).optional(),
    title: z.string().optional(),
    transcript: z.union([z.string(), z.array(transcriptMessageSchema)]).optional(),
    field_values: fieldValuesSchema.optional(),
  })
  .refine((p) => (p.transcript !== undefined && p.transcript !== '') || p.field_values !== undefined, {
    message: 'at least one of transcript or field_values is required',
    path: ['transcript'],
  });

export type VoiceIntakePayload = z.infer<typeof voiceIntakeSchema>;

export interface SchemaFieldError {
  path: string;
  message: string;
}

/**
 * Validate a parsed JSON body against the v1 phone contract. Returns
 * field-level errors with PATHS ONLY — received values are never echoed
 * back (they may contain PHI).
 */
export function validateVoicePayload(
  body: unknown,
):
  | { ok: true; payload: VoiceIntakePayload }
  | { ok: false; errors: SchemaFieldError[] } {
  const result = voiceIntakeSchema.safeParse(body);
  if (result.success) return { ok: true, payload: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => ({
      path: i.path.join('.') || '(root)',
      message: i.message,
    })),
  };
}

// ---------------------------------------------------------------------------
// Signing / verification
// ---------------------------------------------------------------------------

/**
 * The signature base string. The timestamp is bound into the signed content
 * so an attacker cannot take a validly signed body and move its timestamp
 * header forward to defeat the replay window.
 */
export function signatureBase(timestamp: string | number, rawBody: string): string {
  return `${timestamp}.${rawBody}`;
}

/** Hex HMAC-SHA256 over the signature base. */
export function computeIntakeSignature(
  secret: string,
  timestamp: string | number,
  rawBody: string,
): string {
  return crypto.createHmac('sha256', secret).update(signatureBase(timestamp, rawBody)).digest('hex');
}

/**
 * Sender-side helper (used by tests + scripts/gr-intake-verify.ts, and the
 * documented recipe Cole implements): returns the two headers to attach.
 */
export function signIntakeRequest(
  secret: string,
  rawBody: string,
  timestampSeconds?: number,
): { timestamp: string; signature: string } {
  const ts = String(timestampSeconds ?? Math.floor(Date.now() / 1000));
  return { timestamp: ts, signature: `sha256=${computeIntakeSignature(secret, ts, rawBody)}` };
}

export type SignatureVerdict =
  | { ok: true; secretIndex: number }
  | { ok: false; code: Extract<IntakeErrorCode, 'signature_missing' | 'signature_invalid' | 'timestamp_missing' | 'replay_rejected'> };

function constantTimeEqualHex(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, 'utf8');
  const b = Buffer.from(bHex, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verify an inbound request. `secrets` supports zero-downtime rotation:
 * pass [primary, secondary] and either validates. Order:
 *   1. timestamp header present + numeric
 *   2. within REPLAY_WINDOW_SECONDS of now (either direction)
 *   3. signature header present, `sha256=` prefix optional
 *   4. constant-time HMAC match against any active secret
 */
export function verifyIntakeSignature(opts: {
  rawBody: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  secrets: string[];
  nowSeconds?: number;
  replayWindowSeconds?: number;
}): SignatureVerdict {
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const window = opts.replayWindowSeconds ?? REPLAY_WINDOW_SECONDS;

  const tsRaw = (opts.timestampHeader ?? '').trim();
  if (!tsRaw) return { ok: false, code: 'timestamp_missing' };
  const ts = Number(tsRaw);
  if (!Number.isFinite(ts)) return { ok: false, code: 'replay_rejected' };
  if (Math.abs(now - ts) > window) return { ok: false, code: 'replay_rejected' };

  const sigRaw = (opts.signatureHeader ?? '').trim();
  if (!sigRaw) return { ok: false, code: 'signature_missing' };
  const sigHex = sigRaw.startsWith('sha256=') ? sigRaw.slice('sha256='.length) : sigRaw;

  for (let i = 0; i < opts.secrets.length; i++) {
    const secret = opts.secrets[i];
    if (!secret) continue;
    const expected = computeIntakeSignature(secret, tsRaw, opts.rawBody);
    if (constantTimeEqualHex(sigHex, expected)) return { ok: true, secretIndex: i };
  }
  return { ok: false, code: 'signature_invalid' };
}

/**
 * Active webhook secrets, primary first. Two slots so rotation is:
 * add new secret to SECONDARY → GR flips to signing with it → move it to
 * primary and clear secondary. Both validate for the whole overlap.
 */
export function getIntakeWebhookSecrets(): string[] {
  return [
    process.env.GRAVITY_RAIL_WEBHOOK_SECRET,
    process.env.GRAVITY_RAIL_WEBHOOK_SECRET_SECONDARY,
  ].filter((s): s is string => !!s && s.length > 0);
}

/** Environment-scoped sandbox switch — set true only in the MVP environment. */
export function isIntakeSandboxEnabled(): boolean {
  return process.env.INTAKE_SANDBOX_ENABLED === 'true';
}
