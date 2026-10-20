import { randomBytes } from 'crypto';
import type { StorageAdapter } from '@/lib/adapters/storage/types';

/**
 * IRO originals use the existing efax-documents bucket.
 * StorageStack already sets SSE-KMS (customer-managed key, rotation on),
 * block-public, versioning, and a TLS-only bucket policy. PutObject does
 * not override that default — a bare aws:kms header would fall back to
 * the AWS-managed aws/s3 key. Signed URLs are the only read path.
 */
export const IRO_DOCUMENT_BUCKET = 'efax-documents' as const;
export const IRO_DOCUMENT_TTL_SECONDS = 300;
export const IRO_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export interface DocumentStoragePlan {
  bucket: typeof IRO_DOCUMENT_BUCKET;
  key_prefix: 'iro/';
  encryption: 'SSE-KMS';
  encryption_source: 'bucket-default';
  kms_key_alias_pattern: 'alias/vantaum-${env}-storage';
  public_access: 'blocked';
  transport: 'tls';
  signed_url_ttl_seconds: number;
  max_bytes: number;
}

export function documentStoragePlan(): DocumentStoragePlan {
  return {
    bucket: IRO_DOCUMENT_BUCKET,
    key_prefix: 'iro/',
    encryption: 'SSE-KMS',
    encryption_source: 'bucket-default',
    kms_key_alias_pattern: 'alias/vantaum-${env}-storage',
    public_access: 'blocked',
    transport: 'tls',
    signed_url_ttl_seconds: IRO_DOCUMENT_TTL_SECONDS,
    max_bytes: IRO_DOCUMENT_MAX_BYTES,
  };
}

export function iroDocumentKey(caseId: string, documentId: string): string {
  return `iro/${caseId}/${documentId}.pdf`;
}

export function newDocumentId(): string {
  return `doc-${randomBytes(8).toString('hex')}`;
}

export function createMemoryDocumentStorage(): StorageAdapter & { objects: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    async upload(bucket, path, bytes) {
      if (bucket !== IRO_DOCUMENT_BUCKET) {
        return { ok: false, code: 'forbidden', message: 'IRO documents use efax-documents.' };
      }
      if (!path.startsWith('iro/')) {
        return { ok: false, code: 'forbidden', message: 'IRO document keys stay under iro/.' };
      }
      const key = `${bucket}/${path}`;
      if (objects.has(key)) return { ok: false, code: 'duplicate', message: 'Object already exists.' };
      objects.set(key, Buffer.from(bytes));
      return { ok: true, path, bytes: bytes.length };
    },
    async download(bucket, path) {
      const found = objects.get(`${bucket}/${path}`);
      if (!found) return { ok: false, code: 'not_found', message: 'Missing object.' };
      return { ok: true, bytes: found, contentType: 'application/pdf' };
    },
    async signedUrl(bucket, path, ttlSeconds) {
      if (!objects.has(`${bucket}/${path}`)) {
        return { ok: false, code: 'not_found', message: 'Missing object.' };
      }
      return {
        ok: true,
        url: `https://signed.invalid/${bucket}/${path}?ttl=${ttlSeconds}`,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      };
    },
    async remove(bucket, path) {
      objects.delete(`${bucket}/${path}`);
      return { ok: true };
    },
  };
}

let storageOverride: StorageAdapter | null = null;

export function __setIroDocumentStorageForTests(storage: StorageAdapter | null): void {
  storageOverride = storage;
}

export async function getIroDocumentStorage(): Promise<StorageAdapter> {
  if (storageOverride) return storageOverride;
  const { getStorageAdapter } = await import('@/lib/adapters/storage');
  return getStorageAdapter();
}
