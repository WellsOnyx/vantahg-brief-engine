import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { getEnv } from '@/lib/env';
import { provisionTpaUserAndMagicLink } from '@/lib/contracts/client-onboarding';
import { notifyContractPartiallySigned, notifyContractFullyExecuted } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/hellosign
 *
 * Receives Dropbox Sign (HelloSign) callback events. Two responsibilities:
 *
 *  1. Update the contract row to reflect signature state changes
 *     (`signature_request_signed` → `partially_signed`,
 *      `signature_request_all_signed` → `signed` and download the executed PDF).
 *  2. When fully signed, close the loop: provision the TPA's Supabase auth
 *     user, generate a magic link to /client/cases, audit the event.
 *
 * Dropbox Sign quirks worth knowing:
 *  - Body is `multipart/form-data` with a single `json` field. NOT a JSON body.
 *  - Authentication is by SHA-256 HMAC over the concatenation of
 *    `event_time` + `event_type`, signed with the API key. The HMAC is
 *    in `event.event_hash`.
 *  - The handler MUST return HTTP 200 with the literal text response
 *    `"Hello API Event Received"` for Dropbox Sign to consider delivery
 *    successful. Anything else (even a JSON 200) makes them mark the
 *    callback failed and retry.
 *  - On `callback_test` they hit the endpoint with a synthetic event.
 *    We accept it, log it, and return the magic string without touching
 *    the DB.
 *
 * This handler is intentionally chatty in the audit log — every event
 * type produces an entry so we can troubleshoot delivery failures.
 */

const SUCCESS_BODY = 'Hello API Event Received';
const SITE_URL_FALLBACK = 'https://app.vantaum.com';
const EXECUTED_PDF_BUCKET = 'signup-contracts';

interface ParsedEvent {
  event_time: string;
  event_type: string;
  event_hash: string;
  metadata?: Record<string, unknown>;
  signature_request_id?: string;
  is_complete?: boolean;
  files_url?: string;
}

/**
 * Verifies the Dropbox Sign event HMAC.
 *
 * Algorithm (per Dropbox Sign docs): HMAC-SHA256 of (`event_time` + `event_type`)
 * keyed by the API key, lowercase hex output. Compared in constant time.
 *
 * Exported for testability.
 */
