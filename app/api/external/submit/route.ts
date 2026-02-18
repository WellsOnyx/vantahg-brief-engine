import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { generateBriefForCase } from '@/lib/generate-brief';
import { isDemoMode } from '@/lib/demo-mode';
import type { ServiceCategory, CasePriority, ReviewType, FacilityType } from '@/lib/types';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Rate limiting: TODO — implement per-key rate limiting with a sliding window.
// Recommended: use Vercel KV / Upstash Redis for distributed rate limiting.
// Target: 100 requests per minute per API key.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Validation helpers (shared constants with batch route)
// ---------------------------------------------------------------------------

const VALID_SERVICE_CATEGORIES: ServiceCategory[] = [
  'imaging', 'surgery', 'specialty_referral', 'dme', 'infusion',
  'behavioral_health', 'rehab_therapy', 'home_health', 'skilled_nursing',
  'transplant', 'genetic_testing', 'pain_management', 'cardiology', 'oncology', 'other',
];

const VALID_PRIORITIES: CasePriority[] = ['standard', 'urgent', 'expedited'];

const VALID_REVIEW_TYPES: ReviewType[] = [
  'prior_auth', 'medical_necessity', 'concurrent', 'retrospective',
  'peer_to_peer', 'appeal', 'second_level_review',
];

