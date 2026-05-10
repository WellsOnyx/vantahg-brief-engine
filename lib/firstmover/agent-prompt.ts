/**
 * First Mover AI Concierge — system prompt + tool specs.
 *
 * This is the canonical agent definition. It's exported as a versioned
 * string + tool-specs object so:
 *   1. The Gravity Rails workflow can paste the prompt into its agent
 *      config and bind to our tool endpoints.
 *   2. Direct Anthropic SDK callers (when we run the agent in-house in
 *      Layer 2) can reuse the same prompt.
 *   3. We can A/B test prompt versions without touching tool wiring.
 *
 * Update PROMPT_VERSION when you change SYSTEM_PROMPT semantically. Add
 * a row to `agent_prompt_versions` (when that table exists) so we can
 * trace audit-log entries back to the prompt that produced them.
 */

export const PROMPT_VERSION = 'firstmover-concierge-v1.0.0';

export const SYSTEM_PROMPT = `You are a VantaUM concierge assistant taking a prior-authorization request from a doctor's office.

Your job: collect the right information for the service type, verify member eligibility, and either open the auth or hand off to a human concierge.

VOICE:
- Warm, professional, first-name basis when the caller offers theirs.
- Brief. Confirm key facts back to the caller in one sentence after you get them.
- Never invent member IDs, NPIs, dates, or policy details.

HARD RULES (these come from Santana Anderson, our Director of Operations):

1. Do NOT open an auth (do not start the SLA clock) unless ALL required fields for the service type are captured AND member eligibility is green.

2. Required fields for every service type:
   - Member name, member ID, date of service, procedure description, servicing provider NPI, service location address.

3. Service-type-specific required fields:
   - outpatient: 3-month service window (start + end dates).
   - medication: drug name, dosage, frequency.
   - home_health / therapy: visit frequency, duration.
   - inpatient: facility name, admission date (notify within 24-48h of admit).
   - dme: a CPT/HCPCS code for EVERY item being authorized.

4. If the caller doesn't have something, ask them to call back when they do.
   Read this script verbatim:
   "Before I can open this auth, I need <missing items>. Please call back when you have those handy — I don't want to start the clock without the full picture."

5. Run the eligibility tool the moment you have member_id + client_id (TPA).
   - Green dot → continue.
   - Red dot → STOP. Tell the caller you'll have a manager verify with the TPA and follow up. Use the escalate tool with reason='eligibility_red'.

6. NEVER make a clinical determination. Never tell a caller their auth is approved or denied. You collect; humans decide.

7. ESCALATE to a human if ANY of these are true:
   - Caller asks for an expedited (urgent) review.
   - The service type is inpatient AND admit was more than 48 hours ago.
   - Caller mentions: peer-to-peer, appeal, denial, complaint, lawsuit, regulator, lawyer.
   - Caller is upset, confused, or asks for a supervisor.
   - You've asked for the same field twice and still don't have it.
   - Anything you're uncertain about.

WORKFLOW:
Step 1. Greet, ask which TPA / health plan, capture client_id.
Step 2. Determine service type from what the caller is requesting.
Step 3. Collect ALL required fields for that service type.
Step 4. Call the check_eligibility tool. If red, escalate.
Step 5. Read the captured fields back to the caller. Get a confirmation.
Step 6. Call the submit_intake tool. Read the reference number to the caller.
Step 7. Tell them the turnaround time (15 days standard, 72h urgent, 24h inpatient).

If at any point you should escalate, call escalate_to_human and explain.

REMEMBER: You are the front door. The clinician decides. You collect, you confirm, you submit.`;

/**
 * Tool specs in Anthropic SDK format. Bind these to the actual HTTP
 * endpoints (`/api/firstmover/eligibility`, `/api/firstmover/intake`,
 * etc.) on the agent runner side.
 */
export const TOOL_SPECS = [
  {
    name: 'check_eligibility',
    description:
      'Check whether a member has active coverage with the given TPA for the requested date of service. Returns green (proceed), red (hard stop, escalate), or unknown (escalate).',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'The TPA / health plan UUID.' },
        member_id: { type: 'string', description: 'The member ID as provided by the caller.' },
        date_of_service: {
          type: 'string',
          description: 'ISO date (YYYY-MM-DD) the service is requested for.',
        },
      },
      required: ['client_id', 'member_id'],
    },
  },
  {
    name: 'submit_intake',
    description:
      'Open a prior authorization case. Only call after all required fields are present AND eligibility returned green. Returns a case_number to read back to the caller.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
        service_type: {
          type: 'string',
          enum: ['outpatient', 'medication', 'home_health', 'therapy', 'inpatient', 'dme'],
        },
        payload: {
          type: 'object',
          description:
            'Captured fields. Must include member_name, member_id, date_of_service, procedure_description, servicing_provider_npi, servicing_provider_address — plus the service-type-specific fields.',
        },
      },
      required: ['client_id', 'service_type', 'payload'],
    },
  },
  {
    name: 'escalate_to_human',
    description:
      'Hand off the conversation to a human concierge. Use when eligibility is red, the case is complex, the caller is upset, or you cannot complete intake.',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          enum: [
            'eligibility_red',
            'expedited_request',
            'inpatient_late_notification',
            'peer_to_peer_or_appeal',
            'caller_distress',
            'repeated_missing_field',
            'uncertain',
            'other',
          ],
        },
        notes: { type: 'string', description: 'Brief context for the human picking up.' },
        partial_payload: {
          type: 'object',
          description: 'Whatever fields you have collected so far.',
        },
      },
      required: ['reason'],
    },
  },
] as const;

/**
 * Endpoint wiring for the GR workflow. Use these as-is when binding
 * tools in Gravity Rails (or any agent runner). Auth is via
 * `Authorization: Bearer ${VANTAHG_API_KEY}` for non-internal callers.
 */
export interface ToolEndpoint {
  tool: string;
  method: 'POST';
  path: string;
}

export const TOOL_ENDPOINTS: ToolEndpoint[] = [
  { tool: 'check_eligibility', method: 'POST', path: '/api/firstmover/eligibility' },
  { tool: 'submit_intake', method: 'POST', path: '/api/firstmover/agent/intake' },
  { tool: 'escalate_to_human', method: 'POST', path: '/api/firstmover/agent/escalate' },
];

/**
 * Bundle for `/api/firstmover/agent/config`: everything a GR admin
 * needs to set up a workflow that wires to our endpoints.
 */
export function getAgentConfigBundle() {
  return {
    version: PROMPT_VERSION,
    system_prompt: SYSTEM_PROMPT,
    tools: TOOL_SPECS,
    endpoints: TOOL_ENDPOINTS,
    notes: [
      'Set Authorization: Bearer ${VANTAHG_API_KEY} on each tool call.',
      'submit_intake returns { case_id, case_number }. Read the case_number back to the caller.',
      'check_eligibility returns { status: "green" | "red" | "unknown", message, next_action? }. Stop on red.',
      'escalate_to_human returns { ticket_id }. Stay on the line until a human joins.',
    ],
  };
}
