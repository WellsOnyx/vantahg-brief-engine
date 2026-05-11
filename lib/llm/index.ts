import { getLlmConfig } from './config';
import {
  completeText as anthropicCompleteText,
  completeWithTool as anthropicCompleteWithTool,
  streamAnthropic,
  type AnthropicStreamOptions,
} from './anthropic';
import {
  LlmError,
  type LlmTextOptions,
  type LlmTextResult,
  type LlmToolCallOptions,
  type LlmToolCallResult,
} from './types';

export async function completeText(opts: LlmTextOptions): Promise<LlmTextResult> {
  const provider = opts.provider ?? getLlmConfig().provider;
  if (provider === 'bedrock') {
    throw new LlmError(
      'Bedrock provider is not yet wired up; set LLM_PROVIDER=anthropic',
      'bad_request',
      false,
    );
  }
  return anthropicCompleteText(opts);
}

export async function completeWithTool(opts: LlmToolCallOptions): Promise<LlmToolCallResult> {
  const provider = opts.provider ?? getLlmConfig().provider;
  if (provider === 'bedrock') {
    throw new LlmError(
      'Bedrock provider is not yet wired up; set LLM_PROVIDER=anthropic',
      'bad_request',
      false,
    );
  }
  return anthropicCompleteWithTool(opts);
}

export function streamAnthropicMessages(opts: AnthropicStreamOptions) {
  return streamAnthropic(opts);
}

export { getLlmConfig } from './config';
export {
  LlmError,
  type LlmMessage,
  type LlmRole,
  type LlmToolSpec,
  type LlmTextOptions,
  type LlmTextResult,
  type LlmToolCallOptions,
  type LlmToolCallResult,
  type LlmUsage,
  type LlmProviderName,
  type LlmErrorKind,
} from './types';
export type { AnthropicStreamOptions } from './anthropic';
