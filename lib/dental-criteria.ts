export interface DentalCriteria {
  name: string;
  typical_criteria: string[];
  common_denial_reasons: string[];
}

export const dentalCriteria: Record<string, DentalCriteria> = {
  "D6010": {
    name: "Endosseous implant",
    typical_criteria: [
      "Adequate bone volume confirmed by imaging",
      "Adjacent teeth not suitable for fixed bridge",
      "Patient is not a minor (growth complete)",
      "No uncontrolled periodontal disease",
      "No uncontrolled diabetes or immunosuppression",
      "Tooth has been missing or extraction planned"
    ],
    common_denial_reasons: [
      "Insufficient bone volume",
      "Viable alternative treatment available (bridge)",
      "Cosmetic indication only",
      "Incomplete documentation / missing radiographs"
    ]
  },
  "D8080": {
    name: "Comprehensive orthodontic treatment",
    typical_criteria: [
      "Handicapping malocclusion documented",
      "HLD score meets plan threshold (typically 26+)",
      "Cephalometric analysis provided",
      "Treatment plan with estimated duration",
      "Patient age and growth considerations documented"
    ],
    common_denial_reasons: [
      "HLD score below threshold",
      "Cosmetic indication only",
      "Missing cephalometric records",
      "Retreatment without documented relapse cause"
    ]
  },
  "D4260": {
    name: "Osseous surgery (4+ teeth per quadrant)",
    typical_criteria: [
      "Probing depths ≥5mm documented",
      "Bone loss confirmed on radiographs",
      "Failed response to scaling and root planing",
      "Comprehensive periodontal charting provided",
      "Non-surgical treatment attempted first"
    ],
    common_denial_reasons: [
      "No evidence of failed conservative treatment",
      "Probing depths do not meet threshold",
      "Missing periodontal charting",
      "Radiographs do not support bone loss diagnosis"
    ]
  },
  "D7240": {
    name: "Surgical extraction of impacted tooth",
    typical_criteria: [
      "Impaction confirmed on radiograph (panoramic or CBCT)",
      "Clinical indication: pain, infection, pathology, orthodontic need",
      "Soft tissue or bony impaction documented",
      "Classification of impaction provided"
    ],
    common_denial_reasons: [
      "Prophylactic removal without clinical indication",
      "Tooth is erupted (not impacted)",
      "Missing radiographic confirmation"
    ]
  },
  "D9222": {
    name: "Deep sedation/general anesthesia (first 15 min)",
    typical_criteria: [
      "Patient is under age 7, or has documented behavioral/cognitive disability",
      "Multiple procedures requiring extended chair time",
      "Failed attempt at treatment under local anesthesia",
      "Medical condition requiring GA (cardiac, airway, etc.)",
      "ASA classification documented"
    ],
    common_denial_reasons: [
      "Patient does not meet age or disability criteria",
      "No documentation of failed local anesthesia attempt",
      "Single simple procedure does not justify GA",
      "Missing ASA classification"
    ]
  }
};

// Common CDT codes for the intake form helper
export const commonDentalCodes = [
  { code: "D0210", name: "Intraoral complete series of radiographic images" },
  { code: "D0220", name: "Intraoral periapical first radiographic image" },
  { code: "D0230", name: "Intraoral periapical each additional radiographic image" },
  { code: "D0330", name: "Panoramic radiographic image" },
  { code: "D0367", name: "Cone beam CT capture and interpretation" },
  { code: "D1110", name: "Prophylaxis - adult" },
  { code: "D2740", name: "Crown - porcelain/ceramic substrate" },
  { code: "D2750", name: "Crown - porcelain fused to high noble metal" },
  { code: "D2950", name: "Core buildup, including any pins" },
  { code: "D3310", name: "Endodontic therapy, anterior tooth" },
  { code: "D3320", name: "Endodontic therapy, premolar tooth" },
  { code: "D3330", name: "Endodontic therapy, molar tooth" },
  { code: "D4260", name: "Osseous surgery (4+ teeth per quadrant)" },
  { code: "D4341", name: "Periodontal scaling and root planing (4+ teeth per quadrant)" },
  { code: "D5110", name: "Complete denture - maxillary" },
  { code: "D5120", name: "Complete denture - mandibular" },
  { code: "D6010", name: "Endosseous implant" },
  { code: "D6058", name: "Abutment supported porcelain/ceramic crown" },
  { code: "D6065", name: "Implant supported porcelain/ceramic crown" },
  { code: "D7140", name: "Extraction, erupted tooth or exposed root" },
  { code: "D7210", name: "Extraction, surgical (elevation of mucoperiosteal flap)" },
  { code: "D7240", name: "Extraction, surgical (impacted tooth - completely bony)" },
  { code: "D7241", name: "Extraction, surgical (impacted tooth - partially bony)" },
  { code: "D8080", name: "Comprehensive orthodontic treatment - adolescent" },
  { code: "D8090", name: "Comprehensive orthodontic treatment - adult" },
  { code: "D9222", name: "Deep sedation/general anesthesia - first 15 min" },
  { code: "D9223", name: "Deep sedation/general anesthesia - each additional 15 min" },
  { code: "D9230", name: "Inhalation of nitrous oxide/analgesia" },
  { code: "D9310", name: "Consultation - diagnostic service by specialist" },
];

export function getCriteriaForCodes(codes: string[]): Record<string, DentalCriteria> {
  const matched: Record<string, DentalCriteria> = {};
  for (const code of codes) {
    const trimmed = code.trim().toUpperCase();
    if (dentalCriteria[trimmed]) {
      matched[trimmed] = dentalCriteria[trimmed];
    }
  }
  return matched;
}
