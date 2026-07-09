/**
 * Canonical Intake Contract — v1.1 (core-side).
 *
 * THE ENGINE DEFINES THIS CONTRACT; Gravity Rail (and any future sender)
 * conforms to it. The authoritative human-readable spec lives at
 * docs/INTAKE_CONTRACT.md — this module is its executable twin: the JSON
 * schema, the signing recipes, the replay window, and the error codes all
 * live here so the routes, the unit tests, and scripts/gr-intake-verify.ts
 * can never drift from the doc without a test failing.
 *
 * v1.1 unifies the two intake channels on one security model:
 *   - `/api/gr/webhook`  — chat/sms/voice HANDOFF (stable external face)
 *   - `/api/intake/voice` — phone-channel intake envelope
 * Both verify HMAC-SHA256 over `${timestamp}.${rawBody}` with a ±300s
 * replay window and dual-secret rotation (GR_WEBHOOK_SECRET primary).
 *
 * TRANSITION WINDOW: the v1 scheme — plain hex HMAC over the raw body in
 * `X-Webhook-Signature`, no timestamp — is still accepted while we confirm
 * whether the GR team built against it. Flip ACCEPT_V1_LEGACY_SIGNATURES
 * to false to end the window (single switch; every verifier goes through
 * it). Legacy-scheme acceptances are audit-visible via the returned
 * `scheme` so we can see when GR upgrades.
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

export const INTAKE_CONTRACT_VERSION = '1.1';

/** v1.1 header carrying `sha256=<hex hmac>` over `${timestamp}.${rawBody}`. */
export const SIGNATURE_HEADER = 'x-gr-signature';
/** v1.1 header carrying the sender's unix timestamp (seconds) used in the signature base. */
export const TIMESTAMP_HEADER = 'x-gr-timestamp';
/** v1 LEGACY header carrying plain `hex(HMAC(secret, rawBody))` — transition window only. */
export const LEGACY_SIGNATURE_HEADER = 'x-webhook-signature';
/** Optional header marking a sandbox submission (only honored when INTAKE_SANDBOX_ENABLED=true). */
export const SANDBOX_HEADER = 'x-gr-sandbox';

/** Requests older or newer than this many seconds are rejected as replays (v1.1 scheme). */
export const REPLAY_WINDOW_SECONDS = 300;

/**
 * Transition window switch: accept the v1 legacy signature scheme.
 * Flip to false once the GR team confirms they sign with v1.1 (or that
 * they never built against v1). Removal is a one-line change + doc note.
 */
export const ACCEPT_V1_LEGACY_SIGNATURES = true;

/** Case-number prefix that marks sandbox-created cases for later cleanup. */
export const SANDBOX_CASE_PREFIX = 'SBX';

// ---------------------------------------------------------------------------
// Error codes (the exact strings the GR side branches on)
// ---------------------------------------------------------------------------

export type IntakeErrorCode =
  | 'schema_invalid' // 400 — payload failed schema validation (field detail included)
  | 'signature_missing' // 401 — no signature header (either scheme)
  | 'signature_invalid' // 401 — HMAC mismatch against all active secrets
  | 'timestamp_missing' // 401 — v1.1 signature sent without X-GR-Timestamp
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
 * Canonical key names only (see docs/INTAKE_CONTRACT.md).
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
 * The shared intake envelope for the phone channel (`/api/intake/voice`).
 * Future channels (fax / portal / api / batch) reuse this skeleton and add
 * their channel-specific body fields. The handoff channel
 * (`/api/gr/webhook`) predates the envelope and keeps its stable body —
 * see docs/INTAKE_CONTRACT.md §Channel A.
 */
