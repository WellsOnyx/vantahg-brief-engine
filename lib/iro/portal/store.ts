import { emptyCredentialing } from '@/lib/credentialing';
import type { CredentialingState } from '@/lib/credentialing';
import type { IroCase } from '@/lib/iro/types';
import type { StoredOriginal } from '@/lib/iro/adapters/types';
import type { IroPortalRole } from './roles';

export interface IroAuditRow {
  id: string;
  case_id: string;
  at: string;
  actor_id: string;
  action: string;
  code: string;
  step: string;
  version: number;
  request_id: string | null;
}

export interface IroDocumentRow {
  id: string;
  case_id: string;
  storage_key: string;
  bucket: 'efax-documents';
  content_type: string;
  byte_size: number;
  created_at: string;
}

export interface IroStaffGrant {
  user_id: string;
  portal_role: IroPortalRole | null;
  clearance_role: string | null;
}

export interface IroStoredCase {
  case: IroCase;
  storage_objects: StoredOriginal[];
}

export interface IroPortalStore {
  getCase(id: string): Promise<IroStoredCase | null>;
  listCases(): Promise<IroCase[]>;
  saveCase(row: IroStoredCase): Promise<void>;
  appendAudit(row: Omit<IroAuditRow, 'id'>): Promise<IroAuditRow>;
  listAudit(caseId: string): Promise<IroAuditRow[]>;
  saveDocument(row: IroDocumentRow): Promise<void>;
  listDocuments(caseId: string): Promise<IroDocumentRow[]>;
  getDocument(caseId: string, documentId: string): Promise<IroDocumentRow | null>;
  getCredentialing(): Promise<CredentialingState>;
  saveCredentialing(state: CredentialingState): Promise<void>;
  getGrant(userId: string): Promise<IroStaffGrant | null>;
  saveGrant(grant: IroStaffGrant): Promise<void>;
  reviewerCaseIds(reviewerId: string): Promise<string[]>;
}

export function createMemoryIroPortalStore(): IroPortalStore {
  const cases = new Map<string, IroStoredCase>();
  const audits: IroAuditRow[] = [];
  const documents: IroDocumentRow[] = [];
  const grants = new Map<string, IroStaffGrant>();
  let credentialing: CredentialingState = emptyCredentialing();
  let auditSeq = 0;

  return {
    async getCase(id) {
      const row = cases.get(id);
      return row ? structuredClone(row) : null;
    },
    async listCases() {
      return [...cases.values()].map((row) => structuredClone(row.case));
    },
    async saveCase(row) {
      cases.set(row.case.id, structuredClone(row));
    },
    async appendAudit(row) {
      const saved: IroAuditRow = { ...row, id: String(++auditSeq) };
      audits.push(saved);
      return saved;
    },
    async listAudit(caseId) {
      return audits.filter((row) => row.case_id === caseId).map((row) => ({ ...row }));
    },
    async saveDocument(row) {
      documents.push({ ...row });
    },
    async listDocuments(caseId) {
      return documents.filter((row) => row.case_id === caseId).map((row) => ({ ...row }));
    },
    async getDocument(caseId, documentId) {
      return documents.find((row) => row.case_id === caseId && row.id === documentId) ?? null;
    },
    async getCredentialing() {
      return structuredClone(credentialing);
    },
    async saveCredentialing(state) {
      credentialing = structuredClone(state);
    },
    async getGrant(userId) {
      const grant = grants.get(userId);
      return grant ? { ...grant } : null;
    },
    async saveGrant(grant) {
      grants.set(grant.user_id, { ...grant });
    },
    async reviewerCaseIds(reviewerId) {
      return [...cases.values()]
        .filter((row) => row.case.reviewer_id === reviewerId)
        .map((row) => row.case.id);
    },
  };
}

function asCase(body: unknown): IroCase {
  return body as IroCase;
}

function asObjects(body: unknown): StoredOriginal[] {
  return Array.isArray(body) ? (body as StoredOriginal[]) : [];
}

let pgSingleton: IroPortalStore | null = null;

