import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Compact table derived only from CMS Federal IDR public files. */
export interface CmsRateCell {
  n: number;
  share: number;
  provider_prevailing_n: number;
  plan_prevailing_n: number;
  provider_prevailing_rate: number | null;
}

export interface CmsDispersionCell {
  service_code: string;
  state: string;
  case_type: string;
  n_entities: number;
  n_lines: number;
  outcome_dispersion: number;
}

export interface CmsSourceFile {
  id: string;
  role: string;
  period: string;
  published_as_of: string;
  portal_generated: string;
  url: string;
  sha256: string;
  bytes: number;
}

export interface CmsFeatureRates {
  data_source: 'CMS public IDR PUF';
  catalog_version: string;
  offer_unit: string;
  line_items: number;
  provider_prevailing_n: number;
  plan_prevailing_n: number;
  split_n: number;
  provider_prevailing_rate: number | null;
  excluded_from_dispersion_lines: number;
  service_codes: Array<CmsRateCell & { code: string }>;
  states: Array<CmsRateCell & { state: string }>;
  places: Array<CmsRateCell & { pos: string }>;
  provider_type_buckets: Array<CmsRateCell & { bucket: string }>;
  offer_to_qpa_bands: Array<CmsRateCell & { band: string }>;
  case_types: Array<CmsRateCell & { case_type: string }>;
  initiating_party: Record<string, number>;
  arbiter_dispersion: CmsDispersionCell[];
  baselines: {
    service_code_median_share: number | null;
    state_median_share: number | null;
    place_median_share: number | null;
    provider_type_median_share: number | null;
    overall_provider_prevailing_rate: number | null;
    dispersion_median: number | null;
  };
  supplemental: {
    periods: string[];
    initiated_by_party_type: Record<string, number>;
    state_initiations: Record<string, number>;
    state_initiation_share: Record<string, number>;
    payment_outcomes: Record<string, number>;
    qpa_cost_bands: Array<{
      period: string;
      qpa_range: string;
      median_prevailing_offer_pct_of_qpa: number | null;
      payment_determinations: number;
      items: number;
    }>;
    specialties: Array<{
      period: string;
      cpt_range: string;
      specialty: string;
      median_prevailing_offer_pct_of_qpa: number | null;
      payment_determinations: number;
      items: number;
    }>;
  };
  files: CmsSourceFile[];
}

const FILE = path.join(process.cwd(), 'data/cms-idr/derived/feature-rates.json');

let cached: CmsFeatureRates | null = null;

export function loadCmsFeatureRates(): CmsFeatureRates {
  if (cached) return cached;
  const parsed = JSON.parse(readFileSync(FILE, 'utf8')) as CmsFeatureRates;
  if (parsed.data_source !== 'CMS public IDR PUF') {
    throw new Error('VHG score rates are not labeled as CMS public IDR PUF');
  }
  cached = parsed;
  return parsed;
}

export function cmsFeatureRatesPath(): string {
  return FILE;
}
