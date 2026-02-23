'use client';

import type { AIBrief } from '@/lib/types';

interface Props {
  sections: Partial<AIBrief>;
  isStreaming: boolean;
  progress: number;
  currentSection: string | null;
}

const SECTION_LABELS: Record<string, string> = {
  clinical_question: 'Clinical Question',
  patient_summary: 'Patient Summary',
  diagnosis_analysis: 'Diagnosis Analysis',
  procedure_analysis: 'Procedure Analysis',
  criteria_match: 'Clinical Criteria Match',
  documentation_review: 'Documentation Review',
  ai_recommendation: 'AI Recommendation',
  reviewer_action: 'Reviewer Action Required',
};

const SECTION_ORDER = Object.keys(SECTION_LABELS);

export function StreamingBrief({ sections, isStreaming, progress, currentSection }: Props) {
  return (
    <div className="space-y-4">
      {/* Progress bar */}
      {isStreaming && (
        <div className="bg-surface border border-border rounded-xl p-3 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-foreground flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-gold animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              Generating Clinical Brief
            </span>
            <span className="text-xs text-muted">{progress}%</span>
          </div>
          <div className="h-1 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-gold-gradient rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          {currentSection && (
            <p className="text-xs text-muted mt-1.5">
              {SECTION_LABELS[currentSection] || currentSection}...
            </p>
          )}
        </div>
      )}

      {/* Rendered sections */}
      {SECTION_ORDER.map((key) => {
        const content = sections[key as keyof AIBrief];
        if (!content) return null;

        return (
          <div
            key={key}
            className="bg-surface border border-border rounded-xl overflow-hidden animate-slide-up"
          >
            <div className="px-4 py-2.5 bg-navy/5 border-b border-border">
              <h4 className="text-sm font-semibold text-foreground">
                {SECTION_LABELS[key]}
              </h4>
            </div>
            <div className="px-4 py-3">
              <SectionContent sectionKey={key} content={content} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SectionContent({ sectionKey, content }: { sectionKey: string; content: unknown }) {
  if (typeof content === 'string') {
    return <p className="text-sm text-foreground leading-relaxed">{content}</p>;
  }

  if (sectionKey === 'diagnosis_analysis' && typeof content === 'object' && content) {
    const d = content as AIBrief['diagnosis_analysis'];
    return (
      <div className="space-y-2 text-sm">
        <div>
          <span className="text-xs font-medium text-muted">Primary Diagnosis</span>
          <p className="text-foreground">{d.primary_diagnosis}</p>
        </div>
        {d.secondary_diagnoses?.length > 0 && (
          <div>
            <span className="text-xs font-medium text-muted">Secondary</span>
            <p className="text-foreground">{d.secondary_diagnoses.join(', ')}</p>
          </div>
        )}
        <div>
          <span className="text-xs font-medium text-muted">Alignment</span>
          <p className="text-foreground">{d.diagnosis_procedure_alignment}</p>
        </div>
      </div>
    );
  }

  if (sectionKey === 'procedure_analysis' && typeof content === 'object' && content) {
    const p = content as AIBrief['procedure_analysis'];
    return (
      <div className="space-y-2 text-sm">
        <div className="flex flex-wrap gap-1.5">
          {p.codes.map((code) => (
            <span key={code} className="px-2 py-0.5 bg-navy/10 text-navy rounded text-xs font-mono">
              {code}
            </span>
          ))}
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            p.complexity_level === 'routine' ? 'bg-green-100 text-green-700' :
            p.complexity_level === 'moderate' ? 'bg-amber-100 text-amber-700' :
            'bg-red-100 text-red-700'
          }`}>
            {p.complexity_level}
          </span>
        </div>
        <p className="text-foreground">{p.clinical_rationale}</p>
        <div className="px-3 py-2 bg-navy/5 rounded-lg text-xs text-navy">
          {p.setting_appropriateness}
        </div>
      </div>
    );
  }

  if (sectionKey === 'criteria_match' && typeof content === 'object' && content) {
    const c = content as AIBrief['criteria_match'];
    return (
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted">Source:</span>
          <span className="font-medium text-foreground">{c.guideline_source}</span>
        </div>
        {c.criteria_met.length > 0 && (
          <div>
            <span className="text-xs font-medium text-green-600">Criteria Met</span>
            <ul className="mt-1 space-y-0.5">
              {c.criteria_met.map((item, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                  <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        {c.criteria_not_met.length > 0 && (
          <div>
            <span className="text-xs font-medium text-red-600">Criteria Not Met</span>
            <ul className="mt-1 space-y-0.5">
              {c.criteria_not_met.map((item, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                  <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
        {c.conservative_alternatives.length > 0 && (
          <div className="px-3 py-2 bg-indigo-50 rounded-lg">
            <span className="text-xs font-medium text-indigo-700">Conservative Alternatives</span>
            <ul className="mt-1 space-y-0.5">
              {c.conservative_alternatives.map((item, i) => (
                <li key={i} className="text-xs text-indigo-600">• {item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (sectionKey === 'ai_recommendation' && typeof content === 'object' && content) {
    const r = content as AIBrief['ai_recommendation'];
    const colors: Record<string, string> = {
      approve: 'bg-green-100 text-green-700 border-green-200',
      deny: 'bg-red-100 text-red-700 border-red-200',
      pend: 'bg-blue-100 text-blue-700 border-blue-200',
      peer_to_peer_recommended: 'bg-purple-100 text-purple-700 border-purple-200',
    };
    return (
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${colors[r.recommendation] || 'bg-gray-100 text-gray-700'}`}>
            {r.recommendation.replace(/_/g, ' ').toUpperCase()}
          </span>
          <span className={`text-xs ${
            r.confidence === 'high' ? 'text-green-600' :
            r.confidence === 'medium' ? 'text-amber-600' :
            'text-red-600'
          }`}>
            {r.confidence} confidence
          </span>
        </div>
        <p className="text-foreground">{r.rationale}</p>
        {r.key_considerations.length > 0 && (
          <ul className="space-y-0.5">
            {r.key_considerations.map((item, i) => (
              <li key={i} className="text-xs text-muted">• {item}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // Generic object rendering
  if (typeof content === 'object' && content) {
    return (
      <pre className="text-xs text-foreground overflow-auto whitespace-pre-wrap">
        {JSON.stringify(content, null, 2)}
      </pre>
    );
  }

  return null;
}
