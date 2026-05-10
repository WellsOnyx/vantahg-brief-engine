import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, hasSupabaseConfig } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { mapExtractionToPayload } from '@/lib/firstmover/from-extraction';
import type { ParsedFaxData } from '@/lib/intake/efax-parser';

export const dynamic = 'force-dynamic';

/**
 * GET /api/firstmover/intake/from-queue/[id]
 *
 * Returns the eFax (or email) queue item's extracted fields mapped into
 * a First Mover IntakePayload + a service-type guess. The concierge
 * intake form consumes this to pre-populate when a nurse drills in from
 * the CSR triage queue.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
  if (rateLimited) return rateLimited;

  const { id } = await ctx.params;

  // Demo mode: synthesize a representative parsed_data so the UI flow works
  if (isDemoMode() || !hasSupabaseConfig()) {
    const demoParsed: Partial<ParsedFaxData> = {
      patient_name: 'Demo Patient (from fax queue)',
      patient_member_id: 'M1001',
      patient_dob: '1972-04-18',
      procedure_description: 'MRI lumbar spine without contrast',
      procedure_codes: ['72148'],
      diagnosis_codes: ['M54.5'],
      requesting_provider: 'Dr. Patel',
      requesting_provider_npi: '1234567890',
      facility_type: 'outpatient',
      service_category: 'imaging',
      raw_text: '',
      confidence: 92,
    };
    const mapped = mapExtractionToPayload(demoParsed);
    return NextResponse.json({
      queue_id: id,
      source: 'efax',
      extraction_confidence: demoParsed.confidence,
      ...mapped,
    });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('efax_queue')
    .select('id, parsed_data, status, from_number, extraction_method')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Queue item not found' }, { status: 404 });
  }

  const parsed = (data.parsed_data || {}) as Partial<ParsedFaxData>;
  const mapped = mapExtractionToPayload(parsed);

  return NextResponse.json({
    queue_id: id,
    source: 'efax',
    queue_status: data.status,
    extraction_method: data.extraction_method,
    extraction_confidence: parsed.confidence ?? null,
    ...mapped,
  });
}
