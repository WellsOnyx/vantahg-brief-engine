import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { finalizeIntakeCase } from '@/lib/intake/finalize-case';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';

/**
 * POST /api/gr/webhook
 *
 * Inbound from Gravity Rail when an intake chat (web, sms, voice) reaches handoff state.
 * We turn it into a VantaUM case using the shared chassis.
 *
 * Security: HMAC or bearer if GR supports; for now rate-limited + optional secret.
 *
 * Expected payload shape (confirm with GR team):
 * {
 *   event: "chat.handoff" | "chat.completed",
 *   chat_id: number,
 *   workspace_id: string,
 *   workflow_id?: number,
 *   member?: { email, name },
 *   transcript?: string | array,
 *   field_values?: Record<string, any>,  // structured from GR assistant
 *   from_number?: string,
 *   title?: string
 * }
 *
 * The concierge's staff row should have the gr_workspace_id matching the event.
 */

export async function POST(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.json({ success: true, demo: true, message: 'GR webhook accepted (demo)' });
  }

  const rateLimited = await applyRateLimit(request, { maxRequests: 120 });
  if (rateLimited) return rateLimited;

  try {
    const payload = await request.json();

    const workspaceId = payload.workspace_id || payload.wid;
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspace_id required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Find the staff member who owns this GR workspace
    const { data: staff } = await supabase
      .from('staff')
      .select('id, name, email')
      .eq('gr_workspace_id', workspaceId)
      .single();

    const conciergeId = staff?.id || null;

    // Build intake payload similar to other channels
    const intakeData = {
      source: 'gravity_rail',
      chat_id: payload.chat_id,
      workspace_id: workspaceId,
      transcript: payload.transcript || payload.field_values?.transcript,
      field_values: payload.field_values,
      from: payload.from_number || payload.member?.email,
      title: payload.title,
    };

    // Build minimal case data from GR payload / transcript
    const parsed = parseEmailPayload(intakeData.transcript || JSON.stringify(intakeData.field_values || {}));

    // Create the case row (simplified; real would use the full intake path)
    const { data: newCase, error: createErr } = await supabase
      .from('cases')
      .insert({
        case_number: `GR-${payload.chat_id || Date.now()}`,
        status: 'intake',
        intake_channel: 'phone',
        patient_name: parsed.patient_name || intakeData.from || 'GR Member',
        patient_dob: parsed.patient_dob || null,
        patient_member_id: parsed.patient_member_id || null,
        procedure_codes: parsed.procedure_codes || [],
        diagnosis_codes: parsed.diagnosis_codes || [],
        procedure_description: parsed.procedure_description || intakeData.title || 'Gravity Rail intake',
        clinical_question: parsed.clinical_question || null,
        requesting_provider: parsed.requesting_provider || null,
        assigned_concierge_id: conciergeId,
        // add other fields from parsed
      })
      .select('id')
      .single();

    if (createErr || !newCase) {
      throw new Error('Failed to create case from GR webhook');
    }

    const caseId = newCase.id;

    // Run shared chassis (brief, fact check, etc.)
    await finalizeIntakeCase(caseId, { channel: 'phone', actor: 'gravity_rail' });

    await logAuditEvent(caseId, 'gravity_rail_intake_handoff', 'system', {
      gr_chat_id: payload.chat_id,
      gr_workspace_id: workspaceId,
      concierge_id: conciergeId,
    });

    return NextResponse.json({ success: true, case_id: caseId });
  } catch (err) {
    console.error('GR webhook error', err);
    return NextResponse.json({ error: 'webhook processing failed' }, { status: 500 });
  }
}
