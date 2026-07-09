#!/usr/bin/env tsx
/**
 * issue-partner-key — mint a Partner API v1 credential for a client tenant.
 *
 *   npx tsx scripts/issue-partner-key.ts --client <client_uuid> --name "Optum claims bridge (prod)" \
 *     [--webhook-url https://partner.example/vantaum/events] [--scopes submit,read]
 *
 * Prints the PLAINTEXT key exactly once — only the SHA-256 hash is stored.
 * If a webhook URL is given, a webhook signing secret is minted alongside
 * and printed once too (the partner verifies our decision-out events with
 * it — same recipe as docs/INTAKE_CONTRACT.md §2).
 *
 * Requires the target environment's DB config in this shell.
 */
import crypto from 'crypto';
import { getServiceClient } from '../lib/supabase';
import { generatePartnerKey } from '../lib/partner/auth';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const clientId = arg('--client');
const name = arg('--name');
const webhookUrl = arg('--webhook-url');
const scopes = (arg('--scopes') ?? 'submit,read').split(',').map((s) => s.trim()).filter(Boolean);

if (!clientId || !name) {
  console.error('Usage: issue-partner-key.ts --client <client_uuid> --name "<label>" [--webhook-url <url>] [--scopes submit,read]');
  process.exit(2);
}

async function main() {
  const supabase = getServiceClient();

  const { data: client } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', clientId!)
    .maybeSingle();
  if (!client) {
    console.error(`No client with id ${clientId}`);
    process.exit(1);
  }

  const { plaintext, key_hash, key_prefix } = generatePartnerKey();
  const webhookSecret = webhookUrl ? `vumwh_${crypto.randomBytes(32).toString('hex')}` : null;

  const { data: row, error } = await supabase
    .from('partner_api_keys')
    .insert({
      client_id: clientId,
      name,
      key_hash,
      key_prefix,
      scopes,
      webhook_url: webhookUrl ?? null,
      webhook_secret: webhookSecret,
      active: true,
    })
    .select('id')
    .single();

  if (error || !row) {
    console.error('Insert failed:', error?.message);
    process.exit(1);
  }

  console.log('=== Partner API key issued — SHOWN ONCE, store securely ===');
  console.log(`client:        ${client.name} (${clientId})`);
  console.log(`key id:        ${row.id}`);
  console.log(`scopes:        ${scopes.join(', ')}`);
  console.log(`API key:       ${plaintext}`);
  if (webhookSecret) {
    console.log(`webhook url:   ${webhookUrl}`);
    console.log(`webhook secret: ${webhookSecret}`);
  }
  console.log('\nHand the API key (and webhook secret) to the partner over a secure channel.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
