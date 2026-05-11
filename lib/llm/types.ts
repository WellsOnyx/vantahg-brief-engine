export type LlmRole = 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface LlmRequestBase {
  system: string;
  messages?: LlmMessage[];
  user?: string;
  maxTokens?: number;
  cacheSystem?: boolean;
  provider?: LlmProviderName;
  model?: string;
}

export type LlmTextOptions = LlmRequestBase;

export interface LlmToolCallOptions extends LlmRequestBase {
  tool: LlmToolSpec;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface LlmTextResult extends LlmUsage {
  text: string;
  model: string;
  provider: LlmProviderName;
}

export interface LlmToolCallResult extends LlmUsage {
  toolInput: unknown;
  model: string;
  provider: LlmProviderName;
}

export type LlmProviderName = 'anthropic' | 'bedrock';

export type LlmErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'timeout'
  | 'bad_request'
  | 'server'
  | 'no_response'
  | 'unknown';

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly kind: LlmErrorKind,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