export function verifyHelloSignEventHash(
  apiKey: string,
  eventTime: string,
  eventType: string,
  providedHash: string,
): boolean {
  const expected = createHmac('sha256', apiKey)
    .update(`${eventTime}${eventType}`)
    .digest('hex');
  // timingSafeEqual requires equal-length buffers. If the provided hash
  // is malformed/wrong-length it can't be valid — fail closed.
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(providedHash, 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Parses the Dropbox Sign event payload from the multipart `json` field.
 * Returns null when the shape is unexpected — caller treats null as a
 * 400 (with audit log).
 */
function parseEventPayload(raw: string): ParsedEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const ev = obj.event as Record<string, unknown> | undefined;
  const sigReq = obj.signature_request as Record<string, unknown> | undefined;
  if (!ev || typeof ev.event_time !== 'string' || typeof ev.event_type !== 'string' || typeof ev.event_hash !== 'string') {
    return null;
  }
  return {
    event_time: ev.event_time,
    event_type: ev.event_type,
    event_hash: ev.event_hash,
    metadata: (ev.event_metadata as Record<string, unknown>) ?? undefined,
    signature_request_id: typeof sigReq?.signature_request_id === 'string' ? (sigReq.signature_request_id as string) : undefined,
    is_complete: typeof sigReq?.is_complete === 'boolean' ? (sigReq.is_complete as boolean) : undefined,
    files_url: typeof sigReq?.files_url === 'string' ? (sigReq.files_url as string) : undefined,
  };
}

export async function POST(request: NextRequest) {
  try {
    // Dropbox Sign sends multipart/form-data with a single `json` field.
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return new NextResponse('Bad request: expected multipart form data', { status: 400 });
    }
    const rawJson = formData.get('json');
    if (typeof rawJson !== 'string') {
      return new NextResponse('Bad request: missing json field', { status: 400 });
    }

    const event = parseEventPayload(rawJson);
    if (!event) {
      await logAuditEvent(null, 'security:hellosign_webhook_unparseable', 'hellosign-webhook', {
        body_preview: rawJson.slice(0, 200),
      }, getRequestContext(request));
      return new NextResponse('Bad request: malformed event payload', { status: 400 });
    }

    // Callback test events have a fixed hash that doesn't depend on the API
    // key; we accept them so the Dropbox Sign dashboard "Test webhook" works
    // even before HMAC verification would pass.
    const isCallbackTest = event.event_type === 'callback_test';

    // HMAC verification. Skipped in demo mode (no API key) and for callback_test.
    if (!isDemoMode() && !isCallbackTest) {
      const env = getEnv();
      const apiKey = env.HELLOSIGN_API_KEY;
      if (!apiKey) {
        await logAuditEvent(null, 'security:hellosign_webhook_no_api_key', 'hellosign-webhook', {
          event_type: event.event_type,
        }, getRequestContext(request));
        return new NextResponse('Server not configured', { status: 500 });
      }
      const valid = verifyHelloSignEventHash(apiKey, event.event_time, event.event_type, event.event_hash);
      if (!valid) {
        await logAuditEvent(null, 'security:hellosign_webhook_bad_signature', 'hellosign-webhook', {
          event_type: event.event_type,
          signature_request_id: event.signature_request_id ?? null,
        }, getRequestContext(request));
        return new NextResponse('Invalid signature', { status: 401 });
      }
    }

    // From here on, the event is trusted (or demo/test).
    if (isCallbackTest) {
      await logAuditEvent(null, 'hellosign_webhook_callback_test', 'hellosign-webhook', {
        event_time: event.event_time,
      }, getRequestContext(request));
      return new NextResponse(SUCCESS_BODY, { status: 200 });
    }

    // Demo mode: log the event and ack. We don't have any state to update.
    if (isDemoMode()) {
      await logAuditEvent(null, 'hellosign_webhook_demo_ack', 'hellosign-webhook', {
        event_type: event.event_type,
        signature_request_id: event.signature_request_id ?? null,
      }, getRequestContext(request));
      return new NextResponse(SUCCESS_BODY, { status: 200 });
    }

    // Real-mode event handling.
    const supabase = getServiceClient();

    if (!event.signature_request_id) {
      await logAuditEvent(null, 'hellosign_webhook_no_signature_request_id', 'hellosign-webhook', {
        event_type: event.event_type,
      }, getRequestContext(request));
      // Still 200 — we don't want Dropbox Sign retrying. We just can't do anything.
      return new NextResponse(SUCCESS_BODY, { status: 200 });
    }

    // Load the contract row by envelope id. The `idx_contracts_hellosign`
    // index makes this O(1).
    const { data: contract, error: lookupErr } = await supabase
      .from('contracts')
      .select('*, signup_requests!contracts_signup_id_fkey(*)')
      .eq('hellosign_signature_request_id', event.signature_request_id)
      .maybeSingle();

    if (lookupErr) {
      return apiError(lookupErr, {
        operation: 'hellosign_webhook_lookup_contract',
        actor: 'hellosign-webhook',
        requestContext: getRequestContext(request),
      });
    }
    if (!contract) {
      // Event for a signature_request we don't know about. Could be a stale
      // envelope, a manual one from the dashboard, or simply not ours. Log + ack.
      await logAuditEvent(null, 'hellosign_webhook_unknown_envelope', 'hellosign-webhook', {
        event_type: event.event_type,
        signature_request_id: event.signature_request_id,
      }, getRequestContext(request));
      return new NextResponse(SUCCESS_BODY, { status: 200 });
    }

    const now = new Date().toISOString();

    switch (event.event_type) {
      case 'signature_request_signed': {
        // A single signer completed. If all signers are done Dropbox Sign
        // also sends `signature_request_all_signed`, so we just bump to
        // partially_signed here and let the all_signed event do the rest.
        if (contract.status !== 'signed') {
          await supabase
            .from('contracts')
            .update({ status: 'partially_signed' })
            .eq('id', contract.id)
            .eq('status', 'sent'); // optimistic concurrency — don't overwrite signed/void
        }
        await logAuditEvent(null, 'contract_partially_signed', 'hellosign-webhook', {
          contract_id: contract.id,
          signature_request_id: event.signature_request_id,
        }, getRequestContext(request));

        // Item 18 (Claude): notify admins so Jonathan knows his
        // counter-signature is queued up. HelloSign also emails the next
        // signer in the routing order; this is the VantaUM-branded heads-up.
        // Fire-and-forget — never block webhook ack on email delivery.
        void notifyContractPartiallySigned(contract.id).catch(() => {});

        return new NextResponse(SUCCESS_BODY, { status: 200 });
      }

      case 'signature_request_all_signed': {
        // Mark as signed. Don't re-process if we've already handled this event
        // (Dropbox Sign retries on any non-2xx and occasionally re-delivers).
        if (contract.status === 'signed') {
          await logAuditEvent(null, 'hellosign_webhook_all_signed_duplicate', 'hellosign-webhook', {
            contract_id: contract.id,
          }, getRequestContext(request));
          return new NextResponse(SUCCESS_BODY, { status: 200 });
        }

        const { error: updateErr } = await supabase
          .from('contracts')
          .update({ status: 'signed', signed_at: now })
          .eq('id', contract.id);

        if (updateErr) {
          await logAuditEvent(null, 'security:contract_signed_persist_failed', 'hellosign-webhook', {
            contract_id: contract.id,
            error_code: updateErr.code ?? null,
          }, getRequestContext(request));
          // Still ack — Dropbox Sign retrying won't fix a DB issue, and we
          // have the audit trail to reconcile manually.
          return new NextResponse(SUCCESS_BODY, { status: 200 });
        }

        // Bump signup_request to 'signed' so the admin UI reflects it.
        if (contract.signup_id) {
          await supabase
            .from('signup_requests')
            .update({ status: 'signed' })
            .eq('id', contract.signup_id)
            .in('status', ['approved', 'pending_review']);
        }

        // Close the loop: provision the TPA's auth user + magic link.
        // The signup_requests row is joined onto contract via the
        // !contracts_signup_id_fkey hint above.
        const signup = contract.signup_requests as
          | { id: string; signer_email: string | null; primary_contact_email: string; signer_name: string | null; primary_contact_name: string; }
          | null;

        if (signup) {
          const env = getEnv();
          const siteUrl =
            (typeof process.env.NEXT_PUBLIC_SITE_URL === 'string' && process.env.NEXT_PUBLIC_SITE_URL) ||
            (typeof process.env.VERCEL_URL === 'string' && process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
            SITE_URL_FALLBACK;
          void env; // referenced for future expansion (logging build env)

          const provisionResult = await provisionTpaUserAndMagicLink(
            supabase,
            {
              email: signup.signer_email ?? signup.primary_contact_email,
              fullName: signup.signer_name ?? signup.primary_contact_name,
              clientId: contract.client_id ?? null,
              signupId: signup.id,
              redirectPath: '/portal/tpa',
            },
            siteUrl,
          );

          // Ensure the user has the 'client' role so they can access the TPA portal
          if (provisionResult.userId) {
            await supabase
              .from('user_profiles')
              .upsert({
                id: provisionResult.userId,
                role: 'client',
                client_id: contract.client_id ?? null,
              }, { onConflict: 'id' });
          }

          // Post-signature tenant hardening (Item 19): mark the client as contract live
          // using the existing onboarding_status column (no contract_status column yet).
          // This gives a reliable signal for future admin/audit views and any
          // revocation flows. Non-fatal if it fails.
          if (contract.client_id) {
            const { error: clientLiveErr } = await supabase
              .from('clients')
              .update({ onboarding_status: 'live' })
              .eq('id', contract.client_id);
            if (clientLiveErr) {
              await logAuditEvent(null, 'security:client_live_status_update_failed', 'hellosign-webhook', {
                contract_id: contract.id,
                client_id: contract.client_id,
                error: clientLiveErr.message,
              }, getRequestContext(request));
            }
          }

          // Item 18 hardening: Branded confirmation email to TPA that contract is fully executed
          // and portal access is provisioned (closes the E2E notification loop beyond HelloSign + magic link).
          // Fire-and-forget using the email adapter; non-fatal.
          if (signup) {
            const recipient = signup.signer_email ?? signup.primary_contact_email;
            import('@/lib/adapters/email').then(({ getEmailAdapter }) => {
              const email = getEmailAdapter();
              email
                .send({
                  to: recipient,
                  subject: `Welcome to VantaUM — Your contract is signed and portal access is ready`,
                  text:
                    `Thank you for signing the VantaUM MSA + BAA for ${signup.primary_contact_name || 'your organization'}. ` +
                    `Your account has been provisioned. Please check your email for the secure login link (or use the one from Dropbox Sign) ` +
                    `and visit https://app.vantaum.com/portal/tpa to submit your first authorization request. ` +
                    `A concierge has been auto-assigned to support your team. We look forward to partnering with you.`,
                })
                .catch(() => {});
            }).catch(() => {});
          }

          await logAuditEvent(null, 'contract_all_signed', 'hellosign-webhook', {
            contract_id: contract.id,
            signup_id: signup.id,
            signature_request_id: event.signature_request_id,
            user_provisioned: !!provisionResult.userId,
            provision_error: provisionResult.error ?? null,
            // Never log the magic link itself — it's a credential.
            magic_link_generated: !!provisionResult.magicLink,
            client_marked_live: !!contract.client_id,
          }, getRequestContext(request));
        } else {
          await logAuditEvent(null, 'contract_all_signed_no_signup', 'hellosign-webhook', {
            contract_id: contract.id,
            signature_request_id: event.signature_request_id,
          }, getRequestContext(request));
        }

        // Item 18 (Claude): admin notification that the MSA is fully
        // executed. Fired in addition to the TPA welcome email above so
        // Jonathan + the admin distribution list have a confirmation
        // separate from the customer-facing welcome.
        // Fire-and-forget — never block webhook ack on email delivery.
        void notifyContractFullyExecuted(contract.id).catch(() => {});

        return new NextResponse(SUCCESS_BODY, { status: 200 });
      }

      case 'signature_request_declined':
      case 'signature_request_canceled':
      case 'signature_request_expired':
      case 'signature_request_invalid': {
        await supabase
          .from('contracts')
          .update({
            status: 'void',
            voided_at: now,
            void_reason: event.event_type,
          })
          .eq('id', contract.id)
          .in('status', ['sent', 'partially_signed']);

        await logAuditEvent(null, 'contract_voided_via_webhook', 'hellosign-webhook', {
          contract_id: contract.id,
          reason: event.event_type,
        }, getRequestContext(request));
        return new NextResponse(SUCCESS_BODY, { status: 200 });
      }

      default: {
        // Viewed, downloadable, reminded, email_bounce, etc. — informational only.
        await logAuditEvent(null, `hellosign_webhook_${event.event_type}`, 'hellosign-webhook', {
          contract_id: contract.id,
          signature_request_id: event.signature_request_id,
        }, getRequestContext(request));
        return new NextResponse(SUCCESS_BODY, { status: 200 });
      }
    }
  } catch (err) {
    return apiError(err, {
      operation: 'hellosign_webhook',
      actor: 'hellosign-webhook',
      requestContext: getRequestContext(request),
    });
  }
}

// Sink for `EXECUTED_PDF_BUCKET` — referenced by name in audit logs/future
// download step but TypeScript-eslint flags unused consts. Keeping it
// adjacent to the handler since the downloadable-PDF step lands in 2d.
void EXECUTED_PDF_BUCKET;
