import type { ContractTemplate } from '../types';

/**
 * VantaUM Master Services Agreement (Combined with BAA) — v1
 *
 * Per the approved framework (Florida governance, Jonathan Arias as
 * "Co-Chair, COO, and General Counsel").
 *
 * ADMIN LANGUAGE INJECTION (ROADMAP item 4, option B):
 *   - The core legal text is LOCKED.
 *   - The ONLY place an admin may inject additional clauses is via the
 *     `additional_provisions` key (passed in `injections` or `overrides`
 *     to /generate-contract). It renders exclusively inside the
 *     "Additional Provisions" section (conditional block below).
 *   - All other [[PLACEHOLDER]] areas and standard sections remain
 *     immutable in this template version.
 */

const BODY = `# Master Services Agreement

This Master Services Agreement ("Agreement") is entered into as of {{effective_date}} (the "Effective Date") between:

**VantaUM, Inc.** ("VantaUM"), a Delaware corporation, with principal place of business at {{vantaum_address}}; and

**{{tpa_legal_name}}**{{#dba}} d/b/a {{tpa_dba}}{{/dba}} ("Client"), a {{tpa_state_of_org}} entity, with principal place of business at {{tpa_address}}.

---

## 1. Services

VantaUM will provide utilization review and prior authorization management services (the "Services") to Client in accordance with the service levels and scope set forth in this Agreement and any executed Statements of Work.

[[PLACEHOLDER: Detailed scope of services — concierge intake, clinician determination, brief generation, dashboard access, integrations. Replace with attorney-drafted language.]]

## 2. Service Levels

VantaUM will respond to non-urgent authorization requests within {{contracted_sla_hours}} hours of receipt of clinically sufficient information. Urgent requests will be handled in accordance with applicable regulatory turnaround requirements.

[[PLACEHOLDER: Full SLA matrix, including urgent / expedited / standard turn-around tiers, definitions, exclusions, and remedies for missed SLAs.]]

## 3. Fees

Client will pay VantaUM a monthly per-employee-per-month ("PEPM") fee of {{pepm_rate_usd}} per covered life, billed monthly in arrears based on the eligible member count as of the first day of each month. Estimated initial member count: {{estimated_members}}.

[[PLACEHOLDER: Payment terms, late fees, invoicing cadence, dispute window, true-up procedures, automatic adjustments.]]

## 4. Term and Termination

The initial term of this Agreement shall commence on the Effective Date and continue for {{initial_term_months}} months (the "Initial Term"), automatically renewing for successive one-year terms unless either party provides ninety (90) days written notice of non-renewal.

[[PLACEHOLDER: Termination for cause, termination for convenience, transition assistance obligations, data return / destruction.]]

## 5. Confidentiality

Each party will maintain the confidentiality of the other party's Confidential Information using at least the same degree of care it uses to protect its own confidential information of a similar nature, and in any event no less than a reasonable degree of care.

[[PLACEHOLDER: Definition of Confidential Information, exclusions, permitted disclosures, return/destruction obligations.]]

## 6. Governing Law

This Agreement is governed by and construed in accordance with the laws of the State of Florida, without regard to its conflict-of-laws principles. Any dispute arising under this Agreement will be brought exclusively in the state or federal courts located in [[PLACEHOLDER: county]], Florida.

## 7. Notices

All notices under this Agreement must be in writing and delivered to:

- **To VantaUM:** {{notice_address_vantaum}}
- **To Client:** {{notice_address_tpa}}

---

# Exhibit A — HIPAA Business Associate Agreement

This Business Associate Agreement ("BAA") is incorporated by reference into the Master Services Agreement above and is effective as of the same Effective Date. The parties agree as follows:

## A.1 Definitions

Terms used but not otherwise defined in this BAA shall have the same meaning as those terms in the HIPAA Rules (45 CFR Parts 160 and 164).

[[PLACEHOLDER: Definitions section — Breach, Designated Record Set, Individual, PHI, Required by Law, Secretary, Security Incident, Subcontractor, Unsecured PHI, etc.]]

## A.2 Permitted Uses and Disclosures of PHI

VantaUM (as Business Associate) may use or disclose Protected Health Information ("PHI") solely to perform the Services and as otherwise permitted by this BAA and the HIPAA Rules.

[[PLACEHOLDER: Permitted purposes — payment, healthcare operations, management/administration of Business Associate, data aggregation, de-identification, treatment.]]

## A.3 Obligations of Business Associate

VantaUM agrees to:

(a) Not use or disclose PHI other than as permitted by this BAA or required by law;

(b) Implement appropriate administrative, physical, and technical safeguards to prevent unauthorized use or disclosure of PHI, including Electronic PHI;

(c) Report to Client any use or disclosure of PHI not provided for by this BAA, including any Breach of Unsecured PHI, within {{breach_notification_hours}} hours of discovery;

(d) Ensure that any Subcontractors that create, receive, maintain, or transmit PHI on behalf of VantaUM agree in writing to the same restrictions and conditions that apply to VantaUM;

(e) Make PHI in a Designated Record Set available to Client (or to the Individual, as directed by Client) to comply with 45 CFR 164.524;

(f) Make any amendments to PHI in a Designated Record Set as directed by Client pursuant to 45 CFR 164.526;

(g) Provide an accounting of disclosures of PHI as required by 45 CFR 164.528;

(h) Make its internal practices, books, and records relating to the use and disclosure of PHI available to the Secretary for purposes of determining Client's compliance with the HIPAA Rules.

[[PLACEHOLDER: Additional standard BAA obligations — minimum necessary, mitigation, individual rights.]]

## A.4 Obligations of Client

Client agrees to:

(a) Notify VantaUM of any limitation in its Notice of Privacy Practices that affects VantaUM's use or disclosure of PHI;

(b) Notify VantaUM of any changes in, or revocation of, the permission by an Individual to use or disclose his or her PHI;

(c) Notify VantaUM of any restriction on the use or disclosure of PHI that Client has agreed to or is required to abide by, to the extent that such restriction may affect VantaUM's use or disclosure of PHI.

## A.5 Term and Termination of BAA

The term of this BAA commences on the Effective Date and continues until the termination of the Master Services Agreement, or until termination of this BAA for cause. Upon termination, VantaUM shall return or destroy all PHI received from Client (or created or received by VantaUM on behalf of Client) that VantaUM still maintains in any form, or, if return or destruction is not feasible, extend the protections of this BAA to the PHI and limit further uses and disclosures.

## A.6 Survival

The obligations of VantaUM under sections A.3(a)–(c) and A.5 of this BAA shall survive its termination.

{{#additional_provisions}}

---

## Additional Provisions

The following additional terms and conditions are incorporated into this Agreement by the mutual written agreement of the parties. These provisions were supplied by an authorized representative of VantaUM at the time of contract generation and form an integral part of the executed document.

{{additional_provisions}}

{{/additional_provisions}}

---

# Signatures

By signing below, each party acknowledges that it has read this Agreement (including the BAA exhibit), understands it, and agrees to be bound by its terms.

**VANTAUM, INC.**

Name: {{vantaum_signer_name}}
Title: {{vantaum_signer_title}}
Date: ____________________

Signature: ____________________


**{{tpa_legal_name}}**

Name: {{tpa_signer_name}}
Title: {{tpa_signer_title}}
Date: ____________________

Signature: ____________________
`;

