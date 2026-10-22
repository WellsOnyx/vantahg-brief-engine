import { VHG_SCORE_LABEL } from './brand';
import type { VhgScore } from './types';
import { VHG_SCORE_ADVISORY } from './types';

/**
 * Frozen score for the client walkthrough default.
 * `/demo` passes a live `demoWalkthroughVhgScore()` from the server.
 * A unit test keeps this object equal to that live score.
 * This file does not load the CMS rate table, so the client bundle stays free of `fs`.
 */
export const DEMO_WALKTHROUGH_VHG_SCORE: VhgScore = {

  "score": 60,
  "band": "medium",
  "drivers": [
    {
      "key": "state",
      "label": "State",
      "direction": "increases",
      "points": 17,
      "detail": "CMS supplemental initiations (2024-Q4, 2025-Q1, 2025-Q2, 2025-Q3, 2025-Q4): TX is 38% of published dispute initiations."
    },
    {
      "key": "provider_type",
      "label": "Provider type",
      "direction": "increases",
      "points": 11,
      "detail": "CMS Federal IDR PUF provider-type bucket “radiology” is 20.2% of published line items, provider prevailing rate 92.5%. CMS supplemental Table 14 (2025 Q4): median prevailing offer for Radiology was 398% of QPA."
    },
    {
      "key": "service_code",
      "label": "Service code",
      "direction": "increases",
      "points": 7,
      "detail": "CMS Federal IDR PUF (2024 Q3, 2024 Q4, and 2025 Q4): CPT 72148 has 4,492 published line items and a provider prevailing rate of 91.4%."
    },
    {
      "key": "offer_to_qpa",
      "label": "Offer-to-QPA band",
      "direction": "increases",
      "points": 6,
      "detail": "Billed ÷ QPA is 2.67 (2.5–5× QPA). In the CMS Federal IDR PUF that offer-to-QPA band has provider prevailing rate 88.5% (n=461,019)."
    },
    {
      "key": "place_of_service",
      "label": "Place of service",
      "direction": "increases",
      "points": 4,
      "detail": "CMS Federal IDR PUF: ambulatory surgical center (24) is 4% of published line items (n=122,212)."
    },
    {
      "key": "network_status",
      "label": "Out-of-network provider",
      "direction": "increases",
      "points": 3,
      "detail": "45 CFR 149.510: federal IDR is for qualified out-of-network items. CMS public IDR files are those disputes."
    },
    {
      "key": "outcome_dispersion",
      "label": "Public outcome dispersion",
      "direction": "decreases",
      "points": 0,
      "detail": "CMS Federal IDR PUF 2025 Q4: outcome dispersion is 0.123 across 2 certified entities for this service code, state, and case type. Entity names are not used."
    }
  ],
  "pattern_lookup": {
    "match_level": "cms_service_code",
    "sample_size": 4492,
    "provider_wins": 4104,
    "payer_wins": 387,
    "settled": 0,
    "provider_win_rate": 0.913828
  },
  "model_id": "vhg-score-cms-puf-v1",
  "model_status": "demo_not_validated",
  "data_source": "CMS public IDR PUF",
  "source_files": [
    {
      "id": "puf-2024-q3",
      "period": "2024-Q3",
      "published_as_of": "2025-05-28",
      "sha256": "64c51fd4238562a006f8d6f5427f840fc85b9dc79c861dcd74a65ec5f9c7c3ac"
    },
    {
      "id": "puf-2024-q4",
      "period": "2024-Q4",
      "published_as_of": "2025-05-28",
      "sha256": "a5bdfbc953bce1c25d3f6b3adb20378978c021ffb6187b5dc830b8d38a02fdf1"
    },
    {
      "id": "puf-2025-q4",
      "period": "2025-Q4",
      "published_as_of": "2026-07-22",
      "sha256": "60cac5a2c8af73418312974be14f7e225d560b0d2faed2bf3e20688dc317ada9"
    },
    {
      "id": "data-dictionary",
      "period": "2025-Q4",
      "published_as_of": "2026-07-22",
      "sha256": "dcdb3c2082df311778589652e71bf3ff47d3d3a92650fbd0adebba0a3f96bf76"
    },
    {
      "id": "supplemental-2024-q4",
      "period": "2024-Q4",
      "published_as_of": "2025-05-28",
      "sha256": "0f652b1d24c5d194ca0a5b3cdbcba3dc681ee704a0a1e20051932b893d0cd6ca"
    },
    {
      "id": "supplemental-2025-q1",
      "period": "2025-Q1",
      "published_as_of": "2026-01-21",
      "sha256": "6476de4fee9315847d832191f35fca1769fea2b13adb065788e8aebffed510f9"
    },
    {
      "id": "supplemental-2025-q2",
      "period": "2025-Q2",
      "published_as_of": "2026-01-21",
      "sha256": "27a78801aba74f2ff51befa1c25b84bddad2f3e58101d0ba444c19cb0dafc5d3"
    },
    {
      "id": "supplemental-2025-q3",
      "period": "2025-Q3",
      "published_as_of": "2026-07-22",
      "sha256": "e24e8b9a884077c4ae2a5cf7ee8634a0e1d91ada19344a378e889cc57b6b456e"
    },
    {
      "id": "supplemental-2025-q4",
      "period": "2025-Q4",
      "published_as_of": "2026-07-22",
      "sha256": "69a819c66ac30d9c46eaf1a8af41f8608e7616183e8c11bb8bad373999be1aa8"
    }
  ],
  label: VHG_SCORE_LABEL,
  trademark: 'TM',
  advisory: VHG_SCORE_ADVISORY,
};
