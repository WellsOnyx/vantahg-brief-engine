import type { CredentialingService } from '@/lib/iro/adapters/types';
import { projectCredentialStatus } from '@/lib/iro/credentialing';
import type { PanelActivation } from '@/lib/iro/types';
import { readSharedView } from './service';
import type { CredentialingState } from './types';

/**
 * IRO workflow keeps its status read. The shared record is the source.
 * The projection drops vendor refs, labels, and case fields.
 */
export function iroCredentialingFromShared(state: CredentialingState, asOf: string): CredentialingService {
  return {
    vendor: null,
    live_call: false,
    decision: 'f',
    readStatus(physicianId) {
      const view = readSharedView(state, physicianId, asOf);
      if (!view) return null;
      return projectCredentialStatus({
        physician_id: view.reviewer_id,
        active: view.active,
        specialty_codes: view.specialty_codes,
        licensed_states: view.licensed_states,
        board_certified: view.board_certified,
        expires_at: view.expires_at,
        lines_of_business: ['IRO', 'MEDICAL_REVIEW'],
      });
    },
    readPanelActivation(physicianId): PanelActivation | null {
      const activation = state.activations.find((row) => row.reviewer_id === physicianId);
      if (!activation) return null;
      return {
        physician_id: physicianId,
        approvals: activation.approvals.map((approval) => ({
          approver_role: approval.approver_id,
          recorded_at: approval.recorded_at,
          recorded: true,
        })),
      };
    },
  };
}
