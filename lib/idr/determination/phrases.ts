import { IdrContentError } from './schema';

/**
 * The two-field CV sentence (board certification and specialty) is house_style.
 * The training and experience factor it fills is public: 45 CFR 149.510(c)(5)(iii)(B)(1).
 * https://www.ecfr.gov/current/title-45/section-149.510
 * CMS Federal Independent Dispute Resolution (IDR) Process Guidance for Certified IDR Entities.
 * Federal Independent Dispute Resolution (IDR) Process Guidance for Disputing Parties, CMS policies and resources.
 */
export const CV_SENTENCE_BASIS = {
  basis: 'house_style',
  citation: '45 CFR 149.510(c)(5)(iii)(B)(1)',
  source_url: 'https://www.ecfr.gov/current/title-45/section-149.510',
} as const;

export function fillPhrase(template: string, vars: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{([a-z0-9_]+)\}\}/g, (full, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
      throw new IdrContentError(`Content phrase is missing a value for {{${key}}}.`);
    }
    return vars[key];
  });
}

export function partyName(party: 'IP' | 'NIP'): string {
  return party === 'IP' ? 'initiating party' : 'non-initiating party';
}
