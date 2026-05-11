/**
 * Self-bootstrapping insert of a code-defined template into the
 * contract_templates table. Called from the generate-contract route so
 * we don't need a separate "seed templates" step before generation
 * works.
 *
 * Idempotent on the (slug, version) unique constraint — on the second
 * call it just returns the existing template id.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContractTemplate } from './types';

export async function ensureTemplateInDb(
  supabase: SupabaseClient,
  template: ContractTemplate,
): Promise<{ id: string; created: boolean }> {
  // Try a read first — fast path on hot routes.
  const { data: existing, error: readErr } = await supabase
    .from('contract_templates')
    .select('id')
    .eq('slug', template.slug)
    .eq('version', template.version)
    .maybeSingle();

  if (readErr) {
    throw new Error(`ensureTemplateInDb read failed: ${readErr.message}`);
  }
  if (existing?.id) {
    return { id: existing.id as string, created: false };
  }

  // Insert. Race condition: two concurrent calls both miss the read
  // and try to insert. The unique constraint on (slug, version) makes
  // one win and the other fail with 23505 — recover by re-reading.
  const { data: inserted, error: insertErr } = await supabase
    .from('contract_templates')
    .insert({
      slug: template.slug,
      version: template.version,
      title: template.title,
      body_md: template.bodyMd,
      variables: template.variables,
      signer_roles: template.signerRoles,
      active: true,
    })
    .select('id')
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      // Lost the race; the other insert won. Read again.
      const { data: retry, error: retryErr } = await supabase
        .from('contract_templates')
        .select('id')
        .eq('slug', template.slug)
        .eq('version', template.version)
        .single();
      if (retryErr || !retry) {
        throw new Error(`ensureTemplateInDb retry-read failed: ${retryErr?.message}`);
      }
      return { id: retry.id as string, created: false };
    }
    throw new Error(`ensureTemplateInDb insert failed: ${insertErr.message}`);
  }

  if (!inserted) {
    throw new Error('ensureTemplateInDb insert returned no row');
  }
  return { id: inserted.id as string, created: true };
}
