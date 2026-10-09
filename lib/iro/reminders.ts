import { randomUUID } from 'crypto';
import type { IroPhysician, IroReminder } from './types';

export const LICENSE_REMINDER_DAYS = 60;
export const RECREDENTIAL_REMINDER_DAYS = 90;

function daysUntil(iso: string, now: Date): number {
  const due = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Math.floor((due - now.getTime()) / 86_400_000);
}

export function scanReminders(physicians: readonly IroPhysician[], now: Date): IroReminder[] {
  const reminders: IroReminder[] = [];
  const push = (row: Omit<IroReminder, 'id' | 'status'>) => {
    reminders.push({ ...row, id: randomUUID(), status: 'open' });
  };

  for (const physician of physicians) {
    if (physician.status === 'denied') continue;
    for (const license of physician.licenses) {
      if (!license.expires_on || license.status === 'expired') continue;
      const delta = daysUntil(license.expires_on, now);
      if (delta <= LICENSE_REMINDER_DAYS) {
        push({
          physician_id: physician.id,
          display_name: physician.display_name,
          kind: 'license_expiry',
          due_on: license.expires_on,
          message: `${license.state} license expires ${license.expires_on}`,
        });
      }
    }
    if (physician.recredential_due_at) {
      const delta = daysUntil(physician.recredential_due_at, now);
      if (delta <= RECREDENTIAL_REMINDER_DAYS) {
        push({
          physician_id: physician.id,
          display_name: physician.display_name,
          kind: 'recredentialing',
          due_on: physician.recredential_due_at.slice(0, 10),
          message: `Recredentialing due ${physician.recredential_due_at.slice(0, 10)}`,
        });
      }
    }
    for (const item of physician.outstanding_items) {
      if (item.resolved_at) continue;
      const overdue = item.due_on ? daysUntil(item.due_on, now) < 0 : true;
      if (overdue) {
        push({
          physician_id: physician.id,
          display_name: physician.display_name,
          kind: 'outstanding_item',
          due_on: item.due_on,
          message: item.label,
        });
      }
    }
    for (const agreement of physician.agreements) {
      if (agreement.status === 'outstanding') {
        push({
          physician_id: physician.id,
          display_name: physician.display_name,
          kind: 'agreement',
          due_on: null,
          message: `${agreement.title} is outstanding`,
        });
      }
    }
  }
  return reminders;
}
