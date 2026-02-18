import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { generateBriefForCase } from '@/lib/generate-brief';
import { isDemoMode } from '@/lib/demo-mode';
import type { CaseFormData, ServiceCategory, CasePriority, ReviewType, FacilityType } from '@/lib/types';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Validation helpers
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

interface RowValidation {
  valid: boolean;
  errors: string[];
}

function validateCaseRow(row: Record<string, unknown>, index: number): RowValidation {
  const errors: string[] = [];

  // Required fields
  if (!row.patient_name || typeof row.patient_name !== 'string' || !row.patient_name.trim()) {
    errors.push(`Row ${index + 1}: patient_name is required`);
  }
  if (!row.patient_dob || typeof row.patient_dob !== 'string' || !row.patient_dob.trim()) {
    errors.push(`Row ${index + 1}: patient_dob is required`);
  }
  if (!row.requesting_provider || typeof row.requesting_provider !== 'string' || !row.requesting_provider.trim()) {
    errors.push(`Row ${index + 1}: requesting_provider is required`);
  }
  if (!row.procedure_codes) {
    errors.push(`Row ${index + 1}: procedure_codes is required`);
  }
  if (!row.diagnosis_codes) {
    errors.push(`Row ${index + 1}: diagnosis_codes is required`);
  }

  // Enum validation
  if (row.service_category && !VALID_SERVICE_CATEGORIES.includes(row.service_category as ServiceCategory)) {
    errors.push(`Row ${index + 1}: invalid service_category "${row.service_category}"`);
  }
  if (row.priority && !VALID_PRIORITIES.includes(row.priority as CasePriority)) {
    errors.push(`Row ${index + 1}: invalid priority "${row.priority}"`);
  }
  if (row.review_type && !VALID_REVIEW_TYPES.includes(row.review_type as ReviewType)) {
    errors.push(`Row ${index + 1}: invalid review_type "${row.review_type}"`);
  }
  if (row.facility_type && !VALID_FACILITY_TYPES.includes(row.facility_type as FacilityType)) {
    errors.push(`Row ${index + 1}: invalid facility_type "${row.facility_type}"`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Normalise a row from the request body into a CaseFormData-compatible shape.
 * procedure_codes and diagnosis_codes may arrive as pipe-separated strings
 * (from CSV) or as arrays (from JSON).
 */
function normaliseCaseRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalised = { ...row };

  // Normalise array fields that may arrive as pipe-separated strings
  if (typeof normalised.procedure_codes === 'string') {
    normalised.procedure_codes = (normalised.procedure_codes as string)
      .split('|')
      .map((s: string) => s.trim())
      .filter(Boolean);
  }
  if (typeof normalised.diagnosis_codes === 'string') {
    normalised.diagnosis_codes = (normalised.diagnosis_codes as string)
      .split('|')
      .map((s: string) => s.trim())
      .filter(Boolean);
  }

  // Default values
  if (!normalised.service_category) normalised.service_category = 'other';
  if (!normalised.priority) normalised.priority = 'standard';
  if (!normalised.review_type) normalised.review_type = 'prior_auth';

  return normalised;
}

// ---------------------------------------------------------------------------
// POST /api/cases/batch
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.cases || !Array.isArray(body.cases) || body.cases.length === 0) {
      return NextResponse.json(
        { error: 'Request body must include a non-empty "cases" array' },
        { status: 400 }
      );
    }

    if (body.cases.length > 500) {
      return NextResponse.json(
        { error: 'Batch size cannot exceed 500 cases' },
        { status: 400 }
      );
    }

    const results: { created: number; failed: number; errors: { row: number; error: string }[]; case_numbers: string[] } = {
      created: 0,
      failed: 0,
      errors: [],
      case_numbers: [],
    };

    // ------------------------------------------------------------------
    // Demo mode: validate, generate mock case numbers, log to console
    // ------------------------------------------------------------------
    if (isDemoMode()) {
      for (let i = 0; i < body.cases.length; i++) {
        const raw = normaliseCaseRow(body.cases[i]);
        const validation = validateCaseRow(raw, i);

        if (!validation.valid) {
          results.failed++;
          validation.errors.forEach((err) => {
            results.errors.push({ row: i + 1, error: err });
          });
          continue;
        }

        const categoryPrefix = ((raw.service_category as string) || 'OTHER').toUpperCase().replace(/\s+/g, '-');
        const caseNumber = `VHG-${categoryPrefix}-${(i + 1).toString().padStart(4, '0')}`;
        results.case_numbers.push(caseNumber);
        results.created++;

        // Audit log (console in demo mode)
        console.log(`[DEMO AUDIT] case_created | case_number=${caseNumber} | patient=${raw.patient_name}`);
      }

      return NextResponse.json(results, { status: 201 });
    }

    // ------------------------------------------------------------------
    // Production mode: insert into Supabase one-by-one
    // ------------------------------------------------------------------
    const supabase = getServiceClient();

    for (let i = 0; i < body.cases.length; i++) {
      const raw = normaliseCaseRow(body.cases[i]);
      const validation = validateCaseRow(raw, i);

      if (!validation.valid) {
        results.failed++;
        validation.errors.forEach((err) => {
          results.errors.push({ row: i + 1, error: err });
        });
        continue;
      }

      try {
        // Generate case_number
        const categoryPrefix = ((raw.service_category as string) || 'OTHER').toUpperCase().replace(/\s+/g, '-');
        const prefix = `VHG-${categoryPrefix}`;

        const { count, error: countError } = await supabase
          .from('cases')
          .select('*', { count: 'exact', head: true })
          .ilike('case_number', `${prefix}-%`);

        if (countError) {
          results.failed++;
          results.errors.push({ row: i + 1, error: countError.message });
          continue;
        }

        const nextNumber = ((count ?? 0) + 1).toString().padStart(4, '0');
        const caseNumber = `${prefix}-${nextNumber}`;

        const caseData = {
          ...raw,
          case_number: caseNumber,
          status: 'intake',
        };

        const { data, error } = await supabase
          .from('cases')
          .insert(caseData)
          .select('*, reviewer:reviewers(*), client:clients(*)')
          .single();

        if (error) {
          results.failed++;
          results.errors.push({ row: i + 1, error: error.message });
          continue;
        }

        // Audit log
        await logAuditEvent(data.id, 'case_created', 'batch_upload', {
          case_number: caseNumber,
          service_category: raw.service_category,
          batch_upload: true,
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
              batch_upload: true,
            });
          }
        }).catch((err) => {
          console.error(`Background brief generation failed for case ${caseNumber}:`, err);
        });

        results.case_numbers.push(caseNumber);
        results.created++;
      } catch (rowErr) {
        results.failed++;
        results.errors.push({
          row: i + 1,
          error: rowErr instanceof Error ? rowErr.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json(results, { status: 201 });
  } catch (err) {
    console.error('Error in batch case creation:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