export function createPgIroPortalStore(): IroPortalStore {
  async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const { rawQuery } = await import('@/lib/db/pool');
    const rows = await rawQuery<Record<string, unknown>>(sql, params);
    return rows as T[];
  }

  return {
    async getCase(id) {
      const rows = await query<{ body: IroCase; storage_objects: StoredOriginal[] }>(
        'select body, storage_objects from iro_cases where id = $1',
        [id],
      );
      const row = rows[0];
      if (!row) return null;
      return { case: asCase(row.body), storage_objects: asObjects(row.storage_objects) };
    },
    async listCases() {
      const rows = await query<{ body: IroCase }>(
        'select body from iro_cases order by updated_at desc limit 200',
      );
      return rows.map((row) => asCase(row.body));
    },
    async saveCase(row) {
      const kase = row.case;
      await query(
        `insert into iro_cases (
           id, company, line_of_business, state_code, step, status, synthetic,
           reviewer_id, deadline_due_at, body, storage_objects, updated_at
         ) values (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, now()
         )
         on conflict (id) do update set
           step = excluded.step,
           status = excluded.status,
           synthetic = excluded.synthetic,
           reviewer_id = excluded.reviewer_id,
           deadline_due_at = excluded.deadline_due_at,
           body = excluded.body,
           storage_objects = excluded.storage_objects,
           updated_at = now()`,
        [
          kase.id,
          kase.company,
          kase.line_of_business,
          kase.state_code,
          kase.step,
          kase.status,
          kase.synthetic,
          kase.reviewer_id,
          kase.deadline?.due_at ?? null,
          JSON.stringify(kase),
          JSON.stringify(row.storage_objects),
        ],
      );
    },
    async appendAudit(row) {
      const rows = await query<{ id: string }>(
        `insert into iro_case_audit (case_id, at, actor_id, action, code, step, version, request_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id::text as id`,
        [row.case_id, row.at, row.actor_id, row.action, row.code, row.step, row.version, row.request_id],
      );
      return { ...row, id: rows[0]?.id ?? '0' };
    },
    async listAudit(caseId) {
      return query<IroAuditRow>(
        `select id::text as id, case_id, at::text as at, actor_id, action, code, step, version, request_id
         from iro_case_audit where case_id = $1 order by id`,
        [caseId],
      );
    },
    async saveDocument(row) {
      await query(
        `insert into iro_case_documents (id, case_id, storage_key, bucket, content_type, byte_size, created_at)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [row.id, row.case_id, row.storage_key, row.bucket, row.content_type, row.byte_size, row.created_at],
      );
    },
    async listDocuments(caseId) {
      return query<IroDocumentRow>(
        `select id, case_id, storage_key, bucket, content_type, byte_size, created_at::text as created_at
         from iro_case_documents where case_id = $1 order by created_at`,
        [caseId],
      );
    },
    async getDocument(caseId, documentId) {
      const rows = await query<IroDocumentRow>(
        `select id, case_id, storage_key, bucket, content_type, byte_size, created_at::text as created_at
         from iro_case_documents where case_id = $1 and id = $2`,
        [caseId, documentId],
      );
      const row = rows[0];
      if (!row || row.bucket !== 'efax-documents') return null;
      return row;
    },
    async getCredentialing() {
      const rows = await query<{ body: CredentialingState }>(
        `select body from iro_credentialing_state where id = 'shared'`,
      );
      return rows[0] ? asCase(rows[0].body) as unknown as CredentialingState : emptyCredentialing();
    },
    async saveCredentialing(state) {
      await query(
        `insert into iro_credentialing_state (id, body, updated_at)
         values ('shared', $1::jsonb, now())
         on conflict (id) do update set body = excluded.body, updated_at = now()`,
        [JSON.stringify(state)],
      );
    },
    async getGrant(userId) {
      const rows = await query<IroStaffGrant>(
        `select user_id, portal_role, clearance_role from iro_staff_grants where user_id = $1`,
        [userId],
      );
      return rows[0] ?? null;
    },
    async saveGrant(grant) {
      await query(
        `insert into iro_staff_grants (user_id, portal_role, clearance_role, updated_at)
         values ($1, $2, $3, now())
         on conflict (user_id) do update set
           portal_role = excluded.portal_role,
           clearance_role = excluded.clearance_role,
           updated_at = now()`,
        [grant.user_id, grant.portal_role, grant.clearance_role],
      );
    },
    async reviewerCaseIds(reviewerId) {
      const rows = await query<{ id: string }>(
        'select id from iro_cases where reviewer_id = $1',
        [reviewerId],
      );
      return rows.map((row) => row.id);
    },
  };
}

let memorySingleton: IroPortalStore | null = null;
let storeOverride: IroPortalStore | null = null;

export function __setIroPortalStoreForTests(store: IroPortalStore | null): void {
  storeOverride = store;
}

export function getIroPortalStore(): IroPortalStore {
  if (storeOverride) return storeOverride;
  if (process.env.ENABLE_AWS_DB === 'true' && (process.env.DATABASE_URL || process.env.DB_HOST)) {
    if (!pgSingleton) pgSingleton = createPgIroPortalStore();
    return pgSingleton;
  }
  if (!memorySingleton) memorySingleton = createMemoryIroPortalStore();
  return memorySingleton;
}
