import type { ServiceCategory, ReviewType, CasePriority, FacilityType } from '../types';

/**
 * Raw e-fax payload from the fax provider webhook.
 * Supports common e-fax providers: eFax, RingCentral Fax, OpenFax, Phaxio.
 */
export interface EfaxPayload {
  // Common fields across providers
  fax_id: string;
  from_number: string;
  to_number: string;
  received_at: string;
  page_count: number;

  // Document content (base64 or URL)
  document_url?: string;
  document_base64?: string;
  content_type?: string; // 'application/pdf', 'image/tiff'

  // OCR data (if provider supports it)
  ocr_text?: string;
  ocr_confidence?: number;

  // Provider-specific metadata
  provider?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Parsed clinical data extracted from an e-fax.
 * This is the structured output after OCR + parsing.
 */
export interface ParsedFaxData {
  // What we could extract
  patient_name: string | null;
  patient_dob: string | null;
  patient_member_id: string | null;
  patient_gender: string | null;

  requesting_provider: string | null;
  requesting_provider_npi: string | null;
  requesting_provider_specialty: string | null;
  requesting_provider_fax: string | null;
  requesting_provider_phone: string | null;

  procedure_codes: string[];
  diagnosis_codes: string[];
  procedure_description: string | null;

  service_category: ServiceCategory | null;
  review_type: ReviewType | null;
  priority: CasePriority;
  facility_name: string | null;
  facility_type: FacilityType | null;

  payer_name: string | null;
  plan_type: string | null;

  // Raw OCR text for manual review
  raw_text: string;
  confidence: number; // 0-100 overall confidence in extraction

