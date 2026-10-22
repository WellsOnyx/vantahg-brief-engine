import { billedToQpaRatio } from './redact';
import { displayFit, marginalPoints, publicTerms, rawLogOdds, scoreFromLogOdds } from './cms/model';
import { loadCmsFeatureRates } from './cms/rates';
import type { CmsFeatureRates } from './cms/rates';
import type { VhgScore, VhgScoreDriver, VhgScoreInput } from './types';
import { VHG_SCORE_LABEL } from './brand';
import { VHG_SCORE_ADVISORY } from './types';

/**
 * Likely IDR Contested Score.
 * Fit only on CMS Federal IDR public use files, the data dictionary, and
 * supplemental tables. Private case tables, case buckets, and synthetic
 * IDR filings are not inputs.
 */
export function scoreVhgCase(input: VhgScoreInput, rates: CmsFeatureRates = loadCmsFeatureRates()): VhgScore {
  const ratio = billedToQpaRatio(input.billed_amount, input.qpa_amount);
  const terms = publicTerms(input, rates, ratio);
  const logOdds = rawLogOdds(terms);
  const fit = displayFit(rates);
  const score = scoreFromLogOdds(logOdds, fit);
  const code = rates.service_codes.find((row) => row.code === input.cpt.toUpperCase());
  const bucket = rates.provider_type_buckets.find((row) => row.bucket === input.specialty);
  const matched = code ?? null;
  const drivers: VhgScoreDriver[] = terms
    .map((term) => {
      const points = marginalPoints(logOdds, term.weight, fit);
      return {
        key: term.key,
        label: term.label,
        direction: term.weight < 0 || points < 0 ? 'decreases' : 'increases',
        points,
        detail: term.detail,
      } satisfies VhgScoreDriver;
    })
    .filter((driver, index) => driver.points !== 0 || terms[index].weight !== 0)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points) || a.key.localeCompare(b.key));

  const sample = matched ?? bucket;
  const providerWins = sample?.provider_prevailing_n ?? 0;
  const payerWins = sample?.plan_prevailing_n ?? 0;

  return {
    score,
    band: bandForScore(score),
    drivers,
    pattern_lookup: {
      match_level: matched ? 'cms_service_code' : bucket ? 'cms_provider_type' : 'none',
      sample_size: sample?.n ?? 0,
      provider_wins: providerWins,
      payer_wins: payerWins,
      settled: 0,
      provider_win_rate: sample?.provider_prevailing_rate ?? null,
    },
    model_id: 'vhg-score-cms-puf-v1',
    model_status: 'demo_not_validated',
    data_source: 'CMS public IDR PUF',
    source_files: rates.files
      .filter((file) => file.role === 'puf' || file.role === 'supplemental' || file.role === 'data_dictionary')
      .map((file) => ({
        id: file.id,
        period: file.period,
        published_as_of: file.published_as_of,
        sha256: file.sha256,
      })),
    label: VHG_SCORE_LABEL,
    trademark: 'TM',
    advisory: VHG_SCORE_ADVISORY,
  };
}

export function bandForScore(score: number): VhgScore['band'] {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}
