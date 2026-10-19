import type { LineOfBusiness } from './types';

/**
 * What the requester asked for. Only `iro` may enter the IRO queue.
 * IDRE / UM / Medical Review / internal review route OUT (SOP stage 1 STOP).
 */
export const INTAKE_REQUEST_KINDS = [
  'iro',
  'idre',
  'idr',
  'um',
  'medical_review',
  'internal_review',
] as const;

export type IntakeRequestKind = (typeof INTAKE_REQUEST_KINDS)[number];

export interface IntakeRoute {
  /** Null means the request is not placed on the IRO queue. */
  iro_queue: boolean;
  stop: boolean;
  target_line: LineOfBusiness | null;
  code: 'accepted_iro' | 'routed_out_of_iro';
  reason: string;
}

const OUT: Record<Exclude<IntakeRequestKind, 'iro'>, Pick<IntakeRoute, 'target_line' | 'reason'>> = {
  idre: {
    target_line: 'IDR',
    reason: 'IDRE requests are routed out of the IRO queue.',
  },
  idr: {
    target_line: 'IDR',
    reason: 'IDR requests are routed out of the IRO queue.',
  },
  um: {
    target_line: null,
    reason: 'UM requests are routed out of the IRO queue. UM is not an IRO pathway.',
  },
  medical_review: {
    target_line: 'MEDICAL_REVIEW',
    reason: 'Medical Review requests are routed out of the IRO queue.',
  },
  internal_review: {
    target_line: null,
    reason: 'Internal-review requests are routed out of the IRO queue.',
  },
};

export function routeIntake(kind: IntakeRequestKind): IntakeRoute {
  if (kind === 'iro') {
    return {
      iro_queue: true,
      stop: false,
      target_line: 'IRO',
      code: 'accepted_iro',
      reason: 'Request stays on the IRO queue.',
    };
  }
  const out = OUT[kind];
  return {
    iro_queue: false,
    stop: true,
    target_line: out.target_line,
    code: 'routed_out_of_iro',
    reason: out.reason,
  };
}

export function isOnIroQueue(route: IntakeRoute): boolean {
  return route.iro_queue && !route.stop && route.target_line === 'IRO';
}
