import { describe, it, expect } from 'vitest';
import {
  buildKickoffIcal,
  nextWeekdayOccurrenceUtc,
  type KickoffEventInput,
} from '@/lib/calendar/ical-generator';

/**
 * Tests for the minimal RFC 5545 iCal generator. We don't try to
 * round-trip through a strict parser (no dep) — instead we assert
 * presence of the canonical lines + escaping behavior + the
 * "next occurrence" math which is the most error-prone bit.
 */

const baseInput: KickoffEventInput = {
  uid: 'kickoff-signup-123',
  summary: 'Weekly check-in: Acme TPA ↔ VantaUM Delivery',
  description: 'Status sync with your VantaUM Delivery Lead.\nAgenda link to follow.',
  startUtc: new Date(Date.UTC(2026, 4, 18, 14, 0, 0)), // Mon May 18 2026 14:00 UTC
  weekday: 'mon',
  organizer: { name: 'VantaUM Delivery', email: 'delivery@vantaum.com' },
  attendees: [{ name: 'Jane TPA', email: 'jane@acme.example' }],
};

describe('buildKickoffIcal', () => {
  it('emits a well-formed VCALENDAR + VEVENT envelope', async () => {
    const ics = buildKickoffIcal(baseInput);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('uses UTC zulu format for DTSTART / DTEND with default 30-min duration', () => {
    const ics = buildKickoffIcal(baseInput);
    expect(ics).toContain('DTSTART:20260518T140000Z');
    expect(ics).toContain('DTEND:20260518T143000Z');
  });

  it('renders RRULE byday from the weekday key', () => {
    expect(buildKickoffIcal({ ...baseInput, weekday: 'mon' })).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO');
    expect(buildKickoffIcal({ ...baseInput, weekday: 'wed' })).toContain('RRULE:FREQ=WEEKLY;BYDAY=WE');
    expect(buildKickoffIcal({ ...baseInput, weekday: 'fri' })).toContain('RRULE:FREQ=WEEKLY;BYDAY=FR');
  });

  it('escapes commas, semicolons, backslashes, and newlines in TEXT fields', () => {
    const ics = buildKickoffIcal({
      ...baseInput,
      summary: 'Weekly: TPA, VantaUM; sync',
      description: 'Line 1\nLine 2 with \\ backslash',
    });
    expect(ics).toContain('SUMMARY:Weekly: TPA\\, VantaUM\\; sync');
    expect(ics).toContain('DESCRIPTION:Line 1\\nLine 2 with \\\\ backslash');
  });

  it('renders ORGANIZER and ATTENDEE rows with mailto and CN params', () => {
    const ics = buildKickoffIcal({
      ...baseInput,
      attendees: [
        { name: 'Jane TPA', email: 'jane@acme.example' },
        { name: 'Bob TPA', email: 'bob@acme.example', rsvp: false },
      ],
    });
    expect(ics).toContain('ORGANIZER;CN=VantaUM Delivery:mailto:delivery@vantaum.com');
    expect(ics).toContain('ATTENDEE;CN=Jane TPA;RSVP=TRUE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:jane@acme.example');
    // rsvp:false should drop the RSVP=TRUE
    expect(ics).toContain('ATTENDEE;CN=Bob TPA;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:bob@acme.example');
  });

  it('uses CRLF line endings (RFC 5545 compliance)', () => {
    const ics = buildKickoffIcal(baseInput);
    expect(ics.includes('\r\n')).toBe(true);
    // No bare LF without CR
    expect(ics.split('\r\n').join('').includes('\n')).toBe(false);
  });

  it('folds lines longer than 75 octets at column 75 with leading space continuation', () => {
    const longDescription = 'X'.repeat(200);
    const ics = buildKickoffIcal({ ...baseInput, description: longDescription });
    const lines = ics.split('\r\n');
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });

  it('emits SEQUENCE — defaults to 0, honors override for resend', () => {
    expect(buildKickoffIcal(baseInput)).toContain('SEQUENCE:0');
    expect(buildKickoffIcal({ ...baseInput, sequence: 2 })).toContain('SEQUENCE:2');
  });
});

describe('nextWeekdayOccurrenceUtc', () => {
  it('returns the same day if the time is later today', () => {
    // Wed May 13 2026 09:00 UTC; want Wed at 10:00
    const now = new Date(Date.UTC(2026, 4, 13, 9, 0, 0));
    const next = nextWeekdayOccurrenceUtc('wed', '10:00', now);
    expect(next.toISOString()).toBe('2026-05-13T10:00:00.000Z');
  });

  it('slips to next week when the time has already passed today', () => {
    // Wed May 13 2026 11:00 UTC; want Wed at 10:00 → should be next Wed
    const now = new Date(Date.UTC(2026, 4, 13, 11, 0, 0));
    const next = nextWeekdayOccurrenceUtc('wed', '10:00', now);
    expect(next.toISOString()).toBe('2026-05-20T10:00:00.000Z');
  });

  it('rolls forward to the next instance of a different weekday', () => {
    // Wed May 13 2026 09:00 UTC; want Friday at 14:00
    const now = new Date(Date.UTC(2026, 4, 13, 9, 0, 0));
    const next = nextWeekdayOccurrenceUtc('fri', '14:00', now);
    expect(next.toISOString()).toBe('2026-05-15T14:00:00.000Z');
  });

  it('wraps across the week boundary when target is earlier in the week', () => {
    // Fri May 15 2026 16:00 UTC; want Mon at 10:00 → next Mon
    const now = new Date(Date.UTC(2026, 4, 15, 16, 0, 0));
    const next = nextWeekdayOccurrenceUtc('mon', '10:00', now);
    expect(next.toISOString()).toBe('2026-05-18T10:00:00.000Z');
  });
});
