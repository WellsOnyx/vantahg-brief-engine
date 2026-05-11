import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logAuditEvent } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { getActiveTemplate } from '@/lib/contracts/registry';
import { resolveTemplate } from '@/lib/contracts/resolver';
import { renderContractPdf } from '@/lib/contracts/renderer';
import { ensureTemplateInDb } from '@/lib/contracts/ensure-template';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/signups/[id]/generate-contract
 *
 * Renders the active contract template (currently 'msa-with-baa') with
 * values pulled from the signup_request row + any admin-entered
 * overrides, produces a PDF, stores it in the signup-contracts bucket,
 * inserts a row into `contracts`, and links the rendered file back to
 * the signup_request (so the existing ContractPanel surfaces it the
 * same way as a manual upload).
 *
 * Admin-only. Refuses to render when required variables are missing —
 * the response includes the list of missing keys so the admin can fix
 * the signup row or pass them as overrides.
 *
 * Body (optional):
 *   {
 *     template_slug?: string;          // defaults to 'msa-with-baa'
 *     overrides?: Record<string, string>;
 *   }
 */

const BodySchema = z.object({
  template_slug: z.string().optional(),
  overrides: z.record(z.string(), z.string()).optional(),
}).optional().default({});

const BUCKET = 'signup-contracts';

function buildStoragePath(signupId: string, templateSlug: string): string {
  const safeId = signupId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const suffix = randomBytes(4).toString('hex');
  const ts = Date.now();
  return `${safeId}/generated/${templateSlug}-${ts}-${suffix}.pdf`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRole(request, ['admin']);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 20 });
    if (rateLimited) return rateLimited;

    const { id } = await params;

    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        demo: true,
        message: 'Contract generated (demo mode — no PDF persisted).',
        rendered_pdf_path: `demo/${id}/generated.pdf`,
      });
    }

    const raw = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const slug = parsed.data.template_slug ?? 'msa-with-baa';
    const overrides = parsed.data.overrides ?? {};

    const template = getActiveTemplate(slug);
    if (!template) {
      return NextResponse.json(
        { error: `Unknown template slug "${slug}".` },
        { status: 400 },
      );
    }

    const supabase = getServiceClient();

    // Load the signup_request row — needed both for the variable source
    // and to confirm the row still exists before we burn a storage write.
    const { data: signup, error: readErr } = await supabase
      .from('signup_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (readErr) {
      if (readErr.code === 'PGRST116') {
        return NextResponse.json({ error: 'Signup not found' }, { status: 404 });
      }
      return apiError(readErr, {
        operation: 'generate_contract_read_signup',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Resolve variables.
    const resolved = resolveTemplate(template, signup, { overrides });
    if (resolved.unresolvedKeys.length > 0) {
      return NextResponse.json(
        {
          error: 'Cannot render — required variables are missing.',
          missing: resolved.unresolvedKeys,
          hint:
            'Fill these on the signup row (or pass them in the overrides body) and retry.',
        },
        { status: 400 },
      );
    }

    // Render PDF.
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = renderContractPdf(resolved.resolvedMd, {
        headerLabel: `${template.title}`,
        footerLabel: `${template.slug} ${template.version} — confidential`,
      });
    } catch (err) {
      return apiError(err, {
        operation: 'generate_contract_render',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Persist into storage.
    const storagePath = buildStoragePath(id, template.slug);
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });
    if (uploadErr) {
      return apiError(uploadErr, {
        operation: 'generate_contract_upload',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Make sure the template row exists in the DB so the contract row's
    // FK is satisfied. Idempotent on (slug, version).
    let templateId: string;
    try {
      const { id: tid } = await ensureTemplateInDb(supabase, template);
      templateId = tid;
    } catch (err) {
      // Storage write already succeeded; remove the orphan file before
      // surfacing the error.
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => undefined);
      return apiError(err, {
        operation: 'generate_contract_ensure_template',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Insert the contract row.
    const now = new Date().toISOString();
    const { data: contractRow, error: insertErr } = await supabase
      .from('contracts')
      .insert({
        template_id: templateId,
        signup_id: id,
        status: 'generated',
        variable_values: resolved.values,
        rendered_pdf_path: storagePath,
        generated_at: now,
        created_by: authResult.user.email,
      })
      .select('*')
      .single();

    if (insertErr || !contractRow) {
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => undefined);
      await logAuditEvent(
        null,
        'security:contract_insert_failed_after_render',
        authResult.user.email,
        {
          signup_id: id,
          template_slug: template.slug,
          attempted_storage_path: storagePath,
          error_code: insertErr?.code ?? null,
        },
        getRequestContext(request),
      );
      return apiError(insertErr ?? new Error('Contract insert returned no row'), {
        operation: 'generate_contract_insert',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Mirror onto signup_requests so the existing ContractPanel surfaces
    // the generated PDF the same way it surfaces a manual upload. If
    // there was already a manually-uploaded contract, we leave the
    // original in place and surface the new one — the contracts table
    // is the source of truth for history.
    const { data: updatedSignup, error: signupUpdateErr } = await supabase
      .from('signup_requests')
      .update({
        contract_storage_path: storagePath,
        contract_uploaded_at: now,
        contract_uploaded_by: authResult.user.email,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (signupUpdateErr) {
      // The contract row exists but the signup row didn't update. Not
      // fatal — admins can still find the contract via /admin/contracts
      // (when that lands) or by direct query. Log loudly.
      await logAuditEvent(
        null,
        'security:contract_signup_mirror_failed',
        authResult.user.email,
        {
          signup_id: id,
          contract_id: contractRow.id,
          error_code: signupUpdateErr.code ?? null,
        },
        getRequestContext(request),
      );
    }

    // Audit the happy-path event. Do NOT log raw variable_values — they
    // contain TPA legal name, signer email, etc. Log only the keys that
    // were resolved so audit consumers can verify completeness without
    // leaking business contact info.
    await logAuditEvent(
      null,
      'contract_generated',
      authResult.user.email,
      {
        signup_id: id,
        contract_id: contractRow.id,
        template_slug: template.slug,
        template_version: template.version,
        resolved_keys: Object.keys(resolved.values),
        rendered_bytes: pdfBuffer.byteLength,
      },
      getRequestContext(request),
    );

    return NextResponse.json({
      success: true,
      contract: contractRow,
      signup: updatedSignup ?? signup,
      rendered_pdf_path: storagePath,
    });
  } catch (err) {
    return apiError(err, {
      operation: 'generate_contract',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
