/**
 * Onboarding kickoff invite delivery.
 *
 * When a TPA finishes the onboarding wizard with a weekly check-in
 * preference (day + time), this module emails them a calendar invite
 * for the recurring meeting. Attaches a single .ics file built by
 * lib/calendar/ical-generator.ts — Outlook + Gmail render the
 * Accept / Decline UI on receipt.
 *
 * Idempotency: tracked via a flag on the signup row's onboarding_data
 * JSON (`kickoff.invite_sent_at`). No migration required since the
 * column is already JSONB. The flag also surfaces in the audit log
 * for cross-checking.
 *
 * Demo mode short-circuits to a stub messageId; no iCal build, no
 * network call, no DB writes.
 */

import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent } from '@/lib/audit';
import { getEmailAdapter } from '@/lib/adapters/email';
import {
  buildKickoffIcal,
  nextWeekdayOccurrenceUtc,
  type Weekday,
} from '@/lib/calendar/ical-generator';
import type { OnboardingData } from '@/lib/onboarding/types';

export interface KickoffInviteResult {
  ok: true;
  already_sent?: boolean;
  skipped?: 'no_kickoff' | 'no_recipient';
  messageId?: string;
  recipient_email?: string;
}

export interface KickoffInviteError {
  ok: false;
  code: 'signup_not_found' | 'send_failed';
  message: string;
}

interface SendOptions {
  /** Email of the actor triggering the send (typically the onboarding user). */
  actor: string;
}

const ALLOWED_WEEKDAYS: ReadonlyArray<Weekday> = ['mon', 'tue', 'wed', 'thu', 'fri'];

export async function sendKickoffInvite(
  signupId: string,
  options: SendOptions,
): Promise<KickoffInviteResult | KickoffInviteError> {
  if (isDemoMode()) {
    return {
      ok: true,
      messageId: `demo-kickoff-${Date.now()}`,
      recipient_email: 'demo-tpa@example.com',
    };
  }

  const supabase = getServiceClient();

  const { data: signup, error } = await supabase
    .from('signup_requests')
    .select('id, legal_name, primary_contact_name, primary_contact_email, onboarding_data')
    .eq('id', signupId)
    .single();

  if (error || !signup) {
    return { ok: false, code: 'signup_not_found', message: error?.message ?? 'No row' };
  }

  const onboarding = (signup.onboarding_data ?? {}) as OnboardingData & {
    kickoff?: OnboardingData['kickoff'] & { invite_sent_at?: string };
  };

  const kickoff = onboarding.kickoff;
  if (!kickoff?.weekly_checkin_day || !kickoff?.weekly_checkin_time) {
    return { ok: true, skipped: 'no_kickoff' };
  }
  if (!ALLOWED_WEEKDAYS.includes(kickoff.weekly_checkin_day as Weekday)) {
    return { ok: true, skipped: 'no_kickoff' };
  }
  if (!signup.primary_contact_email) {
    return { ok: true, skipped: 'no_recipient' };
  }

  // Idempotency: if we already stamped invite_sent_at, surface that and
  // skip re-sending. SEQUENCE bump for legitimate resends is a future
  // concern (would happen if the TPA changes their preferred slot).
  if (kickoff.invite_sent_at) {
    return {
      ok: true,
      already_sent: true,
      recipient_email: signup.primary_contact_email,
    };
  }

  const startUtc = nextWeekdayOccurrenceUtc(
    kickoff.weekly_checkin_day as Weekday,
    kickoff.weekly_checkin_time,
  );

  const tpaName = signup.legal_name ?? 'your team';
  const summary = `Weekly check-in: ${tpaName} <> VantaUM Delivery`;
  const description = [
    `Recurring weekly status sync with your VantaUM Delivery Lead.`,
    ``,
    `First occurrence: ${startUtc.toUTCString()}`,
    `Time zone: UTC (your calendar client will translate to local).`,
    ``,
    `Agenda link and dial-in details will follow before the first session.`,
  ].join('\n');

  const ics = buildKickoffIcal({
    uid: `kickoff-${signupId}@vantaum.com`,
    summary,
    description,
    startUtc,
    weekday: kickoff.weekly_checkin_day as Weekday,
    organizer: { name: 'VantaUM Delivery', email: 'delivery@vantaum.com' },
    attendees: [
      {
        name: signup.primary_contact_name ?? tpaName,
        email: signup.primary_contact_email,
      },
    ],
  });

  const adapter = getEmailAdapter();
  const sendResult = await adapter.send({
    to: signup.primary_contact_email,
    subject: `Welcome to VantaUM — kickoff weekly check-in attached`,
    text: [
      `Hi ${signup.primary_contact_name ?? 'there'},`,
      ``,
      `Onboarding is complete on our end. Attached is a calendar invite for your standing weekly check-in with your VantaUM Delivery Lead.`,
      ``,
      `Accept the invite from your calendar client to add it to your schedule. Decline or reply if you need to reschedule.`,
      ``,
      `Welcome aboard,`,
      `VantaUM Delivery`,
    ].join('\n'),
    attachments: [
      {
        filename: 'kickoff.ics',
        content: Buffer.from(ics, 'utf-8'),
        contentType: 'text/calendar; method=REQUEST; charset=utf-8',
      },
    ],
  });

  if (!sendResult.ok) {
    await logAuditEvent(null, 'onboarding_kickoff_invite_failed', options.actor, {
      signup_id: signupId,
      code: sendResult.code,
      detail: sendResult.message,
    }).catch(() => {});
    return { ok: false, code: 'send_failed', message: sendResult.message };
  }

  const sentAt = new Date().toISOString();
  const updatedKickoff = { ...kickoff, invite_sent_at: sentAt };
  const updatedOnboarding = { ...onboarding, kickoff: updatedKickoff };
  await supabase
    .from('signup_requests')
    .update({ onboarding_data: updatedOnboarding })
    .eq('id', signupId);

  await logAuditEvent(null, 'onboarding_kickoff_invite_sent', options.actor, {
    signup_id: signupId,
    weekly_checkin_day: kickoff.weekly_checkin_day,
    weekly_checkin_time: kickoff.weekly_checkin_time,
    first_occurrence_utc: startUtc.toISOString(),
    message_id: sendResult.messageId,
  }).catch(() => {});

  return {
    ok: true,
    messageId: sendResult.messageId,
    recipient_email: signup.primary_contact_email,
  };
}
