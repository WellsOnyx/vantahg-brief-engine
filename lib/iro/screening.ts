import type { ScreeningSource } from './types';

export interface ScreeningRequest {
  source: Extract<ScreeningSource, 'oig_leie' | 'sam'>;
  name: string;
  asOf: string;
}

export interface ScreeningStubResult {
  source: ScreeningRequest['source'];
  result: 'clear' | 'hit' | 'inconclusive';
  screened_at: string;
  reference: string;
  live_call: false;
}

/**
 * Stores a screening result without calling OIG LEIE or SAM.
 * A name containing SYN-HIT returns a synthetic hit so tests can
 * record a finding. Everything else is clear.
 */
export async function screenWithStub(input: ScreeningRequest): Promise<ScreeningStubResult> {
  const hit = /SYN-HIT/i.test(input.name);
  return {
    source: input.source,
    result: hit ? 'hit' : 'clear',
    screened_at: input.asOf,
    reference: `stub-${input.source}-no-live-api`,
    live_call: false,
  };
}
