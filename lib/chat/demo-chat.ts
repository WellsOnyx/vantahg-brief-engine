import type { CaseFormData } from '@/lib/types';
import type { StreamChunk } from './types';

/**
 * Demo mode chat responses. Returns a mock streaming response
 * when no Anthropic API key is configured.
 */

interface DemoResponse {
  text: string;
  extraction?: Partial<CaseFormData>;
  toolDisplays?: string[];
}

/**
 * Generate a demo response based on the user's message and current state.
 * Returns an async generator that yields StreamChunks with realistic timing.
 */
export async function* getDemoChatStream(
  userMessage: string,
  extractedData: Partial<CaseFormData>,
  messageCount: number
): AsyncGenerator<StreamChunk> {
  const response = pickDemoResponse(userMessage, extractedData, messageCount);

  // Stream the text word by word
  const words = response.text.split(' ');
  for (let i = 0; i < words.length; i++) {
    yield { type: 'text', content: words[i] + (i < words.length - 1 ? ' ' : '') };
    await delay(25 + Math.random() * 35);
  }

  // Yield tool display results if any
  if (response.toolDisplays) {
    for (const display of response.toolDisplays) {
      yield {
        type: 'tool_result',
        toolResult: {
          tool: 'lookup_cpt_code',
          input: {},
          result: {},
          displayText: display,
        },
      };
    }
  }

  // Yield extraction if any
  if (response.extraction) {
    yield { type: 'extraction', extraction: response.extraction };
  }

  yield { type: 'done' };
}

function pickDemoResponse(
  message: string,
  extracted: Partial<CaseFormData>,
  count: number
): DemoResponse {
  const lower = message.toLowerCase();

  // First message — user describes the case
  if (count <= 1) {
    // Check for specific case types
    if (lower.includes('cpap') || lower.includes('sleep') || lower.includes('apnea')) {
      return cpapIntakeStart();
    }
    if (lower.includes('knee') || lower.includes('arthroplasty') || lower.includes('tka')) {
      return tkaIntakeStart();
    }
    if (lower.includes('mri') || lower.includes('imaging') || lower.includes('scan')) {
      return mriIntakeStart();
    }
    // Generic first response
    return genericIntakeStart();
  }

  // Patient info provided
  if (lower.includes('patient') || /\b\d{4}[-/]\d{2}[-/]\d{2}\b/.test(lower) || lower.includes('dob') || lower.includes('name is')) {
    return patientInfoResponse(lower);
  }

  // Provider info
  if (lower.includes('provider') || lower.includes('npi') || lower.includes('dr.') || lower.includes('doctor')) {
    return providerInfoResponse(lower);
  }

  // Payer info
  if (lower.includes('payer') || lower.includes('insurance') || lower.includes('blue cross') || lower.includes('aetna') || lower.includes('united') || lower.includes('cigna')) {
    return payerInfoResponse(lower);
  }

  // If most fields are filled, prompt for remaining or confirm
  const filledCount = Object.keys(extracted).length;
  if (filledCount >= 8) {
    return readyToSubmitResponse(extracted);
  }

  // Default: ask for next missing info
  return nextFieldResponse(extracted);
}

// ── Demo Response Templates ─────────────────────────────────────────────────

function cpapIntakeStart(): DemoResponse {
  return {
    text: `Got it — a CPAP device review. I found the code for you:\n\n**E0601** — Continuous Positive Airway Pressure (CPAP) Device\n\nThis falls under **DME** (Durable Medical Equipment). For medical necessity, the key criteria include a qualifying sleep study with AHI ≥15, or AHI ≥5 with documented symptoms.\n\nWhat's the patient's name and date of birth?`,
    extraction: {
      service_category: 'dme',
      procedure_codes: ['E0601'],
      procedure_description: 'Continuous Positive Airway Pressure (CPAP) Device',
      review_type: 'prior_auth',
      priority: 'standard',
    },
    toolDisplays: ['Found 1 code — E0601: CPAP Device'],
  };
}

function tkaIntakeStart(): DemoResponse {
  return {
    text: `Total Knee Arthroplasty — I'll set that up.\n\n**27447** — Total Knee Arthroplasty (TKA)\n\nThis is a **surgery** case. Key criteria include Kellgren-Lawrence grade 3-4 OA, failed conservative treatment ≥3 months, and documented functional impairment.\n\nWhat's the patient's name and date of birth?`,
    extraction: {
      service_category: 'surgery',
      procedure_codes: ['27447'],
      procedure_description: 'Total Knee Arthroplasty (TKA)',
      review_type: 'prior_auth',
      priority: 'standard',
    },
    toolDisplays: ['Found 1 code — 27447: Total Knee Arthroplasty (TKA)'],
  };
}

