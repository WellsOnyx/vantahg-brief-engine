/**
 * Board completed dates use the America/New_York calendar day.
 * An evening UTC timestamp stays on the New York date.
 */
export function completedDateInNewYork(nowIso: string): string {
  const date = new Date(nowIso);
  if (Number.isNaN(date.getTime())) {
    throw new Error('now() must return an ISO timestamp.');
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error('now() must return an ISO timestamp.');
  }
  return `${year}-${month}-${day}`;
}
