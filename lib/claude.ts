import type Anthropic from '@anthropic-ai/sdk';
import { completeText, streamAnthropicMessages } from './llm';
import type { LlmMessage } from './llm';

export async function generateClinicalBrief(prompt: {
  system: string;
  user: string;
}): Promise<string> {
  const result = await completeText({
    system: prompt.system,
    user: prompt.user,
    maxTokens: 4096,
  });
  return result.text;
}

export function streamClinicalChat(options: {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  tools?: Anthropic.Tool[];
  maxTokens?: number;
}) {
  return streamAnthropicMessages({
    system: options.system,
    messages: options.messages as LlmMessage[],
    tools: options.tools,
    maxTokens: options.maxTokens,
  });
}
