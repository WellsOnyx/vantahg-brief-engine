/**
 * eFax document storage and submission fingerprinting.
 *
 * This module handles two related concerns for the eFax intake pipeline:
 *
 * 1. Document persistence: fax providers (Phaxio, Documo, etc.) expose the
 *    received document via a transient media URL that may expire or rotate.
 *    We download the bytes, compute a SHA-256, and persist our own copy in
 *    the `efax-documents` Supabase Storage bucket so downstream steps
 *    (OCR, manual review, audit) always have a stable reference.
 *
 * 2. Submission fingerprinting: providers sometimes re-fax the same
 *    authorization request within hours (retries on their end, fax
 *    machine redials, or provider office workflows that send the same
 *    packet to multiple eFax numbers). We compute a stable SHA-256 over
 *    normalized patient + procedure + sender fields so the worker can
 *    detect and surface duplicates. The fingerprint is one-way — raw PHI
 *    cannot be recovered from it — and the lookup window is scoped to
 *    24 hours by default because legitimate re-submissions of the same
 *    case after a day are treated as distinct events (e.g. corrected
 *    records, additional documentation).
 */

import { createHash, randomBytes } from 'crypto';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';

const BUCKET = 'efax-documents';
const DEFAULT_WINDOW_HOURS = 24;

export interface StoredDocument {
  storage_path: string;
  storage_sha256: string;
  storage_bytes: number;
  content_type: string;
}

export interface FingerprintInput {
  patient_name: string | null;
  patient_dob: string | null;
  patient_member_id?: string | null;
  procedure_codes: string[];
  from_number?: string | null;
}

export interface DuplicateMatch {
  case_id: string;
  case_number: string;
  authorization_number: string | null;
  created_at: string;
  age_hours: number;
}

// ---------------------------------------------------------------------------
// Document storage
// ---------------------------------------------------------------------------

function extFromContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('tiff')) return 'tiff';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  return 'pdf';
}

function buildStoragePath(fax_id: string, contentType: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear().toString();
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const suffix = randomBytes(3).toString('hex');
  const ext = extFromContentType(contentType);
  const safeId = fax_id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `efax/${yyyy}/${mm}/${safeId}-${suffix}.${ext}`;
}

async function downloadDocument(
  documentUrl: string,
  basicAuth?: { user: string; pass: string } | null,
): Promise<Buffer> {
  const headers: Record<string, string> = {};
  if (basicAuth) {
    const token = Buffer.from(`${basicAuth.user}:${basicAuth.pass}`).toString('base64');
    headers['Authorization'] = `Basic ${token}`;
  }
  const res = await fetch(documentUrl, { headers });
  if (!res.ok) {
    throw new Error(`Failed to download document: ${res.status} ${res.statusText}`);
  }
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

function demoStoredDocument(fax_id: string, contentType: string): StoredDocument {
  return {
    storage_path: `efax/demo/${fax_id}.pdf`,
    storage_sha256: createHash('sha256').update(`demo:${fax_id}`).digest('hex'),
    storage_bytes: 0,
    content_type: contentType,
  };
}

export async function fetchAndStoreDocument(
  fax_id: string,
  documentUrl: string,
  options?: {
    basicAuth?: { user: string; pass: string } | null;
    contentType?: string;
  },
): Promise<StoredDocument> {
  const contentType = options?.contentType ?? 'application/pdf';

  if (isDemoMode()) {
    return demoStoredDocument(fax_id, contentType);
  }

  let buffer: Buffer;
  try {
    buffer = await downloadDocument(documentUrl, options?.basicAuth ?? null);
  } catch (err) {
    console.warn('[efax/storage] document download failed', err);
    return {
      storage_path: '',
      storage_sha256: '',
      storage_bytes: 0,
      content_type: contentType,
    };
  }

  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const path = buildStoragePath(fax_id, contentType);

  try {
    const supabase = getServiceClient();
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: false });
    if (error) {
      console.warn(`[efax/storage] upload to bucket '${BUCKET}' failed:`, error.message);
      return {
        storage_path: '',
        storage_sha256: sha256,
        storage_bytes: buffer.byteLength,
        content_type: contentType,
      };
    }
  } catch (err) {
    console.warn('[efax/storage] storage client error', err);
    return {
      storage_path: '',
      storage_sha256: sha256,
      storage_bytes: buffer.byteLength,
      content_type: contentType,
    };
  }

  return {
    storage_path: path,
    storage_sha256: sha256,
    storage_bytes: buffer.byteLength,
    content_type: contentType,
  };
}

export async function getStoredDocumentBytes(storage_path: string): Promise<Buffer> {
  if (isDemoMode() || !storage_path) {
    return Buffer.alloc(0);
  }
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.storage.from(BUCKET).download(storage_path);
    if (error || !data) {
      console.warn('[efax/storage] download failed', error?.message);
      return Buffer.alloc(0);
    }
    const arrayBuf = await data.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch (err) {
    console.warn('[efax/storage] getStoredDocumentBytes error', err);
    return Buffer.alloc(0);
  }
}

// ---------------------------------------------------------------------------
// Submission fingerprinting
// ---------------------------------------------------------------------------

function normalizeName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function normalizeDob(dob: string | null | undefined): string {
  if (!dob) return '';
  const trimmed = dob.trim();
  // Extract the leading YYYY-MM-DD if present; otherwise fall back to Date parsing.
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function normalizeMemberId(id: string | null | undefined): string {
  if (!id) return '';
  return id.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeProcedureCodes(codes: string[]): string {
  const cleaned = codes
    .map((c) => (c ?? '').toString().toUpperCase().replace(/\s+/g, '').trim())
    .filter((c) => c.length > 0);
  const unique = Array.from(new Set(cleaned)).sort();
  return unique.join(',');
}

function normalizeFromNumber(num: string | null | undefined): string {
  if (!num) return '';
  const digits = num.replace(/\D/g, '');
  return digits.slice(-10);
}

export function computeSubmissionFingerprint(input: FingerprintInput): string | null {
  const name = normalizeName(input.patient_name);
  const memberId = normalizeMemberId(input.patient_member_id);
  const dob = normalizeDob(input.patient_dob);
  const codes = normalizeProcedureCodes(input.procedure_codes ?? []);
  const fromNum = normalizeFromNumber(input.from_number);

  // Need at least (patient_name OR member_id) AND at least one procedure code.
  if (!name && !memberId) return null;
  if (!codes) return null;

  const parts = [name, dob, memberId, codes, fromNum];
  const joined = parts.join('|');
  return createHash('sha256').update(joined).digest('hex');
}

export async function findDuplicateCase(
  fingerprint: string,
  windowHours: number = DEFAULT_WINDOW_HOURS,
): Promise<DuplicateMatch | null> {
  if (isDemoMode() || !fingerprint) {
    return null;
  }

  try {
    const supabase = getServiceClient();
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('cases')
      .select('id, case_number, authorization_number, created_at')
      .eq('submission_fingerprint', fingerprint)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.warn('[efax/storage] duplicate lookup failed', error.message);
      return null;
    }
    if (!data || data.length === 0) return null;

    const row = data[0] as {
      id: string;
      case_number: string;
      authorization_number: string | null;
      created_at: string;
    };
    const ageMs = Date.now() - new Date(row.created_at).getTime();
    const age_hours = Math.max(0, ageMs / (60 * 60 * 1000));

    return {
      case_id: row.id,
      case_number: row.case_number,
      authorization_number: row.authorization_number,
      created_at: row.created_at,
      age_hours,
    };
  } catch (err) {
    console.warn('[efax/storage] findDuplicateCase error', err);
    return null;
  }
}