function mriIntakeStart(): DemoResponse {
  return {
    text: `Imaging review — which area is the MRI for? I have codes for:\n\n• **72148** — MRI Lumbar Spine without Contrast\n• **70553** — MRI Brain with/without Contrast\n• **73721** — MRI Knee\n• **73221** — MRI Shoulder\n\nWhich one matches, or describe the area and I'll find the right code?`,
    extraction: {
      service_category: 'imaging',
      review_type: 'prior_auth',
      priority: 'standard',
    },
    toolDisplays: ['Found 4 codes matching "MRI"'],
  };
}

function genericIntakeStart(): DemoResponse {
  return {
    text: `I'd be happy to help you submit this case. To get started, could you tell me:\n\n1. What **procedure or service** is being requested?\n2. Is this a **prior authorization**, medical necessity review, or another type?\n\nYou can describe it in plain language — I'll find the right CPT/HCPCS codes.`,
    extraction: {},
  };
}

function patientInfoResponse(msg: string): DemoResponse {
  // Extract a plausible name and DOB from the message for demo purposes
  const extraction: Partial<CaseFormData> = {};

  if (msg.includes('robert') || msg.includes('garcia')) {
    extraction.patient_name = 'Robert Garcia';
    extraction.patient_dob = '1958-03-15';
    extraction.patient_member_id = 'BCB-9928374';
    extraction.patient_gender = 'male';
  } else {
    extraction.patient_name = 'Sarah Mitchell';
    extraction.patient_dob = '1975-09-22';
    extraction.patient_member_id = 'UHC-4419283';
    extraction.patient_gender = 'female';
  }

  return {
    text: `Got it — **${extraction.patient_name}**, DOB ${extraction.patient_dob}, Member ID ${extraction.patient_member_id}.\n\nWho is the **requesting provider** and their NPI number?`,
    extraction,
  };
}

function providerInfoResponse(msg: string): DemoResponse {
  const extraction: Partial<CaseFormData> = {};

  if (msg.includes('chen') || msg.includes('1234567890')) {
    extraction.requesting_provider = 'Dr. Michael Chen';
    extraction.requesting_provider_npi = '1234567890';
    extraction.requesting_provider_specialty = 'Orthopedic Surgery';
  } else {
    extraction.requesting_provider = 'Dr. Lisa Patel';
    extraction.requesting_provider_npi = '1987654321';
    extraction.requesting_provider_specialty = 'Pulmonology';
  }
  extraction.facility_type = 'outpatient';

  return {
    text: `Recorded: **${extraction.requesting_provider}** (NPI: ${extraction.requesting_provider_npi}), ${extraction.requesting_provider_specialty}. Setting: **outpatient**.\n\nWhat **insurance payer** covers this patient?`,
    extraction,
  };
}

function payerInfoResponse(msg: string): DemoResponse {
  const extraction: Partial<CaseFormData> = {};

  if (msg.includes('blue cross') || msg.includes('bcbs')) {
    extraction.payer_name = 'Blue Cross Blue Shield';
    extraction.plan_type = 'PPO';
  } else if (msg.includes('united') || msg.includes('uhc')) {
    extraction.payer_name = 'UnitedHealthcare';
    extraction.plan_type = 'HMO';
  } else if (msg.includes('aetna')) {
    extraction.payer_name = 'Aetna';
    extraction.plan_type = 'PPO';
  } else {
    extraction.payer_name = 'Cigna';
    extraction.plan_type = 'EPO';
  }

  return {
    text: `Payer set to **${extraction.payer_name}** (${extraction.plan_type}).\n\nLast question — what's the **clinical question** for this review? For example: "Is this procedure medically necessary given the patient's condition?"`,
    extraction,
  };
}

function readyToSubmitResponse(extracted: Partial<CaseFormData>): DemoResponse {
  const codes = extracted.procedure_codes?.join(', ') || 'None';
  return {
    text: `Great — I have everything I need. Here's a summary:\n\n• **Patient**: ${extracted.patient_name || 'N/A'}\n• **Procedure**: ${codes} — ${extracted.procedure_description || 'N/A'}\n• **Category**: ${extracted.service_category || 'N/A'}\n• **Provider**: ${extracted.requesting_provider || 'N/A'}\n• **Payer**: ${extracted.payer_name || 'N/A'}\n\nLooks good? Click **Review & Submit** to confirm and generate the AI clinical brief.`,
    extraction: {
      clinical_question: extracted.clinical_question || 'Is this procedure medically necessary given the clinical presentation?',
    },
  };
}