export const voiceIntakeSchema = z
  .object({
    // ---- shared envelope -------------------------------------------------
    contract_version: z.enum(['1.0', '1.1']),
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
 * Validate a parsed JSON body against the phone-channel contract. Returns
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
 * The v1.1 signature base string. The timestamp is bound into the signed
 * content so an attacker cannot take a validly signed body and move its
 * timestamp header forward to defeat the replay window.
 */
export function signatureBase(timestamp: string | number, rawBody: string): string {
  return `${timestamp}.${rawBody}`;
}

/** Hex HMAC-SHA256 over the v1.1 signature base. */
export function computeIntakeSignature(
  secret: string,
  timestamp: string | number,
  rawBody: string,
): string {
  return crypto.createHmac('sha256', secret).update(signatureBase(timestamp, rawBody)).digest('hex');
}

/** Hex HMAC-SHA256 over the raw body only — the v1 LEGACY scheme. */
export function computeLegacySignature(secret: string, rawBody: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * Sender-side helper (used by tests + scripts/gr-intake-verify.ts, and the
 * documented recipe the GR side implements): returns the two v1.1 headers.
 */
export function signIntakeRequest(
  secret: string,
  rawBody: string,
  timestampSeconds?: number,
): { timestamp: string; signature: string } {
  const ts = String(timestampSeconds ?? Math.floor(Date.now() / 1000));
  return { timestamp: ts, signature: `sha256=${computeIntakeSignature(secret, ts, rawBody)}` };
}

export type SignatureScheme = 'v1_1' | 'v1_legacy';

export type SignatureVerdict =
  | { ok: true; secretIndex: number; scheme: SignatureScheme }
  | { ok: false; code: Extract<IntakeErrorCode, 'signature_missing' | 'signature_invalid' | 'timestamp_missing' | 'replay_rejected'> };

function constantTimeEqualHex(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, 'utf8');
  const b = Buffer.from(bHex, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verify an inbound request against the v1.1 scheme, with the v1 legacy
 * scheme as a transition fallback (ACCEPT_V1_LEGACY_SIGNATURES).
 *
 * `secrets` supports zero-downtime rotation: pass every active secret and
 * any of them validates. Precedence:
 *   1. v1.1: X-GR-Signature present → require X-GR-Timestamp, enforce the
 *      replay window, verify HMAC(ts + "." + body) against each secret.
 *   2. v1 legacy (window open): X-Webhook-Signature present → verify plain
 *      HMAC(body) against each secret. No timestamp requirement — that is
 *      exactly the weakness v1.1 exists to close, which is why the window
 *      is temporary.
 */
export function verifyIntakeSignature(opts: {
  rawBody: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  legacySignatureHeader?: string | null;
  secrets: string[];
  nowSeconds?: number;
  replayWindowSeconds?: number;
  acceptLegacy?: boolean;
}): SignatureVerdict {
  const acceptLegacy = opts.acceptLegacy ?? ACCEPT_V1_LEGACY_SIGNATURES;
  const sigRaw = (opts.signatureHeader ?? '').trim();
  const legacyRaw = (opts.legacySignatureHeader ?? '').trim();

  // ── v1.1 path ────────────────────────────────────────────────────────
  if (sigRaw) {
    const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
    const window = opts.replayWindowSeconds ?? REPLAY_WINDOW_SECONDS;

    const tsRaw = (opts.timestampHeader ?? '').trim();
    if (!tsRaw) return { ok: false, code: 'timestamp_missing' };
    const ts = Number(tsRaw);
    if (!Number.isFinite(ts)) return { ok: false, code: 'replay_rejected' };
    if (Math.abs(now - ts) > window) return { ok: false, code: 'replay_rejected' };

    const sigHex = sigRaw.startsWith('sha256=') ? sigRaw.slice('sha256='.length) : sigRaw;
    for (let i = 0; i < opts.secrets.length; i++) {
      const secret = opts.secrets[i];
      if (!secret) continue;
      if (constantTimeEqualHex(sigHex, computeIntakeSignature(secret, tsRaw, opts.rawBody))) {
        return { ok: true, secretIndex: i, scheme: 'v1_1' };
      }
    }
    return { ok: false, code: 'signature_invalid' };
  }

  // ── v1 legacy path (transition window) ───────────────────────────────
  if (acceptLegacy && legacyRaw) {
    const legacyHex = legacyRaw.startsWith('sha256=') ? legacyRaw.slice('sha256='.length) : legacyRaw;
    for (let i = 0; i < opts.secrets.length; i++) {
      const secret = opts.secrets[i];
      if (!secret) continue;
      if (constantTimeEqualHex(legacyHex, computeLegacySignature(secret, opts.rawBody))) {
        return { ok: true, secretIndex: i, scheme: 'v1_legacy' };
      }
    }
    return { ok: false, code: 'signature_invalid' };
  }

  return { ok: false, code: 'signature_missing' };
}

/**
 * Active webhook secrets, primary first. Rotation: add the new secret to
 * SECONDARY → GR flips to signing with it → move it to primary and clear
 * secondary. Both validate for the whole overlap. The legacy
 * GRAVITY_RAIL_WEBHOOK_SECRET name is honored last so nothing breaks while
 * environments standardize on GR_WEBHOOK_SECRET.
 */
export function getIntakeWebhookSecrets(): string[] {
  return [
    process.env.GR_WEBHOOK_SECRET,
    process.env.GR_WEBHOOK_SECRET_SECONDARY,
    process.env.GRAVITY_RAIL_WEBHOOK_SECRET,
  ].filter((s): s is string => !!s && s.length > 0);
}

/** Environment-scoped sandbox switch — set true only in the MVP environment. */
export function isIntakeSandboxEnabled(): boolean {
  return process.env.INTAKE_SANDBOX_ENABLED === 'true';
}
