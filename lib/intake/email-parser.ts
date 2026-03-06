import type { ServiceCategory, ReviewType, CasePriority, FacilityType } from '../types';

// ── Interfaces ───────────────────────────────────────────────────────────────

/**
 * Raw inbound email webhook payload.
 * Compatible with SendGrid Inbound Parse and Mailgun Routes.
 * This is the primary intake channel — call center auths, forwarded e-faxes,
 * and provider submissions all arrive here.
 */
export interface EmailPayload {
  // Standard inbound email webhook fields (SendGrid/Mailgun compatible)
  from: string;           // sender email (may include display name)
  to: string;             // receiving inbox (e.g. intake@vantaum.com)
  subject: string;
  text: string;           // plain text body
  html?: string;          // HTML body
  sender_ip?: string;
  SPF?: string;
  envelope?: string;      // JSON string with from/to
  attachments?: number;   // count of attachments
  attachment_info?: string; // JSON string with attachment metadata
  // Attachment data (parsed from multipart)
  attachment_files?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  content_type: string;   // application/pdf, image/tiff, etc.
  size: number;           // bytes
  url?: string;           // if stored externally (SendGrid/Mailgun provide URLs)
  content?: string;       // base64 content if inline
}

export interface ParsedEmailData {
  // Source info
  from_address: string;
  from_name: string;      // extracted from "Dr. Smith <smith@clinic.com>"
  subject: string;
  received_at: string;    // ISO timestamp

  // Extracted clinical data (same shape as efax parser output)
  patient_name: string | null;
  patient_dob: string | null;
  member_id: string | null;

  provider_name: string | null;
  provider_npi: string | null;
  provider_phone: string | null;
  provider_fax: string | null;
  facility_name: string | null;

  payer_name: string | null;
  group_number: string | null;

  procedure_codes: string[];     // CPT, HCPCS
  diagnosis_codes: string[];     // ICD-10

  service_category: ServiceCategory | null;
  review_type: ReviewType | null;
  priority: CasePriority;
  facility_type: FacilityType | null;

  clinical_notes: string;        // body text stripped of signatures/disclaimers

  // Attachment summary
  attachment_count: number;
  attachment_types: string[];    // ['pdf', 'tiff', 'docx']
  has_clinical_documents: boolean;

  // Quality
  confidence_score: number;      // 0-100
  needs_manual_review: boolean;
  manual_review_reasons: string[];

  // Raw for storage
  raw_text: string;
  raw_subject: string;
}

// ── Main Parser ──────────────────────────────────────────────────────────────

/**
 * Parses an inbound email webhook payload into structured clinical data.
 *
 * Email is the PRIMARY intake channel for healthcare UR. This parser handles:
 * - Call center staff forwarding auth requests
 * - E-fax-to-email forwarded documents
 * - Direct provider submissions
 * - Internal routing / triage emails
 *
 * The function extracts clinical data using regex patterns, strips email noise,
 * classifies the email type, and flags cases that need manual review.
 */
