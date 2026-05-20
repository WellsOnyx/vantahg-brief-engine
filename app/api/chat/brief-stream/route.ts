import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { isDemoMode } from '@/lib/demo-mode';
import { getDemoBriefStream } from '@/lib/chat/demo-chat';
import type { StreamChunk } from '@/lib/chat/types';
import type { AIBrief } from '@/lib/types';

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
 * Given a completed brief (now potentially carrying generation_metadata from
 * the multi-pass self-critique engine), yield rich progressive events:
 *  - brief_pass / refinement_update events (the new self-improvement visibility)
 *  - then the final sections + fact-check.
 * This delivers the white-glove "watch the AI improve its own output" experience.
 */
async function* streamBriefSections(briefData: Record<string, unknown>): AsyncGenerator<StreamChunk> {
  const brief = (briefData.brief || briefData) as AIBrief & Record<string, unknown>;
  const meta = brief.generation_metadata;

  // If self-improvement occurred, surface the pass/refinement narrative first
  if (meta?.self_improvement_applied && meta.revisions?.length) {
    yield {
      type: 'brief_pass',
      passNumber: 1,
      message: `Pass 1/${meta.passes_completed} — Initial clinical analysis & draft`,
    };
    await delay(180);

    yield {
      type: 'refinement_update',
      passNumber: 1,
      message: `Pass 1 fact-check: ${meta.initial_fact_check_score ?? '?'} / 100`,
      scoreBefore: meta.initial_fact_check_score,
      scoreAfter: meta.initial_fact_check_score,
    };
    await delay(260);

    for (const rev of meta.revisions) {
      yield {
        type: 'brief_pass',
        passNumber: rev.pass,
        message: `Pass ${rev.pass}/${meta.passes_completed} — Self-critique & structured revision`,
      };
      await delay(220);

      yield {
        type: 'refinement_update',
        passNumber: rev.pass,
        message: `Self-critique: ${rev.critique_summary || 'Addressed clinical defensibility gaps'}`,
        issues: rev.issues_addressed,
        sectionsRevised: rev.sections_revised,
        scoreBefore: rev.score_before,
        scoreAfter: rev.score_after,
      };
      await delay(380);
    }

    yield {
      type: 'refinement_update',
      passNumber: meta.passes_completed,
      message: `Final fact-check ${meta.final_fact_check_score ?? '?'} / 100 (+${(meta.final_fact_check_score ?? 0) - (meta.initial_fact_check_score ?? 0)} lift) • Ready for concierge validation`,
      scoreBefore: meta.initial_fact_check_score,
      scoreAfter: meta.final_fact_check_score,
    };
    await delay(220);
  }

  // Now stream the authoritative final sections (the improved version)
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
      await delay(130);
    }
  }

  // Send fact-check + the full enriched brief metadata for the live preview
  if (briefData.factCheck) {
    yield {
      type: 'brief_section',
      briefSection: 'fact_check',
      briefContent: briefData.factCheck,
    };
  }

  // Surface the generation metadata itself as a final summary event (UI can render the badge/log)
  if (meta) {
    yield {
      type: 'brief_section',
      briefSection: 'generation_metadata',
      briefContent: meta,
    };
  }

  yield { type: 'done' };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
