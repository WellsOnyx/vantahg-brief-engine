/**
 * Minimal RFC 5545 iCalendar generator for the kickoff weekly check-in.
 *
 * Scope is intentionally narrow: one recurring weekly event with a single
 * organizer + attendee list. No exceptions, no RDATEs, no time-zone DB
 * embeds — we emit times in UTC since recipients' mail clients translate
 * to local on display. That sidesteps the VTIMEZONE block which is the
 * messiest part of the spec.
 *
 * METHOD:REQUEST is what gets Outlook / Gmail to render Accept / Decline.
 * METHOD:PUBLISH is just a one-way feed. We use REQUEST so the TPA can
 * RSVP from their email client.
 */

const WEEKDAYS = {
  mon: 'MO',
  tue: 'TU',
  wed: 'WE',
  thu: 'TH',
  fri: 'FR',
} as const;

export type Weekday = keyof typeof WEEKDAYS;

export interface IcalAttendee {
  email: string;
  name?: string | null;
  /** RSVP rendering hint for mail clients. Defaults to true (show RSVP buttons). */
  rsvp?: boolean;
}

export interface KickoffEventInput {
  /** Stable identifier — typically `kickoff-${signupId}` so re-sending
   *  updates the same calendar entry instead of creating a duplicate. */
  uid: string;
  /** Title shown on the calendar entry. */
  summary: string;
  /** Body text. Newlines and commas are escaped per RFC 5545. */
  description: string;
  /** First occurrence in UTC. Recurrence is one week later, same UTC time. */
  startUtc: Date;
  /** Duration in minutes. Defaults to 30. */
  durationMinutes?: number;
  /** Weekday for the weekly RRULE byday. */
  weekday: Weekday;
  /** Optional location string (video link, room name). */
  location?: string;
  /** Event organizer. */
  organizer: IcalAttendee;
  /** Required attendees. Empty array is allowed but unusual. */
  attendees: IcalAttendee[];
  /** Optional sequence — bump to override a prior REQUEST in a calendar
   *  client. Defaults to 0 (first send). */
  sequence?: number;
}

/**
 * Build a single VEVENT-in-VCALENDAR iCal string. Returns text/calendar
 * content suitable for attaching to an email or serving directly.
 */
export function buildKickoffIcal(input: KickoffEventInput): string {
  const durationMin = input.durationMinutes ?? 30;
  const endUtc = new Date(input.startUtc.getTime() + durationMin * 60 * 1000);
  const dtstamp = formatIcalDate(new Date());

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VantaUM//Onboarding Kickoff//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${escapeIcalField(input.uid)}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${formatIcalDate(input.startUtc)}`,
    `DTEND:${formatIcalDate(endUtc)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${WEEKDAYS[input.weekday]}`,
    `SUMMARY:${escapeIcalText(input.summary)}`,
    `DESCRIPTION:${escapeIcalText(input.description)}`,
    `SEQUENCE:${input.sequence ?? 0}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
  ];

  if (input.location) {
    lines.push(`LOCATION:${escapeIcalText(input.location)}`);
  }

  lines.push(formatAttendee('ORGANIZER', input.organizer));
  for (const att of input.attendees) {
    lines.push(formatAttendee('ATTENDEE', att));
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');

  // RFC 5545 requires CRLF line endings.
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

function formatIcalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function escapeIcalField(value: string): string {
  // UIDs and similar — strip CR / LF only. Don't escape commas etc since
  // UIDs are typed as text without TEXT VALUE.
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function escapeIcalText(value: string): string {
  // RFC 5545 §3.3.11 — escape backslash, semicolon, comma, newline.
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function formatAttendee(kind: 'ORGANIZER' | 'ATTENDEE', att: IcalAttendee): string {
  const params: string[] = [];
  if (att.name) {
    params.push(`CN=${escapeIcalText(att.name)}`);
  }
  if (kind === 'ATTENDEE' && att.rsvp !== false) {
    params.push('RSVP=TRUE');
  }
  if (kind === 'ATTENDEE') {
    params.push('ROLE=REQ-PARTICIPANT', 'PARTSTAT=NEEDS-ACTION');
  }
  const prefix = params.length > 0 ? `${kind};${params.join(';')}` : kind;
  return `${prefix}:mailto:${att.email}`;
}

/**
 * RFC 5545 §3.1 — lines must be no longer than 75 octets. Continuation
 * lines start with a single space. Most clients are forgiving but
 * Microsoft Exchange in particular trips on long unfolded lines.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  out.push(line.slice(0, 75));
  i = 75;
  while (i < line.length) {
    out.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return out.join('\r\n');
}

/**
 * Given a desired weekday + time-of-day, return the next future
 * occurrence as a UTC Date. Used to set DTSTART for the kickoff event.
 *
 * Inputs:
 *   - weekday: 'mon' | 'tue' | ...
 *   - timeOfDay: "HH:MM" 24h
 *   - now: reference time. If the requested weekday/time is later this
 *          week, returns this week's instance; otherwise next week.
 *
 * Time is interpreted as UTC for simplicity (the V1 kickoff scheduler
 * doesn't ask for a time zone). The TPA's mail client will translate
 * to local on render.
 */
export function nextWeekdayOccurrenceUtc(
  weekday: Weekday,
  timeOfDay: string,
  now: Date = new Date(),
): Date {
  const [hStr, mStr] = timeOfDay.split(':');
  const hh = Math.max(0, Math.min(23, parseInt(hStr ?? '10', 10) || 0));
  const mm = Math.max(0, Math.min(59, parseInt(mStr ?? '0', 10) || 0));

  const targetWeekdayIndex = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(weekday);
  const currentWeekdayIndex = now.getUTCDay();

  let daysAhead = targetWeekdayIndex - currentWeekdayIndex;
  if (daysAhead < 0) daysAhead += 7;

  const candidate = new Date(now);
  candidate.setUTCDate(candidate.getUTCDate() + daysAhead);
  candidate.setUTCHours(hh, mm, 0, 0);

  // If the candidate is today but the time has already passed, slip to
  // next week.
  if (candidate.getTime() <= now.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 7);
  }
  return candidate;
}
