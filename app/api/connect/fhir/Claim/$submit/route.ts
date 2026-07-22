import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { authenticatePartner, hasScope } from '@/lib/partner/auth';
import { intakePersistenceGuard } from '@/lib/intake/persistence-guard';
import { ingestCanonicalCase, getCaseAuthNumber } from '@/lib/partner/ingest';
import { mapPasBundleToCanonical, renderClaimResponse, type FhirBundle } from '@/lib/connectors/fhir-pas';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * FHIR rail inbound — Da Vinci PAS `Claim/$submit` (docs/CONNECTOR_RAILS.md).
 *
 *   POST /api/connect/fhir/Claim/$submit     (scope: submit)
 *
 * Accepts the PAS request Bundle, maps it to the CanonicalCase, and runs the
 * SAME shared ingest as every other channel (ledger idempotency keyed on
 * Claim.identifier[0].value, content dedup, tenant from the partner key,
 * brief queue, the wall). Synchronous response is a ClaimResponse with
 * outcome `queued` / review action A4 (pended) carrying our authorization
 * number as preAuthRef — the honest UM shape: the DETERMINATION arrives
 * later via webhook (case.determination) or polling, rendered with the
 * final review-action code.
 *
 * Errors are FHIR OperationOutcome resources whose issues carry element
 * paths only — never values (PHI rule).
 */

const CONTRACT_VERSION = 'pas-r4-v1';

function operationOutcome(
  status: number,
  issues: Array<{ severity: string; code: string; expression?: string[]; diagnostics: string }>,
) {
  return NextResponse.json(
    { resourceType: 'OperationOutcome', issue: issues },
    { status, headers: { 'content-type': 'application/fhir+json' } },
  );
}

function fhirJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'content-type': 'application/fhir+json' } });
}

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 240 });
    if (rateLimited) return rateLimited;

    const partner = await authenticatePartner(request);
    if (!partner) {
      return operationOutcome(401, [{ severity: 'error', code: 'login', diagnostics: 'Missing or invalid X-API-Key.' }]);
    }
    if (!hasScope(partner, 'submit')) {
      return operationOutcome(403, [{ severity: 'error', code: 'forbidden', diagnostics: 'Key lacks the submit scope.' }]);
    }

    let bundle: FhirBundle;
    try {
      bundle = (await request.json()) as FhirBundle;
    } catch {
      return operationOutcome(400, [{ severity: 'error', code: 'structure', diagnostics: 'Body is not valid JSON.' }]);
    }

    const mapped = mapPasBundleToCanonical(bundle);
    if (!mapped.ok || !mapped.value) {
      return operationOutcome(
        400,
        (mapped.errors ?? []).map((e) => ({
          severity: 'error', code: 'required', expression: [e.path], diagnostics: e.message,
        })),
      );
    }
    const canonical = mapped.value;

    const guard = intakePersistenceGuard();
    if (guard) return guard;

    if (isDemoMode()) {
      return fhirJson(renderClaimResponse({
        det: { case_id: 'demo', client_reference: canonical.client_reference, decision: null, rationale_summary: null, decided_at: null },
        claimIdentifier: canonical.client_reference,
        authorizationNumber: `VUM-DEMO-${canonical.client_reference.slice(0, 8)}`,
      }));
    }

    const outcome = await ingestCanonicalCase(partner, canonical, {
      rail: 'fhir_pas',
      contractVersion: CONTRACT_VERSION,
    });

    switch (outcome.kind) {
      case 'created':
        return fhirJson(renderClaimResponse({
          det: { case_id: outcome.case_id, client_reference: canonical.client_reference, decision: null, rationale_summary: null, decided_at: null },
          claimIdentifier: canonical.client_reference,
          authorizationNumber: outcome.authorization_number,
        }));
      case 'idempotent': {
        const auth = outcome.case_id ? await getCaseAuthNumber(outcome.case_id) : null;
        return fhirJson(renderClaimResponse({
          det: { case_id: outcome.case_id ?? 'pending', client_reference: canonical.client_reference, decision: null, rationale_summary: null, decided_at: null },
          claimIdentifier: canonical.client_reference,
          authorizationNumber: auth ?? undefined,
        }));
      }
      case 'duplicate_content':
        return operationOutcome(409, [{
          severity: 'error', code: 'duplicate',
          diagnostics: `A case matching this content already exists (24h window): ${outcome.case_number}.`,
        }]);
      default:
        return operationOutcome(500, [{ severity: 'error', code: 'exception', diagnostics: 'Submission could not be recorded; retry with the same Claim.identifier.' }]);
    }
  } catch (e) {
    return apiError(e, { operation: 'fhir_pas_submit', actor: 'connector-fhir', requestContext: getRequestContext(request) });
  }
}
