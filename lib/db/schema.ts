/**
 * Drizzle schema for VantaUM Postgres.
 *
 * This mirrors the existing migrations (supabase/migrations/000-009) but
 * defines the same tables for use with Drizzle ORM against AWS RDS Postgres.
 * Constraints and indexes are documented here for code-level reference; the
 * authoritative DDL still lives in `supabase/migrations/` and is applied via
 * the same SQL files (RDS speaks Postgres, so the migrations run unchanged
 * after stripping the `auth.users` references that Supabase Auth created).
 *
 * When Cognito replaces Supabase Auth, `user_profiles.id` becomes a Cognito
 * `sub` (UUID-shaped) rather than a foreign key into Supabase's `auth.users`.
 * The application layer enforces that the Cognito sub matches.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  date,
  doublePrecision,
  pgEnum,
} from 'drizzle-orm/pg-core';

// ── Enum-like text checks are kept inline as `text` columns with app-level
// validation; Drizzle supports pgEnum but we mirror the original SQL CHECK
// constraints for consistency with existing migrations.

// ── clients ────────────────────────────────────────────────────────────────
export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  name: text('name').notNull(),
  type: text('type'), // tpa | health_plan | self_funded_employer | managed_care_org | workers_comp | auto_med
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  usesInterqual: boolean('uses_interqual').default(false),
  usesMcg: boolean('uses_mcg').default(false),
  customGuidelinesUrl: text('custom_guidelines_url'),
  contractedSlaHours: doublePrecision('contracted_sla_hours'),
  contractedRatePerCase: numeric('contracted_rate_per_case', { precision: 10, scale: 2 }),
  // Migration 004 — credentials
  interqualPortalUrl: text('interqual_portal_url'),
  interqualUsername: text('interqual_username'),
  interqualApiKey: text('interqual_api_key'),
  mcgPortalUrl: text('mcg_portal_url'),
  mcgUsername: text('mcg_username'),
  mcgApiKey: text('mcg_api_key'),
  onboardingStatus: text('onboarding_status').default('pending'),
  credentialsConfiguredAt: timestamp('credentials_configured_at', { withTimezone: true }),
  onboardingNotes: text('onboarding_notes'),
});

// ── reviewers (physicians) ─────────────────────────────────────────────────
export const reviewers = pgTable('reviewers', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  name: text('name').notNull(),
  credentials: text('credentials'),
  specialty: text('specialty'),
  subspecialty: text('subspecialty'),
  boardCertifications: text('board_certifications').array(),
  licenseState: text('license_state').array(),
  licenseStates: text('license_states').array(),
  approvedServiceCategories: text('approved_service_categories').array(),
  maxCasesPerDay: integer('max_cases_per_day'),
  avgTurnaroundHours: doublePrecision('avg_turnaround_hours'),
  deaNumber: text('dea_number'),
  email: text('email').unique(),
  phone: text('phone'),
  status: text('status').default('active'),
  casesCompleted: integer('cases_completed').default(0),
});

// ── staff (LPNs, RNs, admin) ───────────────────────────────────────────────
export const staff = pgTable('staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  name: text('name').notNull(),
  role: text('role').notNull(), // lpn | rn | admin_staff
  email: text('email').unique(),
  phone: text('phone'),
  licenseNumber: text('license_number'),
  licenseState: text('license_state'),
  certifications: text('certifications').array(),
  maxCasesPerDay: integer('max_cases_per_day'),
  avgTurnaroundHours: doublePrecision('avg_turnaround_hours'),
  status: text('status').default('active'),
  casesCompleted: integer('cases_completed').default(0),
  qualityScore: doublePrecision('quality_score'),
});

// ── pods ───────────────────────────────────────────────────────────────────
export const pods = pgTable('pods', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  name: text('name').notNull(),
  description: text('description'),
  serviceCategories: text('service_categories').array(),
  clientIds: uuid('client_ids').array(),
  rnId: uuid('rn_id').references(() => staff.id),
  adminStaffId: uuid('admin_staff_id').references(() => staff.id),
  isActive: boolean('is_active').default(true),
  capacityPerDay: integer('capacity_per_day'),
});

// ── cases ──────────────────────────────────────────────────────────────────
export const cases = pgTable('cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  caseNumber: text('case_number').notNull().unique(),
  status: text('status').default('intake'),
  priority: text('priority').default('standard'),
  serviceCategory: text('service_category'),
  vertical: text('vertical'),
  patientName: text('patient_name'),
  patientDob: date('patient_dob'),
  patientMemberId: text('patient_member_id'),
  patientGender: text('patient_gender'),
  requestingProvider: text('requesting_provider'),
  requestingProviderNpi: text('requesting_provider_npi'),
  requestingProviderSpecialty: text('requesting_provider_specialty'),
  servicingProvider: text('servicing_provider'),
  servicingProviderNpi: text('servicing_provider_npi'),
  facilityName: text('facility_name'),
  facilityType: text('facility_type'),
  procedureCodes: text('procedure_codes').array(),
  diagnosisCodes: text('diagnosis_codes').array(),
  procedureDescription: text('procedure_description'),
  clinicalQuestion: text('clinical_question'),
  assignedReviewerId: uuid('assigned_reviewer_id').references(() => reviewers.id),
  reviewType: text('review_type'),
  payerName: text('payer_name'),
  planType: text('plan_type'),
  turnaroundDeadline: timestamp('turnaround_deadline', { withTimezone: true }),
  slaHours: doublePrecision('sla_hours'),
  aiBrief: jsonb('ai_brief'),
  aiBriefGeneratedAt: timestamp('ai_brief_generated_at', { withTimezone: true }),
  factCheck: jsonb('fact_check'),
  factCheckAt: timestamp('fact_check_at', { withTimezone: true }),
  determination: text('determination'),
  determinationRationale: text('determination_rationale'),
  determinationAt: timestamp('determination_at', { withTimezone: true }),
  determinedBy: uuid('determined_by').references(() => reviewers.id),
  denialReason: text('denial_reason'),
  denialCriteriaCited: text('denial_criteria_cited'),
  alternativeRecommended: text('alternative_recommended'),
  submittedDocuments: text('submitted_documents').array(),
  clientId: uuid('client_id').references(() => clients.id),
  // Migration 003 — pod assignment + nursing tiers
  assignedPodId: uuid('assigned_pod_id').references(() => pods.id),
  assignedLpnId: uuid('assigned_lpn_id').references(() => staff.id),
  assignedRnId: uuid('assigned_rn_id').references(() => staff.id),
  lpnReviewNotes: text('lpn_review_notes'),
  lpnReviewAt: timestamp('lpn_review_at', { withTimezone: true }),
  lpnDetermination: text('lpn_determination'),
  rnReviewNotes: text('rn_review_notes'),
  rnReviewAt: timestamp('rn_review_at', { withTimezone: true }),
  rnDetermination: text('rn_determination'),
  slaPausedAt: timestamp('sla_paused_at', { withTimezone: true }),
  slaResumedAt: timestamp('sla_resumed_at', { withTimezone: true }),
  slaPauseTotalHours: doublePrecision('sla_pause_total_hours').default(0),
  intakeChannel: text('intake_channel'),
  intakeConfirmationSent: boolean('intake_confirmation_sent').default(false),
  authorizationNumber: text('authorization_number'),
  peerToPeerStatus: text('peer_to_peer_status'),
  peerToPeerScheduledAt: timestamp('peer_to_peer_scheduled_at', { withTimezone: true }),
  peerToPeerCompletedAt: timestamp('peer_to_peer_completed_at', { withTimezone: true }),
  peerToPeerNotes: text('peer_to_peer_notes'),
  appealOfCaseId: uuid('appeal_of_case_id'),
  appealStatus: text('appeal_status'),
  // Migration 005 — physician feedback, denial strength, Two-Midnight
  physicianAiAgreement: text('physician_ai_agreement'),
  physicianAiFeedbackNotes: text('physician_ai_feedback_notes'),
  denialStrengthScore: integer('denial_strength_score'),
  denialStrengthGrade: text('denial_strength_grade'),
  twoMidnightApplies: boolean('two_midnight_applies').default(false),
  payerClassification: text('payer_classification'),
  // Migration 006 — intake tracking
  intakeSourceId: uuid('intake_source_id'),
  intakeReceivedAt: timestamp('intake_received_at', { withTimezone: true }),
  intakeProcessedAt: timestamp('intake_processed_at', { withTimezone: true }),
  // Migration 008 — fingerprint
  submissionFingerprint: text('submission_fingerprint'),
  // Migration 009 — First Mover
  orgId: uuid('org_id'),
  intakeServiceType: text('intake_service_type'),
  slaPauseReason: text('sla_pause_reason'),
});

// ── audit_log ──────────────────────────────────────────────────────────────
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  caseId: uuid('case_id').references(() => cases.id),
  action: text('action').notNull(),
  actor: text('actor'),
  details: jsonb('details'),
  actorType: text('actor_type').default('user'),
  actorId: uuid('actor_id'),
});

// ── user_profiles ──────────────────────────────────────────────────────────
// Under Cognito: `id` is the Cognito `sub` (UUID format). Drop the FK to
// auth.users which doesn't exist on RDS.
export const userProfiles = pgTable('user_profiles', {
  id: uuid('id').primaryKey(),
  name: text('name'),
  role: text('role').notNull().default('reviewer'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  providerOrgId: uuid('provider_org_id'),
});

// ── provider_orgs ──────────────────────────────────────────────────────────
export const providerOrgs = pgTable('provider_orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  name: text('name').notNull(),
  npi: text('npi'),
  taxId: text('tax_id'),
  primaryFax: text('primary_fax'),
  primaryEmail: text('primary_email'),
  address: text('address'),
  status: text('status').default('active'),
});

// ── member_eligibility ─────────────────────────────────────────────────────
export const memberEligibility = pgTable('member_eligibility', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  memberId: text('member_id').notNull(),
  memberName: text('member_name'),
  memberDob: date('member_dob'),
  planId: text('plan_id'),
  planName: text('plan_name'),
  effectiveDate: date('effective_date'),
  terminationDate: date('termination_date'),
  status: text('status').notNull().default('active'),
  sourceFileVersion: text('source_file_version'),
  source: text('source').default('manual'),
  notes: text('notes'),
});

// ── case_modifications ─────────────────────────────────────────────────────
export const caseModifications = pgTable('case_modifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  modifiedBy: uuid('modified_by'),
  modifierRole: text('modifier_role'),
  reason: text('reason').notNull(),
  beforeState: jsonb('before_state').notNull(),
  afterState: jsonb('after_state').notNull(),
  fieldsChanged: text('fields_changed').array().notNull(),
});

// ── intake_log ─────────────────────────────────────────────────────────────
export const intakeLog = pgTable('intake_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  channel: text('channel').notNull(),
  sourceIdentifier: text('source_identifier'),
  authorizationNumber: text('authorization_number'),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'set null' }),
  patientNameHash: text('patient_name_hash'),
  status: text('status').notNull().default('received'),
  rejectionReason: text('rejection_reason'),
  metadata: jsonb('metadata'),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  processedBy: text('processed_by'),
});

// ── efax_queue ─────────────────────────────────────────────────────────────
export const efaxQueue = pgTable('efax_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  faxId: text('fax_id').notNull(),
  fromNumber: text('from_number'),
  toNumber: text('to_number'),
  pageCount: integer('page_count').default(0),
  documentUrl: text('document_url'),
  contentType: text('content_type').default('application/pdf'),
  ocrText: text('ocr_text'),
  ocrConfidence: numeric('ocr_confidence', { precision: 5, scale: 2 }),
  parsedData: jsonb('parsed_data'),
  status: text('status').notNull().default('received'),
  intakeLogId: uuid('intake_log_id').references(() => intakeLog.id),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'set null' }),
  needsManualReview: boolean('needs_manual_review').default(false),
  manualReviewReasons: text('manual_review_reasons').array(),
  reviewedBy: text('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  provider: text('provider'),
  providerMetadata: jsonb('provider_metadata'),
  // Migration 008 — async pipeline
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  lastError: text('last_error'),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  lockedBy: text('locked_by'),
  processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
  processingCompletedAt: timestamp('processing_completed_at', { withTimezone: true }),
  storagePath: text('storage_path'),
  storageSha256: text('storage_sha256'),
  storageBytes: integer('storage_bytes'),
  submissionFingerprint: text('submission_fingerprint'),
  extractionModel: text('extraction_model'),
  extractionMethod: text('extraction_method'),
  ocrProvider: text('ocr_provider'),
});

// ── email_queue ────────────────────────────────────────────────────────────
export const emailQueue = pgTable('email_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  emailId: text('email_id').unique(),
  fromAddress: text('from_address').notNull(),
  fromName: text('from_name'),
  toAddress: text('to_address'),
  subject: text('subject'),
  bodyText: text('body_text'),
  bodyHtml: text('body_html'),
  attachmentCount: integer('attachment_count').default(0),
  attachmentTypes: text('attachment_types').array(),
  attachmentUrls: jsonb('attachment_urls'),
  hasClinicalDocuments: boolean('has_clinical_documents').default(false),
  parsedData: jsonb('parsed_data'),
  confidenceScore: integer('confidence_score').default(0),
  status: text('status').notNull().default('received'),
  needsManualReview: boolean('needs_manual_review').notNull().default(false),
  manualReviewReasons: text('manual_review_reasons').array(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'set null' }),
  authorizationNumber: text('authorization_number'),
  emailType: text('email_type').default('auth_request'),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  processedBy: uuid('processed_by'),
  senderVerified: boolean('sender_verified').default(false),
});

// ── appeals ────────────────────────────────────────────────────────────────
export const appeals = pgTable('appeals', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  originalCaseId: uuid('original_case_id').references(() => cases.id),
  appealCaseId: uuid('appeal_case_id').references(() => cases.id),
  reason: text('reason'),
  filedBy: text('filed_by'),
  filedAt: timestamp('filed_at', { withTimezone: true }).defaultNow(),
  status: text('status').default('pending'),
  originalDenyingReviewerId: uuid('original_denying_reviewer_id').references(() => reviewers.id),
  assignedReviewerId: uuid('assigned_reviewer_id').references(() => reviewers.id),
  determination: text('determination'),
  determinationAt: timestamp('determination_at', { withTimezone: true }),
  determinationRationale: text('determination_rationale'),
  outcome: text('outcome'),
  outcomeRationale: text('outcome_rationale'),
  originalDenialStrengthScore: integer('original_denial_strength_score'),
});

// ── peer_to_peer_records ───────────────────────────────────────────────────
export const peerToPeerRecords = pgTable('peer_to_peer_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  caseId: uuid('case_id').references(() => cases.id),
  requestingProvider: text('requesting_provider'),
  reviewingPhysicianId: uuid('reviewing_physician_id').references(() => reviewers.id),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  outcome: text('outcome'),
  notes: text('notes'),
  status: text('status').default('requested'),
});

// ── quality_audits ─────────────────────────────────────────────────────────
export const qualityAudits = pgTable('quality_audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  caseId: uuid('case_id').references(() => cases.id),
  auditorId: uuid('auditor_id').references(() => staff.id),
  auditedStaffId: uuid('audited_staff_id').references(() => staff.id),
  criteriaAccuracy: integer('criteria_accuracy'),
  documentationQuality: integer('documentation_quality'),
  slaCompliance: boolean('sla_compliance'),
  determinationAppropriate: boolean('determination_appropriate'),
  notes: text('notes'),
  overallScore: integer('overall_score'),
  status: text('status').default('pending'),
});

// ── missing_info_requests ──────────────────────────────────────────────────
export const missingInfoRequests = pgTable('missing_info_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  caseId: uuid('case_id').references(() => cases.id),
  requestedBy: uuid('requested_by').references(() => staff.id),
  requestedItems: text('requested_items').array(),
  sentTo: text('sent_to'),
  sentVia: text('sent_via'),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  receivedItems: text('received_items').array(),
  status: text('status').default('pending'),
  deadline: timestamp('deadline', { withTimezone: true }),
});

// ── determination_templates ────────────────────────────────────────────────
export const determinationTemplates = pgTable('determination_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  clientId: uuid('client_id').references(() => clients.id),
  templateType: text('template_type').notNull(),
  name: text('name').notNull(),
  bodyTemplate: text('body_template').notNull(),
  appealInstructions: text('appeal_instructions'),
  isActive: boolean('is_active').default(true),
});

// ── allowed_sender_domains ─────────────────────────────────────────────────
export const allowedSenderDomains = pgTable('allowed_sender_domains', {
  id: uuid('id').primaryKey().defaultRandom(),
  domain: text('domain').notNull().unique(),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
  verified: boolean('verified').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  notes: text('notes'),
});

// ── Convenience: type exports for the rest of the app ──────────────────────
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
export type Reviewer = typeof reviewers.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type Pod = typeof pods.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
export type UserProfile = typeof userProfiles.$inferSelect;
export type ProviderOrg = typeof providerOrgs.$inferSelect;
export type MemberEligibility = typeof memberEligibility.$inferSelect;
export type CaseModification = typeof caseModifications.$inferSelect;
export type IntakeLog = typeof intakeLog.$inferSelect;
export type NewIntakeLog = typeof intakeLog.$inferInsert;
export type EfaxQueue = typeof efaxQueue.$inferSelect;
export type EmailQueue = typeof emailQueue.$inferSelect;
export type Appeal = typeof appeals.$inferSelect;
export type P2PRecord = typeof peerToPeerRecords.$inferSelect;
export type QualityAudit = typeof qualityAudits.$inferSelect;
export type MissingInfoRequest = typeof missingInfoRequests.$inferSelect;
export type DeterminationTemplate = typeof determinationTemplates.$inferSelect;
export type AllowedSenderDomain = typeof allowedSenderDomains.$inferSelect;
