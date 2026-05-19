/**
 * TPA Access Control (Item 9)
 *
 * This module is the hook point for "approved TPA only" protection.
 *
 * Current state: Still leans on the existing service client for data lookup
 * (because full Cognito + RDS user profile lookup is not yet wired).
 *
 * Future state (AWS/Cognito only):
 *   - Accept a Cognito user id / email (from verified JWT)
 *   - Look up the client in RDS (via pg shim)
 *   - Check that the client has an active/signed contract
 *   - Return the tenant + practices the user is allowed to see
 *
 * Do not add new Supabase auth client usage here. Use whatever
 * the current "get current user from AWS session" primitive is.
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
  status: 401 | 403;
  error: string;
}

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
    .select('id, name, contract_status')
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

  // Basic "approved" check — in V1 a signed contract is what makes them live.
  // You can tighten this later (e.g. require contract_status === 'signed').
  if (client.contract_status === 'void' || client.contract_status === 'cancelled') {
    return {
      status: 403,
      error: 'Your contract is no longer active. Contact support.',
    };
  }

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
