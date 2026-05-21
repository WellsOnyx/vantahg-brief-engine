/**
 * Rotating sign-in taglines for /login.
 *
 * Tone (locked 2026-05-21):
 *   - Concierge-quiet. Editorial, not cheerful.
 *   - Two short sentences, never more.
 *   - No exclamation points. No emoji. No first-person plural.
 *   - Each line should land like a thought, not a slogan.
 *   - Playful is OK only when it's also disciplined — a tilt of the
 *     head, not a wink.
 *
 * If you add to this list, keep the cadence. If a tagline reads
 * like it could be on a coffee mug, remove it.
 */
export const loginTaglines: { title: string; sub?: string }[] = [
  { title: 'The room is quiet. Your work is waiting.' },
  { title: 'Slow morning. Real work.' },
  { title: 'You’re back. The cases noticed.' },
  { title: 'Coffee’s on. So is the queue.' },
  { title: 'Quiet hands. Loud care.' },
  { title: 'No noise. Just the next file.' },
  { title: 'The lobby is empty. Step through.' },
  { title: 'Where the careful work happens.' },
  { title: 'Soft chairs, sharp eyes.' },
  { title: 'The reviewers are listening.' },
  { title: 'A still room, by design.' },
  { title: 'No alerts. Only attention.' },
  { title: 'You arrive. The work begins.' },
  { title: 'Light off the brass. Files on the desk.' },
  { title: 'The kettle is on. So are we.' },
  { title: 'Velvet rope, plain language.' },
  { title: 'Concierge hours. Clinical care.' },
  { title: 'The pages are paginated. The patients are not.' },
  { title: 'Less hurry. More accuracy.' },
  { title: 'A quiet morning is a productive morning.' },
  { title: 'You’re early. Good.' },
  { title: 'Doors locked. Minds open.' },
  { title: 'No queues here. Only people.' },
  { title: 'The work is patient. So is the room.' },
  { title: 'Soft step. Steady hand.' },
  { title: 'Brass, paper, and time.' },
  { title: 'Members on one side. You on the other.' },
  { title: 'The room remembers your last case.' },
  { title: 'Slow is smooth. Smooth is reviewed.' },
  { title: 'A second pair of eyes. Yours.' },
];

export function pickLoginTagline(seed?: number): { title: string; sub?: string } {
  const i = seed === undefined
    ? Math.floor(Math.random() * loginTaglines.length)
    : seed % loginTaglines.length;
  return loginTaglines[i];
}
