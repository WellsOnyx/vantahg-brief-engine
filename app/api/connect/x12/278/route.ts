import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { authenticatePartner, hasScope } from '@/lib/partner/auth';
import { intakePersistenceGuard } from '@/lib/intake/persistence-guard';
import { ingestCanonicalCase, getCaseAuthNumber } from '@/lib/partner/ingest';
import { tokenizeX12, parse278ToCanonical, render278Response } from '@/lib/connectors/x12-278';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * X12 rail inbound — ASC X12N 278 request (docs/CONNECTOR_RAILS.md).
 *
 *   POST /api/connect/x12/278      raw EDI body (scope: submit)
 *
 * Accepts a 278 request interchange (text/plain or application/edi-x12),
 * parses the 005010X217 subset to the CanonicalCase, and runs the SAME
 * shared ingest as every other channel — idempotency keyed on TRN02 (the
 * trace number the sender already treats as retry-stable), content dedup,
 * tenant from the partner key, brief queue, the wall.
 *
 * Synchronous response is a structurally valid 278 response with HCR
 * action A4 (pended) + our authorization number — the honest UM answer at
 * intake time. The determination is delivered later (webhook/polling/
 * response rendering via render278Response with the decided action code).
 *
 * Parse failures return HTTP 400 with segment/element locators only, never
 * values (PHI rule). Formal 999/TA1 acknowledgment generation is the
 * clearinghouse's job at this stage — documented in CONNECTOR_RAILS.md.
 */

const CONTRACT_VERSION = '005010X217-v1';
const MAX_BODY_BYTES = 1_000_000; // 1 MB — a single 278 is a few KB; batches go through the clearinghouse rail

function ediResponse(body: string, status = 200) {
  return new NextResponse(body, { status, headers: { 'content-type': 'application/edi-x12' } });
}

function jsonError(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 240 });
    if (rateLimited) return rateLimited;

    const partner = await authenticatePartner(request);
    if (!partner) return jsonError(401, 'unauthorized', 'Missing or invalid X-API-Key.');
    if (!hasScope(partner, 'submit')) return jsonError(403, 'forbidden', 'Key lacks the submit scope.');

    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY_BYTES) {
      return jsonError(400, 'body_invalid', 'Body must be a single non-empty X12 278 interchange under 1 MB.');
    }

    const parsed = parse278ToCanonical(raw);
    if (!parsed.ok || !parsed.value) {
      return jsonError(400, 'x12_invalid', 'Interchange failed 278 parsing.', {
        errors: parsed.errors ?? [],
      });
    }
    const { trace, ...canonical } = parsed.value;
    // Re-tokenize for the response envelope (parse already proved it tokenizes).
    const tok = tokenizeX12(raw);
    if (!tok.ok || !tok.value) {
      return jsonError(400, 'x12_invalid', 'Interchange failed tokenization.', { errors: tok.errors ?? [] });
    }
    const interchange = tok.value;

    const guard = intakePersistenceGuard();
    if (guard) return guard;

    const pendedResponse = (authorizationNumber: string) =>
      render278Response({
        request: interchange,
        det: { case_id: 'pending', client_reference: canonical.client_reference, decision: null, rationale_summary: null, decided_at: null },
        authorizationNumber,
        trace,
      });

    if (isDemoMode()) {
      return ediResponse(pendedResponse(`VUMDEMO${canonical.client_reference.slice(0, 8).toUpperCase()}`));
    }

    const outcome = await ingestCanonicalCase(partner, canonical, {
      rail: 'x12_278',
      contractVersion: CONTRACT_VERSION,
    });

    switch (outcome.kind) {
      case 'created':
        return ediResponse(pendedResponse(outcome.authorization_number));
      case 'idempotent': {
        // Retransmission of a trace we already hold — echo the same pended
        // response (same auth number) rather than erroring; that is how EDI
        // senders expect duplicate TRNs to behave.
        const auth = outcome.case_id ? await getCaseAuthNumber(outcome.case_id) : null;
        return ediResponse(pendedResponse(auth ?? 'PENDING'));
      }
      case 'duplicate_content': {
        // Different trace, same clinical content inside the 24h window —
        // point at the original certification rather than opening a second.
        const auth = await getCaseAuthNumber(outcome.case_id);
        return ediResponse(pendedResponse(auth ?? 'PENDING'));
      }
      default:
        return jsonError(500, 'ingest_failed', 'Submission could not be recorded; retransmit with the same TRN02.');
    }
  } catch (e) {
    return apiError(e, { operation: 'x12_278_submit', actor: 'connector-x12', requestContext: getRequestContext(request) });
  }
}
