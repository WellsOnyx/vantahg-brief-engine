#!/usr/bin/env tsx
/**
 * Backfill script for case_state (per migration-029 comments).
 * Run in dev/MVP env: npx tsx scripts/backfill-licensure-case-state.ts
 *
 * Populated at intake (claim jurisdiction or form data).
 * Backfill: one-time update from historical intake JSONB or external data if available.
 *
 * In demo: simulates from available payer_name etc.
 * In real: queries/updates via supabase those without case_state.
 *
 * Everything estimated_pending_calibration.
 */

import { isDemoMode, getDemoCases } from '../lib/demo-mode';
import { getServiceClient, hasSupabaseConfig } from '../lib/supabase';

async function main() {
  console.log('Running case_state backfill in dev/MVP env...');
  console.log('Flag state: ENABLE_LABOR_METRIC=', process.env.ENABLE_LABOR_METRIC);
  console.log('Demo mode:', isDemoMode());

  let populated = 0;
  let unresolved = 0;
  let total = 0;

  if (isDemoMode() || !hasSupabaseConfig()) {
    // Demo / no DB: simulate backfill on demo cases from "historical" data (payer etc.)
    const cases = getDemoCases(); // note: this may be filtered, but for backfill use raw if possible
    // Actually use the source for full
    // For simplicity, use the exported, but to count, re-import raw
    const { demoCases: rawDemo } = await import('../lib/demo-data'); // may not export, use get and note
    total = cases.length;
    for (const c of cases) {
      if (c.case_state) continue;
      // Backfill logic example: map payer to state if possible, else unresolved for demo
      const payer = (c.payer_name || '').toLowerCase();
      if (payer.includes('southwest') || payer.includes('pinnacle')) {
        (c as any).case_state = 'TX'; // example from demo
        populated++;
      } else if (payer.includes('western')) {
        (c as any).case_state = 'CA';
        populated++;
      } else {
        // cannot resolve from available demo intake data
        unresolved++;
      }
    }
    console.log(`[DEMO BACKFILL] Total considered: ${total}`);
    console.log(`Populated: ${populated}`);
    console.log(`Unresolved (no historical intake data to derive state): ${unresolved}`);
    console.log('Note: in real MVP with Supabase + intake JSONB, would UPDATE from actual claim data.');
    return;
  }

  // Real Supabase path
  const supabase = getServiceClient();
  const { data: toBackfill, error } = await supabase
    .from('cases')
    .select('id, case_number, payer_name, procedure_description, intake_data') // assume intake JSONB or other
    .is('case_state', null)
    .limit(1000);

  if (error) {
    console.error('Backfill query error:', error);
    return;
  }

  total = toBackfill?.length || 0;
  for (const row of toBackfill || []) {
    let state: string | null = null;
    // Example backfill from "historical intake JSONB" or payer
    const intake = (row as any).intake_data || {};
    if (intake.state || intake.jurisdiction) {
      state = intake.state || intake.jurisdiction;
    } else if ((row.payer_name || '').toLowerCase().includes('southwest')) {
      state = 'TX';
    } else if ((row.payer_name || '').toLowerCase().includes('pinnacle')) {
      state = 'AZ';
    }
    if (state) {
      const { error: upErr } = await supabase
        .from('cases')
        .update({ case_state: state })
        .eq('id', row.id);
      if (!upErr) populated++;
      else unresolved++;
    } else {
      unresolved++;
    }
  }

  console.log(`[REAL BACKFILL] Total without case_state: ${total}`);
  console.log(`Populated from historical/intake: ${populated}`);
  console.log(`Unresolved (no derivable state from intake JSONB/external): ${unresolved}`);
}

main().catch(console.error);