const VALID_FACILITY_TYPES: FacilityType[] = ['inpatient', 'outpatient', 'asc', 'office', 'home'];

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateExternalCase(body: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  // Required fields
  if (!body.patient_name || typeof body.patient_name !== 'string' || !body.patient_name.trim()) {
    errors.push('patient_name is required');
  }
  if (!body.patient_dob || typeof body.patient_dob !== 'string' || !body.patient_dob.trim()) {
    errors.push('patient_dob is required');
  }
  if (!body.requesting_provider || typeof body.requesting_provider !== 'string' || !body.requesting_provider.trim()) {
    errors.push('requesting_provider is required');
  }
  if (!body.procedure_codes || (Array.isArray(body.procedure_codes) && body.procedure_codes.length === 0)) {
    errors.push('procedure_codes is required (non-empty array)');
  }
  if (!body.diagnosis_codes || (Array.isArray(body.diagnosis_codes) && body.diagnosis_codes.length === 0)) {
    errors.push('diagnosis_codes is required (non-empty array)');
  }

  // Enum validation
  if (body.service_category && !VALID_SERVICE_CATEGORIES.includes(body.service_category as ServiceCategory)) {
    errors.push(`Invalid service_category "${body.service_category}". Valid values: ${VALID_SERVICE_CATEGORIES.join(', ')}`);
  }
  if (body.priority && !VALID_PRIORITIES.includes(body.priority as CasePriority)) {
    errors.push(`Invalid priority "${body.priority}". Valid values: ${VALID_PRIORITIES.join(', ')}`);
  }
  if (body.review_type && !VALID_REVIEW_TYPES.includes(body.review_type as ReviewType)) {
    errors.push(`Invalid review_type "${body.review_type}". Valid values: ${VALID_REVIEW_TYPES.join(', ')}`);
  }
  if (body.facility_type && !VALID_FACILITY_TYPES.includes(body.facility_type as FacilityType)) {
    errors.push(`Invalid facility_type "${body.facility_type}". Valid values: ${VALID_FACILITY_TYPES.join(', ')}`);
  }

  // Type-check arrays
  if (body.procedure_codes && !Array.isArray(body.procedure_codes)) {
    errors.push('procedure_codes must be an array of strings');
  }
  if (body.diagnosis_codes && !Array.isArray(body.diagnosis_codes)) {
    errors.push('diagnosis_codes must be an array of strings');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Estimate turnaround based on priority.
 */
function getEstimatedTurnaround(priority: string): string {
  switch (priority) {
    case 'expedited':
      return '4-8 hours';
    case 'urgent':
      return '12-24 hours';
    default:
      return '24-48 hours';
  }
}

// ---------------------------------------------------------------------------
// POST /api/external/submit
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // ----------------------------------------------------------------
    // API key authentication
    // ----------------------------------------------------------------
    const apiKey = request.headers.get('x-api-key');
    const expectedKey = process.env.VANTAHG_API_KEY;

    // In demo mode without an API key configured, skip auth
    if (!isDemoMode() || expectedKey) {
      if (!apiKey) {
        return NextResponse.json(
          { error: 'Missing x-api-key header' },
          { status: 401 }
        );
      }
      if (!expectedKey) {
        return NextResponse.json(
          { error: 'Server misconfiguration: VANTAHG_API_KEY not set' },
          { status: 500 }
        );
      }
      if (apiKey !== expectedKey) {
        return NextResponse.json(
          { error: 'Invalid API key' },
          { status: 403 }
        );
      }
    }

    // ----------------------------------------------------------------
    // Parse and validate request body
    // ----------------------------------------------------------------
    const body = await request.json();
    const validation = validateExternalCase(body);

    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 }
      );
    }

    // Apply defaults
    const serviceCategory = body.service_category || 'other';
    const priority = body.priority || 'standard';
    const reviewType = body.review_type || 'prior_auth';

    // ----------------------------------------------------------------
    // Demo mode: return mock response
    // ----------------------------------------------------------------
    if (isDemoMode()) {
      const categoryPrefix = serviceCategory.toUpperCase().replace(/\s+/g, '-');
      const mockNum = Math.floor(1000 + Math.random() * 9000);
      const caseNumber = `VHG-${categoryPrefix}-${mockNum}`;
      const caseId = `demo-ext-${Date.now()}`;

      console.log(`[DEMO AUDIT] external_case_created | case_number=${caseNumber} | patient=${body.patient_name} | source=external_api`);

      return NextResponse.json({
        case_number: caseNumber,
        case_id: caseId,
        status: 'intake',
        estimated_turnaround: getEstimatedTurnaround(priority),
        created_at: new Date().toISOString(),
      }, { status: 201 });
    }

    // ----------------------------------------------------------------
    // Production mode: create case in Supabase
    // ----------------------------------------------------------------
    const supabase = getServiceClient();

    // Generate case_number
    const categoryPrefix = serviceCategory.toUpperCase().replace(/\s+/g, '-');
    const prefix = `VHG-${categoryPrefix}`;

    const { count, error: countError } = await supabase
      .from('cases')
      .select('*', { count: 'exact', head: true })
      .ilike('case_number', `${prefix}-%`);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    const nextNumber = ((count ?? 0) + 1).toString().padStart(4, '0');
    const caseNumber = `${prefix}-${nextNumber}`;

    const caseData = {
      ...body,
      case_number: caseNumber,
      service_category: serviceCategory,
      priority,
      review_type: reviewType,
      status: 'intake',
    };

    const { data, error } = await supabase
      .from('cases')
      .insert(caseData)
      .select('*, reviewer:reviewers(*), client:clients(*)')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit log
    await logAuditEvent(data.id, 'case_created', 'external_api', {
      case_number: caseNumber,
      service_category: serviceCategory,
      source: 'external_api',
      api_key_prefix: apiKey ? `${apiKey.substring(0, 8)}...` : 'unknown',
    });

    // Background brief generation (non-blocking)
    generateBriefForCase(data).then(async (brief) => {
      if (brief) {
        await supabase
          .from('cases')
          .update({
            ai_brief: brief,
            ai_brief_generated_at: new Date().toISOString(),
            status: 'brief_ready',
          })
          .eq('id', data.id);

        await logAuditEvent(data.id, 'brief_generated', 'system', {
          generated_automatically: true,
          source: 'external_api',
        });
      }
    }).catch((err) => {
      console.error(`Background brief generation failed for case ${caseNumber}:`, err);
    });

    return NextResponse.json({
      case_number: caseNumber,
      case_id: data.id,
      status: 'intake',
      estimated_turnaround: getEstimatedTurnaround(priority),
      created_at: data.created_at,
    }, { status: 201 });
  } catch (err) {
    console.error('Error in external case submission:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
