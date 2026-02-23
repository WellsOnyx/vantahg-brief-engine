import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function generateClinicalBrief(prompt: { system: string; user: string }): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    system: prompt.system,
    messages: [
      { role: 'user', content: prompt.user },
    ],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude API');
  }
  return textBlock.text;
}

/**
 * Create a streaming chat session with Claude.
 * Used by the chat API for multi-turn conversation with tool use.
 */
export function streamClinicalChat(options: {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  tools?: Anthropic.Tool[];
  maxTokens?: number;
}) {
  return anthropic.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: options.maxTokens || 4096,
    system: options.system,
    messages: options.messages,
    tools: options.tools,
  });
}