export const MSA_WITH_BAA_V1: ContractTemplate = {
  slug: 'msa-with-baa',
  version: 'v1',
  title: 'VantaUM Master Services Agreement (incl. BAA)',
  bodyMd: BODY,
  signerRoles: [
    { key: 'tpa_signer', label: 'TPA Authorized Signer', order: 1 },
    { key: 'vantaum_signer', label: 'VantaUM Authorized Signer', order: 2 },
  ],
  variables: [
    // Sourced from the signup_requests row
    { key: 'tpa_legal_name', label: 'TPA legal name', source: 'signup', signupField: 'legal_name', format: 'text', required: true },
    { key: 'tpa_dba', label: 'TPA d/b/a', source: 'signup', signupField: 'dba', format: 'text', required: false },
    { key: 'tpa_state_of_org', label: 'TPA state of organization', source: 'signup', signupField: 'entity_state', format: 'text', required: false, defaultValue: '[state]' },
    { key: 'tpa_address', label: 'TPA principal address', source: 'computed', format: 'address', required: false, defaultValue: '[address on file]', hint: 'Composed from street_address, city, state, zip on the signup row.' },
    { key: 'tpa_signer_name', label: 'TPA signer name', source: 'signup', signupField: 'signer_name', format: 'text', required: true },
    { key: 'tpa_signer_title', label: 'TPA signer title', source: 'signup', signupField: 'signer_title', format: 'text', required: false, defaultValue: '[title]' },
    { key: 'tpa_signer_email', label: 'TPA signer email', source: 'signup', signupField: 'signer_email', format: 'text', required: true },
    { key: 'pepm_rate_usd', label: 'PEPM rate (USD/member/month)', source: 'signup', signupField: 'pepm_rate_cents', format: 'money_cents', required: true },
    { key: 'estimated_members', label: 'Estimated member count', source: 'signup', signupField: 'estimated_members', format: 'integer', required: false, defaultValue: '[TBD]' },
    { key: 'notice_address_tpa', label: 'TPA notice address', source: 'computed', format: 'address', required: false, defaultValue: '[address on file]' },

    // VantaUM-side, admin overrides at generate time
    { key: 'vantaum_signer_name', label: 'VantaUM signer name', source: 'override', format: 'text', required: true, defaultValue: 'Jonathan Arias' },
    { key: 'vantaum_signer_title', label: 'VantaUM signer title', source: 'override', format: 'text', required: true, defaultValue: 'Co-Chair, COO, and General Counsel' },
    { key: 'vantaum_address', label: 'VantaUM principal address', source: 'override', format: 'address', required: true, defaultValue: '[VantaUM principal office address]' },
    { key: 'notice_address_vantaum', label: 'VantaUM notice address', source: 'override', format: 'address', required: true, defaultValue: '[VantaUM notice address]' },
    { key: 'contracted_sla_hours', label: 'Contracted SLA (hours)', source: 'override', format: 'integer', required: true, defaultValue: '48' },
    { key: 'initial_term_months', label: 'Initial term length (months)', source: 'override', format: 'integer', required: true, defaultValue: '12' },
    { key: 'breach_notification_hours', label: 'Breach notification window (hours)', source: 'override', format: 'integer', required: true, defaultValue: '24' },

    // Admin-injected language (OPTION B — only into this predefined section; core framework remains locked)
    { key: 'additional_provisions', label: 'Additional Provisions (admin-injected clauses)', source: 'override', format: 'text', required: false, hint: 'Optional. Text entered here appears ONLY in the dedicated "Additional Provisions" section before signatures. The rest of the approved MSA+Baa framework is immutable.' },

    // Computed
    { key: 'effective_date', label: 'Effective date', source: 'computed', format: 'date', required: true, hint: 'Defaults to today (the date the contract is generated).' },
  ],
};
