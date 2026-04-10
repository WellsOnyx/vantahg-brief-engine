/**
 * Phaxio eFax provider normalizer.
 *
 * Phaxio sends inbound fax webhooks as `application/x-www-form-urlencoded`
 * (with bracket-notation keys like `fax[id]`) or, on newer deployments, as
 * `application/json` with a top-level `fax` object.
 *
 * Signature algorithm (from https://www.phaxio.com/docs/api/v2.1/faxes/webhook):
 *
 *   HMAC-SHA256(callback_token, url + concat(sorted_post_params))
 *
 * Each POST param is concatenated as `key{value}` (no separator) in alphabetic
 * key order, then appended to the full webhook URL. For JSON webhooks, the raw
 * JSON body is appended to the URL instead of the sorted key/value pairs. The
 * resulting hex digest is delivered in the `X-Phaxio-Signature` header.
 *
 * This module verifies that signature with constant-time comparison and
 * normalizes the payload into the shared `EfaxPayload` shape consumed by the
 * rest of the intake pipeline. It does not download the PDF — that happens
 * downstream via `getPhaxioAuth()` + HTTP Basic auth against `document_url`.
 */

import * as crypto from 'crypto';
import type { EfaxPayload } from '../../efax-parser';

export interface PhaxioRawWebhook {
  /** Content-Type request header value. */
  contentType: string;
  /** The raw request body exactly as received. */
  rawBody: string;
  /** Value of the `X-Phaxio-Signature` header. */
  signatureHeader: string;
  /** The exact URL Phaxio called — required for HMAC reconstruction. */
  webhookUrl: string;
}

export interface PhaxioVerifyResult {
  valid: boolean;
  reason?: string;
}

interface PhaxioFaxObject {
  id?: string | number;
  num_pages?: string | number;
  status?: string;
  direction?: string;
  from_number?: string;
  to_number?: string;
  completed_at?: string | number;
  media_url?: string;
  media_id?: string;
  [key: string]: unknown;
}

interface PhaxioParsedBody {
  fax: PhaxioFaxObject;
  top: Record<string, unknown>;
}

/**
 * Verifies the HMAC signature on a Phaxio webhook.
 * Uses constant-time comparison. Reads `PHAXIO_CALLBACK_TOKEN` from env.
 * If unset, returns `{ valid: true, reason: 'no_token_configured' }` so local
 * dev / demo environments don't break.
 */
export function verifyPhaxioSignature(input: PhaxioRawWebhook): PhaxioVerifyResult {
  const token = process.env.PHAXIO_CALLBACK_TOKEN;
  if (!token) {
    return { valid: true, reason: 'no_token_configured' };
  }

  if (!input.signatureHeader) {
    return { valid: false, reason: 'missing_signature_header' };
  }
  if (!input.webhookUrl) {
    return { valid: false, reason: 'missing_webhook_url' };
  }

  const isJson = input.contentType.toLowerCase().includes('application/json');

  let signatureString: string;
  if (isJson) {
    // Newer Phaxio webhook format: HMAC over URL + raw JSON body.
    signatureString = input.webhookUrl + (input.rawBody || '');
  } else {
    // Form-encoded format: HMAC over URL + sorted concat of `key{value}` pairs.
    const params = new URLSearchParams(input.rawBody || '');
    const pairs: Array<[string, string]> = [];
    params.forEach((value, key) => {
      pairs.push([key, value]);
    });
    pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const concatenated = pairs.map(([k, v]) => `${k}{${v}}`).join('');
    signatureString = input.webhookUrl + concatenated;
  }

  const expected = crypto
    .createHmac('sha256', token)
    .update(signatureString)
    .digest('hex');

  const provided = input.signatureHeader.trim().toLowerCase();
  const expectedLower = expected.toLowerCase();

  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expectedLower, 'utf8');
  if (providedBuf.length !== expectedBuf.length) {
    return { valid: false, reason: 'signature_length_mismatch' };
  }

  const ok = crypto.timingSafeEqual(providedBuf, expectedBuf);
  return ok ? { valid: true } : { valid: false, reason: 'signature_mismatch' };
}

/**
 * Parses a Phaxio webhook body (form-encoded or JSON) and returns the
 * normalized EfaxPayload that the rest of the intake pipeline consumes.
 * Throws if required fields (fax id, from number) are missing or if the
 * event is not a `received` fax.
 */
