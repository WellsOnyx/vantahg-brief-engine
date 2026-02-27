import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { isDemoMode } from '@/lib/demo-mode';
import { getDemoBriefStream } from '@/lib/chat/demo-chat';
import type { StreamChunk } from '@/lib/chat/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Auth check
  const authResult = await requireAuth(request);
  if (authResult instanceof Response) return authResult;

  // Rate limit: 10 requests/minute for brief generation
  const rateLimitResult = await applyRateLimit(request, { maxRequests: 10, windowMs: 60_000 });
  if (rateLimitResult) return rateLimitResult;

  try {
    const { case_id } = await request.json();

    if (!case_id) {
      return Response.json({ error: 'case_id is required' }, { status: 400 });
    }

    // Demo mode: stream pre-built brief sections
    if (isDemoMode()) {
      const stream = createSSEStream(getDemoBriefStream());
      return new Response(stream, {
        headers: sseHeaders(),
      });
    }

    // Live mode: generate brief via the existing pipeline
    // For now, call the generate-brief API internally and stream the result
    const briefRes = await fetch(new URL('/api/generate-brief', request.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: request.headers.get('cookie') || '',
      },
      body: JSON.stringify({ case_id }),
    });

    if (!briefRes.ok) {
      const error = await briefRes.json();
      return Response.json(error, { status: briefRes.status });
    }

    const briefData = await briefRes.json();

    // Stream the generated brief section by section
    const sectionStream = streamBriefSections(briefData);
    const stream = createSSEStream(sectionStream);

    return new Response(stream, {
      headers: sseHeaders(),
    });
  } catch (error) {
    console.error('Brief stream API error:', error);
    return Response.json(
      { error: 'Brief generation service unavailable' },
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
 * Given a completed brief, yield sections one at a time with delays.
 */
async function* streamBriefSections(briefData: Record<string, unknown>): AsyncGenerator<StreamChunk> {
  const brief = briefData.brief || briefData;
  const sections = [
    'clinical_question',
    'patient_summary',
    'diagnosis_analysis',
    'procedure_analysis',
    'criteria_match',
    'documentation_review',
    'ai_recommendation',
    'reviewer_action',
  ];

  for (const section of sections) {
    const content = (brief as Record<string, unknown>)[section];
    if (content) {
      yield {
        type: 'brief_section',
        briefSection: section,
        briefContent: content,
      };
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  // Send fact-check results if available
  if (briefData.factCheck) {
    yield {
      type: 'brief_section',
      briefSection: 'fact_check',
      briefContent: briefData.factCheck,
    };
  }

  yield { type: 'done' };
}
