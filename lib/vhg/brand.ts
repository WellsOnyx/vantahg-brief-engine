import type { VhgBand } from './types';

/**
 * User-visible brand. The trademark sits immediately after VHG.
 * Do not use this string in identifiers, routes, or query keys.
 */
export const VHG_BRAND = 'VHG\u2122';

/** Heading form: the brand, then the word Score. */
export const VHG_SCORE_LABEL = `${VHG_BRAND} Score`;

export const LIKELY_IDR_CONTESTED_LABEL = 'Likely IDR Contested Score';

export function vhgBandLabel(band: VhgBand): 'Low' | 'Moderate' | 'High' {
  if (band === 'high') return 'High';
  if (band === 'medium') return 'Moderate';
  return 'Low';
}
