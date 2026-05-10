import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/rate-limit-middleware';

export const dynamic = 'force-dynamic';

/**
 * GET /api/firstmover/agent/test-connection
 *
 * Pings the Gravity Rails API with the configured credentials and
 * reports back whether everything is wired correctly. The admin UI
 * uses this for the green/red status dots.
 */
export async function GET(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
  if (rateLimited) return rateLimited;

  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];

  const apiKey = process.env.GRAVITY_RAIL_API_KEY;
  const workspaceId = process.env.GRAVITY_RAIL_WORKSPACE_ID;
  const webhookSecret = process.env.GRAVITY_RAIL_WEBHOOK_SECRET;
  const ourApiKey = process.env.VANTAHG_API_KEY;

  checks.push({
    name: 'GRAVITY_RAIL_API_KEY',
    ok: !!apiKey,
    detail: apiKey ? 'Set' : 'Not set — agent cannot authenticate to GR.',
  });
  checks.push({
    name: 'GRAVITY_RAIL_WORKSPACE_ID',
    ok: !!workspaceId,
    detail: workspaceId ? `Workspace: ${workspaceId}` : 'Not set — required to scope API calls.',
  });
  checks.push({
    name: 'GRAVITY_RAIL_WEBHOOK_SECRET',
    ok: !!webhookSecret,
    detail: webhookSecret
      ? 'Set — webhook signatures will be verified.'
      : 'Not set — webhooks will accept unsigned payloads (DEV ONLY).',
  });
  checks.push({
    name: 'VANTAHG_API_KEY',
    ok: !!ourApiKey,
    detail: ourApiKey
      ? 'Set — GR agent can authenticate to our tool endpoints.'
      : 'Not set — agent tool calls will be rejected.',
  });

  // Live ping to GR API (only if credentials are present)
  let gr_reachable = false;
  let gr_workspace_ok = false;
  let gr_error: string | null = null;
  if (apiKey && workspaceId) {
    try {
      const res = await fetch(`https://api.gravityrail.com/api/v2/workspaces/${workspaceId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        // Hard 5s budget so the admin UI doesn't hang
        signal: AbortSignal.timeout(5000),
      });
      gr_reachable = true;
      if (res.ok) {
        gr_workspace_ok = true;
      } else {
        gr_error = `Workspace lookup returned ${res.status}`;
      }
    } catch (err) {
      gr_error = err instanceof Error ? err.message : 'Network error';
    }
  }

  checks.push({
    name: 'GR API reachable',
    ok: gr_reachable,
    detail: gr_reachable ? 'OK' : gr_error || 'Skipped (credentials missing).',
  });
  checks.push({
    name: 'GR workspace accessible',
    ok: gr_workspace_ok,
    detail: gr_workspace_ok ? 'Authenticated.' : gr_error || 'Skipped.',
  });

  const allOk = checks.every((c) => c.ok);

  // Webhook URL — relative to host
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('host') || 'localhost:3000';
  const webhook_url = `${protocol}://${host}/api/firstmover/agent/webhook`;

  return NextResponse.json({
    ready: allOk,
    checks,
    webhook_url,
    instructions: [
      `1. In Gravity Rails, set the webhook URL to: ${webhook_url}`,
      '2. Set the webhook secret to the same value as GRAVITY_RAIL_WEBHOOK_SECRET in your env.',
      '3. Configure the workflow agent prompt + tools using /api/firstmover/agent/config.',
      '4. Bind tool calls with header: Authorization: Bearer ${VANTAHG_API_KEY}.',
      '5. Re-run this endpoint to confirm all checks pass.',
    ],
  });
}
