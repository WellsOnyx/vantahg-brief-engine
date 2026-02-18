'use client';

import { useState, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PortalStage = 'submitted' | 'ai_analysis' | 'physician_review' | 'determination';
type PortalStatus = 'pending' | 'in_progress' | 'completed';
type DeterminationResult = 'approved' | 'denied' | null;

interface PortalCase {
  id: string;
  caseRef: string;
  patientName: string;
  patientMasked: string;
  memberId: string;
  procedureCode: string;
  procedureDescription: string;
  dateSubmitted: string;
  currentStage: PortalStage;
  determination: DeterminationResult;
  estimatedCompletion: string;
  priority: 'standard' | 'urgent' | 'expedited';
  reviewType: string;
  peerToPeerAvailable: boolean;
  notes: string;
}

// ---------------------------------------------------------------------------
// Stage pipeline definition
// ---------------------------------------------------------------------------

const STAGES: { key: PortalStage; label: string; description: string }[] = [
  { key: 'submitted', label: 'Submitted', description: 'Case received and validated' },
  { key: 'ai_analysis', label: 'AI Analysis', description: 'Clinical criteria analysis in progress' },
  { key: 'physician_review', label: 'Physician Review', description: 'Board-certified physician reviewing' },
  { key: 'determination', label: 'Determination', description: 'Final decision issued' },
];

function stageIndex(stage: PortalStage): number {
  return STAGES.findIndex((s) => s.key === stage);
}

function stageStatus(stage: PortalStage, currentStage: PortalStage): PortalStatus {
  const current = stageIndex(currentStage);
  const target = stageIndex(stage);
  if (target < current) return 'completed';
  if (target === current) return 'in_progress';
  return 'pending';
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_CASES: PortalCase[] = [
  {
    id: '1',
    caseRef: 'VHG-2026-00412',
    patientName: 'John Davidson',
    patientMasked: 'John D.',
    memberId: 'MBR-88431',
    procedureCode: 'D7240',
    procedureDescription: 'Surgical removal of impacted tooth',
    dateSubmitted: '2026-02-17T09:15:00Z',
    currentStage: 'submitted',
    determination: null,
    estimatedCompletion: '2026-02-19T17:00:00Z',
    priority: 'standard',
    reviewType: 'Prior Authorization',
    peerToPeerAvailable: false,
    notes: 'Case has been received and is queued for clinical analysis. All required documentation has been verified.',
  },
  {
    id: '2',
    caseRef: 'VHG-2026-00409',
    patientName: 'Maria Santos',
    patientMasked: 'Maria S.',
    memberId: 'MBR-72104',
    procedureCode: 'D4341',
    procedureDescription: 'Periodontal scaling and root planing, 4+ teeth per quadrant',
    dateSubmitted: '2026-02-16T14:30:00Z',
    currentStage: 'ai_analysis',
    determination: null,
    estimatedCompletion: '2026-02-18T12:00:00Z',
    priority: 'standard',
    reviewType: 'Medical Necessity',
    peerToPeerAvailable: false,
    notes: 'AI clinical analysis is actively evaluating submitted radiographs and periodontal charting against evidence-based criteria.',
  },
  {
    id: '3',
    caseRef: 'VHG-2026-00401',
    patientName: 'Robert Chen',
    patientMasked: 'Robert C.',
    memberId: 'MBR-55923',
    procedureCode: 'D2750',
    procedureDescription: 'Crown - porcelain fused to high noble metal',
    dateSubmitted: '2026-02-15T10:00:00Z',
    currentStage: 'physician_review',
    determination: null,
    estimatedCompletion: '2026-02-17T17:00:00Z',
    priority: 'urgent',
    reviewType: 'Prior Authorization',
    peerToPeerAvailable: false,
    notes: 'A board-certified dental consultant is reviewing the AI-generated clinical brief and supporting documentation.',
  },
  {
    id: '4',
    caseRef: 'VHG-2026-00398',
    patientName: 'Angela Morris',
    patientMasked: 'Angela M.',
    memberId: 'MBR-44810',
    procedureCode: 'D6010',
    procedureDescription: 'Endosseous implant body placement',
    dateSubmitted: '2026-02-14T08:45:00Z',
    currentStage: 'physician_review',
    determination: null,
    estimatedCompletion: '2026-02-17T15:00:00Z',
    priority: 'expedited',
    reviewType: 'Prior Authorization',
    peerToPeerAvailable: false,
    notes: 'Expedited review in progress. Physician is evaluating bone density imaging and implant placement plan.',
  },
  {
    id: '5',
    caseRef: 'VHG-2026-00385',
    patientName: 'Thomas Wright',
    patientMasked: 'Thomas W.',
    memberId: 'MBR-33201',
    procedureCode: 'D0367',
    procedureDescription: 'Cone beam CT capture and interpretation',
    dateSubmitted: '2026-02-12T11:20:00Z',
    currentStage: 'determination',
    determination: 'approved',
    estimatedCompletion: '2026-02-14T09:00:00Z',
    priority: 'standard',
    reviewType: 'Medical Necessity',
    peerToPeerAvailable: false,
    notes: 'Determination: Approved. Clinical documentation supports medical necessity per ADA guidelines. Authorization valid for 90 days.',
  },
  {
    id: '6',
    caseRef: 'VHG-2026-00379',
    patientName: 'Lisa Nguyen',
    patientMasked: 'Lisa N.',
    memberId: 'MBR-29087',
    procedureCode: 'D8080',
    procedureDescription: 'Comprehensive orthodontic treatment, adolescent dentition',
    dateSubmitted: '2026-02-11T13:00:00Z',
    currentStage: 'determination',
    determination: 'denied',
    estimatedCompletion: '2026-02-13T16:00:00Z',
    priority: 'standard',
    reviewType: 'Prior Authorization',
    peerToPeerAvailable: true,
    notes: 'Determination: Denied. Documentation does not meet medical necessity criteria for comprehensive orthodontic treatment at this time. A peer-to-peer review is available upon request.',
  },
];

// ---------------------------------------------------------------------------
// Filter status options (client-facing labels)
// ---------------------------------------------------------------------------

type FilterStatus = '' | 'submitted' | 'in_review' | 'completed_approved' | 'completed_denied';

const FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'in_review', label: 'Under Review' },
  { value: 'completed_approved', label: 'Approved' },
  { value: 'completed_denied', label: 'Denied' },
];

