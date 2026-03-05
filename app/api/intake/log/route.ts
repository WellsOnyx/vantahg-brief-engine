import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';

export const dynamic = 'force-dynamic';

/**
 * GET /api/intake/log
 *
 * Returns the intake log for compliance reporting.
 * Admin-only access — shows all intake events across all channels.
 * No raw PHI — patient names are hashed.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['admin']);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 100 });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const channel = searchParams.get('channel');
    const status = searchParams.get('status');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    if (isDemoMode()) {
      const demoLog = [
        {
          id: 'intake-log-001',
          created_at: '2026-02-18T08:30:00Z',
          channel: 'portal',
          source_identifier: null,
          authorization_number: 'AUTH-2026-000001',
          case_id: 'case-001-mri-lumbar',
          patient_name_hash: 'PHI-A7F3B2',
          status: 'case_created',
          rejection_reason: null,
          processed_at: '2026-02-18T08:30:15Z',
          processed_by: 'system',
        },
        {
          id: 'intake-log-002',
          created_at: '2026-02-19T10:15:00Z',
          channel: 'efax',
          source_identifier: '+14155551234',
          authorization_number: 'AUTH-2026-000002',
          case_id: 'case-002-knee-replacement',
          patient_name_hash: 'PHI-B4E1C9',
          status: 'case_created',
          rejection_reason: null,
          processed_at: '2026-02-19T10:16:32Z',
          processed_by: 'system',
        },
        {
          id: 'intake-log-003',
          created_at: '2026-02-19T14:45:00Z',
          channel: 'api',
          source_identifier: 'key:vhg_live...',
          authorization_number: 'AUTH-2026-000003',
          case_id: 'case-003-cardiac-cath',
          patient_name_hash: 'PHI-C2D8A1',
          status: 'case_created',
          rejection_reason: null,
          processed_at: '2026-02-19T14:45:02Z',
          processed_by: 'system',
        },
        {
          id: 'intake-log-004',
          created_at: '2026-02-20T09:00:00Z',
          channel: 'efax',
          source_identifier: '+13105559876',
          authorization_number: 'AUTH-2026-000004',
          case_id: null,
          patient_name_hash: 'PHI-D9F4E3',
          status: 'rejected',
          rejection_reason: 'Duplicate submission — case already exists',
          processed_at: '2026-02-20T09:01:00Z',
          processed_by: 'system',
        },
        {
          id: 'intake-log-005',
          created_at: '2026-02-21T11:30:00Z',
          channel: 'batch_upload',
          source_identifier: null,
          authorization_number: 'AUTH-2026-000005',
          case_id: 'case-004-spinal-fusion',
          patient_name_hash: 'PHI-E5A7B6',
          status: 'case_created',
          rejection_reason: null,
          processed_at: '2026-02-21T11:30:45Z',
          processed_by: 'admin',
        },
        {
          id: 'intake-log-006',
          created_at: '2026-02-22T07:45:00Z',
          channel: 'email',
          source_identifier: 'provider@medicaldocs.com',
          authorization_number: 'AUTH-2026-000006',
          case_id: null,
          patient_name_hash: 'PHI-F1C3D8',
          status: 'processing',
          rejection_reason: null,
          processed_at: null,
          processed_by: null,
        },
        {
          id: 'intake-log-007',
          created_at: '2026-02-22T16:20:00Z',
          channel: 'phone',
          source_identifier: '+18005559999',
          authorization_number: 'AUTH-2026-000007',
          case_id: 'case-005-psychotherapy',
          patient_name_hash: 'PHI-G8H2J4',
          status: 'case_created',
          rejection_reason: null,
          processed_at: '2026-02-22T16:25:00Z',
          processed_by: 'admin_staff',
        },
      ];

      let filtered = demoLog;
      if (channel) filtered = filtered.filter((l) => l.channel === channel);
      if (status) filtered = filtered.filter((l) => l.status === status);
      if (dateFrom) {
        const from = new Date(dateFrom).getTime();
        filtered = filtered.filter((l) => new Date(l.created_at).getTime() >= from);
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        filtered = filtered.filter((l) => new Date(l.created_at).getTime() <= to.getTime());
      }

      return NextResponse.json({
        entries: filtered,
        total: filtered.length,
        summary: {
          by_channel: {
            portal: demoLog.filter((l) => l.channel === 'portal').length,
            efax: demoLog.filter((l) => l.channel === 'efax').length,
            api: demoLog.filter((l) => l.channel === 'api').length,
            email: demoLog.filter((l) => l.channel === 'email').length,
            phone: demoLog.filter((l) => l.channel === 'phone').length,
            batch_upload: demoLog.filter((l) => l.channel === 'batch_upload').length,
          },
          by_status: {
            received: demoLog.filter((l) => l.status === 'received').length,
            processing: demoLog.filter((l) => l.status === 'processing').length,
            case_created: demoLog.filter((l) => l.status === 'case_created').length,
            rejected: demoLog.filter((l) => l.status === 'rejected').length,
            duplicate: demoLog.filter((l) => l.status === 'duplicate').length,
          },
        },
      });
    }

    const supabase = getServiceClient();
    let query = supabase
      .from('intake_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (channel) query = query.eq('channel', channel);
    if (status) query = query.eq('status', status);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59.999Z`);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Build summary
    const entries = data || [];
    const channels = ['portal', 'efax', 'api', 'email', 'phone', 'batch_upload'];
    const statuses = ['received', 'processing', 'case_created', 'rejected', 'duplicate'];

    const byChannel: Record<string, number> = {};
    channels.forEach((ch) => {
      byChannel[ch] = entries.filter((e) => e.channel === ch).length;
    });

    const byStatus: Record<string, number> = {};
    statuses.forEach((st) => {
      byStatus[st] = entries.filter((e) => e.status === st).length;
    });

    return NextResponse.json({
      entries,
      total: entries.length,
      summary: { by_channel: byChannel, by_status: byStatus },
    });
  } catch (err) {
    console.error('Error fetching intake log:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
