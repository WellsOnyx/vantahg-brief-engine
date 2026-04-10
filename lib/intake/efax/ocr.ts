/**
 * OCR adapter layer for the eFax intake pipeline.
 *
 * Production faxes arrive as PDF or TIFF binaries. We need OCR to turn them
 * into text that the AI extractor can read. This module exposes a single
 * `runOcr()` entry point and dispatches to whichever adapter is configured.
 *
 * Adapters
 *   - google_vision : Google Cloud Vision Document Text Detection (default)
 *   - provider      : trust the OCR text the fax provider already returned
 *   - none          : no OCR; use only what the parser can find in the payload
 *
 * Selection is controlled by the EFAX_OCR_PROVIDER env var. When unset, we
 * fall back to 'provider' if the payload included ocr_text, otherwise 'none'.
 *
 * The adapter is intentionally synchronous-looking from the caller's
 * perspective (returns a Promise<OcrResult>). Network calls happen inside.
 * Demo mode short-circuits to a deterministic stub so tests don't hit the
 * network.
 */

import { isDemoMode } from '@/lib/demo-mode';

export type OcrProvider = 'google_vision' | 'provider' | 'none' | 'demo';

export interface OcrInput {
  /** Raw bytes of the document, if available. */
  document?: Buffer;
  /** Public or signed URL to the document. */
  document_url?: string;
  /** MIME type, e.g. 'application/pdf', 'image/tiff'. */
  content_type?: string;
  /** OCR text the provider already supplied (if any). */
  provider_ocr_text?: string;
  /** Confidence the provider supplied (0-100). */
  provider_ocr_confidence?: number;
}

export interface OcrResult {
  text: string;
  confidence: number; // 0-100
  provider: OcrProvider;
  page_count: number | null;
  /** Per-page text, when the OCR provider exposes it. */
  pages?: string[];
  /** Diagnostics for the worker log. Never logged to audit (may contain PHI). */
  warnings: string[];
}

/**
 * Pick the OCR provider for this run.
 *
 * Order of precedence:
 *   1. EFAX_OCR_PROVIDER env var (explicit override)
 *   2. Demo mode → 'demo'
 *   3. Provider-supplied OCR text → 'provider'
 *   4. GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_VISION_API_KEY set → 'google_vision'
 *   5. Fallback → 'none'
 */
export function selectOcrProvider(input: OcrInput): OcrProvider {
  const explicit = process.env.EFAX_OCR_PROVIDER as OcrProvider | undefined;
  if (explicit) return explicit;

  if (isDemoMode()) return 'demo';

  if (input.provider_ocr_text && input.provider_ocr_text.length > 100) {
    return 'provider';
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_VISION_API_KEY) {
    return 'google_vision';
  }

  return 'none';
}

export async function runOcr(input: OcrInput): Promise<OcrResult> {
  const provider = selectOcrProvider(input);

  switch (provider) {
    case 'demo':
      return demoOcr(input);
    case 'provider':
      return providerOcr(input);
    case 'google_vision':
      return googleVisionOcr(input);
    case 'none':
    default:
      return noOcr(input);
  }
}

// ── demo adapter ────────────────────────────────────────────────────────────
//
// Returns a deterministic, recognizable string so tests and demo flows can
// assert against the AI extraction step without hitting real network APIs.

function demoOcr(input: OcrInput): OcrResult {
  if (input.provider_ocr_text) {
    return {
      text: input.provider_ocr_text,
      confidence: input.provider_ocr_confidence ?? 92,
      provider: 'demo',
      page_count: 1,
      pages: [input.provider_ocr_text],
      warnings: [],
    };
  }

  const stub = `PRIOR AUTHORIZATION REQUEST
Patient: Sarah Johnson
DOB: 04/12/1978
Member ID: BCBS-44219008
Requesting Provider: Dr. Michael Torres, MD
NPI: 1184729551
Specialty: Orthopedic Surgery
Procedure: Right knee arthroscopy with meniscectomy
CPT: 27447
Diagnosis: M17.11 (Unilateral primary osteoarthritis, right knee)
Facility: Coastal Surgery Center (ASC)
Payer: Blue Cross Blue Shield TX
Plan Type: PPO
Clinical Notes: Patient has failed 6 weeks of conservative therapy including
physical therapy, NSAIDs, and corticosteroid injection. MRI shows medial
meniscal tear. Patient has persistent pain limiting ambulation.
Priority: Standard
Review Type: Prior Authorization`;

  return {
    text: stub,
    confidence: 95,
    provider: 'demo',
    page_count: 1,
    pages: [stub],
    warnings: ['demo OCR — deterministic stub content'],
  };
}

