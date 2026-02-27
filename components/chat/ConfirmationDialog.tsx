'use client';

import type { CaseFormData } from '@/lib/types';
import type { RequiredFieldStatus } from '@/lib/chat/types';

interface Props {
  extractedData: Partial<CaseFormData>;
  requiredFieldsStatus: RequiredFieldStatus[];
  isOpen: boolean;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationDialog({
  extractedData,
  requiredFieldsStatus,
  isOpen,
  isSubmitting,
  onConfirm,
  onCancel,
}: Props) {
  if (!isOpen) return null;

  const allFilled = requiredFieldsStatus.every((f) => f.filled);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" onClick={onCancel} />

      {/* Dialog */}
      <div className="relative bg-surface rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-auto border border-border animate-scale-in">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-navy/5">
          <h2 className="text-lg font-semibold text-foreground font-[family-name:var(--font-dm-serif)]">
            Confirm Case Submission
          </h2>
          <p className="text-xs text-muted mt-1">
            Review the extracted information before submitting.
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Patient */}
          <Section title="Patient Information">
            <Row label="Name" value={extractedData.patient_name} />
            <Row label="DOB" value={extractedData.patient_dob} />
            <Row label="Member ID" value={extractedData.patient_member_id} />
            <Row label="Gender" value={extractedData.patient_gender} />
          </Section>

          {/* Service */}
          <Section title="Service Details">
            <Row label="Category" value={extractedData.service_category?.replace(/_/g, ' ')} />
            <Row label="Review Type" value={extractedData.review_type?.replace(/_/g, ' ')} />
            <Row label="Priority" value={extractedData.priority} />
          </Section>

          {/* Provider */}
          <Section title="Provider">
            <Row label="Provider" value={extractedData.requesting_provider} />
            <Row label="NPI" value={extractedData.requesting_provider_npi} />
            <Row label="Specialty" value={extractedData.requesting_provider_specialty} />
            <Row label="Facility Type" value={extractedData.facility_type} />
          </Section>

          {/* Procedures */}
          <Section title="Procedure Details">
            <Row label="CPT/HCPCS" value={extractedData.procedure_codes?.join(', ')} />
            <Row label="ICD-10" value={extractedData.diagnosis_codes?.join(', ')} />
            <Row label="Description" value={extractedData.procedure_description} multiline />
          </Section>

          {/* Clinical Question */}
          {extractedData.clinical_question && (
            <Section title="Clinical Question">
              <p className="text-sm text-foreground">{extractedData.clinical_question}</p>
            </Section>
          )}

          {/* Payer */}
          <Section title="Payer">
            <Row label="Payer" value={extractedData.payer_name} />
            <Row label="Plan Type" value={extractedData.plan_type} />
          </Section>

          {/* Required fields checklist */}
          <div className="border border-border rounded-xl p-4 bg-background">
            <h4 className="text-xs font-medium text-muted mb-2">Required Fields</h4>
            <div className="grid grid-cols-2 gap-1">
              {requiredFieldsStatus.map((field) => (
                <div key={field.field} className="flex items-center gap-1.5">
                  {field.filled ? (
                    <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                  )}
                  <span className={`text-xs ${field.filled ? 'text-foreground' : 'text-red-500'}`}>
                    {field.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            Back to Chat
          </button>
          <button
            onClick={onConfirm}
            disabled={!allFilled || isSubmitting}
            className="px-5 py-2.5 bg-gold hover:bg-gold-dark text-navy text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
                Submitting...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Submit Case
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-medium text-muted uppercase tracking-wide mb-2">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  multiline,
}: {
  label: string;
  value?: string | null;
  multiline?: boolean;
}) {
  if (!value) return null;

  if (multiline) {
    return (
      <div>
        <span className="text-xs text-muted">{label}</span>
        <p className="text-sm text-foreground">{value}</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted w-24 flex-shrink-0">{label}</span>
      <span className="text-sm text-foreground font-medium">{value}</span>
    </div>
  );
}
