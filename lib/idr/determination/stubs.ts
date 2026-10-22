/**
 * STUB — November 1 batching rules.
 * The Departments' batching criteria effective 2026-11-01 are not implemented.
 * `eligible` stays null. This function does not decide single versus batched.
 *
 * STUB — IDR Gateway.
 * No vendor, no live call, and no dispute payload. Determination facts come
 * from the case file passed into the workflow, not from this port.
 */

export const NOV_1_BATCHING_EFFECTIVE_ON = '2026-11-01' as const;

export interface BatchingFacts {
  line_count: number;
  service_labels: readonly string[];
}

export interface November1BatchingDecision {
  implemented: false;
  eligible: null;
  effective_on: typeof NOV_1_BATCHING_EFFECTIVE_ON;
  code: 'NOV_1_BATCHING_UNIMPLEMENTED';
  message: string;
}

export interface November1BatchingRules {
  readonly effective_on: typeof NOV_1_BATCHING_EFFECTIVE_ON;
  readonly implemented: false;
  evaluate(facts: BatchingFacts): November1BatchingDecision;
}

const BATCHING_MESSAGE = 'November 1 batching rules are not implemented. Eligibility is not decided.';

export function november1BatchingRules(): November1BatchingRules {
  return {
    effective_on: NOV_1_BATCHING_EFFECTIVE_ON,
    implemented: false,
    evaluate(_facts: BatchingFacts): November1BatchingDecision {
      return {
        implemented: false,
        eligible: null,
        effective_on: NOV_1_BATCHING_EFFECTIVE_ON,
        code: 'NOV_1_BATCHING_UNIMPLEMENTED',
        message: BATCHING_MESSAGE,
      };
    },
  };
}

export function assertBatchingStub(rules: November1BatchingRules): boolean {
  return rules.implemented === false && rules.effective_on === NOV_1_BATCHING_EFFECTIVE_ON;
}

export interface IdrGatewayRefusal {
  ok: false;
  system: 'idr_gateway';
  vendor: null;
  live_call: false;
  implemented: false;
  settled: false;
  code: 'IDR_GATEWAY_UNIMPLEMENTED';
  dispute_ref: string;
}

export interface IdrGatewayPort {
  readonly system: 'idr_gateway';
  readonly vendor: null;
  readonly live_call: false;
  readonly implemented: false;
  pullDispute(disputeRef: string): IdrGatewayRefusal;
}

export function stubIdrGateway(): IdrGatewayPort {
  return {
    system: 'idr_gateway',
    vendor: null,
    live_call: false,
    implemented: false,
    pullDispute(disputeRef: string): IdrGatewayRefusal {
      return {
        ok: false,
        system: 'idr_gateway',
        vendor: null,
        live_call: false,
        implemented: false,
        settled: false,
        code: 'IDR_GATEWAY_UNIMPLEMENTED',
        dispute_ref: disputeRef,
      };
    },
  };
}

export function assertGatewayClosed(gateway: IdrGatewayPort): boolean {
  return (
    gateway.system === 'idr_gateway' &&
    gateway.vendor === null &&
    gateway.live_call === false &&
    gateway.implemented === false
  );
}
