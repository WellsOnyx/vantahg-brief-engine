import type { LineOfBusiness } from '@/lib/lines/types';
import type { CredentialStatus, PanelActivation } from '../types';

/**
 * Vendor slots for open decisions (a), (c), (d), (e), and credentialing (f).
 * No implementation in this slice selects a vendor or places a network call.
 */

export interface EmrPullRequest {
  case_ref: string;
}

export interface EmrPullResult {
  configured: false;
  live_call: false;
  records: [];
}

/** (a) EMR connection vs standalone. Standalone intake is the default. */
export interface EmrAdapter {
  readonly vendor: null;
  readonly live_call: false;
  readonly decision: 'a';
  pull(input: EmrPullRequest): EmrPullResult;
}

export interface MailingRequest {
  case_id: string;
  channel: 'regular' | 'certified';
  to_ref: string;
}

export interface MailingReceipt {
  ok: true;
  live_call: false;
  vendor: null;
  delivered: boolean;
  manual_fallback: boolean;
  channel: 'regular' | 'certified';
  at: string;
}

/** (c) Mailing API, regular and certified, with a manual fallback. */
export interface MailingAdapter {
  readonly vendor: null;
  readonly live_call: false;
  readonly decision: 'c';
  send(input: MailingRequest): MailingReceipt;
}

export interface PhoneMessage {
  case_id: string;
  urgent: boolean;
  /** Opaque token. Do not put a patient name or number here. */
  token: string;
}

export interface PhoneLog {
  id: string;
  case_id: string;
  escalated: boolean;
  live_call: false;
  vendor: null;
}

/** (d) 24/7 phone line. Messages link to a case and can escalate. */
export interface PhoneLineAdapter {
  readonly vendor: null;
  readonly live_call: false;
  readonly decision: 'd';
  logMessage(input: PhoneMessage): PhoneLog;
}

export interface StoredOriginal {
  key: string;
  case_id: string;
  line_of_business: LineOfBusiness;
  revision: number;
  bytes: number;
}

/** (e) File storage. Originals are immutable; later bytes are a new revision. */
export interface IroStorageAdapter {
  readonly vendor: null;
  readonly live_call: false;
  readonly decision: 'e';
  putOriginal(input: {
    key: string;
    case_id: string;
    line_of_business: LineOfBusiness;
    bytes: number;
  }): { ok: true; object: StoredOriginal } | { ok: false; code: 'immutable_original' };
  putRevision(input: {
    key: string;
    case_id: string;
    line_of_business: LineOfBusiness;
    bytes: number;
  }): { ok: true; object: StoredOriginal } | { ok: false; code: 'original_missing' };
}

/**
 * Credentialing read. Portals see status only.
 * HR files, license numbers, and screening packets are not on this interface.
 * Provenance (Vanta-verified or vendor-attested) is stored on the shared
 * record in lib/credentialing. Decision (f) stays open. This read does not
 * pick a vendor and does not place a screening call.
 */
export interface CredentialingService {
  readonly vendor: null;
  readonly live_call: false;
  readonly decision: 'f';
  readStatus(physicianId: string): CredentialStatus | null;
  readPanelActivation(physicianId: string): PanelActivation | null;
}