export function parseEmailPayload(payload: EmailPayload): ParsedEmailData {
  const rawText = payload.text || '';
  const rawSubject = payload.subject || '';
  const sender = extractSenderInfo(payload.from || '');
  const cleanedBody = stripEmailNoise(rawText);
  const combinedText = `${rawSubject}\n${cleanedBody}`;

  // Extract clinical data
  const patientName = extractPatientName(combinedText);
  const patientDob = extractDob(combinedText);
  const memberId = extractMemberId(combinedText);
  const providerName = extractProviderName(combinedText, sender.name);
  const providerNpi = extractNpi(combinedText);
  const providerPhone = extractPhone(combinedText);
  const providerFax = extractFax(combinedText);
  const facilityName = extractFacilityName(combinedText);
  const payerName = extractPayerName(combinedText);
  const groupNumber = extractGroupNumber(combinedText);
  const procedureCodes = extractCptCodes(combinedText);
  const diagnosisCodes = extractIcdCodes(combinedText);

  // Classify and infer
  const serviceCategory = inferServiceCategory(combinedText);
  const reviewType = inferReviewType(combinedText);
  const priority = detectUrgency(rawSubject, cleanedBody);
  const facilityType = inferFacilityType(combinedText);

  // Attachment analysis
  const attachmentFiles = payload.attachment_files || [];
  const attachmentCount = payload.attachments || attachmentFiles.length;
  const attachmentTypes = extractAttachmentTypes(attachmentFiles);
  const hasClinicalDocuments = attachmentTypes.some(
    (ext) => ['pdf', 'tiff', 'tif', 'png', 'jpg', 'jpeg', 'dcm', 'dicom'].includes(ext)
  );

  // Confidence scoring
  const confidence = calculateConfidence({
    patientName,
    patientDob,
    memberId,
    providerName,
    providerNpi,
    procedureCodes,
    diagnosisCodes,
    payerName,
    hasClinicalDocuments,
    bodyLength: cleanedBody.length,
  });

  // Manual review flags
  const reviewReasons: string[] = [];
  if (!patientName) reviewReasons.push('Patient name not found');
  if (!patientDob) reviewReasons.push('Patient DOB not found');
  if (!memberId) reviewReasons.push('Member ID not found');
  if (!providerName) reviewReasons.push('Provider name not found');
  if (procedureCodes.length === 0) reviewReasons.push('No procedure codes found');
  if (diagnosisCodes.length === 0) reviewReasons.push('No diagnosis codes found');
  if (!payerName) reviewReasons.push('Payer information missing');
  if (cleanedBody.length < 50) reviewReasons.push('Insufficient email body content');
  if (confidence < 40) reviewReasons.push('Low overall confidence score');
  if (isSuspiciousSender(payload.from, payload.SPF)) reviewReasons.push('Suspicious sender — verify source');
  if (attachmentCount === 0 && cleanedBody.length < 200) reviewReasons.push('No attachments and minimal text');

  const emailType = classifyEmailType(rawSubject, cleanedBody);
  if (emailType === 'status_inquiry') reviewReasons.push('Appears to be a status inquiry, not an auth request');
  if (emailType === 'general') reviewReasons.push('Could not classify email as a clinical submission');

  return {
    from_address: sender.email,
    from_name: sender.name,
    subject: rawSubject,
    received_at: new Date().toISOString(),

    patient_name: patientName,
    patient_dob: patientDob,
    member_id: memberId,

    provider_name: providerName,
    provider_npi: providerNpi,
    provider_phone: providerPhone,
    provider_fax: providerFax,
    facility_name: facilityName,

    payer_name: payerName,
    group_number: groupNumber,

    procedure_codes: procedureCodes,
    diagnosis_codes: diagnosisCodes,

    service_category: serviceCategory,
    review_type: reviewType,
    priority,
    facility_type: facilityType,

    clinical_notes: cleanedBody,

    attachment_count: attachmentCount,
    attachment_types: attachmentTypes,
    has_clinical_documents: hasClinicalDocuments,

    confidence_score: confidence,
    needs_manual_review: reviewReasons.length > 0,
    manual_review_reasons: reviewReasons,

    raw_text: rawText,
    raw_subject: rawSubject,
  };
}

// ── Exported Helpers ─────────────────────────────────────────────────────────

/**
 * Extracts structured sender info from an email "From" field.
 * Handles formats:
 *   "Dr. Jane Smith <jane@clinic.com>"
 *   "jane@clinic.com"
 *   "<jane@clinic.com>"
 *   "Smith, Jane MD" <jane@clinic.com>
 */
