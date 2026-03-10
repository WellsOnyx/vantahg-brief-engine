'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

// ── Types ──

interface IntakeLogEntry {
  id: string;
  created_at: string;
  channel: string;
  source_identifier: string | null;
  authorization_number: string | null;
  case_id: string | null;
  patient_name_hash: string | null;
  status: string;
  rejection_reason: string | null;
  processed_at: string | null;
  processed_by: string | null;
}

interface EfaxQueueEntry {
  id: string;
  created_at: string;
  fax_id: string;
  from_number: string | null;
  to_number: string | null;
  page_count: number;
  status: string;
  needs_manual_review: boolean;
  manual_review_reasons: string[];
  parsed_data: {
    patient_name?: string;
    procedure_codes?: string[];
    service_category?: string | null;
    confidence?: number;
  } | null;
  case_id: string | null;
}

interface IntakeSummary {
  by_channel: Record<string, number>;
  by_status: Record<string, number>;
}

// ── Constants ──

const channelLabels: Record<string, string> = {
  portal: 'Portal',
  efax: 'E-Fax',
  email: 'Email',
  phone: 'Phone',
  api: 'API',
  batch_upload: 'Batch Upload',
};

const channelIcons: Record<string, string> = {
  portal: 'M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25',
  efax: 'M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.75 12h.008v.008h-.008V12zm-3 0h.008v.008h-.008V12z',
  email: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75',
  phone: 'M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25',
  api: 'M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5',
  batch_upload: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5',
};

const statusColors: Record<string, string> = {
  received: 'bg-blue-50 text-blue-700 border-blue-200',
  processing: 'bg-amber-50 text-amber-700 border-amber-200',
  case_created: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  duplicate: 'bg-gray-50 text-gray-600 border-gray-200',
};

const statusLabels: Record<string, string> = {
  received: 'Received',
  processing: 'Processing',
  case_created: 'Case Created',
  rejected: 'Rejected',
  duplicate: 'Duplicate',
};

const efaxStatusColors: Record<string, string> = {
  received: 'bg-blue-50 text-blue-700 border-blue-200',
  ocr_processing: 'bg-amber-50 text-amber-700 border-amber-200',
  parsed: 'bg-teal-50 text-teal-700 border-teal-200',
  case_created: 'bg-green-50 text-green-700 border-green-200',
  manual_review: 'bg-orange-50 text-orange-700 border-orange-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  duplicate: 'bg-gray-50 text-gray-600 border-gray-200',
};

const efaxStatusLabels: Record<string, string> = {
  received: 'Received',
  ocr_processing: 'OCR Processing',
  parsed: 'Parsed',
  case_created: 'Case Created',
  manual_review: 'Manual Review',
  rejected: 'Rejected',
  duplicate: 'Duplicate',
};

interface EmailQueueEntry {
  id: string;
  created_at: string;
  email_id: string;
  from_address: string;
  from_name: string | null;
  subject: string;
  status: string;
  needs_manual_review: boolean;
  manual_review_reasons: string[];
  confidence_score: number;
  attachment_count: number;
  attachment_types: string[];
  case_id: string | null;
  authorization_number: string | null;
  email_type: string;
  processed_at: string | null;
}

