import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logChatMessage } from '@/lib/audit';
import { getRequestContext } from '@/lib/security';
import { isDemoMode } from '@/lib/demo-mode';
import { streamClinicalChat } from '@/lib/claude';
import { buildIntakePrompt, buildReviewPrompt } from '@/lib/chat/system-prompts';
import { chatTools } from '@/lib/chat/tools';
import { executeToolCall } from '@/lib/chat/tool-handlers';
import { mergeExtraction } from '@/lib/chat/extraction-engine';
import { getDemoChatStream } from '@/lib/chat/demo-chat';
import type { CaseFormData } from '@/lib/types';
import type { StreamChunk } from '@/lib/chat/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Auth check
  const authResult = await requireAuth(request);
  if (authResult instanceof Response) return authResult;

  // Rate limit: 30 requests/minute for chat
  const rateLimitResult = await applyRateLimit(request, { maxRequests: 30, windowMs: 60_000 });
  if (rateLimitResult) return rateLimitResult;

  const { user } = authResult;
  const ctx = getRequestContext(request);

  try {
    const body = await request.json();
    const {
      messages = [],
      mode = 'intake',
      caseId,
      extractedData = {},
    } = body as {
      messages: { role: 'user' | 'assistant'; content: string }[];
      mode: 'intake' | 'review' | 'general';
      caseId?: string;
      extractedData?: Partial<CaseFormData>;
    };

    if (!messages.length) {
      return Response.json({ error: 'Messages array is required' }, { status: 400 });
    }

    // Log the user's last message
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMessage) {
      logChatMessage(caseId || null, user.email, 'user', lastUserMessage.content, ctx);
    }

    // Demo mode: return mock streaming response
    if (isDemoMode()) {
      const userMsg = lastUserMessage?.content || '';
      const messageCount = messages.filter((m) => m.role === 'user').length;
      const stream = createSSEStream(getDemoChatStream(userMsg, extractedData, messageCount));
      return new Response(stream, {
        headers: sseHeaders(),
      });
    }

    // Build system prompt based on mode
    let systemPrompt: string;
    if (mode === 'review' && caseId) {
      // Fetch case data for review mode
      const caseRes = await fetch(new URL(`/api/cases/${caseId}`, request.url), {
        headers: { cookie: request.headers.get('cookie') || '' },
      });
      if (caseRes.ok) {
        const caseData = await caseRes.json();
        systemPrompt = buildReviewPrompt(caseData, caseData.ai_brief);
      } else {
        systemPrompt = buildIntakePrompt(extractedData);
      }
    } else {
      systemPrompt = buildIntakePrompt(extractedData);
    }

    // Create the streaming response with Claude
    const stream = streamClinicalChat({
      system: systemPrompt,
      messages,
      tools: chatTools,
    });

    // Process the stream and handle tool calls
    let runningExtraction = { ...extractedData };
    const readableStream = createAnthropicSSEStream(stream, runningExtraction, (newExtraction) => {
      runningExtraction = mergeExtraction(runningExtraction, newExtraction);
    });

    return new Response(readableStream, {
      headers: sseHeaders(),
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return Response.json(
      { error: 'Chat service unavailable' },
      { status: 503 }
    );
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  };
}

/**
 * Create SSE stream from an async generator of StreamChunks.
 * Used for demo mode.
 */
function createSSEStream(generator: AsyncGenerator<StreamChunk>): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
      } catch {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Stream error' })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * Create SSE stream from an Anthropic MessageStream, handling tool calls inline.
 */
function createAnthropicSSEStream(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stream: any,
  currentExtraction: Partial<CaseFormData>,
  onExtraction: (data: Partial<CaseFormData>) => void
): ReadableStream {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        // Collect tool use blocks as they come
        let currentToolName = '';
        let currentToolInput = '';

        for await (const event of stream) {
          if (event.type === 'content_block_start') {
            if (event.content_block?.type === 'tool_use') {
              currentToolName = event.content_block.name || '';
              currentToolInput = '';
            }
          } else if (event.type === 'content_block_delta') {
            if (event.delta?.type === 'text_delta' && event.delta.text) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'text', content: event.delta.text })}\n\n`
                )
              );
            } else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
              currentToolInput += event.delta.partial_json;
            }
          } else if (event.type === 'content_block_stop') {
            if (currentToolName) {
              // Execute the tool
              try {
                const input = JSON.parse(currentToolInput || '{}');
                const result = executeToolCall(currentToolName, input);

                // Send tool result to client
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'tool_result',
                      toolName: currentToolName,
                      toolInput: input,
                      toolResult: result,
                    })}\n\n`
                  )
                );

                // If this was an extraction, send extraction event
                if (currentToolName === 'extract_case_data' && result.result) {
                  const extraction = result.result as Partial<CaseFormData>;
                  onExtraction(extraction);
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: 'extraction', extraction })}\n\n`
                    )
                  );
                }
              } catch {
                // Tool parse error — continue streaming
              }
              currentToolName = '';
              currentToolInput = '';
            }
          }
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        );
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', error: String(error) })}\n\n`
          )
        );
      } finally {
        controller.close();
      }
    },
  });
}
