import type { EmailAdapter } from './types';
import { SmtpEmailAdapter } from './smtp';
import { SesEmailAdapter } from './ses';

let cached: EmailAdapter | null = null;
let override: EmailAdapter | null = null;

export function getEmailAdapter(): EmailAdapter {
  if (override) return override;
  if (cached) return cached;
  const useAws = process.env.ENABLE_AWS_EMAIL === 'true';
  cached = useAws ? new SesEmailAdapter() : new SmtpEmailAdapter();
  return cached;
}

export function setEmailAdapter(adapter: EmailAdapter | null): void {
  override = adapter;
  if (!adapter) cached = null;
}

export type { EmailAdapter, SendEmailParams, SendEmailResult, SendEmailError } from './types';
