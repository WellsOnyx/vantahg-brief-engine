/**
 * VantaHG IRO Panel entitlement.
 *
 * Independent of UM Med Review. `evaluateUmBriefEngineAccess` is not
 * consulted here, and a med-review contract does not open this module.
 * VantaHG = IRO + IDR. UM still sells Med Review on its own card.
 *
 * Two gates, both required at the HTTP boundary:
 *   1. Feature flag `ENABLE_IRO_PANEL=true` (deploy switch).
 *   2. `iro_line_contract=true` (commercial entitlement).
 */

export const IRO_PANEL_DENIALS = ['missing_iro_line_contract'] as const;
export type IroPanelDenial = (typeof IRO_PANEL_DENIALS)[number];

export interface IroPanelEntitlementInput {
  /** VantaHG IRO line contract. Not the UM med-review flag. */
  iro_line_contract?: boolean | null;
}

export interface IroPanelAccessGranted {
  allowed: true;
  code: 'granted';
  reason: string;
}

export interface IroPanelAccessDenied {
  allowed: false;
  code: IroPanelDenial;
  reason: string;
}

export type IroPanelAccess = IroPanelAccessGranted | IroPanelAccessDenied;

export function isIroPanelFlagEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ENABLE_IRO_PANEL === 'true';
}

/**
 * Granted only when the IRO line contract is explicitly true.
 * Extra fields (including any UM med-review flag) are ignored.
 */
export function evaluateIroPanelAccess(
  input: IroPanelEntitlementInput | null | undefined,
): IroPanelAccess {
  if (input?.iro_line_contract !== true) {
    return {
      allowed: false,
      code: 'missing_iro_line_contract',
      reason:
        'IRO Panel & Credentialing requires iro_line_contract=true. A VantaUM med-review contract does not entitle this module.',
    };
  }
  return {
    allowed: true,
    code: 'granted',
    reason: 'VantaHG IRO line contract is on. UM Med Review packaging is unchanged.',
  };
}

export function hasIroPanelEntitlement(
  input: IroPanelEntitlementInput | null | undefined,
): boolean {
  return evaluateIroPanelAccess(input).allowed;
}
