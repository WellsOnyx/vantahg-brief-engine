import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { SYSTEM_PROMPT, TOOL_SPECS, PROMPT_VERSION } from '@/lib/firstmover/agent-prompt';

export const dynamic = 'force-dynamic';

/**
 * GET /api/firstmover/agent/workflow-scaffold
 *
 * Returns a paste-ready Gravity Rails workflow definition. The admin
 * downloads this JSON (or copy-pastes it from the admin page) and
 * imports it into their GR workspace. All tool calls are pre-bound to
 * our endpoints with the right auth header.
 *
 * Single source of truth: any change here propagates next time the
 * admin re-imports.
 */
export async function GET(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
  if (rateLimited) return rateLimited;

  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('host') || 'localhost:3000';
  const baseUrl = `${protocol}://${host}`;

  const scaffold = {
    name: `VantaUM First Mover Concierge — ${PROMPT_VERSION}`,
    description:
      'AI overflow agent that takes prior-auth intake calls when human concierges are unavailable. Same gates as a human concierge: required-fields per service type, eligibility green-light, audit trail.',
    version: PROMPT_VERSION,
    agent: {
      model: 'claude-sonnet-4-6',
      system_prompt: SYSTEM_PROMPT,
      tools: TOOL_SPECS.map((t) => ({
        ...t,
        // Bind each tool to its HTTP endpoint and auth
        execute: {
          method: 'POST',
          url: `${baseUrl}${endpointFor(t.name)}`,
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ${VANTAHG_API_KEY}',
          },
        },
      })),
    },
    channels: ['phone-voice', 'phone-sms', 'web-chat', 'email'],
    completion_webhook: {
      url: `${baseUrl}/api/firstmover/agent/webhook`,
      events: ['conversation.completed', 'conversation.escalated', 'conversation.abandoned'],
      signature_header: 'X-GR-Signature',
      signature_format: 'sha256=<hex>',
      secret_env: 'GRAVITY_RAIL_WEBHOOK_SECRET',
    },
    notes: [
      'Set VANTAHG_API_KEY as a secret in your GR workspace; it authorizes the agent to call our endpoints.',
      'Set the webhook secret to the same value as GRAVITY_RAIL_WEBHOOK_SECRET in our env.',
      'The agent enforces the required-fields gate before calling submit_intake; we re-enforce server-side.',
      'On eligibility=red, the agent must call escalate_to_human — never proceed.',
    ],
  };

  // If the request asks for download, set a content-disposition header
  const url = new URL(request.url);
  const download = url.searchParams.get('download') === '1';
  const json = JSON.stringify(scaffold, null, 2);

  if (download) {
    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="vantaum-firstmover-gr-workflow-${PROMPT_VERSION}.json"`,
      },
    });
  }

  return NextResponse.json(scaffold);
}

function endpointFor(toolName: string): string {
  switch (toolName) {
    case 'check_eligibility':
      return '/api/firstmover/eligibility';
    case 'submit_intake':
      return '/api/firstmover/agent/intake';
    case 'escalate_to_human':
      return '/api/firstmover/agent/escalate';
    default:
      return '/api/firstmover/agent';
  }
}