// ── provider passthrough ────────────────────────────────────────────────────

function providerOcr(input: OcrInput): OcrResult {
  return {
    text: input.provider_ocr_text || '',
    confidence: input.provider_ocr_confidence ?? 60,
    provider: 'provider',
    page_count: null,
    warnings: input.provider_ocr_text
      ? []
      : ['provider OCR selected but no text was supplied'],
  };
}

// ── no OCR ──────────────────────────────────────────────────────────────────

function noOcr(input: OcrInput): OcrResult {
  return {
    text: input.provider_ocr_text || '',
    confidence: 0,
    provider: 'none',
    page_count: null,
    warnings: ['OCR not configured — extraction will rely on whatever text the provider supplied'],
  };
}

// ── Google Cloud Vision adapter ────────────────────────────────────────────
//
// Uses the Vision REST API directly so we do not have to add the @google-cloud/vision
// SDK as a dependency. The API key path (GOOGLE_VISION_API_KEY) is the simplest
// to deploy on Vercel; service account JSON (GOOGLE_APPLICATION_CREDENTIALS)
// is supported for environments that prefer it.
//
// We use DOCUMENT_TEXT_DETECTION which is tuned for dense text and forms,
// and we send the document as base64 in the request body.

async function googleVisionOcr(input: OcrInput): Promise<OcrResult> {
  const warnings: string[] = [];

  // Acquire the document bytes
  let bytes: Buffer | null = null;
  if (input.document) {
    bytes = input.document;
  } else if (input.document_url) {
    try {
      const res = await fetch(input.document_url);
      if (!res.ok) {
        return {
          text: input.provider_ocr_text || '',
          confidence: input.provider_ocr_text ? 50 : 0,
          provider: 'google_vision',
          page_count: null,
          warnings: [`Failed to fetch document_url: HTTP ${res.status}`],
        };
      }
      const ab = await res.arrayBuffer();
      bytes = Buffer.from(ab);
    } catch (err) {
      return {
        text: input.provider_ocr_text || '',
        confidence: input.provider_ocr_text ? 50 : 0,
        provider: 'google_vision',
        page_count: null,
        warnings: [`Document fetch threw: ${err instanceof Error ? err.message : String(err)}`],
      };
    }
  } else {
    return {
      text: input.provider_ocr_text || '',
      confidence: input.provider_ocr_text ? 50 : 0,
      provider: 'google_vision',
      page_count: null,
      warnings: ['No document bytes or URL provided to Google Vision adapter'],
    };
  }

  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    // Service account auth (GOOGLE_APPLICATION_CREDENTIALS) is not implemented
    // in this lightweight adapter — recommend the API key path on Vercel.
    return {
      text: input.provider_ocr_text || '',
      confidence: 0,
      provider: 'google_vision',
      page_count: null,
      warnings: ['GOOGLE_VISION_API_KEY not set; service-account auth not supported by this adapter'],
    };
  }

  const isPdf = (input.content_type || '').includes('pdf');
  const isTiff = (input.content_type || '').includes('tiff');

  // Vision's image:annotate works for raster formats (PNG, JPEG, TIFF, GIF, BMP).
  // For PDF you must use files:annotate (asyncBatchAnnotateFiles is too slow for
  // a sub-second cron loop, so we use the synchronous batchAnnotateFiles).
  const endpoint = isPdf
    ? `https://vision.googleapis.com/v1/files:annotate?key=${apiKey}`
    : `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;

  const requestBody = isPdf
    ? {
        requests: [
          {
            inputConfig: {
              content: bytes.toString('base64'),
              mimeType: 'application/pdf',
            },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
            // Process up to 5 pages synchronously (Vision's hard limit is 5 for
            // batchAnnotateFiles). Faxes longer than 5 pages will be partially OCR'd
            // and a warning will be raised.
            pages: [1, 2, 3, 4, 5],
          },
        ],
      }
    : {
        requests: [
          {
            image: { content: bytes.toString('base64') },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
          },
        ],
      };

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    return {
      text: input.provider_ocr_text || '',
      confidence: input.provider_ocr_text ? 50 : 0,
      provider: 'google_vision',
      page_count: null,
      warnings: [`Vision API request failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    return {
      text: input.provider_ocr_text || '',
      confidence: input.provider_ocr_text ? 50 : 0,
      provider: 'google_vision',
      page_count: null,
      warnings: [`Vision API ${res.status}: ${errBody.slice(0, 200)}`],
    };
  }

  const json = (await res.json()) as VisionResponse;

  // Extract per-page text and an aggregate confidence
  const { text, pages, confidence, pageCount } = extractVisionText(json, isPdf);

  if (pageCount && pageCount > 5 && isPdf) {
    warnings.push(`Document has ${pageCount} pages; only first 5 OCR'd in synchronous mode`);
  }

  if (isTiff) {
    warnings.push('TIFF processed via image endpoint (multi-page TIFFs return only first page)');
  }

  return {
    text,
    confidence,
    provider: 'google_vision',
    page_count: pageCount ?? pages.length ?? null,
    pages,
    warnings,
  };
}

