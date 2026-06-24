export interface IdrFactor {
  name: string;
  description: string;
  typical_considerations: string[];
  common_decision_factors: string[];
  guideline_references: string[];
}

export const idrCriteria: Record<string, IdrFactor> = {
  // Core NSA IDR factors
  "qpa_comparison": {
    name: "Qualifying Payment Amount (QPA) Comparison",
    description: "Comparison of the payer's offer (QPA) against the provider's billed charge.",
    typical_considerations: [
      "Billed charge vs. QPA differential",
      "Whether QPA was calculated per NSA rules (median contracted rate, geographic area, etc.)",
      "Inflation adjustments applied correctly",
      "Facility vs. non-facility rate applicability"
    ],
    common_decision_factors: [
      "Offer within 10-20% of billed for routine services",
      "Significant outlier (offer <50% of billed without justification)",
      "QPA calculation documentation provided by payer",
      "Similar claims in same market support the QPA"
    ],
    guideline_references: [
      "No Surprises Act (NSA) Regulations 45 CFR § 149",
      "CMS Guidance on Qualifying Payment Amount",
      "NSA IDR Process Rules"
    ]
  },

  "network_status": {
    name: "Out-of-Network Status",
    description: "Confirmation that the provider/facility was out-of-network for the plan at time of service.",
    typical_considerations: [
      "Provider not in-network on date of service",
      "Emergency services exception applicability",
      "Post-stabilization care rules",
      "Ancillary provider status in in-network facility"
    ],
    common_decision_factors: [
      "Clear documentation of out-of-network status",
      "Emergency service that qualifies under NSA",
      "Provider was in-network but ancillary service billed OON improperly",
      "Notice and consent requirements met or waived"
    ],
    guideline_references: [
      "NSA § 2799A-1, § 2799A-2",
      "Emergency Services Definition under NSA"
    ]
  },

  "qualifying_service": {
    name: "Qualifying Item or Service under NSA",
    description: "Whether the billed item/service is subject to the No Surprises Act protections.",
    typical_considerations: [
      "Emergency services",
      "Non-emergency services at in-network facility by out-of-network provider",
      "Air ambulance services",
      "Excluded services (e.g., certain ground ambulance in some cases)"
    ],
    common_decision_factors: [
      "Service meets NSA definition of emergency or qualifying non-emergency",
      "Service performed at in-network facility",
      "Provider gave required notice/consent (or exception applied)",
      "Service is not subject to NSA (e.g., scheduled elective with in-network option)"
    ],
    guideline_references: [
      "No Surprises Act statutory text and implementing regulations"
    ]
  },

  "additional_circumstances": {
    name: "Additional Circumstances",
    description: "Other factors the IDR entity must consider under NSA (training, experience, market share, etc.).",
    typical_considerations: [
      "Provider's training, experience, and quality",
      "Market share of the provider in the geographic region",
      "Complexity of the case or patient's medical condition",
      "Any other relevant information submitted by parties"
    ],
    common_decision_factors: [
      "Provider has unique expertise justifying higher rate",
      "High market concentration in area supports payer's QPA",
      "Patient acuity or complexity not reflected in base rate",
      "No additional circumstances submitted by either party"
    ],
    guideline_references: [
      "NSA IDR Considerations § 2799A-1(c)(5)"
    ]
  }
};

export function getIdrFactors(): IdrFactor[] {
  return Object.values(idrCriteria);
}

export function getIdrFactor(key: string): IdrFactor | undefined {
  return idrCriteria[key];
}
