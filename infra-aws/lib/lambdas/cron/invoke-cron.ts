/**
 * EventBridge -> Lambda -> HTTP POST to a cron route on the ALB.
 *
 * Invokes the configured CRON_TARGET_URL with Authorization: Bearer
 * ${CRON_SECRET}. The route is expected to be one of:
 *   - /api/cron/efax-process
 *   - (others as the app adds them)
 *
 * Logs the response code + body for CloudWatch visibility.
 */

const TARGET_URL = process.env.CRON_TARGET_URL!;
const SECRET_NAME = process.env.CRON_SECRET_ARN!;

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
const sm = new SecretsManagerClient({});

let cachedSecret: string | null = null;

async function getCronSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const result = await sm.send(new GetSecretValueCommand({ SecretId: SECRET_NAME }));
  if (!result.SecretString) throw new Error('CRON_SECRET not retrievable');
  // Secret may be plain string or JSON {value: "..."} - handle both.
  try {
    const parsed = JSON.parse(result.SecretString);
    cachedSecret = parsed.value ?? result.SecretString;
  } catch {
    cachedSecret = result.SecretString;
  }
  return cachedSecret!;
}

export const handler = async (): Promise<{ status: number; body: string }> => {
  const secret = await getCronSecret();
  const res = await fetch(TARGET_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
  });
  const body = await res.text().catch(() => '');
  console.log(`Cron POST ${TARGET_URL} -> ${res.status}`);
  if (!res.ok) {
    console.error(`Cron failure body: ${body.slice(0, 500)}`);
  }
  return { status: res.status, body: body.slice(0, 500) };
};
