/**
 * Cognito CreateAuthChallenge Lambda trigger.
 *
 * Generates a one-time link code, stashes it in DynamoDB with a 15-min
 * TTL, and sends the user an email with the magic link via SES.
 *
 * The link points at `${APP_URL}/api/auth/callback?code=...&user=...`.
 * The /api/auth/callback route in the Next.js app does the
 * RespondToAuthChallenge call to exchange the code for tokens, then
 * sets HttpOnly session cookies.
 */

import * as crypto from 'node:crypto';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const OTP_TABLE = process.env.OTP_TABLE_NAME!;
const SES_FROM = process.env.SES_FROM_ADDRESS!;
const SES_CONFIG_SET = process.env.SES_CONFIG_SET!;
const APP_URL = process.env.APP_URL!;
const OTP_TTL_SECONDS = 15 * 60; // 15 minutes

const ddb = new DynamoDBClient({});
const ses = new SESv2Client({});

interface CreateAuthChallengeEvent {
  request: {
    userAttributes: { email?: string; sub?: string; name?: string };
    session: Array<unknown>;
  };
  response: {
    publicChallengeParameters: Record<string, string>;
    privateChallengeParameters: Record<string, string>;
    challengeMetadata: string;
  };
  userName: string;
}

export const handler = async (
  event: CreateAuthChallengeEvent,
): Promise<CreateAuthChallengeEvent> => {
  // Only generate a new code on the FIRST challenge in the session - if
  // the user is on attempt 2 or 3, re-use the same code (they probably
  // mistyped). The TTL is short enough that this is safe.
  if (event.request.session.length > 0) {
    // Subsequent attempts: return the stashed code via private params.
    // We pull it back out by querying DDB with the user sub.
    const sub = event.request.userAttributes.sub ?? event.userName;
    event.response.publicChallengeParameters = { email: event.request.userAttributes.email ?? '' };
    event.response.privateChallengeParameters = { sub };
    event.response.challengeMetadata = 'MAGIC_LINK_OTP';
    return event;
  }

  const email = event.request.userAttributes.email;
  if (!email) {
    throw new Error('No email on user - cannot send magic link');
  }
  const sub = event.request.userAttributes.sub ?? event.userName;

  // 32 hex chars (128 bits) of entropy.
  const otp = crypto.randomBytes(16).toString('hex');

  // Stash in DynamoDB with TTL.
  const expiresAt = Math.floor(Date.now() / 1000) + OTP_TTL_SECONDS;
  await ddb.send(
    new PutItemCommand({
      TableName: OTP_TABLE,
      Item: {
        sub: { S: sub },
        otp: { S: otp },
        email: { S: email },
        expires_at: { N: String(expiresAt) },
        created_at: { N: String(Math.floor(Date.now() / 1000)) },
      },
    }),
  );

  // Compose magic link.
  const link = `${APP_URL}/api/auth/callback?code=${encodeURIComponent(otp)}&user=${encodeURIComponent(sub)}`;

  // Send via SES.
  const subject = 'Sign in to VantaUM';
  const text = `Click the link below to sign in to VantaUM. The link expires in 15 minutes.\n\n${link}\n\nIf you didn't request this, ignore this email.`;
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#0c2340;line-height:1.5;">
    <div style="max-width:560px;margin:32px auto;padding:24px;">
      <h2 style="color:#0c2340;">Sign in to VantaUM</h2>
      <p>Click the button below to sign in. The link expires in 15 minutes.</p>
      <p style="margin:24px 0;">
        <a href="${link}" style="display:inline-block;background:#0c2340;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;">Sign in</a>
      </p>
      <p style="font-size:13px;color:#666;">Or copy and paste this URL into your browser:<br/><span style="font-family:monospace;font-size:12px;word-break:break-all;">${link}</span></p>
      <p style="font-size:13px;color:#666;">If you didn't request this, you can safely ignore this email.</p>
    </div></body></html>`;

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: SES_FROM,
      Destination: { ToAddresses: [email] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: text, Charset: 'UTF-8' },
            Html: { Data: html, Charset: 'UTF-8' },
          },
        },
      },
      ConfigurationSetName: SES_CONFIG_SET,
    }),
  );

  // Tell Cognito about the challenge.
  event.response.publicChallengeParameters = { email };
  // Never put the OTP in publicChallengeParameters - those go to the
  // client. privateChallengeParameters stay server-side only.
  event.response.privateChallengeParameters = { sub };
  event.response.challengeMetadata = 'MAGIC_LINK_OTP';
  return event;
};
