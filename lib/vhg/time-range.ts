/** Fixed synthetic calendar. "Today" on the stop-loss demo is the last ledger day. */
export const LEDGER_START = '2024-10-14';
export const LEDGER_END = '2026-10-13';

export const GRAINS = ['year', 'quarter', 'month', 'day'] as const;
export type Grain = (typeof GRAINS)[number];

export const QUICK_RANGES = ['ytd', '90', '30', 'today'] as const;
export type QuickRange = (typeof QUICK_RANGES)[number];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function formatISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatISODate(date);
}

export function daysInclusive(from: string, to: string): number {
  const ms = parseISODate(to).getTime() - parseISODate(from).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return formatISODate(parseISODate(value)) === value;
}

export function clampRange(from: string, to: string): { from: string; to: string } {
  let start = from < LEDGER_START ? LEDGER_START : from;
  let end = to > LEDGER_END ? LEDGER_END : to;
  if (start > end) {
    const swap = start;
    start = end;
    end = swap;
  }
  return { from: start, to: end };
}

export function quarterOf(iso: string): { year: number; quarter: number } {
  const month = Number(iso.slice(5, 7));
  return { year: Number(iso.slice(0, 4)), quarter: Math.floor((month - 1) / 3) + 1 };
}

export function monthEnd(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

export function bucketKey(iso: string, grain: Grain): string {
  if (grain === 'year') return iso.slice(0, 4);
  if (grain === 'month') return iso.slice(0, 7);
  if (grain === 'day') return iso;
  const { year, quarter } = quarterOf(iso);
  return `${year}-Q${quarter}`;
}

export function bucketBounds(key: string, grain: Grain): { from: string; to: string } {
  if (grain === 'year') {
    const year = Number(key);
    return clampRange(`${year}-01-01`, `${year}-12-31`);
  }
  if (grain === 'month') {
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(5, 7));
    return clampRange(`${key}-01`, monthEnd(year, month));
  }
  if (grain === 'day') return { from: key, to: key };
  const year = Number(key.slice(0, 4));
  const quarter = Number(key.slice(6));
  const startMonth = (quarter - 1) * 3 + 1;
  return clampRange(
    `${year}-${String(startMonth).padStart(2, '0')}-01`,
    monthEnd(year, startMonth + 2),
  );
}

export function bucketLabel(key: string, grain: Grain): string {
  if (grain === 'year') return key;
  if (grain === 'quarter') return key.replace('-', ' ');
  if (grain === 'month') {
    const month = MONTHS[Number(key.slice(5, 7)) - 1] ?? key;
    return `${month} ${key.slice(0, 4)}`;
  }
  const month = MONTHS[Number(key.slice(5, 7)) - 1] ?? '';
  return `${month} ${Number(key.slice(8, 10))}`;
}

export function nextGrain(grain: Grain): Grain | null {
  if (grain === 'year') return 'quarter';
  if (grain === 'quarter') return 'month';
  if (grain === 'month') return 'day';
  return null;
}

export function drillTarget(
  grain: Grain,
  bucket: { from: string; to: string },
): { grain: Grain; from: string; to: string } {
  const finer = nextGrain(grain);
  if (!finer) return { grain: 'day', from: bucket.from, to: bucket.to };
  return { grain: finer, from: bucket.from, to: bucket.to };
}

export function quickRange(kind: QuickRange, today: string = LEDGER_END): { from: string; to: string; grain: Grain } {
  if (kind === 'today') return { from: today, to: today, grain: 'day' };
  if (kind === '30') return { from: addDays(today, -29), to: today, grain: 'day' };
  if (kind === '90') return { from: addDays(today, -89), to: today, grain: 'month' };
  return { from: `${today.slice(0, 4)}-01-01`, to: today, grain: 'month' };
}