// ── Vision response shapes ──────────────────────────────────────────────────

interface VisionResponse {
  responses?: Array<{
    fullTextAnnotation?: {
      text?: string;
      pages?: Array<{
        confidence?: number;
        blocks?: Array<{ confidence?: number }>;
      }>;
    };
    textAnnotations?: Array<{ description?: string }>;
    error?: { code?: number; message?: string };
  }>;
}

function extractVisionText(
  json: VisionResponse,
  isPdf: boolean,
): { text: string; pages: string[]; confidence: number; pageCount: number | null } {
  const responses = json.responses || [];
  if (responses.length === 0) {
    return { text: '', pages: [], confidence: 0, pageCount: null };
  }

  if (isPdf) {
    // batchAnnotateFiles wraps each page response inside the file response.
    // The shape is { responses: [{ responses: [pageResponses...] }] }, but
    // some Vision API versions inline it differently. Handle both.
    const fileResponse = responses[0] as VisionResponse['responses'] extends infer T
      ? T extends Array<infer U>
        ? U & { responses?: VisionResponse['responses'] }
        : never
      : never;
    const pageResponses = fileResponse.responses || responses;

    const pages: string[] = [];
    const confidences: number[] = [];
    for (const page of pageResponses) {
      const pageText = page.fullTextAnnotation?.text || '';
      pages.push(pageText);
      const pageConf = page.fullTextAnnotation?.pages?.[0]?.confidence;
      if (typeof pageConf === 'number') confidences.push(pageConf);
    }
    const text = pages.join('\n\n').trim();
    const avgConfidence = confidences.length
      ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100)
      : text.length > 50
        ? 80
        : 0;
    return { text, pages, confidence: avgConfidence, pageCount: pages.length || null };
  }

  // Image endpoint: single response with fullTextAnnotation
  const r = responses[0];
  const text = r.fullTextAnnotation?.text || r.textAnnotations?.[0]?.description || '';
  const pageConf = r.fullTextAnnotation?.pages?.[0]?.confidence;
  const confidence =
    typeof pageConf === 'number' ? Math.round(pageConf * 100) : text.length > 50 ? 80 : 0;
  return {
    text,
    pages: [text],
    confidence,
    pageCount: text ? 1 : null,
  };
}
