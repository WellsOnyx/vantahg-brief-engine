import crypto from 'crypto';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logSecurityEvent } from '@/lib/audit';
import { getRequestContext } from '@/lib/security';

/**
 * Partner API v1 authentication (docs/PARTNER_API.md §2).
 *
 * Credentials live in partner_api_keys — SHA-256 hashed at rest, scoped to
 * exactly one client tenant, with per-key scopes. The caller sends the
 * plaintext key in `X-API-Key`; we hash and look up. A partner can only
 * ever act within its own client_id — tenant binding comes from the key,
 * never from the request body.
 *
 * Key format (issued by scripts/issue-partner-key.ts):
 *   vum_live_<32 hex bytes>   — the prefix is stored for support lookup.
 *
 * Fail-closed rules:
 *   - No key row / inactive key / wrong hash → null (route 401s).
 *   - Demo mode returns a deterministic demo partner so preview
 *     deployments can exercise the API without a database.
 *   - The legacy EXTERNAL_API_KEYS env path is NOT honored here; the
 *     legacy /api/external/submit route keeps its own (patched) check
 *     until partners migrate.
 */

export interface PartnerPrincipal {
  key_id: string;
  client_id: string;
  name: string;
  scopes: string[];
}

export function hashApiKey(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

/** Generate a new partner key (plaintext returned ONCE; only the hash is stored). */
export function generatePartnerKey(): { plaintext: string; key_hash: string; key_prefix: string } {
  const plaintext = `vum_live_${crypto.randomBytes(32).toString('hex')}`;
  return { plaintext, key_hash: hashApiKey(plaintext), key_prefix: plaintext.slice(0, 8) };
}

const DEMO_PARTNER: PartnerPrincipal = {
  key_id: 'demo-partner-key',
  client_id: 'cli-001-southwest-administrators',
  name: 'Demo partner (synthetic)',
  scopes: ['submit', 'read'],
};

export async function authenticatePartner(request: Request): Promise<PartnerPrincipal | null> {
  const apiKey = request.headers.get('x-api-key')?.trim();
  if (!apiKey) return null;

  if (isDemoMode()) {
    // Preview deployments: any non-empty key exercises the demo partner.
    // Real deployments never take this branch (demo mode is refused
    // upstream in production without the demo grant).
    return DEMO_PARTNER;
  }

  const supabase = getServiceClient();
  const { data: row } = await supabase
    .from('partner_api_keys')
    .select('id, client_id, name, scopes, active')
    .eq('key_hash', hashApiKey(apiKey))
    .maybeSingle();

  if (!row || row.active !== true) {
    await logSecurityEvent(
      'auth_failure',
      'partner-api',
      { reason: 'invalid_partner_key', key_prefix: apiKey.slice(0, 8) },
      getRequestContext(request),
    ).catch(() => {});
    return null;
  }

  // Best-effort usage stamp — never blocks the request.
  supabase
    .from('partner_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id)
    .then(() => {}, () => {});

  return {
    key_id: row.id as string,
    client_id: row.client_id as string,
    name: row.name as string,
    scopes: (row.scopes as string[]) ?? [],
  };
}

export function hasScope(p: PartnerPrincipal, scope: 'submit' | 'read'): boolean {
  return p.scopes.includes(scope);
}
