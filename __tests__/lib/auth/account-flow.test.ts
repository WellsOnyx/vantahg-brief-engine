import { describe, expect, it } from 'vitest';
import {
  authMessage,
  challengePrompt,
  classifyAccountException,
  classifySignInException,
  inviteBinding,
  isAuthChallenge,
  passwordPolicyError,
  safeNextPath,
  sessionClockDecision,
  stampSessionCap,
} from '@/lib/auth/account-flow';

describe('account flow', () => {
  it('matches the pool password policy', () => {
    expect(passwordPolicyError('short')).toBe('weak_password');
    expect(passwordPolicyError('alllowercase12!')).toBe('weak_password');
    expect(passwordPolicyError('NoSymbol12345')).toBe('weak_password');
    expect(passwordPolicyError('Good-Password-1')).toBeNull();
  });

  it('keeps MFA and unconfirmed email off the generic failure path', () => {
    expect(isAuthChallenge('SOFTWARE_TOKEN_MFA')).toBe(true);
    expect(isAuthChallenge('SMS_MFA')).toBe(true);
    expect(isAuthChallenge('CUSTOM_CHALLENGE')).toBe(false);
    expect(classifySignInException('UserNotConfirmedException')).toBe('unconfirmed');
    expect(classifySignInException('PasswordResetRequiredException')).toBe('password_reset_required');
    expect(classifySignInException('NotAuthorizedException')).toBe('invalid_credentials');
    expect(classifySignInException('UserNotFoundException')).toBe('invalid_credentials');
    expect(classifyAccountException('ExpiredCodeException')).toBe('expired_code');
    expect(challengePrompt('SMS_MFA')).toMatch(/texted/i);
    expect(authMessage('unconfirmed')).toMatch(/code/i);
  });

  it('rejects open redirects', () => {
    expect(safeNextPath('/client')).toBe('/client');
    expect(safeNextPath('https://evil.test')).toBeNull();
    expect(safeNextPath('//evil.test')).toBeNull();
  });

  it('requires a client_id for client invites and does not tag IDR as Med Review', () => {
    expect(inviteBinding({ role: 'client', clientId: 'not-a-uuid' }).ok).toBe(false);
    const client = inviteBinding({
      role: 'client',
      clientId: '11111111-1111-1111-1111-111111111111',
    });
    expect(client).toMatchObject({ ok: true, productLine: 'med_review' });
    const reviewer = inviteBinding({ role: 'reviewer' });
    expect(reviewer).toMatchObject({ ok: true, clientId: null, productLine: 'med_review' });
    const attorney = inviteBinding({ role: 'idr-attorney' });
    expect(attorney).toMatchObject({ ok: true, productLine: null });
  });

  it('refreshes inside the absolute cap and stops after it', () => {
    const now = 1_000_000;
    expect(sessionClockDecision({
      expiresAt: now - 1,
      absoluteExpiresAt: now + 60_000,
      hasRefresh: true,
      now,
    })).toBe('refresh');
    expect(sessionClockDecision({
      expiresAt: now + 3_600_000,
      absoluteExpiresAt: now + 60_000,
      hasRefresh: true,
      now,
    })).toBe('valid');
    expect(sessionClockDecision({
      expiresAt: now - 1,
      absoluteExpiresAt: now - 1,
      hasRefresh: true,
      now,
    })).toBe('expired');
    const stamped = stampSessionCap({ id: 1 }, now, 60, now + 30_000);
    expect(stamped).toMatchObject({ maxAgeSec: 30 });
    expect(stampSessionCap({ id: 1 }, now, 60, now - 1)).toEqual({ expired: true });
  });
});
