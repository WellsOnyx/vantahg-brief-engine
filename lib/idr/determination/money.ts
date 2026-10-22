/**
 * Offer and QPA amounts are integer cents taken from a source pointer.
 * Unparseable input is MISSING. Values are never rounded or estimated.
 */

export function parseExactCents(raw: string | null): number | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return cents;
}

export function formatCents(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, '0');
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${grouped}.${frac}`;
}

export function currencyTokens(text: string): string[] {
  return [...text.matchAll(/\$\d{1,3}(?:,\d{3})*\.\d{2}/g)].map((match) => match[0]);
}

export function sameMultiset(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const counts = new Map<string, number>();
  for (const item of left) counts.set(item, (counts.get(item) ?? 0) + 1);
  for (const item of right) {
    const next = (counts.get(item) ?? 0) - 1;
    if (next < 0) return false;
    counts.set(item, next);
  }
  return true;
}
