/**
 * Claude client backed by AWS Bedrock.
 *
 * Why Bedrock instead of direct Anthropic API:
 *   - AWS BAA covers Bedrock-Claude inference. One BAA, single subprocessor
 *     line in our HIPAA disclosure (AWS) instead of a separate Anthropic
 *     enterprise agreement.
 *   - Same Claude model weights, near-identical Messages API shape (we use
 *     Anthropic's official @anthropic-ai/bedrock-sdk which mirrors the
 *     direct SDK).
 *   - IAM-scoped credentials in AWS, no separate API key to rotate.
 *
 * Required env:
 *   - AWS_REGION (e.g., 'us-east-1') — Bedrock region
 *   - AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (or IAM task role on ECS)
 *   - BEDROCK_CLAUDE_MODEL_ID (default: 'us.anthropic.claude-opus-4-6-v1:0')
 *     The `us.` prefix is a cross-region inference profile that routes to
 *     whichever US region has capacity.
 */

import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import type Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL_ID = 'us.anthropic.claude-opus-4-6-v1:0';

function getClient(): AnthropicBedrock {
  return new AnthropicBedrock({
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    // AWS SDK resolves credentials from env / IAM role / shared credentials
    // automatically — no need to pass them explicitly here.
  });
}

function modelId(): string {
  return process.env.BEDROCK_CLAUDE_MODEL_ID || DEFAULT_MODEL_ID;
}

export async function generateClinicalBrief(prompt: { system: string; user: string }): Promise<string> {
  const client = getClient();
  const response = await client.messages.create({
    model: modelId(),
    max_tokens: 4096,
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }
  return textBlock.text;
}

/**
 * Streaming chat session. Returns the Bedrock SDK's message stream which
 * exposes the same `.on('text', cb)` / async iterator surface as the direct
 * Anthropic SDK, so existing callers do not change.
 */
export function streamClinicalChat(options: {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  tools?: Anthropic.Tool[];
  maxTokens?: number;
}) {
  const client = getClient();
  return client.messages.stream({
    model: modelId(),
    max_tokens: options.maxTokens || 4096,
    system: options.system,
    messages: options.messages,
    tools: options.tools,
  });
}

/**
 * Direct messages.create access for callers that need the full response
 * shape (e.g., tool-use extraction in the eFax pipeline).
 */
export function createMessage(params: Anthropic.MessageCreateParamsNonStreaming) {
  const client = getClient();
  return client.messages.create({
    ...params,
    model: params.model || modelId(),
  });
}
