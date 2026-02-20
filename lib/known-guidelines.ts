/**
 * Known clinical guideline reference database.
 * Used by the fact-checker to verify that cited guidelines are real
 * and not hallucinated by an AI model.
 */

export interface KnownGuideline {
  name: string;
  aliases: string[];
  organization: string;
  category: 'criteria_set' | 'specialty_society' | 'government' | 'evidence_review';
}

export const knownGuidelines: KnownGuideline[] = [
  // ── Major Criteria Sets ───────────────────────────────────────────────────
  {
    name: 'InterQual',
    aliases: ['interqual', 'inter qual', 'iq criteria', 'interqual 2026', 'interqual 2025', 'interqual 2024', 'interqual criteria'],
    organization: 'Change Healthcare / Optum',
    category: 'criteria_set',
  },
  {
    name: 'MCG (Milliman Care Guidelines)',
    aliases: ['mcg', 'milliman', 'milliman care guidelines', 'mcg guidelines', 'mcg 27th', 'mcg 26th', 'mcg 28th'],
    organization: 'Milliman',
    category: 'criteria_set',
  },
  {
    name: 'ACR Appropriateness Criteria',
    aliases: ['acr', 'acr appropriateness', 'acr criteria', 'american college of radiology', 'acr appropriateness criteria'],
    organization: 'American College of Radiology',
    category: 'specialty_society',
  },

  // ── Specialty Society Guidelines ──────────────────────────────────────────
  {
    name: 'NCCN Clinical Practice Guidelines in Oncology',
    aliases: ['nccn', 'nccn guidelines', 'nccn compendium', 'national comprehensive cancer network'],
    organization: 'National Comprehensive Cancer Network',
    category: 'specialty_society',
  },
  {
    name: 'AAOS Clinical Practice Guidelines',
    aliases: ['aaos', 'aaos guidelines', 'american academy of orthopaedic surgeons', 'aaos cpg'],
    organization: 'American Academy of Orthopaedic Surgeons',
    category: 'specialty_society',
  },
  {
    name: 'AAN Clinical Practice Guidelines',
    aliases: ['aan', 'aan guidelines', 'american academy of neurology'],
    organization: 'American Academy of Neurology',
    category: 'specialty_society',
  },
  {
    name: 'AASM Clinical Practice Guidelines',
    aliases: ['aasm', 'aasm guidelines', 'american academy of sleep medicine'],
    organization: 'American Academy of Sleep Medicine',
    category: 'specialty_society',
  },
  {
    name: 'APA Practice Guidelines',
    aliases: ['apa', 'apa guidelines', 'american psychiatric association', 'apa practice guidelines'],
    organization: 'American Psychiatric Association',
    category: 'specialty_society',
  },
  {
    name: 'ASIPP Guidelines for Interventional Techniques',
    aliases: ['asipp', 'asipp guidelines', 'american society of interventional pain physicians'],
    organization: 'American Society of Interventional Pain Physicians',
    category: 'specialty_society',
  },
  {
    name: 'ACR Guidelines for Management of Rheumatoid Arthritis',
    aliases: ['acr ra', 'acr rheumatoid', 'acr rheumatology guidelines'],
    organization: 'American College of Rheumatology',
    category: 'specialty_society',
  },
  {
    name: 'AGA Clinical Practice Guidelines',
    aliases: ['aga', 'aga guidelines', 'american gastroenterological association'],
    organization: 'American Gastroenterological Association',
    category: 'specialty_society',
  },
  {
    name: 'AAD Guidelines for Psoriasis Management',
    aliases: ['aad', 'aad guidelines', 'american academy of dermatology'],
    organization: 'American Academy of Dermatology',
    category: 'specialty_society',
  },
  {
    name: 'ASCO Clinical Practice Guidelines',
    aliases: ['asco', 'asco guidelines', 'american society of clinical oncology'],
    organization: 'American Society of Clinical Oncology',
    category: 'specialty_society',
  },
  {
    name: 'AHA/ACC Clinical Practice Guidelines',
    aliases: ['aha', 'acc', 'aha/acc', 'american heart association', 'american college of cardiology'],
    organization: 'AHA / ACC',
    category: 'specialty_society',
  },
  {
    name: 'NASS Clinical Guidelines',
    aliases: ['nass', 'nass guidelines', 'north american spine society'],
    organization: 'North American Spine Society',
    category: 'specialty_society',
  },
  {
    name: 'Cochrane Reviews',
    aliases: ['cochrane', 'cochrane review', 'cochrane systematic review', 'cochrane collaboration'],
    organization: 'Cochrane Collaboration',
    category: 'evidence_review',
  },

  // ── Government / CMS ─────────────────────────────────────────────────────
  {
    name: 'CMS National Coverage Determination (NCD)',
    aliases: ['cms ncd', 'ncd', 'national coverage determination', 'cms national coverage', 'medicare ncd'],
    organization: 'Centers for Medicare & Medicaid Services',
    category: 'government',
  },
  {
    name: 'CMS Local Coverage Determination (LCD)',
    aliases: ['cms lcd', 'lcd', 'local coverage determination', 'medicare lcd'],
    organization: 'Centers for Medicare & Medicaid Services',
    category: 'government',
  },
  {
    name: 'CMS Benefit Policy Manual',
    aliases: ['cms benefit policy', 'medicare benefit policy manual', 'cms therapy services'],
    organization: 'Centers for Medicare & Medicaid Services',
    category: 'government',
  },
  {
    name: 'CMS Home Health Conditions of Participation',
    aliases: ['cms home health', 'home health cop', 'conditions of participation'],
    organization: 'Centers for Medicare & Medicaid Services',
    category: 'government',
  },

  // ── AHRQ ──────────────────────────────────────────────────────────────────
  {
    name: 'AHRQ Evidence Reports',
    aliases: ['ahrq', 'agency for healthcare research and quality', 'ahrq evidence', 'ahrq guidelines'],
    organization: 'Agency for Healthcare Research and Quality',
    category: 'government',
  },

  // ── Additional specialty references ───────────────────────────────────────
  {
    name: 'USPSTF Recommendations',
    aliases: ['uspstf', 'us preventive services task force', 'preventive services task force'],
    organization: 'US Preventive Services Task Force',
    category: 'government',
  },
  {
    name: 'Hayes Health Technology Assessments',
    aliases: ['hayes', 'hayes hta', 'hayes health technology'],
    organization: 'Hayes Inc.',
    category: 'evidence_review',
  },
  {
    name: 'ECRI Institute Guidelines',
    aliases: ['ecri', 'ecri institute', 'ecri guidelines'],
    organization: 'ECRI Institute',
    category: 'evidence_review',
  },
  {
    name: 'UpToDate',
    aliases: ['uptodate', 'up to date'],
    organization: 'Wolters Kluwer',
    category: 'evidence_review',
  },
];