function nextFieldResponse(extracted: Partial<CaseFormData>): DemoResponse {
  if (!extracted.patient_name) {
    return {
      text: `What's the **patient's name** and **date of birth**? And their insurance **member ID** if you have it.`,
      extraction: {},
    };
  }
  if (!extracted.requesting_provider) {
    return {
      text: `Who is the **requesting provider**? I'll need their name and **NPI number**.`,
      extraction: {},
    };
  }
  if (!extracted.payer_name) {
    return {
      text: `Which **insurance payer** covers this patient? (e.g., Blue Cross, UnitedHealthcare, Aetna)`,
      extraction: {},
    };
  }
  if (!extracted.clinical_question) {
    return {
      text: `What's the **clinical question** for this review? For example: "Is this procedure medically necessary?"`,
      extraction: {},
    };
  }
  return readyToSubmitResponse(extracted);
}

// ── Demo Brief Streaming ────────────────────────────────────────────────────

/**
 * Stream a demo AI brief section by section.
 */
export async function* getDemoBriefStream(): AsyncGenerator<StreamChunk> {
  const sections = [
    { name: 'clinical_question', text: 'Generating clinical question analysis...' },
    { name: 'patient_summary', text: 'Analyzing patient demographics and history...' },
    { name: 'diagnosis_analysis', text: 'Evaluating diagnosis-procedure alignment...' },
    { name: 'procedure_analysis', text: 'Reviewing procedure codes and clinical rationale...' },
    { name: 'criteria_match', text: 'Matching against clinical criteria and guidelines...' },
    { name: 'documentation_review', text: 'Reviewing submitted documentation...' },
    { name: 'ai_recommendation', text: 'Formulating clinical recommendation...' },
    { name: 'reviewer_action', text: 'Preparing reviewer action items...' },
  ];

  for (let i = 0; i < sections.length; i++) {
    yield { type: 'text', content: `\n\n**${sections[i].text}**\n\n` };
    await delay(400 + Math.random() * 300);

    yield {
      type: 'brief_section',
      briefSection: sections[i].name,
      briefContent: getDemoBriefSection(sections[i].name),
    };
    await delay(200);
  }

  yield { type: 'done' };
}

function getDemoBriefSection(section: string): unknown {
  const demoSections: Record<string, unknown> = {
    clinical_question: 'Is CPAP therapy medically necessary for the treatment of moderate obstructive sleep apnea?',
    patient_summary: 'Robert Garcia, 67-year-old male presenting with moderate obstructive sleep apnea (AHI 22), excessive daytime sleepiness, and hypertension.',
    diagnosis_analysis: {
      primary_diagnosis: 'G47.33 — Obstructive Sleep Apnea',
      secondary_diagnoses: ['I10 — Essential Hypertension', 'R06.83 — Snoring'],
      diagnosis_procedure_alignment: 'Strong alignment — OSA with AHI ≥15 directly supports CPAP therapy.',
    },
    procedure_analysis: {
      codes: ['E0601 — CPAP Device'],
      clinical_rationale: 'Patient has moderate OSA confirmed by sleep study with documented comorbid hypertension.',
      complexity_level: 'routine',
      setting_appropriateness: 'Home use is the appropriate setting for CPAP therapy.',
    },
    criteria_match: {
      guideline_source: 'CMS LCD / AASM Clinical Practice Guidelines',
      applicable_guideline: 'CMS LCD for Positive Airway Pressure Devices',
      criteria_met: ['Qualifying sleep study with AHI ≥15', 'Face-to-face evaluation documented', 'Treating physician prescription on file'],
      criteria_not_met: [],
      criteria_unable_to_assess: ['90-day compliance check (future requirement)'],
      conservative_alternatives: ['Positional therapy', 'Weight management program'],
    },
    documentation_review: {
      documents_provided: 'Sleep study report, physician notes',
      key_findings: ['AHI of 22 events/hour on polysomnography', 'Epworth Sleepiness Scale score of 14/24'],
      missing_documentation: ['Face-to-face encounter note date'],
    },
    ai_recommendation: {
      recommendation: 'approve',
      confidence: 'high',
      rationale: 'Patient meets CMS LCD criteria with confirmed moderate OSA and documented comorbid conditions.',
      key_considerations: ['Verify face-to-face encounter timing', 'Schedule 90-day compliance check'],
      if_modify_suggestion: null,
    },
    reviewer_action: {
      decision_required: 'Confirm medical necessity for CPAP device based on sleep study results.',
      time_sensitivity: 'Standard turnaround — no regulatory urgency.',
      peer_to_peer_suggested: false,
      additional_info_needed: ['Confirm face-to-face encounter date'],
      state_specific_requirements: [],
    },
  };

  return demoSections[section] || null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
