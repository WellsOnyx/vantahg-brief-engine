'use client';

import type { CaseFormData } from '@/lib/types';
import type { RequiredFieldStatus } from '@/lib/chat/types';

interface Props {
  extractedData: Partial<CaseFormData>;
  requiredFieldsStatus: RequiredFieldStatus[];
  completionPercent: number;
  isReady: boolean;
  onSubmit?: () => void;
  onEdit?: (field: string, value: string) => void;
}

interface FieldGroup {
  title: string;
  icon: React.ReactNode;
  fields: {
    key: keyof CaseFormData;
    label: string;
    format?: (v: unknown) => string;
  }[];
}

const fieldGroups: FieldGroup[] = [
  {
    title: 'Patient Info',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
    fields: [
      { key: 'patient_name', label: 'Name' },
      { key: 'patient_dob', label: 'DOB' },
      { key: 'patient_member_id', label: 'Member ID' },
      { key: 'patient_gender', label: 'Gender' },
    ],
  },
  {
    title: 'Service',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      </svg>
    ),
    fields: [
      { key: 'service_category', label: 'Category', format: (v) => String(v).replace(/_/g, ' ') },
      { key: 'review_type', label: 'Review Type', format: (v) => String(v).replace(/_/g, ' ') },
      { key: 'priority', label: 'Priority' },
    ],
  },
  {
    title: 'Provider',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
      </svg>
    ),
    fields: [
      { key: 'requesting_provider', label: 'Provider' },
      { key: 'requesting_provider_npi', label: 'NPI' },
      { key: 'requesting_provider_specialty', label: 'Specialty' },
      { key: 'facility_type', label: 'Facility Type' },
    ],
  },
  {
    title: 'Procedures',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    fields: [
      {
        key: 'procedure_codes',
        label: 'CPT/HCPCS',
        format: (v) => Array.isArray(v) ? v.join(', ') : String(v),
      },
      {
        key: 'diagnosis_codes',
        label: 'ICD-10',
        format: (v) => Array.isArray(v) && v.length > 0 ? v.join(', ') : '',
      },
      { key: 'procedure_description', label: 'Description' },
    ],
  },
  {
    title: 'Payer',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
    fields: [
      { key: 'payer_name', label: 'Payer' },
      { key: 'plan_type', label: 'Plan Type' },
    ],
  },
];

export function DataExtractionPanel({
  extractedData,
  requiredFieldsStatus,
  completionPercent,
  isReady,
  onSubmit,
}: Props) {
  const filledRequired = requiredFieldsStatus.filter((f) => f.filled).length;
  const totalRequired = requiredFieldsStatus.length;

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 bg-navy/5 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <svg className="w-4 h-4 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            Extracted Data
          </h3>
          <span className="text-xs text-muted">
            {filledRequired}/{totalRequired} required
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-gold-gradient rounded-full transition-all duration-500 ease-out"
            style={{ width: `${completionPercent}%` }}
          />
        </div>
      </div>

      {/* Field groups */}
      <div className="divide-y divide-border/50">
        {fieldGroups.map((group) => (
          <FieldGroupCard
            key={group.title}
            group={group}
            extractedData={extractedData}
          />
        ))}
      </div>

      {/* Clinical Question */}
      {extractedData.clinical_question && (
        <div className="px-4 py-3 border-t border-border bg-gold/5">
          <p className="text-xs font-medium text-gold-dark mb-1">Clinical Question</p>
          <p className="text-xs text-foreground">{extractedData.clinical_question}</p>
        </div>
      )}

      {/* Submit button */}
      {isReady && onSubmit && (
        <div className="p-4 border-t border-border">
          <button
            onClick={onSubmit}
            className="w-full py-2.5 px-4 bg-gold hover:bg-gold-dark text-navy font-semibold text-sm rounded-xl transition-colors duration-200 shadow-sm hover:shadow-md flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Review & Submit Case
          </button>
        </div>
      )}
    </div>
  );
}

function FieldGroupCard({
  group,
  extractedData,
}: {
  group: FieldGroup;
  extractedData: Partial<CaseFormData>;
}) {
  const hasAnyData = group.fields.some((f) => {
    const val = extractedData[f.key];
    if (Array.isArray(val)) return val.length > 0;
    return val !== null && val !== undefined && val !== '';
  });

  return (
    <div className={`px-4 py-2.5 ${hasAnyData ? '' : 'opacity-50'}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={hasAnyData ? 'text-gold' : 'text-muted'}>{group.icon}</span>
        <span className="text-xs font-medium text-muted">{group.title}</span>
      </div>
      <div className="space-y-0.5">
        {group.fields.map((field) => {
          const rawValue = extractedData[field.key];
          const display = field.format
            ? field.format(rawValue)
            : Array.isArray(rawValue)
              ? rawValue.join(', ')
              : String(rawValue || '');
          const hasValue = display && display !== '' && display !== 'undefined' && display !== 'null';

          if (!hasValue && !hasAnyData) return null;

          return (
            <div key={field.key as string} className="flex items-center gap-2">
              {hasValue ? (
                <svg className="w-3 h-3 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <div className="w-3 h-3 rounded-full border border-border flex-shrink-0" />
              )}
              <span className="text-xs text-muted w-16 flex-shrink-0">{field.label}</span>
              <span
                className={`text-xs truncate ${
                  hasValue ? 'text-foreground font-medium' : 'text-muted/40'
                }`}
              >
                {hasValue ? display : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
