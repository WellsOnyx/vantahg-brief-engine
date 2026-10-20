/**
 * MFA readiness against the existing Cognito user pool.
 * AuthStack already sets mfa OPTIONAL with SMS and software OTP.
 * This portal reads the amr claim. It does not enroll a second factor
 * and it does not send a code. IRO_PORTAL_MFA_REQUIRED defaults off.
 */

export interface MfaStatus {
  ready: true;
  satisfied: boolean;
  required: boolean;
  factors: readonly string[];
}

const MFA_FACTOR = /mfa|otp|sms|software_token/i;

function cookieValue(header: string, name: string): string | null {
  const parts = header.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  }
  return null;
}

function factorsFromIdToken(idToken: string): string[] {
  const segment = idToken.split('.')[1];
  if (!segment) return [];
  try {
    const json = Buffer.from(segment, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { amr?: unknown };
    if (!Array.isArray(payload.amr)) return [];
    return payload.amr.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

export function readMfaStatus(request: Request, env: NodeJS.ProcessEnv = process.env): MfaStatus {
  const required = env.IRO_PORTAL_MFA_REQUIRED === 'true';
  const raw = cookieValue(request.headers.get('cookie') ?? '', 'vantaum_session');
  let factors: string[] = [];
  if (raw) {
    try {
      const session = JSON.parse(raw) as { id_token?: string };
      if (session.id_token) factors = factorsFromIdToken(session.id_token);
    } catch {
      factors = [];
    }
  }
  return {
    ready: true,
    satisfied: factors.some((factor) => MFA_FACTOR.test(factor)),
    required,
    factors,
  };
}
