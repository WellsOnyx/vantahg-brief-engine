/**
 * Server-side gate for real IRO intake.
 *
 * AWS BAAs are already in place (Jonah, Oct 20). The BAA is not a signing
 * step. Unset AWS_BAA_SIGNED means the existing account BAA stands.
 * AWS_BAA_SIGNED=false is a config kill switch.
 *
 * Real intake also requires the AWS database and storage flags that are
 * already wired to RDS and the efax-documents bucket. Default is off:
 * LIVE_PHI_ENABLED must be the string "true".
 */

export type LivePhiCode =
  | 'ok'
  | 'live_phi_disabled'
  | 'baa_revoked'
  | 'aws_db_required'
  | 'aws_storage_required';

export interface LivePhiDecision {
  allowed: boolean;
  code: LivePhiCode;
  message: string;
  /** Config view of the existing AWS BAA. Not a signature workflow. */
  baa: 'signed' | 'revoked';
}

export function awsDatabaseConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ENABLE_AWS_DB === 'true' && Boolean(env.DATABASE_URL || env.DB_HOST);
}

export function evaluateLivePhiGate(env: NodeJS.ProcessEnv = process.env): LivePhiDecision {
  const baa = env.AWS_BAA_SIGNED === 'false' ? 'revoked' : 'signed';
  if (env.LIVE_PHI_ENABLED !== 'true') {
    return {
      allowed: false,
      code: 'live_phi_disabled',
      message: 'Live case intake is off. Set LIVE_PHI_ENABLED=true on the existing AWS runtime.',
      baa,
    };
  }
  if (baa === 'revoked') {
    return {
      allowed: false,
      code: 'baa_revoked',
      message: 'Live case intake is off because AWS_BAA_SIGNED is false.',
      baa,
    };
  }
  if (!awsDatabaseConfigured(env)) {
    return {
      allowed: false,
      code: 'aws_db_required',
      message: 'Live case intake needs ENABLE_AWS_DB=true and DATABASE_URL or DB_HOST on the existing RDS instance.',
      baa,
    };
  }
  if (env.ENABLE_AWS_STORAGE !== 'true') {
    return {
      allowed: false,
      code: 'aws_storage_required',
      message: 'Live case intake needs ENABLE_AWS_STORAGE=true so documents use the existing private S3 buckets.',
      baa,
    };
  }
  return {
    allowed: true,
    code: 'ok',
    message: 'Live PHI intake is enabled on the existing AWS account.',
    baa,
  };
}