  // Flags for manual review
  needs_manual_review: boolean;
  manual_review_reasons: string[];
}

/**
 * Parses an e-fax payload into structured clinical data.
 *
 * In production, this would use:
 * 1. OCR service (Google Vision, AWS Textract) for image-based faxes
 * 2. Claude AI for extracting structured data from OCR text
 * 3. NPI registry lookup for provider validation
 *
 * Currently implements basic text extraction patterns.
 */
export function parseEfaxPayload(payload: EfaxPayload): ParsedFaxData {
  const text = payload.ocr_text || '';
  const confidence = payload.ocr_confidence || 0;

  const result: ParsedFaxData = {
    patient_name: extractPattern(text, /patient\s*(?:name)?:\s*([^\n]+)/i),
    patient_dob: extractPattern(text, /(?:dob|date\s*of\s*birth|birth\s*date):\s*([^\n]+)/i),
    patient_member_id: extractPattern(text, /(?:member\s*id|subscriber\s*id|id\s*#?):\s*([^\n]+)/i),
    patient_gender: extractPattern(text, /(?:gender|sex):\s*([^\n]+)/i),

    requesting_provider: extractPattern(text, /(?:requesting|ordering|referring)\s*(?:provider|physician|doctor|dr\.?):\s*([^\n]+)/i),
    requesting_provider_npi: extractNpi(text),
    requesting_provider_specialty: extractPattern(text, /(?:specialty|speciality):\s*([^\n]+)/i),
    requesting_provider_fax: payload.from_number || null,
    requesting_provider_phone: extractPattern(text, /(?:phone|tel|telephone):\s*([^\n]+)/i),

    procedure_codes: extractCptCodes(text),
    diagnosis_codes: extractIcdCodes(text),
    procedure_description: extractPattern(text, /(?:procedure|service|treatment)\s*(?:description|requested)?:\s*([^\n]+)/i),

    service_category: inferServiceCategory(text),
    review_type: inferReviewType(text),
    priority: inferPriority(text),
    facility_name: extractPattern(text, /(?:facility|hospital|clinic|center):\s*([^\n]+)/i),
    facility_type: inferFacilityType(text),

    payer_name: extractPattern(text, /(?:payer|insurance|plan|carrier):\s*([^\n]+)/i),
    plan_type: extractPattern(text, /(?:plan\s*type|product):\s*([^\n]+)/i),

    raw_text: text,
    confidence,

    needs_manual_review: false,
    manual_review_reasons: [],
  };

  // Determine if manual review is needed
  const reviewReasons: string[] = [];
  if (confidence < 70) reviewReasons.push('Low OCR confidence');
  if (!result.patient_name) reviewReasons.push('Patient name not extracted');
  if (!result.requesting_provider) reviewReasons.push('Provider not extracted');
  if (result.procedure_codes.length === 0) reviewReasons.push('No procedure codes found');
  if (!result.payer_name) reviewReasons.push('Payer information missing');
  if (!text || text.length < 50) reviewReasons.push('Insufficient text content');

  result.needs_manual_review = reviewReasons.length > 0;
  result.manual_review_reasons = reviewReasons;

  return result;
}

// ── Helper extractors ──────────────────────────────────────────────────────

function extractPattern(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

function extractNpi(text: string): string | null {
  // NPI is a 10-digit number
  const match = text.match(/(?:npi|national\s*provider)[\s:#]*(\d{10})/i);
  return match ? match[1] : null;
}

function extractCptCodes(text: string): string[] {
  // Match 5-digit CPT codes and HCPCS codes (letter + 4 digits)
  const cptMatches = text.match(/\b\d{5}\b/g) || [];
  const hcpcsMatches = text.match(/\b[A-Z]\d{4}\b/g) || [];

  // Filter out common false positives (zip codes, dates, etc.)
  const validCpt = cptMatches.filter((code) => {
    const num = parseInt(code);
    // CPT codes are typically in these ranges
    return (num >= 10000 && num <= 99999);
  });

  return [...new Set([...validCpt, ...hcpcsMatches])];
}

function extractIcdCodes(text: string): string[] {
  // ICD-10 codes: letter + 2 digits + optional dot + more digits/letters
  const matches = text.match(/\b[A-TV-Z]\d{2}(?:\.\d{1,4})?\b/g) || [];
  return [...new Set(matches)];
}

function inferServiceCategory(text: string): ServiceCategory | null {
  const lower = text.toLowerCase();
  if (/mri|ct\s*scan|x-ray|ultrasound|pet\s*scan|imaging/i.test(lower)) return 'imaging';
  if (/surgery|surgical|arthroplasty|arthroscop|fusion|excision/i.test(lower)) return 'surgery';
  if (/physical\s*therap|occupational\s*therap|speech\s*therap|rehabilitation/i.test(lower)) return 'rehab_therapy';
  if (/infusion|chemotherapy|biologics?|iv\s*therapy/i.test(lower)) return 'infusion';
  if (/mental\s*health|psychiatric|psychology|behavioral/i.test(lower)) return 'behavioral_health';
  if (/dme|wheelchair|cpap|prosthetic|orthotics|durable/i.test(lower)) return 'dme';
  if (/home\s*health|home\s*care|visiting\s*nurse/i.test(lower)) return 'home_health';
  if (/skilled\s*nursing|snf|nursing\s*facility/i.test(lower)) return 'skilled_nursing';
  if (/transplant/i.test(lower)) return 'transplant';
  if (/genetic|genomic/i.test(lower)) return 'genetic_testing';
  if (/pain\s*management|pain\s*clinic|epidural|nerve\s*block/i.test(lower)) return 'pain_management';
  if (/cardio|heart|cardiac|stent|ablation|pacemaker/i.test(lower)) return 'cardiology';
  if (/oncology|cancer|tumor|neoplasm/i.test(lower)) return 'oncology';
  if (/ophthal|eye|cataract|retina|vitreous/i.test(lower)) return 'ophthalmology';
  if (/workers?\s*comp|work\s*injury|occupational\s*injury/i.test(lower)) return 'workers_comp';
  if (/emergency|er\s|ed\s|trauma/i.test(lower)) return 'emergency_medicine';
  return null;
}

function inferReviewType(text: string): ReviewType | null {
  const lower = text.toLowerCase();
  if (/prior\s*auth|pre-?auth|pre-?cert/i.test(lower)) return 'prior_auth';
  if (/concurrent|continued\s*stay/i.test(lower)) return 'concurrent';
  if (/retrospective|retro\s*review/i.test(lower)) return 'retrospective';
  if (/appeal/i.test(lower)) return 'appeal';
  if (/peer.to.peer|p2p/i.test(lower)) return 'peer_to_peer';
  if (/medical\s*necessity/i.test(lower)) return 'medical_necessity';
  return 'prior_auth'; // Default
}

function inferPriority(text: string): CasePriority {
  const lower = text.toLowerCase();
  if (/urgent|emergent|stat|rush/i.test(lower)) return 'urgent';
  if (/expedited/i.test(lower)) return 'expedited';
  return 'standard';
}

function inferFacilityType(text: string): FacilityType | null {
  const lower = text.toLowerCase();
  if (/inpatient|hospital\s*admission|admitted/i.test(lower)) return 'inpatient';
  if (/outpatient|ambulatory|clinic/i.test(lower)) return 'outpatient';
  if (/asc|ambulatory\s*surgery|surgery\s*center/i.test(lower)) return 'asc';
  if (/office|physician.s?\s*office/i.test(lower)) return 'office';
  if (/home|domiciliary/i.test(lower)) return 'home';
  return null;
}
