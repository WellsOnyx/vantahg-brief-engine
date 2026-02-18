import { NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/demo-mode';

export const dynamic = 'force-dynamic';

const startTime = Date.now();

/**
 * GET /api/health
 *
 * Lightweight health-check endpoint for uptime monitoring and SOC 2
 * availability controls (CC7.1).  Returns current system status without
 * exposing any PHI or internal implementation details.
 */
export async function GET() {
  const now = Date.now();
  const uptimeMs = now - startTime;
  const uptimeSeconds = Math.floor(uptimeMs / 1000);

  let databaseStatus: 'connected' | 'demo_mode' | 'error' = 'demo_mode';

  if (!isDemoMode()) {
    try {
      // Dynamic import to avoid issues when Supabase env vars are absent
      const { getServiceClient } = await import('@/lib/supabase');
      const supabase = getServiceClient();

      // A minimal query to verify connectivity
      const { error } = await supabase
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .limit(1);

      databaseStatus = error ? 'error' : 'connected';
    } catch {
      databaseStatus = 'error';
    }
  }

  return NextResponse.json({
    status: 'healthy',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: databaseStatus,
    uptime: uptimeSeconds,
  });
}