function matchesFilter(c: PortalCase, filter: FilterStatus): boolean {
  if (filter === '') return true;
  if (filter === 'submitted') return c.currentStage === 'submitted';
  if (filter === 'in_review')
    return c.currentStage === 'ai_analysis' || c.currentStage === 'physician_review';
  if (filter === 'completed_approved')
    return c.currentStage === 'determination' && c.determination === 'approved';
  if (filter === 'completed_denied')
    return c.currentStage === 'determination' && c.determination === 'denied';
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// ProgressStepper
// ---------------------------------------------------------------------------

function ProgressStepper({
  currentStage,
  determination,
}: {
  currentStage: PortalStage;
  determination: DeterminationResult;
}) {
  return (
    <div className="flex items-center w-full mt-4">
      {STAGES.map((stage, i) => {
        const status = stageStatus(stage.key, currentStage);
        const isLast = i === STAGES.length - 1;

        // Determine node styling
        let nodeClasses = '';
        let labelClasses = 'text-xs mt-1.5 font-medium text-center ';
        let lineClasses = 'flex-1 h-0.5 mx-1 ';

        if (status === 'completed') {
          nodeClasses = 'bg-green-500 text-white';
          labelClasses += 'text-green-700';
        } else if (status === 'in_progress') {
          if (stage.key === 'determination' && determination === 'denied') {
            nodeClasses = 'bg-red-500 text-white';
            labelClasses += 'text-red-700';
          } else if (stage.key === 'determination' && determination === 'approved') {
            nodeClasses = 'bg-green-500 text-white';
            labelClasses += 'text-green-700';
          } else if (stage.key === 'ai_analysis') {
            nodeClasses = 'bg-gold text-navy animate-pulse';
            labelClasses += 'text-gold-dark';
          } else {
            nodeClasses = 'bg-navy text-white';
            labelClasses += 'text-navy';
          }
        } else {
          nodeClasses = 'bg-gray-200 text-gray-400';
          labelClasses += 'text-muted';
        }

        // Line color
        if (status === 'completed') {
          lineClasses += 'bg-green-400';
        } else {
          lineClasses += 'bg-gray-200';
        }

        return (
          <div key={stage.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center min-w-[60px]">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${nodeClasses} transition-all duration-300`}
              >
                {status === 'completed' ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : status === 'in_progress' && stage.key === 'determination' && determination === 'denied' ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={labelClasses}>{stage.label}</span>
            </div>
            {!isLast && <div className={lineClasses} />}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CaseCard
// ---------------------------------------------------------------------------

function CaseCard({ caseData }: { caseData: PortalCase }) {
  const [expanded, setExpanded] = useState(false);

  const currentIdx = stageIndex(caseData.currentStage);
  const isComplete = caseData.currentStage === 'determination';
  const isActive = caseData.currentStage === 'ai_analysis';

  // Determine the headline status text
  let statusText = '';
  let statusColor = '';
  if (isComplete && caseData.determination === 'approved') {
    statusText = 'Approved';
    statusColor = 'bg-green-50 text-green-700 border-green-200';
  } else if (isComplete && caseData.determination === 'denied') {
    statusText = 'Denied';
    statusColor = 'bg-red-50 text-red-700 border-red-200';
  } else if (isActive) {
    statusText = 'AI Analysis';
    statusColor = 'bg-amber-50 text-amber-700 border-amber-200';
  } else if (caseData.currentStage === 'physician_review') {
    statusText = 'Physician Review';
    statusColor = 'bg-purple-50 text-purple-700 border-purple-200';
  } else {
    statusText = 'Submitted';
    statusColor = 'bg-blue-50 text-blue-700 border-blue-200';
  }

  // Priority badge
  let priorityColor = 'bg-gray-100 text-gray-600';
  if (caseData.priority === 'urgent') priorityColor = 'bg-red-50 text-red-700';
  if (caseData.priority === 'expedited') priorityColor = 'bg-orange-50 text-orange-700';

  return (
    <div
      className={`bg-surface rounded-xl border transition-all duration-200 ${
        expanded ? 'border-navy/30 shadow-lg' : 'border-border shadow-sm hover:shadow-md'
      } ${isActive ? 'ring-2 ring-gold/30' : ''}`}
    >
      {/* Card Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-5 py-4 sm:px-6 sm:py-5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-mono text-sm font-semibold text-navy">{caseData.caseRef}</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusColor}`}>
                {isActive && (
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full mr-1.5 animate-pulse" />
                )}
                {statusText}
              </span>
              {caseData.priority !== 'standard' && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${priorityColor}`}>
                  {caseData.priority === 'urgent' ? 'Urgent' : 'Expedited'}
                </span>
              )}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm">
              <span className="text-foreground font-medium">{caseData.patientMasked}</span>
              <span className="text-muted hidden sm:inline">|</span>
              <span className="text-muted">
                <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded mr-1.5">{caseData.procedureCode}</span>
                {caseData.procedureDescription}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
            <span className="text-xs text-muted whitespace-nowrap">
              Submitted {formatShortDate(caseData.dateSubmitted)}
            </span>
            {!isComplete && (
              <span className="text-xs text-muted whitespace-nowrap">
                Est. {formatShortDate(caseData.estimatedCompletion)}
              </span>
            )}
            <svg
              className={`w-5 h-5 text-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Progress Stepper - always visible */}
        <ProgressStepper currentStage={caseData.currentStage} determination={caseData.determination} />
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-border px-5 py-4 sm:px-6 sm:py-5 space-y-4 bg-gray-50/40">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <DetailField label="Case Reference" value={caseData.caseRef} />
            <DetailField label="Member ID" value={caseData.memberId} />
            <DetailField label="Patient" value={caseData.patientMasked} />
            <DetailField label="Procedure Code" value={caseData.procedureCode} mono />
            <DetailField label="Review Type" value={caseData.reviewType} />
            <DetailField label="Date Submitted" value={formatDate(caseData.dateSubmitted)} />
            {!isComplete && (
              <DetailField label="Estimated Completion" value={formatDate(caseData.estimatedCompletion)} />
            )}
            {isComplete && (
              <DetailField
                label="Determination"
                value={caseData.determination === 'approved' ? 'Approved' : 'Denied'}
                highlight={caseData.determination === 'approved' ? 'green' : 'red'}
              />
            )}
          </div>

          {/* Status Notes */}
          <div className="bg-white rounded-lg border border-border p-4">
            <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Status Notes</h4>
            <p className="text-sm text-foreground leading-relaxed">{caseData.notes}</p>
          </div>

          {/* Current stage description */}
          <div className="flex items-start gap-3 bg-navy/5 rounded-lg p-4">
            <div className="w-8 h-8 rounded-full bg-navy/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-navy">
                {isComplete
                  ? 'Review Complete'
                  : `Current Stage: ${STAGES[currentIdx].label}`}
              </h4>
              <p className="text-sm text-muted mt-0.5">
                {isComplete
                  ? 'This case has been fully reviewed and a determination has been issued.'
                  : STAGES[currentIdx].description}
              </p>
            </div>
          </div>

          {/* P2P option for denied cases */}
          {caseData.peerToPeerAvailable && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Peer-to-Peer Review Available</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    The requesting provider may schedule a peer-to-peer discussion with the reviewing physician.
                  </p>
                </div>
              </div>
              <button className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap">
                Request P2P
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DetailField helper
// ---------------------------------------------------------------------------

function DetailField({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: 'green' | 'red';
}) {
  let valueClasses = 'text-sm text-foreground font-medium';
  if (mono) valueClasses += ' font-mono';
  if (highlight === 'green') valueClasses = 'text-sm font-semibold text-green-700';
  if (highlight === 'red') valueClasses = 'text-sm font-semibold text-red-700';

  return (
    <div>
      <dt className="text-xs font-semibold text-muted uppercase tracking-wider">{label}</dt>
      <dd className={valueClasses}>{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Understanding Your Review sidebar section
// ---------------------------------------------------------------------------

function ReviewExplainer() {
  const stages = [
    {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      title: 'Submission',
      description: 'Your case and clinical documentation are received, validated, and entered into our secure system.',
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      title: 'AI Analysis',
      description: 'Our AI engine reviews clinical documentation against evidence-based guidelines, identifying relevant criteria and preparing a comprehensive brief for physician review.',
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      title: 'Physician Review',
      description: 'A board-certified physician reviews the AI-prepared brief alongside all clinical documentation to make an independent clinical determination.',
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      title: 'Determination',
      description: 'The physician issues a final determination. If denied, the requesting provider can request a peer-to-peer review with the reviewing physician.',
    },
  ];

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="bg-navy px-5 py-4 sm:px-6">
        <h2 className="font-[family-name:var(--font-dm-serif)] text-lg text-white">
          Understanding Your Review
        </h2>
        <p className="text-white/70 text-sm mt-1">What happens at each stage</p>
      </div>
      <div className="p-5 sm:p-6 space-y-5">
        {stages.map((stage, i) => (
          <div key={stage.title} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-9 h-9 rounded-full bg-navy/10 text-navy flex items-center justify-center flex-shrink-0">
                {stage.icon}
              </div>
              {i < stages.length - 1 && (
                <div className="w-px flex-1 bg-border mt-2" />
              )}
            </div>
            <div className="pb-4">
              <h3 className="text-sm font-semibold text-foreground">{stage.title}</h3>
              <p className="text-sm text-muted mt-0.5 leading-relaxed">{stage.description}</p>
            </div>
          </div>
        ))}

        {/* Trust message */}
        <div className="bg-navy/5 rounded-lg p-4 mt-2">
          <p className="text-sm text-navy leading-relaxed font-medium">
            Every case is analyzed using evidence-based clinical criteria and reviewed by a board-certified physician.
          </p>
          <p className="text-xs text-muted mt-2 leading-relaxed">
            Our AI technology assists physicians by preparing comprehensive clinical briefs, but all determinations are made by licensed medical professionals. We are committed to transparency, accuracy, and timely decisions.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Portal Page
// ---------------------------------------------------------------------------

export default function CaseStatusPortal() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('');

  const filteredCases = useMemo(() => {
    return DEMO_CASES.filter((c) => {
      // Status filter
      if (!matchesFilter(c, statusFilter)) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          c.caseRef.toLowerCase().includes(q) ||
          c.patientMasked.toLowerCase().includes(q) ||
          c.patientName.toLowerCase().includes(q) ||
          c.memberId.toLowerCase().includes(q) ||
          c.procedureCode.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [searchQuery, statusFilter]);

  // Summary counts
  const totalCases = DEMO_CASES.length;
  const activeCases = DEMO_CASES.filter(
    (c) => c.currentStage !== 'determination'
  ).length;
  const completedCases = DEMO_CASES.filter(
    (c) => c.currentStage === 'determination'
  ).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl sm:text-4xl text-navy">
          Case Status Portal
        </h1>
        <p className="text-muted mt-2 text-base sm:text-lg">
          Track your utilization review cases in real-time
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
        <div className="bg-surface rounded-xl border border-border p-4 sm:p-5 shadow-sm">
          <div className="text-2xl sm:text-3xl font-bold text-navy">{totalCases}</div>
          <div className="text-xs sm:text-sm font-medium text-muted mt-0.5">Total Cases</div>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4 sm:p-5 shadow-sm">
          <div className="text-2xl sm:text-3xl font-bold text-gold-dark">{activeCases}</div>
          <div className="text-xs sm:text-sm font-medium text-muted mt-0.5">In Progress</div>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4 sm:p-5 shadow-sm">
          <div className="text-2xl sm:text-3xl font-bold text-green-700">{completedCases}</div>
          <div className="text-xs sm:text-sm font-medium text-muted mt-0.5">Completed</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        {/* Case List */}
        <div className="flex-1 min-w-0">
          {/* Search and Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by case reference, patient name, or member ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-border rounded-lg bg-surface focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold placeholder:text-muted/60"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
              className="text-sm border border-border rounded-lg px-3 py-2.5 bg-surface focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold sm:w-44"
            >
              {FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Case Cards */}
          <div className="space-y-4">
            {filteredCases.length === 0 ? (
              <div className="text-center py-16 bg-surface rounded-xl border border-border">
                <svg
                  className="mx-auto h-12 w-12 text-muted/40"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                  />
                </svg>
                <h3 className="mt-3 text-sm font-semibold text-foreground">No cases found</h3>
                <p className="mt-1 text-sm text-muted">
                  No cases match your search or filter criteria. Try adjusting your search.
                </p>
              </div>
            ) : (
              filteredCases.map((caseData) => (
                <CaseCard key={caseData.id} caseData={caseData} />
              ))
            )}
          </div>

          {/* Results count */}
          {filteredCases.length > 0 && (
            <div className="text-xs text-muted mt-4 text-center">
              Showing {filteredCases.length} of {DEMO_CASES.length} case{DEMO_CASES.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:w-[360px] flex-shrink-0">
          <div className="lg:sticky lg:top-8 space-y-6">
            <ReviewExplainer />

            {/* Contact Support */}
            <div className="bg-surface rounded-xl border border-border shadow-sm p-5 sm:p-6">
              <h3 className="font-semibold text-foreground text-sm">Need Assistance?</h3>
              <p className="text-sm text-muted mt-1.5 leading-relaxed">
                Our team is available to help with any questions about your case status or the review process.
              </p>
              <div className="mt-4 space-y-2">
                <a
                  href="mailto:support@vantahg.com"
                  className="flex items-center gap-2 text-sm text-navy hover:text-gold-dark transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  support@vantahg.com
                </a>
                <a
                  href="tel:+18005551234"
                  className="flex items-center gap-2 text-sm text-navy hover:text-gold-dark transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  1-800-555-1234
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
