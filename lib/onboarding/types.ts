/**
 * Canonical shape of the onboarding wizard payload.
 *
 * Stored in `signup_requests.onboarding_data` as JSONB (schema-on-read).
 * The five steps below correspond to the five wizard pages. Each step is
 * optional in the DB blob — a partially-filled object means the TPA
 * abandoned the wizard mid-flow. The UI re-hydrates from this object
 * on every load.
 *
 * If you add a field, also add a corresponding piece of UI in the
 * matching step component. Renaming or removing a field is a breaking
 * change for previously-saved data — handle migration explicitly.
 */

export interface OnboardingData {
  /** Step 1 — brand and contact identity that should appear in member-facing comms. */
  brand?: {
    /** Plan/TPA display name shown on letters and the portal. Defaults to legal_name. */
    display_name?: string;
    /** Public-facing support email — what members see on determinations. */
    support_email?: string;
    /** Public-facing support phone. */
    support_phone?: string;
    /** Hex color used in PDFs and the client portal accent. */
    brand_color?: string;
    /** Logo file path inside the public assets bucket (uploaded separately). */
    logo_storage_path?: string;
  };

  /** Step 2 — who works what role on the TPA side. */
  team?: {
    operations_lead?: { name: string; email: string; phone?: string };
    clinical_lead?: { name: string; email: string; phone?: string };
    billing_contact?: { name: string; email: string; phone?: string };
    /** Additional contacts the TPA wants in the loop. */
    others?: Array<{ name: string; email: string; role?: string }>;
  };

  /** Step 3 — how auth requests flow in. */
  intake?: {
    /** Channels the TPA will use to submit auth requests. */
    channels?: Array<'portal' | 'efax' | 'email' | 'api'>;
    /** If they have an existing TPA system, free-text name. */
    existing_system?: string;
    /** Estimated weekly auth volume (already captured at signup but TPA can revise). */
    expected_weekly_auths?: number;
    /** Standard SLA in hours they want to commit to members. */
    standard_sla_hours?: number;
    /** Urgent SLA in hours. */
    urgent_sla_hours?: number;
  };

  /** Step 4 — clinical preferences. */
  clinical?: {
    /** Guideline source preference. */
    primary_guideline?: 'interqual' | 'mcg' | 'cms' | 'custom';
    /** Service categories the TPA needs covered. */
    service_categories?: string[];
    /** Notes for the medical director — special carve-outs, plan quirks, etc. */
    medical_director_notes?: string;
  };

  /** Step 5 — kickoff scheduling. */
  kickoff?: {
    /** When the TPA wants to go live with real auths. */
    target_go_live_date?: string;
    /** Time zone for scheduling weekly check-ins. */
    timezone?: string;
    /** Preferred day of week for the weekly DL check-in. */
    weekly_checkin_day?: 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
    /** Preferred 30-minute window, e.g. "10:00" (local to timezone). */
    weekly_checkin_time?: string;
  };
}

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed';

/**
 * Wizard step keys, in order. The UI uses this to drive next/back nav.
 */
export const STEP_KEYS = ['brand', 'team', 'intake', 'clinical', 'kickoff'] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export const STEP_LABELS: Record<StepKey, { title: string; blurb: string }> = {
  brand: {
    title: 'Brand & identity',
    blurb: 'How your plan appears to members in letters, the portal, and emails.',
  },
  team: {
    title: 'Your team',
    blurb: 'Who we coordinate with on the TPA side. We\'ll book a weekly check-in with your operations lead.',
  },
  intake: {
    title: 'How auths come in',
    blurb: 'The channels you\'ll use to submit prior authorization requests.',
  },
  clinical: {
    title: 'Clinical preferences',
    blurb: 'Guideline source, service categories you cover, anything our medical directors should know.',
  },
  kickoff: {
    title: 'Go-live & cadence',
    blurb: 'Target go-live date and your preferred weekly check-in time with your Delivery Lead.',
  },
};

/**
 * Determines the next unfinished step from a saved OnboardingData blob.
 * Used by the wizard to resume where the TPA left off and by the
 * post-magic-link redirect to decide whether to send them through
 * onboarding or straight to /client/cases.
 *
 * Returns `null` when every step has at least one field populated —
 * the caller treats that as "ready to mark complete".
 */
export function nextIncompleteStep(data: OnboardingData): StepKey | null {
  for (const key of STEP_KEYS) {
    const stepValue = data[key];
    if (!stepValue || Object.keys(stepValue).length === 0) {
      return key;
    }
  }
  return null;
}
