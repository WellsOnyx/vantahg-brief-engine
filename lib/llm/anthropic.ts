import Anthropic from '@anthropic-ai/sdk';
import { getLlmConfig } from './config';
import {
  LlmError,
  type LlmMessage,
  type LlmTextOptions,
  type LlmTextResult,
  type LlmToolCallOptions,
  type LlmToolCallResult,
} from './types';

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new LlmError('ANTHROPIC_API_KEY is not set', 'auth', false);
  }
  const { maxRetries } = getLlmConfig();
  cachedClient = new Anthropic({ apiKey, maxRetries });
  return cachedClient;
}

function buildMessages(opts: LlmTextOptions | LlmToolCallOptions): LlmMessage[] {
  if (opts.messages && opts.messages.length > 0) return opts.messages;
  if (typeof opts.user === 'string' && opts.user.length > 0) {
    return [{ role: 'user', content: opts.user }];
  }
  throw new LlmError(
    'Either `messages` or `user` must be provided',
    'bad_request',
    false,
  );
}

function buildSystem(
  system: string,
  cache: boolean | undefined,
): string | Anthropic.TextBlockParam[] {
  if (!cache) return system;
  return [
    {
      type: 'text',
      text: system,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

function mapAnthropicError(err: unknown): LlmError {
  if (err instanceof Anthropic.AuthenticationError) {
    return new LlmError('Authentication failed', 'auth', false, 401);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new LlmError('Rate limited', 'rate_limit', true, 429);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new LlmError(err.message, 'bad_request', false, 400);
  }
  if (err instanceof Anthropic.APIError) {
    const status = typeof err.status === 'number' ? err.status : undefined;
    const retryable = status === undefined || status >= 500 || status === 429;
    const kind = status && status >= 500 ? 'server' : 'unknown';
    return new LlmError(err.message, kind, retryable, status);
  }
  if (err instanceof Error && (err.name === 'AbortError' || /timeout/i.test(err.message))) {
    return new LlmError('Request timed out', 'timeout', true);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new LlmError(message, 'unknown', false);
}

export async function completeText(opts: LlmTextOptions): Promise<LlmTextResult> {
  const cfg = getLlmConfig();
  const model = opts.model ?? cfg.model;
  const client = getClient();

  try {
    const response = await client.messages.create(
      {
        model,
        max_tokens: opts.maxTokens ?? 4096,
        system: buildSystem(opts.system, opts.cacheSystem),
        messages: buildMessages(opts),
      },
      { timeout: cfg.timeoutMs },
    );

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    );
    if (!textBlock) {
      throw new LlmError('Model returned no text content', 'no_response', false);
    }

    return {
      text: textBlock.text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      model: response.model,
      provider: 'anthropic',
    };
  } catch (err) {
    if (err instanceof LlmError) throw err;
    throw mapAnthropicError(err);
  }
}

export async function completeWithTool(opts: LlmToolCallOptions): Promise<LlmToolCallResult> {
  const cfg = getLlmConfig();
  const model = opts.model ?? cfg.model;
  const client = getClient();

  try {
    const response = await client.messages.create(
      {
        model,
        max_tokens: opts.maxTokens ?? 2048,
        system: buildSystem(opts.system, opts.cacheSystem),
        tools: [
          {
            name: opts.tool.name,
            description: opts.tool.description,
            input_schema: opts.tool.input_schema as Anthropic.Tool['input_schema'],
          },
        ],
        tool_choice: { type: 'tool', name: opts.tool.name },
        messages: buildMessages(opts),
      },
      { timeout: cfg.timeoutMs },
    );

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === 'tool_use' && block.name === opts.tool.name,
    );
    if (!toolUse) {
      throw new LlmError(
        `Model did not invoke tool '${opts.tool.name}'`,
        'no_response',
        false,
      );
    }

    return {
      toolInput: toolUse.input,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      model: response.model,
      provider: 'anthropic',
    };
  } catch (err) {
    if (err instanceof LlmError) throw err;
    throw mapAnthropicError(err);
  }
}

export interface AnthropicStreamOptions {
  system: string;
  messages: LlmMessage[];
  tools?: Anthropic.Tool[];
  maxTokens?: number;
  model?: string;
}

export function streamAnthropic(opts: AnthropicStreamOptions) {
  const cfg = getLlmConfig();
  const client = getClient();
  return client.messages.stream({
    model: opts.model ?? cfg.model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: opts.messages,
    tools: opts.tools,
  });
}