type ActiveTab = 'overview' | 'efax' | 'email' | 'log';

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

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function IntakePage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [intakeLog, setIntakeLog] = useState<IntakeLogEntry[]>([]);
  const [efaxQueue, setEfaxQueue] = useState<EfaxQueueEntry[]>([]);
  const [emailQueue, setEmailQueue] = useState<EmailQueueEntry[]>([]);
  const [summary, setSummary] = useState<IntakeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterChannel, setFilterChannel] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filterChannel) params.set('channel', filterChannel);
      if (filterStatus) params.set('status', filterStatus);

      const [logRes, efaxRes, emailRes] = await Promise.all([
        fetch(`/api/intake/log?${params.toString()}`),
        fetch('/api/intake/efax'),
        fetch('/api/intake/email'),
      ]);

      if (logRes.ok) {
        const logData = await logRes.json();
        setIntakeLog(logData.entries || []);
        setSummary(logData.summary || null);
      }
      if (efaxRes.ok) {
        const efaxData = await efaxRes.json();
        setEfaxQueue(efaxData);
      }
      if (emailRes.ok) {
        const emailData = await emailRes.json();
        setEmailQueue(emailData);
      }
    } catch {
      setError('Failed to load intake data');
    } finally {
      setLoading(false);
    }
  }, [filterChannel, filterStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalToday = intakeLog.filter((l) => {
    const today = new Date();
    const entryDate = new Date(l.created_at);
    return entryDate.toDateString() === today.toDateString();
  }).length;

  const efaxPendingReview = efaxQueue.filter((f) => f.needs_manual_review && f.status !== 'case_created').length;
  const emailPendingReview = emailQueue.filter((e) => e.needs_manual_review && e.status !== 'case_created').length;
  const pendingReview = efaxPendingReview + emailPendingReview;
  const casesCreated = intakeLog.filter((l) => l.status === 'case_created').length;
  const rejections = intakeLog.filter((l) => l.status === 'rejected' || l.status === 'duplicate').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl text-navy">
            Intake Management
          </h1>
          <p className="text-muted mt-1">
            HIPAA-compliant case intake across all channels
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 bg-white border border-border text-navy px-4 py-2 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Single Upload
          </Link>
          <Link
            href="/batch"
            className="inline-flex items-center gap-2 bg-navy text-gold px-4 py-2 rounded-lg font-semibold text-sm hover:bg-navy-light transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Batch Upload
          </Link>
        </div>
      </div>

      {/* HIPAA Compliance Banner */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-green-800">HIPAA-Compliant Intake System</h3>
          <p className="text-xs text-green-700 mt-0.5">
            All submissions are logged with audit trails. Patient names are hashed in logs — no raw PHI stored in intake records.
            Authorization numbers generated for every submission. SOC 2 Type II compliant.
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
          <p className="text-xs font-medium text-muted uppercase tracking-wider">Today&apos;s Intake</p>
          <p className="text-2xl font-bold text-navy mt-1">{totalToday}</p>
          <p className="text-xs text-muted mt-0.5">submissions received</p>
        </div>
        <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
          <p className="text-xs font-medium text-muted uppercase tracking-wider">Pending Review</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{pendingReview}</p>
          <p className="text-xs text-muted mt-0.5">e-faxes need attention</p>
        </div>
        <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
          <p className="text-xs font-medium text-muted uppercase tracking-wider">Cases Created</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{casesCreated}</p>
          <p className="text-xs text-muted mt-0.5">from all channels</p>
        </div>
        <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
          <p className="text-xs font-medium text-muted uppercase tracking-wider">Rejected/Duplicate</p>
          <p className="text-2xl font-bold text-red-500 mt-1">{rejections}</p>
          <p className="text-xs text-muted mt-0.5">filtered out</p>
        </div>
      </div>

      {/* Channel Breakdown */}
      {summary && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
          {Object.entries(channelLabels).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilterChannel(filterChannel === key ? '' : key)}
              className={`bg-surface rounded-xl border shadow-sm p-3 text-center transition-all hover:shadow-md ${
                filterChannel === key ? 'border-gold ring-2 ring-gold/30' : 'border-border'
              }`}
            >
              <div className="w-8 h-8 mx-auto mb-1.5 rounded-lg bg-navy/5 flex items-center justify-center">
                <svg className="w-4 h-4 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={channelIcons[key]} />
                </svg>
              </div>
              <p className="text-lg font-bold text-navy">{summary.by_channel[key] || 0}</p>
              <p className="text-[10px] font-medium text-muted uppercase tracking-wider">{label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border mb-6">
        <nav className="flex gap-6">
          {[
            { key: 'overview' as const, label: 'Overview' },
            { key: 'email' as const, label: `Email Queue${emailPendingReview > 0 ? ` (${emailPendingReview})` : ''}` },
            { key: 'efax' as const, label: `E-Fax Queue${efaxPendingReview > 0 ? ` (${efaxPendingReview})` : ''}` },
            { key: 'log' as const, label: 'Intake Log' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.key
                  ? 'text-navy border-gold'
                  : 'text-muted border-transparent hover:text-foreground hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={fetchData} className="ml-auto text-sm font-medium text-red-600 hover:text-red-800">
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="bg-surface rounded-xl border border-border shadow-sm p-8">
          <div className="flex items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-navy/20 border-t-navy rounded-full animate-spin" />
            <p className="text-sm text-muted">Loading intake data...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Intake Channels Info */}
              <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="font-semibold text-navy">Active Intake Channels</h2>
                  <p className="text-xs text-muted mt-0.5">How cases enter the VantaUM system</p>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
                  {[
                    {
                      channel: 'efax',
                      title: 'E-Fax Intake',
                      desc: 'Automatic OCR processing of incoming faxes. Auth requests parsed and cases auto-created when confidence is high.',
                      status: 'Active',
                      color: 'green',
                    },
                    {
                      channel: 'portal',
                      title: 'Provider Portal',
                      desc: 'Self-service case submission via the upload portal. Real-time form validation and instant auth number assignment.',
                      status: 'Active',
                      color: 'green',
                    },
                    {
                      channel: 'api',
                      title: 'API Integration',
                      desc: 'RESTful API for EHR/TPA system integration. HMAC-authenticated with full HIPAA audit trail.',
                      status: 'Active',
                      color: 'green',
                    },
                    {
                      channel: 'batch_upload',
                      title: 'Batch Upload',
                      desc: 'CSV-based bulk case submission for TPA clients. Validates and creates multiple cases in one operation.',
                      status: 'Active',
                      color: 'green',
                    },
                    {
                      channel: 'email',
                      title: 'Email Intake',
                      desc: 'Monitored inbox for email submissions. Call center, e-fax forwarding, and provider emails parsed with AI-powered extraction.',
                      status: 'Active',
                      color: 'green',
                    },
                    {
                      channel: 'phone',
                      title: 'Phone Intake',
                      desc: 'Manual entry by intake staff during phone calls. Authorization number generated in real-time.',
                      status: 'Manual',
                      color: 'blue',
                    },
                  ].map((ch) => (
                    <div key={ch.channel} className="bg-surface p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-navy/5 flex items-center justify-center">
                          <svg className="w-4.5 h-4.5 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={channelIcons[ch.channel]} />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-semibold text-foreground">{ch.title}</h3>
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              ch.color === 'green' ? 'bg-green-50 text-green-700' :
                              ch.color === 'amber' ? 'bg-amber-50 text-amber-700' :
                              'bg-blue-50 text-blue-700'
                            }`}>
                              {ch.status}
                            </span>
                          </div>
                          <p className="text-xs text-muted leading-relaxed">{ch.desc}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Intake Activity */}
              <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-navy">Recent Activity</h2>
                    <p className="text-xs text-muted mt-0.5">Latest submissions across all channels</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('log')}
                    className="text-xs font-medium text-gold-dark hover:text-gold transition-colors"
                  >
                    View All
                  </button>
                </div>
                <div className="divide-y divide-border">
                  {intakeLog.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="px-5 py-3 flex items-center gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-navy/5 flex items-center justify-center">
                        <svg className="w-4 h-4 text-navy/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={channelIcons[entry.channel] || channelIcons.portal} />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-navy">{channelLabels[entry.channel] || entry.channel}</span>
                          {entry.authorization_number && (
                            <span className="text-xs font-mono text-muted">{entry.authorization_number}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted mt-0.5">
                          {entry.source_identifier || 'Direct submission'}
                          {entry.rejection_reason && ` — ${entry.rejection_reason}`}
                        </p>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                        statusColors[entry.status] || 'bg-gray-50 text-gray-600 border-gray-200'
                      }`}>
                        {statusLabels[entry.status] || entry.status}
                      </span>
                      <span className="text-xs text-muted whitespace-nowrap hidden sm:block">
                        {formatDateShort(entry.created_at)}
                      </span>
                      {entry.case_id && (
                        <Link
                          href={`/cases/${entry.case_id}`}
                          className="text-xs font-medium text-gold-dark hover:text-gold transition-colors hidden md:block"
                        >
                          View Case
                        </Link>
                      )}
                    </div>
                  ))}
                  {intakeLog.length === 0 && (
                    <div className="px-5 py-8 text-center">
                      <p className="text-sm text-muted">No intake activity yet</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Email Queue Tab */}
          {activeTab === 'email' && (
            <div className="space-y-4">
              <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-navy">Email Intake Queue</h2>
                    <p className="text-xs text-muted mt-0.5">
                      Inbound emails from call center, providers, and forwarded e-faxes
                    </p>
                  </div>
                  <div className="text-xs text-muted bg-navy/5 px-3 py-1 rounded-full font-medium">
                    {emailQueue.length} email{emailQueue.length !== 1 ? 's' : ''}
                  </div>
                </div>

                {emailQueue.length === 0 ? (
                  <div className="p-8 text-center">
                    <svg className="w-10 h-10 text-muted/30 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                    <p className="text-sm text-muted">No emails in queue</p>
                    <p className="text-xs text-muted/70 mt-1">Emails sent to intake@vantaum.com will appear here</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50/50">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Sender</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Subject</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider hidden sm:table-cell">Attachments</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Confidence</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider hidden md:table-cell">Auth #</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider hidden lg:table-cell">Received</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {emailQueue.map((entry) => (
                          <tr key={entry.id} className="hover:bg-gold/[0.03] transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-medium text-foreground truncate max-w-[180px]">
                                {entry.from_name || entry.from_address}
                              </div>
                              <div className="text-xs text-muted truncate max-w-[180px]">
                                {entry.from_address}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-foreground truncate max-w-[250px]">
                                {entry.case_id ? (
                                  <Link href={`/cases/${entry.case_id}`} className="text-gold-dark hover:text-gold font-medium">
                                    {entry.subject}
                                  </Link>
                                ) : (
                                  entry.subject
                                )}
                              </div>
                              {entry.needs_manual_review && entry.manual_review_reasons.length > 0 && (
                                <div className="text-[10px] text-orange-600 mt-0.5 truncate">
                                  {entry.manual_review_reasons[0]}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              {entry.attachment_count > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <svg className="w-3.5 h-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                                  </svg>
                                  <span className="text-xs text-muted">
                                    {entry.attachment_count} ({entry.attachment_types.join(', ')})
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted/50">None</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-gray-100 rounded-full h-1.5">
                                  <div
                                    className={`h-1.5 rounded-full ${
                                      entry.confidence_score >= 80
                                        ? 'bg-green-500'
                                        : entry.confidence_score >= 60
                                        ? 'bg-amber-500'
                                        : 'bg-red-500'
                                    }`}
                                    style={{ width: `${entry.confidence_score}%` }}
                                  />
                                </div>
                                <span className="text-xs font-mono text-muted">{entry.confidence_score}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                efaxStatusColors[entry.status] || 'bg-gray-50 text-gray-600 border-gray-200'
                              }`}>
                                {efaxStatusLabels[entry.status] || entry.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              {entry.authorization_number ? (
                                <span className="font-mono text-xs text-navy">{entry.authorization_number}</span>
                              ) : (
                                <span className="text-xs text-muted/50">--</span>
                              )}
                            </td>
                            <td className="px-4 py-3 hidden lg:table-cell">
                              <span className="text-xs text-muted">{formatDate(entry.created_at)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* E-Fax Queue Tab */}
          {activeTab === 'efax' && (
            <div className="space-y-4">
              {/* E-Fax Status Filter */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-medium text-muted">Filter:</span>
                {['all', 'manual_review', 'parsed', 'case_created'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setFilterStatus(st === 'all' ? '' : st)}
                    className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${
                      (st === 'all' && !filterStatus) || filterStatus === st
                        ? 'bg-navy text-white'
                        : 'bg-gray-100 text-muted hover:bg-gray-200'
                    }`}
                  >
                    {st === 'all' ? 'All' : efaxStatusLabels[st] || st}
                  </button>
                ))}
              </div>

              {/* E-Fax Queue Table */}
              <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="font-semibold text-navy">E-Fax Queue</h2>
                  <p className="text-xs text-muted mt-0.5">Incoming faxes with OCR processing status</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-gray-50/80">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider">Fax ID</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider">From</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider hidden md:table-cell">Pages</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider">Patient</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider hidden lg:table-cell">Codes</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider hidden lg:table-cell">Confidence</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider">Status</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider">Received</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {efaxQueue.map((fax) => (
                        <tr key={fax.id} className="hover:bg-gold/[0.03] transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-navy font-medium">{fax.fax_id}</td>
                          <td className="px-4 py-3 text-foreground">{fax.from_number || '—'}</td>
                          <td className="px-4 py-3 text-muted hidden md:table-cell">{fax.page_count}</td>
                          <td className="px-4 py-3">
                            {fax.parsed_data?.patient_name || <span className="text-muted italic">Not extracted</span>}
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {fax.parsed_data?.procedure_codes && fax.parsed_data.procedure_codes.length > 0 ? (
                              <div className="flex gap-1 flex-wrap">
                                {fax.parsed_data.procedure_codes.map((code) => (
                                  <span key={code} className="inline-block bg-navy/5 text-navy px-1.5 py-0.5 rounded text-xs font-mono">
                                    {code}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted italic text-xs">None</span>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {fax.parsed_data?.confidence != null ? (
                              <div className="flex items-center gap-2">
                                <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      fax.parsed_data.confidence >= 80 ? 'bg-green-500' :
                                      fax.parsed_data.confidence >= 60 ? 'bg-amber-500' : 'bg-red-500'
                                    }`}
                                    style={{ width: `${fax.parsed_data.confidence}%` }}
                                  />
                                </div>
                                <span className="text-xs text-muted">{fax.parsed_data.confidence}%</span>
                              </div>
                            ) : (
                              <span className="text-muted text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                              efaxStatusColors[fax.status] || 'bg-gray-50 text-gray-600 border-gray-200'
                            }`}>
                              {efaxStatusLabels[fax.status] || fax.status}
                            </span>
                            {fax.needs_manual_review && fax.status !== 'case_created' && (
                              <div className="mt-1">
                                {fax.manual_review_reasons.map((reason, i) => (
                                  <p key={i} className="text-[10px] text-orange-600">{reason}</p>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">
                            {formatDate(fax.created_at)}
                          </td>
                        </tr>
                      ))}
                      {efaxQueue.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted">
                            No faxes in queue
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Intake Log Tab */}
          {activeTab === 'log' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-medium text-muted">Channel:</span>
                <select
                  value={filterChannel}
                  onChange={(e) => setFilterChannel(e.target.value)}
                  className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold/50"
                >
                  <option value="">All Channels</option>
                  {Object.entries(channelLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>

                <span className="text-xs font-medium text-muted ml-2">Status:</span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold/50"
                >
                  <option value="">All Statuses</option>
                  {Object.entries(statusLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>

                {(filterChannel || filterStatus) && (
                  <button
                    onClick={() => { setFilterChannel(''); setFilterStatus(''); }}
                    className="text-xs text-gold-dark hover:text-gold font-medium ml-2"
                  >
                    Clear Filters
                  </button>
                )}
              </div>

              {/* Log Table */}
              <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="font-semibold text-navy">Compliance Intake Log</h2>
                  <p className="text-xs text-muted mt-0.5">
                    Complete audit trail — no raw PHI stored. Patient names are hashed for duplicate detection only.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-gray-50/80">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider">Timestamp</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider">Channel</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider">Auth #</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider hidden md:table-cell">Source</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider hidden lg:table-cell">PHI Hash</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider">Status</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider hidden md:table-cell">Processed</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider">Case</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {intakeLog.map((entry) => (
                        <tr key={entry.id} className="hover:bg-gold/[0.03] transition-colors">
                          <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{formatDate(entry.created_at)}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-navy">
                              <svg className="w-3.5 h-3.5 text-navy/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d={channelIcons[entry.channel] || channelIcons.portal} />
                              </svg>
                              {channelLabels[entry.channel] || entry.channel}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-navy font-medium">
                            {entry.authorization_number || '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted hidden md:table-cell">
                            {entry.source_identifier || '—'}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted hidden lg:table-cell">
                            {entry.patient_name_hash || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                              statusColors[entry.status] || 'bg-gray-50 text-gray-600 border-gray-200'
                            }`}>
                              {statusLabels[entry.status] || entry.status}
                            </span>
                            {entry.rejection_reason && (
                              <p className="text-[10px] text-red-600 mt-0.5">{entry.rejection_reason}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted hidden md:table-cell">
                            {entry.processed_at ? formatDate(entry.processed_at) : <span className="italic">Pending</span>}
                          </td>
                          <td className="px-4 py-3">
                            {entry.case_id ? (
                              <Link
                                href={`/cases/${entry.case_id}`}
                                className="text-xs font-medium text-gold-dark hover:text-gold transition-colors"
                              >
                                View
                              </Link>
                            ) : (
                              <span className="text-xs text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {intakeLog.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted">
                            No intake log entries found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-border text-xs text-muted bg-gray-50/40">
                  Showing {intakeLog.length} entries
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
