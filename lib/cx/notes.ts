/**
 * Non-PHI CX relationship memory (04 CX view).
 *
 * Gifts, scheduling, hypercare comments — never member names, DOB,
 * clinicals, or packet keys. Separate store from the case object so
 * the Client lens cannot accidentally project these fields.
 */

import { randomUUID } from 'crypto';

export const CX_NOTE_KINDS = [
  'gift',
  'scheduling',
  'relationship',
  'hypercare',
  'commitment',
] as const;
export type CxNoteKind = (typeof CX_NOTE_KINDS)[number];

export interface CxNote {
  note_id: string;
  client_id: string;
  case_id: string | null;
  kind: CxNoteKind;
  body: string;
  created_at: string;
  created_by: string;
}

export interface CxNoteStore {
  insert(row: CxNote): Promise<CxNote>;
  list(filters?: { client_id?: string; case_id?: string }): Promise<CxNote[]>;
}

function cloneNote(row: CxNote): CxNote {
  return { ...row };
}

export class MemoryCxNoteStore implements CxNoteStore {
  private rows: CxNote[] = [];

  async insert(row: CxNote): Promise<CxNote> {
    const copy = cloneNote({ ...row, note_id: row.note_id || randomUUID() });
    this.rows.push(copy);
    return cloneNote(copy);
  }

  async list(filters: { client_id?: string; case_id?: string } = {}): Promise<CxNote[]> {
    return this.rows
      .filter((n) => !filters.client_id || n.client_id === filters.client_id)
      .filter((n) => !filters.case_id || n.case_id === filters.case_id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(cloneNote);
  }

  reset(): void {
    this.rows = [];
  }
}

let memorySingleton: MemoryCxNoteStore | null = null;

export function getMemoryCxNoteStore(): MemoryCxNoteStore {
  if (!memorySingleton) memorySingleton = new MemoryCxNoteStore();
  return memorySingleton;
}

export function resetMemoryCxNoteStore(): MemoryCxNoteStore {
  memorySingleton = new MemoryCxNoteStore();
  return memorySingleton;
}

export function createCxNote(
  input: Omit<CxNote, 'note_id' | 'created_at'> & { note_id?: string; created_at?: string },
  now: () => Date = () => new Date(),
): CxNote {
  return {
    note_id: input.note_id || randomUUID(),
    client_id: input.client_id,
    case_id: input.case_id ?? null,
    kind: input.kind,
    body: input.body,
    created_at: input.created_at || now().toISOString(),
    created_by: input.created_by,
  };
}
