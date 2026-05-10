import { describe, it, expect } from 'vitest';
import {
  SYSTEM_PROMPT,
  TOOL_SPECS,
  TOOL_ENDPOINTS,
  PROMPT_VERSION,
  getAgentConfigBundle,
} from '@/lib/firstmover/agent-prompt';

describe('SYSTEM_PROMPT', () => {
  it('encodes the hard rules from Santana', () => {
    expect(SYSTEM_PROMPT).toMatch(/SLA clock/);
    expect(SYSTEM_PROMPT).toMatch(/required fields/i);
    expect(SYSTEM_PROMPT).toMatch(/NEVER make a clinical determination/i);
    expect(SYSTEM_PROMPT).toMatch(/eligibility/i);
  });

  it('lists service-type-specific fields', () => {
    expect(SYSTEM_PROMPT).toMatch(/outpatient/);
    expect(SYSTEM_PROMPT).toMatch(/medication/);
    expect(SYSTEM_PROMPT).toMatch(/home_health|home health/);
    expect(SYSTEM_PROMPT).toMatch(/inpatient/);
    expect(SYSTEM_PROMPT).toMatch(/dme/i);
  });

  it('includes the call-back script verbatim', () => {
    expect(SYSTEM_PROMPT).toMatch(/Please call back when you have those handy/);
  });

  it('lists escalation triggers', () => {
    expect(SYSTEM_PROMPT).toMatch(/peer-to-peer/i);
    expect(SYSTEM_PROMPT).toMatch(/expedited/i);
    expect(SYSTEM_PROMPT).toMatch(/upset|distress|supervisor/i);
  });
});

describe('TOOL_SPECS', () => {
  it('exposes the three required tools', () => {
    const names = TOOL_SPECS.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['check_eligibility', 'submit_intake', 'escalate_to_human']));
  });

  it('check_eligibility requires client_id + member_id', () => {
    const tool = TOOL_SPECS.find((t) => t.name === 'check_eligibility');
    expect(tool?.input_schema.required).toEqual(expect.arrayContaining(['client_id', 'member_id']));
  });

  it('submit_intake constrains service_type to the six valid types', () => {
    const tool = TOOL_SPECS.find((t) => t.name === 'submit_intake');
    const enumVals = (tool?.input_schema.properties as { service_type?: { enum: string[] } } | undefined)?.service_type?.enum;
    expect(enumVals).toEqual(
      expect.arrayContaining(['outpatient', 'medication', 'home_health', 'therapy', 'inpatient', 'dme'])
    );
  });

  it('escalate_to_human requires a typed reason', () => {
    const tool = TOOL_SPECS.find((t) => t.name === 'escalate_to_human');
    expect(tool?.input_schema.required).toEqual(expect.arrayContaining(['reason']));
  });
});

describe('TOOL_ENDPOINTS', () => {
  it('maps every tool to a POST path', () => {
    expect(TOOL_ENDPOINTS).toHaveLength(3);
    for (const e of TOOL_ENDPOINTS) {
      expect(e.method).toBe('POST');
      expect(e.path).toMatch(/^\/api\/firstmover\//);
    }
  });
});

describe('getAgentConfigBundle', () => {
  it('returns a paste-ready bundle', () => {
    const bundle = getAgentConfigBundle();
    expect(bundle.version).toBe(PROMPT_VERSION);
    expect(bundle.system_prompt).toBe(SYSTEM_PROMPT);
    expect(bundle.tools).toBe(TOOL_SPECS);
    expect(bundle.endpoints.length).toBe(3);
    expect(bundle.notes.length).toBeGreaterThan(0);
  });
});
