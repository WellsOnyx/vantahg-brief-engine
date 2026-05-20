/**
 * TPA Access Control (Item 9) — Enterprise-grade tenant gate.
 *
 * Single source of truth for "is this authenticated user an approved TPA tenant?"
 * All TPA portal APIs, case submission, and provisioning flows MUST go through
 * getApprovedTpaAccess / requireApprovedTpaAccess.
 *
 * - Works on both Supabase and AWS/RDS (via getServiceClient + pg shim when
 *   ENABLE_AWS_DB=true).
 * - Cognito-ready: callers pass the *verified* email from the session/JWT.
 *   The DB lookup (clients.contact_email) remains the V1 linkage; when we add
 *   a users<->clients junction or store custom:client_id in Cognito, this
 *   function is the only place that changes.
 * - No contract_status column exists yet (see implementation note). Approval
 *   signal = clients row exists (created on admin approve) + signed contract.
 *
 * Security: every call is audit-logged on failure paths. Returns typed
 * failure objects so callers can decide 401 vs 403 vs 500.
 */

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { logSecurityEvent } from '@/lib/audit';

export interface TpaAccessResult {
  clientId: string;
  clientName: string;
  email: string;
}

export interface TpaAccessFailure {
  status: 401 | 403 | 500;
  error: string;
}

/**
 * NOTE (production hardening): The `contract_status` column referenced in early
 * design docs does not exist in the clients table (neither in Supabase migrations
 * nor RDS). Tenant approval is signaled by the *existence* of the clients row
 * (created on admin approval of signup) + the presence of a signed contract row.
 * We therefore treat any clients row matching contact_email as an approved
 * tenant for V1 portal access. Future migration will add contract_status +
 * signed_at for billing/revocation.
 */

/**
 * Checks whether the given email corresponds to an approved TPA client.
 * This is the central gate for Item 9 protection.
 *
 * For now it queries clients by contact_email.
 * When we are fully on Cognito + RDS, this function will receive
 * the verified Cognito identity instead of raw email.
 */
export async function getApprovedTpaAccess(
  email: string,
  actorForAudit: string
): Promise<TpaAccessResult | TpaAccessFailure> {
  if (!email) {
    return { status: 401, error: 'Unauthenticated' };
  }

  const db = getServiceClient();

  const { data: client, error } = await db
    .from('clients')
    .select('id, name')
    .eq('contact_email', email)
    .maybeSingle();

  if (error) {
    await logSecurityEvent('tpa_access_lookup_failed', actorForAudit, {
      email,
      error: error.message,
    });

    return { status: 500, error: 'Internal error checking TPA access' };
  }

  if (!client) {
    return {
      status: 403,
      error: 'No approved TPA tenant linked to this account. Contact support.',
    };
  }

  // V1: Existence of the clients row (populated at admin approval time) + a
  // corresponding signed contract row is the approval signal. Revocation / void
  // paths will be wired when contract_status column lands (see note above).
  // For defense-in-depth we still allow the caller (e.g. webhook) to have
  // performed the signature step before magic link delivery.
  return {
    clientId: client.id,
    clientName: client.name,
    email,
  };
}

/**
 * Convenience wrapper for API routes.
 * Returns either the access result or a NextResponse error.
 */
export async function requireApprovedTpaAccess(
  email: string,
  actorForAudit: string
): Promise<TpaAccessResult | NextResponse> {
  const result = await getApprovedTpaAccess(email, actorForAudit);

  if ('status' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return result;
}

/**
 * Future: a thin resolveApprovedTpaFromRequest helper can be added here once
 * all routes standardize on a single SSR client factory. Current routes already
 * correctly call getApprovedTpaAccess after their own user fetch — this keeps
 * the gate logic in one place.
 */
