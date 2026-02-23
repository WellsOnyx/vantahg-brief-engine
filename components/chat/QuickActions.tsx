'use client';

import type { CaseFormData } from '@/lib/types';

interface Props {
  mode: 'intake' | 'review';
  extractedData: Partial<CaseFormData>;
  isReady: boolean;
  isStreaming: boolean;
  onAction: (message: string) => void;
  onSwitchToForm?: () => void;
  onSubmit?: () => void;
}

interface QuickAction {
  label: string;
  message?: string;
  onClick?: () => void;
  variant?: 'default' | 'gold' | 'navy';
}

export function QuickActions({
  mode,
  extractedData,
  isReady,
  isStreaming,
  onAction,
  onSwitchToForm,
  onSubmit,
}: Props) {
  if (isStreaming) return null;

  const actions = getActions(mode, extractedData, isReady, onAction, onSwitchToForm, onSubmit);

  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 pb-2">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => {
            if (action.onClick) {
              action.onClick();
            } else if (action.message) {
              onAction(action.message);
            }
          }}
          className={`text-xs px-3 py-1.5 rounded-full border transition-all duration-200 hover:shadow-sm ${
            action.variant === 'gold'
              ? 'bg-gold/10 border-gold/30 text-gold-dark hover:bg-gold/20 font-medium'
              : action.variant === 'navy'
                ? 'bg-navy/10 border-navy/20 text-navy hover:bg-navy/15'
                : 'bg-surface border-border text-muted hover:bg-background hover:text-foreground'
          }`}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

function getActions(
  mode: 'intake' | 'review',
  extractedData: Partial<CaseFormData>,
  isReady: boolean,
  onAction: (message: string) => void,
  onSwitchToForm?: () => void,
  onSubmit?: () => void,
): QuickAction[] {
  if (mode === 'review') {
    return [
      { label: 'Criteria Match?', message: 'What criteria support this procedure? Are there any criteria not met?' },
      { label: 'Missing Docs?', message: 'What documentation is missing from this case?' },
      { label: 'Suggest Determination', message: 'Based on the brief, what determination would you suggest and why?' },
      { label: 'Conservative Alternatives', message: 'What conservative alternatives should be considered?' },
    ];
  }

  // Intake mode
  const hasCodes = (extractedData.procedure_codes?.length || 0) > 0;
  const hasPatient = !!extractedData.patient_name;

  if (isReady) {
    return [
      { label: 'Review & Submit', onClick: onSubmit, variant: 'gold' },
      { label: 'Switch to Form', onClick: onSwitchToForm, variant: 'navy' },
    ];
  }

  if (hasCodes && hasPatient) {
    return [
      { label: 'Validate Codes', message: 'Can you validate the procedure codes I provided and check the criteria?' },
      { label: 'Check Guidelines', message: 'What clinical guidelines apply to this case?' },
      { label: 'Switch to Form', onClick: onSwitchToForm },
    ];
  }

  if (!hasCodes) {
    return [
      { label: 'MRI', message: 'I need to submit an MRI review' },
      { label: 'Surgery', message: 'I need to submit a surgery authorization' },
      { label: 'DME', message: 'I need a DME authorization review' },
      { label: 'Switch to Form', onClick: onSwitchToForm },
    ];
  }

  return [
    { label: 'Switch to Form', onClick: onSwitchToForm },
  ];
}