/**
 * Fuzzy-match a cited guideline string against known guidelines.
 * Returns the matched guideline or null if unrecognized.
 */
export function findKnownGuideline(cited: string): KnownGuideline | null {
  const lower = cited.toLowerCase().trim();

  for (const guideline of knownGuidelines) {
    // Check canonical name
    if (lower.includes(guideline.name.toLowerCase())) {
      return guideline;
    }
    // Check aliases
    for (const alias of guideline.aliases) {
      if (lower.includes(alias)) {
        return guideline;
      }
    }
  }

  return null;
}

/**
 * Checks whether a citation string matches recognized regulatory/statutory patterns.
 * Detects fake statute numbers and fabricated regulatory references.
 */
export function isRecognizedRegulatoryFormat(citation: string): boolean {
  const patterns = [
    // CMS references
    /cms\s+(ncd|lcd|ncd\s*\/?\s*lcd)/i,
    /\b(ncd|lcd)\s*[-#]?\s*\d/i,
    /\bL\d{4,5}\b/,                     // LCD numbers like L33718
    /\bNCD\s+\d{1,3}\.\d/i,             // NCD numbers like NCD 20.29
    // CFR references
    /\b42\s*CFR\s*\d/i,
    // State regulations
    /\b(state|federal)\s+(regulation|statute|law|code|requirement)/i,
    // Known org abbreviations
    /\b(InterQual|MCG|ACR|NCCN|AAOS|AAN|AASM|APA|ASIPP|AGA|AAD|ASCO|AHA|ACC|NASS|AHRQ|USPSTF)\b/i,
    // Cochrane
    /cochrane/i,
    // FDA
    /\bFDA[\s-]approved/i,
  ];

  return patterns.some((p) => p.test(citation));
}