export function extractSenderInfo(from: string): { email: string; name: string } {
  if (!from || !from.trim()) {
    return { email: '', name: '' };
  }

  const trimmed = from.trim();

  // Pattern: "Display Name" <email@domain.com> or Display Name <email@domain.com>
  const angleMatch = trimmed.match(/^(?:"?(.+?)"?\s*)?<([^>]+)>$/);
  if (angleMatch) {
    const name = (angleMatch[1] || '').replace(/^["']|["']$/g, '').trim();
    const email = angleMatch[2].trim();
    return { email, name: name || emailToDisplayName(email) };
  }

  // Pattern: bare email address
  const bareEmailMatch = trimmed.match(/^([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})$/);
  if (bareEmailMatch) {
    return { email: bareEmailMatch[1], name: emailToDisplayName(bareEmailMatch[1]) };
  }

  // Pattern: name followed by email with no angle brackets (edge case from messy data)
  const looseMatch = trimmed.match(/^(.+?)\s+([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})$/);
  if (looseMatch) {
    return { email: looseMatch[2].trim(), name: looseMatch[1].replace(/^["']|["']$/g, '').trim() };
  }

  // Fallback: try to find any email in the string
  const anyEmail = trimmed.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
  if (anyEmail) {
    const email = anyEmail[1];
    const name = trimmed.replace(email, '').replace(/[<>"']/g, '').trim();
    return { email, name: name || emailToDisplayName(email) };
  }

  return { email: trimmed, name: '' };
}

/**
 * Strips email noise from body text:
 * - Signatures (-- , Sent from, etc.)
 * - HIPAA disclaimers / legal boilerplate
 * - Forwarded headers (---------- Forwarded message ----------)
 * - Quoted replies (lines starting with >)
 * - Email threading artifacts
 */
export function stripEmailNoise(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // Remove quoted reply lines (> prefixed). Do this first before splitting.
  cleaned = cleaned.replace(/^>+\s?.*$/gm, '');

  // Remove "On [date], [person] wrote:" attribution lines
  cleaned = cleaned.replace(/^On\s+.+wrote:\s*$/gm, '');

  // Remove forwarded message headers
  cleaned = cleaned.replace(/^-{3,}\s*Forwarded\s*message\s*-{3,}$/gim, '');
  cleaned = cleaned.replace(/^-{3,}\s*Original\s*Message\s*-{3,}$/gim, '');
  cleaned = cleaned.replace(/^Begin\s+forwarded\s+message:\s*$/gim, '');

  // Remove email header blocks in forwarded messages (From:, To:, Date:, Subject: clusters)
  cleaned = cleaned.replace(
    /^(?:From|To|Cc|Bcc|Date|Sent|Subject):\s*[^\n]*(?:\n(?:From|To|Cc|Bcc|Date|Sent|Subject):\s*[^\n]*)*/gm,
    ''
  );

  // Remove HIPAA / confidentiality disclaimers — these are long boilerplate blocks
  const disclaimerPatterns = [
    /(?:^|\n).*(?:CONFIDENTIALITY\s*(?:NOTICE|DISCLAIMER)|This\s*(?:email|message|communication)\s*(?:is|may\s*be)\s*(?:intended|confidential)|HIPAA|protected\s*health\s*information|PHI|If\s*you\s*(?:are\s*not\s*the\s*intended|have\s*received\s*this\s*(?:in\s*error|by\s*mistake)))[\s\S]{0,1500}?(?=\n{2,}|\n*$)/gi,
    /(?:^|\n)\s*This\s+(?:e-?mail|message)\s+and\s+any\s+(?:attachments?|files?)[\s\S]{0,1000}?(?=\n{2,}|\n*$)/gi,
    /(?:^|\n)\s*NOTICE:\s*This\s+(?:communication|message|email)[\s\S]{0,1000}?(?=\n{2,}|\n*$)/gi,
    /(?:^|\n)\s*DISCLAIMER[\s\S]{0,1000}?(?=\n{2,}|\n*$)/gi,
  ];

  for (const pattern of disclaimerPatterns) {
    cleaned = cleaned.replace(pattern, '\n');
  }

  // Remove signature blocks. Look for common signature delimiters.
  // Standard "-- " (dash-dash-space on its own line) is the RFC signature delimiter.
  const sigDelimiterIdx = cleaned.indexOf('\n-- \n');
  if (sigDelimiterIdx !== -1) {
    cleaned = cleaned.substring(0, sigDelimiterIdx);
  }

  // Other common signature patterns: truncate from the match onward
  const signatureStarts = [
    /^(?:Best\s*regards?|Kind\s*regards?|Regards?|Sincerely|Thank\s*you|Thanks|Warm\s*regards?|Respectfully|Cheers|V\/r|With\s*appreciation)\s*[,.]?\s*$/im,
    /^Sent\s+from\s+(?:my\s+)?(?:iPhone|iPad|Galaxy|Android|mobile|Outlook|Mail)/im,
    /^Get\s+Outlook\s+for\s+(?:iOS|Android)/im,
  ];

  for (const sigPattern of signatureStarts) {
    const match = cleaned.match(sigPattern);
    if (match && match.index !== undefined) {
      cleaned = cleaned.substring(0, match.index);
    }
  }

  // Remove excessive blank lines (normalize to max double newline)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Trim
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Classifies the purpose of the email based on subject and body.
 */
export function classifyEmailType(
  subject: string,
  body: string
): 'auth_request' | 'clinical_docs' | 'status_inquiry' | 'appeal' | 'general' {
  const combined = `${subject}\n${body}`.toLowerCase();

  // Appeal — check first because appeals also mention auth
  if (
    /\bappeal\b/i.test(combined) ||
    /\breconsideration\b/i.test(combined) ||
    /\bgrievance\b/i.test(combined) ||
    /\breversal\s*request\b/i.test(combined)
  ) {
    return 'appeal';
  }

  // Authorization / prior auth request
  if (
    /(?:prior\s*)?auth(?:orization)?\s*request/i.test(combined) ||
    /\bpre-?auth\b/i.test(combined) ||
    /\bpre-?cert(?:ification)?\b/i.test(combined) ||
    /\bur\s*request\b/i.test(combined) ||
    /\bum\s*request\b/i.test(combined) ||
    /\bmedical\s*necessity\s*review\b/i.test(combined) ||
    /\brequest(?:ing)?\s*(?:for\s*)?(?:auth|approval|review)\b/i.test(combined) ||
    /\bclinical\s*review\s*request\b/i.test(combined) ||
    /\bconcurrent\s*review\b/i.test(combined) ||
    /\bcontinued\s*stay\s*review\b/i.test(combined)
  ) {
    return 'auth_request';
  }

  // Clinical documents (attachments forwarded without an explicit auth request)
  if (
    /\bclinical\s*(?:documents?|records?|notes?)\b/i.test(combined) ||
    /\bmedical\s*records?\b/i.test(combined) ||
    /\battach(?:ed|ment|ing)\b/i.test(combined) ||
    /\bfax(?:ed|ing)?\b/i.test(combined) ||
    /\bdocument(?:ation|s)?\s*(?:for|attached|enclosed)\b/i.test(combined)
  ) {
    return 'clinical_docs';
  }

  // Status inquiry
  if (
    /\bstatus\b/i.test(combined) ||
    /\bwhere\s*(?:is|are)\b/i.test(combined) ||
    /\bfollow(?:ing)?\s*up\b/i.test(combined) ||
    /\bchecking\s*(?:on|in)\b/i.test(combined) ||
    /\bwhen\s*(?:will|can)\b/i.test(combined) ||
    /\bupdate\s*(?:on|for|regarding)\b/i.test(combined) ||
    /\bpending\s*(?:auth|case|review)\b/i.test(combined)
  ) {
    return 'status_inquiry';
  }

  return 'general';
}

/**
 * Detects urgency level from subject and body text.
 * Looks for explicit urgency keywords and clinical urgency indicators.
 */
export function detectUrgency(subject: string, body: string): CasePriority {
  const subjectLower = (subject || '').toLowerCase();
  const bodyLower = (body || '').toLowerCase();
  const combined = `${subjectLower}\n${bodyLower}`;

  // Urgent — highest priority
  if (
    /\burgent\b/.test(combined) ||
    /\bemergent\b/.test(combined) ||
    /\bstat\b/.test(combined) ||
    /\brush\b/.test(combined) ||
    /\bimmediate(?:ly)?\b/.test(combined) ||
    /\basap\b/.test(combined) ||
    /\btime[\s-]*sensitive\b/.test(combined) ||
    /\b(?:life|limb)[\s-]*threaten/i.test(combined) ||
    /\!\s*urgent/i.test(subjectLower) ||
    /\*{2,}urgent\*{2,}/i.test(combined)
  ) {
    return 'urgent';
  }

  // Expedited — elevated but not emergent
  if (
    /\bexpedited?\b/.test(combined) ||
    /\bpriority\b/.test(combined) ||
    /\baccelerated?\b/.test(combined) ||
    /\bfast[\s-]*track/i.test(combined) ||
    /\b24[\s-]*hour/i.test(combined) ||
    /\bsoon\s*as\s*possible\b/.test(combined)
  ) {
    return 'expedited';
  }

  return 'standard';
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

/** Utility: generic regex extraction returning first capture group or null. */
function extractPattern(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

/** Derives a rough display name from an email address. */
function emailToDisplayName(email: string): string {
  const local = email.split('@')[0] || '';
  // Replace dots, underscores, hyphens with spaces and title-case
  return local
    .replace(/[._\-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// ── Clinical Data Extractors ─────────────────────────────────────────────────

function extractPatientName(text: string): string | null {
  // Try structured label patterns first
  const labeled = extractPattern(
    text,
    /(?:patient|patient\s*name|member|member\s*name|enrollee|beneficiary|claimant)\s*[:=]\s*([^\n,;]{2,60})/i
  );
  if (labeled) return normalizeName(labeled);

  // Subject line patterns: "Auth Request: John Doe" or "PA - John Doe"
  const subjectMatch = extractPattern(
    text,
    /(?:auth(?:orization)?\s*request|prior\s*auth|pa)\s*[-:]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i
  );
  if (subjectMatch) return normalizeName(subjectMatch);

  return null;
}

function extractDob(text: string): string | null {
  return extractPattern(
    text,
    /(?:dob|d\.o\.b\.?|date\s*of\s*birth|birth\s*date|born)\s*[:=]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
  );
}

function extractMemberId(text: string): string | null {
  return extractPattern(
    text,
    /(?:member\s*(?:id|#|number)|subscriber\s*(?:id|#|number)|id\s*#|identification\s*(?:#|number)|policy\s*(?:#|number)|cert(?:ificate)?\s*(?:#|number))\s*[:=]?\s*([A-Z0-9\-]{4,30})/i
  );
}

function extractProviderName(text: string, senderName: string): string | null {
  // Try structured patterns
  const labeled = extractPattern(
    text,
    /(?:requesting|ordering|referring|treating|attending)\s*(?:provider|physician|doctor|dr\.?)\s*[:=]\s*([^\n,;]{2,60})/i
  );
  if (labeled) return normalizeName(labeled);

  // "Dr. Firstname Lastname" pattern in body
  const drMatch = extractPattern(
    text,
    /\b(Dr\.?\s+[A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+(?:\s+(?:MD|DO|DDS|DMD|DPM|OD|PharmD|NP|PA|PA-C))?)\b/
  );
  if (drMatch) return normalizeName(drMatch);

  // Fall back to sender name if it looks like a provider name
  if (senderName && /(?:dr\.?|md|do|dds|dmd|dpm|od|np|pa\b)/i.test(senderName)) {
    return normalizeName(senderName);
  }

  // "Provider:" without qualifier
  const providerBare = extractPattern(
    text,
    /provider\s*[:=]\s*([^\n,;]{2,60})/i
  );
  if (providerBare) return normalizeName(providerBare);

  return null;
}

function extractNpi(text: string): string | null {
  // NPI is always 10 digits, often preceded by "NPI" label
  const labeled = text.match(/(?:npi|national\s*provider\s*(?:id(?:entifier)?|#|number))\s*[:=#]?\s*(\d{10})\b/i);
  if (labeled) return labeled[1];

  // Bare 10-digit number near "NPI" keyword (within ~40 chars)
  const nearby = text.match(/npi.{0,40}?(\d{10})\b/i);
  if (nearby) return nearby[1];

  return null;
}

function extractPhone(text: string): string | null {
  return extractPattern(
    text,
    /(?:phone|tel(?:ephone)?|call(?:\s*back)?|contact\s*#?)\s*[:=]?\s*(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/i
  );
}

function extractFax(text: string): string | null {
  return extractPattern(
    text,
    /(?:fax|facsimile)\s*[:=#]?\s*(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/i
  );
}

function extractFacilityName(text: string): string | null {
  return extractPattern(
    text,
    /(?:facility|hospital|clinic|surgery\s*center|medical\s*center|health\s*center|center)\s*(?:name)?\s*[:=]\s*([^\n,;]{2,80})/i
  );
}

function extractPayerName(text: string): string | null {
  const labeled = extractPattern(
    text,
    /(?:payer|payor|insurance|health\s*plan|plan|carrier|insurer)\s*(?:name)?\s*[:=]\s*([^\n,;]{2,60})/i
  );
  if (labeled) return labeled;

  // Look for well-known payer names in the text
  const knownPayers = [
    'Aetna', 'Anthem', 'Blue Cross', 'Blue Shield', 'BCBS', 'Cigna', 'Humana',
    'Kaiser', 'UnitedHealthcare', 'UHC', 'United Healthcare', 'Molina',
    'Centene', 'Ambetter', 'Oscar', 'Magellan', 'Tricare', 'Medicare',
    'Medicaid', 'Optum', 'WellCare', 'Elevance', 'CVS Health', 'Health Net',
    'Highmark', 'CareSource', 'Bright Health', 'Clover Health', 'EmblemHealth',
    'Geisinger', 'Priority Health', 'SelectHealth', 'Medica',
    'Capital Blue Cross', 'Independence Blue Cross', 'Horizon BCBS',
    'Florida Blue', 'CareFirst', 'Premera', 'Regence',
  ];

  for (const payer of knownPayers) {
    const escapedPayer = payer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escapedPayer}\\b`, 'i').test(text)) {
      return payer;
    }
  }

  return null;
}

function extractGroupNumber(text: string): string | null {
  return extractPattern(
    text,
    /(?:group\s*(?:#|number|id|no\.?)|grp\s*#?)\s*[:=]?\s*([A-Z0-9\-]{3,20})/i
  );
}

function extractCptCodes(text: string): string[] {
  // Match 5-digit CPT codes
  const cptMatches = text.match(/\b\d{5}\b/g) || [];
  // Match HCPCS codes (letter + 4 digits)
  const hcpcsMatches = text.match(/\b[A-Za-z]\d{4}\b/g) || [];

  // Filter CPT codes to valid ranges (avoid zip codes, random 5-digit numbers)
  const validCpt = cptMatches.filter((code) => {
    const num = parseInt(code);
    // CPT code ranges: 00100-99499 (anesthesia through E/M),
    // plus Category II (0001F-0015F range won't match 5-digit pure numbers)
    return num >= 10021 && num <= 99499;
  });

  // Normalize HCPCS to uppercase
  const validHcpcs = hcpcsMatches.map((code) => code.toUpperCase());

  return [...new Set([...validCpt, ...validHcpcs])];
}

function extractIcdCodes(text: string): string[] {
  // ICD-10 codes: letter + 2 digits + optional dot + up to 4 more alphanumerics
  // Exclude common false positives: "V12" (version), "E10" if isolated
  const matches = text.match(/\b[A-TV-Z]\d{2}(?:\.\d{1,4}[A-Z]?)?\b/g) || [];

  // Filter out likely false positives
  const filtered = matches.filter((code) => {
    // Must be at least 3 chars
    if (code.length < 3) return false;
    // Codes with decimal points are almost certainly ICD-10
    if (code.includes('.')) return true;
    // 3-char codes that are common false positives
    const upper = code.toUpperCase();
    const falsePositives = ['V12', 'V13', 'V14', 'V15', 'V16', 'V17', 'V18', 'V19', 'V20'];
    if (falsePositives.includes(upper) && !text.includes(`ICD`) && !text.includes(`diagnosis`)) {
      return false;
    }
    return true;
  });

  return [...new Set(filtered)];
}

function extractAttachmentTypes(files: EmailAttachment[]): string[] {
  const extensions = new Set<string>();

  for (const file of files) {
    // Extract from filename
    const extMatch = file.filename?.match(/\.(\w+)$/);
    if (extMatch) {
      extensions.add(extMatch[1].toLowerCase());
      continue;
    }

    // Fall back to content_type
    const typeMap: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/tiff': 'tiff',
      'image/tif': 'tif',
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'text/plain': 'txt',
      'application/xml': 'xml',
      'text/xml': 'xml',
    };

    const mapped = typeMap[file.content_type];
    if (mapped) {
      extensions.add(mapped);
    }
  }

  return Array.from(extensions);
}

// ── Name Normalization ───────────────────────────────────────────────────────

function normalizeName(raw: string): string {
  let name = raw.trim();
  // Remove trailing credentials
  name = name.replace(/\s*[,;]\s*(MD|DO|DDS|DMD|DPM|OD|NP|PA|PA-C|RN|LPN|APRN|PhD|PharmD|FACS|FACP)\b.*/i, '');
  // Remove "Dr." prefix (we'll store the clean name)
  name = name.replace(/^Dr\.?\s*/i, '');
  // Remove extra whitespace
  name = name.replace(/\s+/g, ' ').trim();
  return name || raw.trim();
}

// ── Confidence Scoring ───────────────────────────────────────────────────────

interface ConfidenceFactors {
  patientName: string | null;
  patientDob: string | null;
  memberId: string | null;
  providerName: string | null;
  providerNpi: string | null;
  procedureCodes: string[];
  diagnosisCodes: string[];
  payerName: string | null;
  hasClinicalDocuments: boolean;
  bodyLength: number;
}

function calculateConfidence(factors: ConfidenceFactors): number {
  let score = 0;

  // Patient identification (up to 25 points)
  if (factors.patientName) score += 12;
  if (factors.patientDob) score += 8;
  if (factors.memberId) score += 5;

  // Provider identification (up to 20 points)
  if (factors.providerName) score += 10;
  if (factors.providerNpi) score += 10;

  // Clinical data (up to 30 points)
  if (factors.procedureCodes.length > 0) score += 15;
  if (factors.diagnosisCodes.length > 0) score += 15;

  // Payer info (10 points)
  if (factors.payerName) score += 10;

  // Supporting documents (10 points)
  if (factors.hasClinicalDocuments) score += 10;

  // Body content richness (up to 5 points)
  if (factors.bodyLength >= 200) score += 5;
  else if (factors.bodyLength >= 100) score += 3;
  else if (factors.bodyLength >= 50) score += 1;

  return Math.min(100, score);
}

// ── Sender Validation ────────────────────────────────────────────────────────

function isSuspiciousSender(from: string, spf?: string): boolean {
  if (!from) return true;

  // SPF failure is a red flag
  if (spf && /fail/i.test(spf) && !/softfail/i.test(spf)) return true;

  const email = from.toLowerCase();

  // Free/consumer email providers sending clinical data is suspicious
  const consumerDomains = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
    'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com',
  ];

  const senderDomain = email.match(/@([a-z0-9.\-]+)/)?.[1];
  if (senderDomain && consumerDomains.includes(senderDomain)) {
    // Not auto-reject — many small practices use Gmail — but flag for review
    return true;
  }

  return false;
}

// ── Service Classification (mirrors efax-parser patterns) ────────────────────

function inferServiceCategory(text: string): ServiceCategory | null {
  const lower = text.toLowerCase();
  if (/mri|ct\s*scan|x-?ray|ultrasound|pet\s*scan|imaging|radiology|dexa|mammogra/i.test(lower)) return 'imaging';
  if (/surgery|surgical|arthroplasty|arthroscop|fusion|excision|laparoscop|thoracotomy|craniotomy/i.test(lower)) return 'surgery';
  if (/physical\s*therap|occupational\s*therap|speech\s*therap|rehabilitation|rehab\b/i.test(lower)) return 'rehab_therapy';
  if (/infusion|chemotherapy|biologics?|iv\s*therapy|rituxan|remicade|humira|keytruda/i.test(lower)) return 'infusion';
  if (/mental\s*health|psychiatric|psychology|behavioral|counseling|therapy\s*session/i.test(lower)) return 'behavioral_health';
  if (/dme|wheelchair|cpap|prosthetic|orthotics|durable\s*medical/i.test(lower)) return 'dme';
  if (/home\s*health|home\s*care|visiting\s*nurse|home\s*infusion/i.test(lower)) return 'home_health';
  if (/skilled\s*nursing|snf|nursing\s*facility|long[\s-]*term\s*care/i.test(lower)) return 'skilled_nursing';
  if (/transplant/i.test(lower)) return 'transplant';
  if (/genetic|genomic|gene\s*test/i.test(lower)) return 'genetic_testing';
  if (/pain\s*management|pain\s*clinic|epidural|nerve\s*block|spinal\s*cord\s*stimulat/i.test(lower)) return 'pain_management';
  if (/cardio|heart|cardiac|stent|ablation|pacemaker|catheteriz|angioplast|cabg/i.test(lower)) return 'cardiology';
  if (/oncology|cancer|tumor|neoplasm|malignant|chemo|radiation\s*therapy/i.test(lower)) return 'oncology';
  if (/ophthal|eye|cataract|retina|vitreous|glaucoma|lasik/i.test(lower)) return 'ophthalmology';
  if (/workers?\s*comp|work\s*injury|occupational\s*injury|on[\s-]*the[\s-]*job/i.test(lower)) return 'workers_comp';
  if (/emergency|er\b|ed\b|trauma|emergent\s*(?:care|visit)/i.test(lower)) return 'emergency_medicine';
  if (/internal\s*medicine|primary\s*care|pcp|annual\s*physical/i.test(lower)) return 'internal_medicine';
  if (/specialty|specialist|referral/i.test(lower)) return 'specialty_referral';
  return null;
}

function inferReviewType(text: string): ReviewType | null {
  const lower = text.toLowerCase();
  if (/prior\s*auth|pre-?auth|pre-?cert/i.test(lower)) return 'prior_auth';
  if (/concurrent|continued\s*stay/i.test(lower)) return 'concurrent';
  if (/retrospective|retro\s*review/i.test(lower)) return 'retrospective';
  if (/\bappeal\b/i.test(lower)) return 'appeal';
  if (/peer[\s-]*to[\s-]*peer|p2p/i.test(lower)) return 'peer_to_peer';
  if (/medical\s*necessity/i.test(lower)) return 'medical_necessity';
  if (/second[\s-]*level/i.test(lower)) return 'second_level_review';
  return 'prior_auth'; // Default — most email intakes are prior auth requests
}

function inferFacilityType(text: string): FacilityType | null {
  const lower = text.toLowerCase();
  if (/inpatient|hospital\s*admission|admitted|admission/i.test(lower)) return 'inpatient';
  if (/outpatient|ambulatory|clinic\b/i.test(lower)) return 'outpatient';
  if (/asc\b|ambulatory\s*surgery|surgery\s*center/i.test(lower)) return 'asc';
  if (/(?:physician.?s?\s*)?office|office[\s-]*based/i.test(lower)) return 'office';
  if (/\bhome\b|domiciliary|home[\s-]*based/i.test(lower)) return 'home';
  return null;
}
