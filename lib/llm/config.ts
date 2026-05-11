import type { LlmProviderName } from './types';

export interface LlmConfig {
  provider: LlmProviderName;
  model: string;
  timeoutMs: number;
  maxRetries: number;
}

const DEFAULT_MODEL = 'claude-opus-4-6';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;

export function getLlmConfig(): LlmConfig {
  const providerEnv = (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase();
  const provider: LlmProviderName = providerEnv === 'bedrock' ? 'bedrock' : 'anthropic';

  return {
    provider,
    model: process.env.LLM_MODEL?.trim() || DEFAULT_MODEL,
    timeoutMs: parseIntOr(process.env.LLM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxRetries: parseIntOr(process.env.LLM_MAX_RETRIES, DEFAULT_MAX_RETRIES),
  };
}

function parseIntOr(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