export function parsePhaxioWebhook(rawBody: string, contentType: string): EfaxPayload {
  const parsed = parseBody(rawBody, contentType);
  const fax = parsed.fax;

  const faxId = fax.id !== undefined && fax.id !== null ? String(fax.id) : '';
  if (!faxId) {
    throw new Error('phaxio: missing fax.id');
  }

  const fromNumber = typeof fax.from_number === 'string' ? fax.from_number : '';
  if (!fromNumber) {
    throw new Error('phaxio: missing fax.from_number');
  }

  const directionRaw =
    (typeof fax.direction === 'string' && fax.direction) ||
    (typeof parsed.top.direction === 'string' ? (parsed.top.direction as string) : '');
  if (directionRaw && directionRaw !== 'received') {
    throw new Error('phaxio: not a received fax event');
  }

  const toNumber = typeof fax.to_number === 'string' ? fax.to_number : '';

  const pageCountRaw = fax.num_pages;
  let pageCount = 0;
  if (typeof pageCountRaw === 'number') {
    pageCount = Math.trunc(pageCountRaw);
  } else if (typeof pageCountRaw === 'string' && pageCountRaw.length > 0) {
    const parsedNum = parseInt(pageCountRaw, 10);
    pageCount = Number.isNaN(parsedNum) ? 0 : parsedNum;
  }

  const receivedAt = toIsoTimestamp(fax.completed_at);
  const documentUrl = typeof fax.media_url === 'string' ? fax.media_url : undefined;
  const status = typeof fax.status === 'string' ? fax.status : undefined;

  const payload: EfaxPayload = {
    fax_id: faxId,
    from_number: fromNumber,
    to_number: toNumber,
    received_at: receivedAt,
    page_count: pageCount,
    document_url: documentUrl,
    content_type: 'application/pdf',
    provider: 'phaxio',
    status,
    metadata: {
      ...parsed.top,
      fax: { ...fax },
    },
  };

  return payload;
}

/**
 * Extracts the HTTP Basic auth credentials needed to download the media file
 * from Phaxio. Returns `{ apiKey, apiSecret }` or `null` if not configured.
 * The caller uses these when fetching `EfaxPayload.document_url`.
 */
export function getPhaxioAuth(): { apiKey: string; apiSecret: string } | null {
  const apiKey = process.env.PHAXIO_API_KEY;
  const apiSecret = process.env.PHAXIO_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

// ── Internals ──────────────────────────────────────────────────────────────

function parseBody(rawBody: string, contentType: string): PhaxioParsedBody {
  const ct = (contentType || '').toLowerCase();

  if (ct.includes('application/json')) {
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      throw new Error('phaxio: invalid json body');
    }
    if (!json || typeof json !== 'object') {
      throw new Error('phaxio: json body is not an object');
    }
    const top = json as Record<string, unknown>;
    const faxField = top.fax;
    if (!faxField || typeof faxField !== 'object') {
      throw new Error('phaxio: missing fax object in json body');
    }
    return { fax: faxField as PhaxioFaxObject, top };
  }

  // Default: form-encoded. May also arrive with a nested JSON `fax` field.
  const params = new URLSearchParams(rawBody || '');
  const top: Record<string, unknown> = {};
  const fax: PhaxioFaxObject = {};

  params.forEach((value, key) => {
    const bracketMatch = key.match(/^fax\[(.+)\]$/);
    if (bracketMatch) {
      fax[bracketMatch[1]] = value;
      return;
    }
    if (key === 'fax') {
      // Some deployments POST a JSON-encoded `fax` field.
      try {
        const nested = JSON.parse(value);
        if (nested && typeof nested === 'object') {
          Object.assign(fax, nested as PhaxioFaxObject);
          return;
        }
      } catch {
        // Not JSON — fall through and store as top-level.
      }
    }
    top[key] = value;
  });

  return { fax, top };
}

function toIsoTimestamp(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return new Date().toISOString();
  }
  if (typeof value === 'number') {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === 'string') {
    // Phaxio sends Unix epoch seconds as a string in form-encoded payloads.
    if (/^\d+$/.test(value)) {
      return new Date(parseInt(value, 10) * 1000).toISOString();
    }
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString();
    }
  }
  return new Date().toISOString();
}
