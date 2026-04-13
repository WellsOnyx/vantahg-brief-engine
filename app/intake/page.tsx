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

interface TriageQueueItem {
  id: string;
  created_at: string;
  fax_id: string;
  from_number: string | null;
  to_number: string | null;
  page_count: number;
  status: string;
  needs_manual_review: boolean;
  manual_review_reasons: string[];
  extracted_data: Record<string, unknown> | null;
  case_id: string | null;
  ocr_confidence: number | null;
  extraction_method: string | null;
  extraction_model: string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  authorization_number: string | null;
  provider: string;
}

interface TriageStats {
  manual_review: number;
  dead_letter: number;
  total: number;
  oldest_at: string | null;
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

type ActiveTab = 'overview' | 'triage' | 'efax' | 'email' | 'log';

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

  // Triage state
  const [triageItems, setTriageItems] = useState<TriageQueueItem[]>([]);
  const [triageStats, setTriageStats] = useState<TriageStats | null>(null);
  const [triageFilter, setTriageFilter] = useState<'all' | 'manual_review' | 'dead_letter'>('all');
  const [triageLoading, setTriageLoading] = useState(false);
  const [selectedTriageItem, setSelectedTriageItem] = useState<TriageQueueItem | null>(null);
  const [editingData, setEditingData] = useState<Record<string, unknown> | null>(null);
  const [triageActionLoading, setTriageActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [triageSuccessMessage, setTriageSuccessMessage] = useState<string | null>(null);

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

  // Triage data fetching
  const fetchTriageData = useCallback(async () => {
    setTriageLoading(true);
    try {
      const params = new URLSearchParams();
      if (triageFilter !== 'all') params.set('status', triageFilter);
      else params.set('status', 'all');

      const res = await fetch(`/api/intake/efax/queue?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTriageItems(data.items || []);
        setTriageStats(data.stats || null);
      }
    } catch {
      // Silent fail for triage, main data already loaded
    } finally {
      setTriageLoading(false);
    }
  }, [triageFilter]);

  // Load triage stats on mount (for tab badge), and full data when tab is active
  useEffect(() => {
    // Always fetch stats for the badge
    fetch('/api/intake/efax/queue?status=all')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.stats) setTriageStats(data.stats); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === 'triage') {
      fetchTriageData();
    }
  }, [activeTab, fetchTriageData]);

  function selectTriageItem(item: TriageQueueItem) {
    setSelectedTriageItem(item);
    setEditingData(item.extracted_data ? { ...item.extracted_data } : {});
    setShowRejectDialog(false);
    setRejectReason('');
    setTriageSuccessMessage(null);
  }

  function updateEditingField(field: string, value: unknown) {
    if (!editingData) return;
    setEditingData({ ...editingData, [field]: value });
  }

  function updateEditingArrayField(field: string, value: string) {
    if (!editingData) return;
    const arr = value.split(',').map((s) => s.trim()).filter(Boolean);
    setEditingData({ ...editingData, [field]: arr });
  }

  async function handleTriageAction(action: 'promote' | 'reject' | 'retry_ocr' | 'update_data') {
    if (!selectedTriageItem) return;
    setTriageActionLoading(true);
    setTriageSuccessMessage(null);

    try {
      const payload: Record<string, unknown> = {
        id: selectedTriageItem.id,
        action,
      };

      if (action === 'promote' || action === 'update_data') {
        payload.extracted_data = editingData;
      }
      if (action === 'reject') {
        payload.reject_reason = rejectReason || 'Rejected during CSR triage';
      }

      const res = await fetch('/api/intake/efax/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const result = await res.json();
        const actionMessages: Record<string, string> = {
          promote: `Case created: ${result.case_number || result.case_id || 'Success'}`,
          reject: 'eFax rejected successfully',
          retry_ocr: 'eFax queued for re-processing',
          update_data: 'Extracted data saved',
        };
        setTriageSuccessMessage(actionMessages[action] || 'Action completed');

        if (action !== 'update_data') {
          // Remove the item from the list and deselect
          setTriageItems((prev) => prev.filter((i) => i.id !== selectedTriageItem.id));
          setSelectedTriageItem(null);
          setEditingData(null);
          // Refresh stats
          fetchTriageData();
        }
      } else {
        const err = await res.json();
        setTriageSuccessMessage(`Error: ${err.error || 'Action failed'}`);
      }
    } catch {
      setTriageSuccessMessage('Error: Network request failed');
    } finally {
      setTriageActionLoading(false);
      setShowRejectDialog(false);
    }
  }

  function formatAge(dateStr: string): string {
    const now = new Date();
    const then = new Date(dateStr);
    const diffMs = now.getTime() - then.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`;
    if (diffHours > 0) return `${diffHours}h`;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return `${diffMins}m`;
  }

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
            { key: 'triage' as const, label: `CSR Triage${triageStats ? ` (${triageStats.total})` : ''}`, highlight: (triageStats?.total ?? 0) > 0 },
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
                  : 'highlight' in tab && tab.highlight
                  ? 'text-orange-600 border-transparent hover:text-orange-700 hover:border-orange-300'
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

          {/* CSR Triage Tab */}
          {activeTab === 'triage' && (
            <div className="space-y-4">
              {/* Stats Bar */}
              {triageStats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
                    <p className="text-xs font-medium text-muted uppercase tracking-wider">Needs Review</p>
                    <p className="text-2xl font-bold text-orange-600 mt-1">{triageStats.manual_review}</p>
                    <p className="text-xs text-muted mt-0.5">manual review items</p>
                  </div>
                  <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
                    <p className="text-xs font-medium text-muted uppercase tracking-wider">Dead Letter</p>
                    <p className="text-2xl font-bold text-red-600 mt-1">{triageStats.dead_letter}</p>
                    <p className="text-xs text-muted mt-0.5">failed processing</p>
                  </div>
                  <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
                    <p className="text-xs font-medium text-muted uppercase tracking-wider">Total Flagged</p>
                    <p className="text-2xl font-bold text-navy mt-1">{triageStats.total}</p>
                    <p className="text-xs text-muted mt-0.5">items in queue</p>
                  </div>
                  <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
                    <p className="text-xs font-medium text-muted uppercase tracking-wider">Oldest Item</p>
                    <p className="text-2xl font-bold text-navy mt-1">
                      {triageStats.oldest_at ? formatAge(triageStats.oldest_at) : '--'}
                    </p>
                    <p className="text-xs text-muted mt-0.5">waiting in queue</p>
                  </div>
                </div>
              )}

              {/* Filter Tabs */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-medium text-muted">Filter:</span>
                {[
                  { key: 'all' as const, label: 'All Flagged' },
                  { key: 'manual_review' as const, label: 'Manual Review' },
                  { key: 'dead_letter' as const, label: 'Dead Letter' },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => { setTriageFilter(f.key); setSelectedTriageItem(null); setEditingData(null); }}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                      triageFilter === f.key
                        ? 'bg-navy text-white'
                        : 'bg-gray-100 text-muted hover:bg-gray-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
                <button
                  onClick={fetchTriageData}
                  className="ml-auto text-xs font-medium text-gold-dark hover:text-gold transition-colors inline-flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
                  Refresh
                </button>
              </div>

              {/* Success Message */}
              {triageSuccessMessage && !selectedTriageItem && (
                <div className={`rounded-xl border p-4 flex items-center gap-3 ${
                  triageSuccessMessage.startsWith('Error')
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-green-50 border-green-200 text-green-700'
                }`}>
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {triageSuccessMessage.startsWith('Error') ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    )}
                  </svg>
                  <p className="text-sm font-medium">{triageSuccessMessage}</p>
                </div>
              )}

              {triageLoading ? (
                <div className="bg-surface rounded-xl border border-border shadow-sm p-8">
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-5 h-5 border-2 border-navy/20 border-t-navy rounded-full animate-spin" />
                    <p className="text-sm text-muted">Loading triage queue...</p>
                  </div>
                </div>
              ) : selectedTriageItem ? (
                /* ── Detail Panel ────────────────────────────── */
                <div className="space-y-4">
                  {/* Back button */}
                  <button
                    onClick={() => { setSelectedTriageItem(null); setEditingData(null); setTriageSuccessMessage(null); }}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-gold-dark hover:text-gold transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                    Back to Queue
                  </button>

                  {/* Item Header */}
                  <div className="bg-surface rounded-xl border border-border shadow-sm p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <div className="flex items-center gap-3">
                          <h2 className="font-[family-name:var(--font-dm-serif)] text-xl text-navy">
                            {(editingData?.patient_name as string) || 'Unknown Patient'}
                          </h2>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            selectedTriageItem.status === 'dead_letter'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-orange-50 text-orange-700 border-orange-200'
                          }`}>
                            {selectedTriageItem.status === 'dead_letter' ? 'Dead Letter' : 'Manual Review'}
                          </span>
                        </div>
                        <p className="text-sm text-muted mt-1">
                          Fax ID: <span className="font-mono">{selectedTriageItem.fax_id}</span>
                          {' | '}Auth: <span className="font-mono">{selectedTriageItem.authorization_number || '--'}</span>
                          {' | '}From: {selectedTriageItem.from_number || 'Unknown'}
                          {' | '}{selectedTriageItem.page_count} page{selectedTriageItem.page_count !== 1 ? 's' : ''}
                          {' | '}Received {formatAge(selectedTriageItem.created_at)} ago
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleTriageAction('retry_ocr')}
                          disabled={triageActionLoading}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-navy hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                          </svg>
                          Retry OCR
                        </button>
                        <button
                          onClick={() => setShowRejectDialog(true)}
                          disabled={triageActionLoading}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Reject
                        </button>
                        <button
                          onClick={() => handleTriageAction('promote')}
                          disabled={triageActionLoading}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-navy text-gold text-sm font-semibold hover:bg-navy-light transition-colors shadow-sm disabled:opacity-50"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                          Promote to Case
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Reject Dialog */}
                  {showRejectDialog && (
                    <div className="bg-red-50 rounded-xl border border-red-200 p-5">
                      <h3 className="text-sm font-semibold text-red-800 mb-2">Reject this eFax</h3>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Reason for rejection (e.g., not an auth request, spam, unreadable)..."
                        className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-300 mb-3"
                        rows={2}
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleTriageAction('reject')}
                          disabled={triageActionLoading}
                          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          Confirm Rejection
                        </button>
                        <button
                          onClick={() => setShowRejectDialog(false)}
                          className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Success/Error Message */}
                  {triageSuccessMessage && (
                    <div className={`rounded-xl border p-4 flex items-center gap-3 ${
                      triageSuccessMessage.startsWith('Error')
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : 'bg-green-50 border-green-200 text-green-700'
                    }`}>
                      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        {triageSuccessMessage.startsWith('Error') ? (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        )}
                      </svg>
                      <p className="text-sm font-medium">{triageSuccessMessage}</p>
                    </div>
                  )}

                  {/* Side-by-side panels */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Left Panel: Editable Extracted Data */}
                    <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-navy">Extracted Data</h3>
                          <p className="text-xs text-muted mt-0.5">Edit fields before promoting to a case</p>
                        </div>
                        <button
                          onClick={() => handleTriageAction('update_data')}
                          disabled={triageActionLoading}
                          className="text-xs font-medium text-gold-dark hover:text-gold transition-colors disabled:opacity-50"
                        >
                          Save Changes
                        </button>
                      </div>
                      <div className="p-5 space-y-4 max-h-[600px] overflow-y-auto">
                        {/* Patient Section */}
                        <fieldset className="space-y-3">
                          <legend className="text-xs font-semibold text-navy uppercase tracking-wider mb-2">Patient Information</legend>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-muted mb-1">Patient Name</label>
                              <input
                                type="text"
                                value={(editingData?.patient_name as string) || ''}
                                onChange={(e) => updateEditingField('patient_name', e.target.value || null)}
                                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
                                placeholder="Patient full name"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-muted mb-1">Date of Birth</label>
                              <input
                                type="text"
                                value={(editingData?.patient_dob as string) || ''}
                                onChange={(e) => updateEditingField('patient_dob', e.target.value || null)}
                                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
                                placeholder="YYYY-MM-DD"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-muted mb-1">Member ID</label>
                              <input
                                type="text"
                                value={(editingData?.patient_member_id as string) || ''}
                                onChange={(e) => updateEditingField('patient_member_id', e.target.value || null)}
                                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold font-mono"
                                placeholder="Member ID"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-muted mb-1">Gender</label>
                              <select
                                value={(editingData?.patient_gender as string) || ''}
                                onChange={(e) => updateEditingField('patient_gender', e.target.value || null)}
                                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/50"
                              >
                                <option value="">Unknown</option>
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>
                          </div>
                        </fieldset>

                        {/* Provider Section */}
                        <fieldset className="space-y-3">
                          <legend className="text-xs font-semibold text-navy uppercase tracking-wider mb-2">Requesting Provider</legend>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-muted mb-1">Provider Name</label>
                              <input
                                type="text"
                                value={(editingData?.requesting_provider as string) || ''}
                                onChange={(e) => updateEditingField('requesting_provider', e.target.value || null)}
                                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
                                placeholder="Provider name"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-muted mb-1">NPI</label>
                              <input
                                type="text"
                                value={(editingData?.requesting_provider_npi as string) || ''}
                                onChange={(e) => updateEditingField('requesting_provider_npi', e.target.value || null)}
                                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold font-mono"
                                placeholder="10-digit NPI"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-muted mb-1">Specialty</label>
                              <input
                                type="text"
                                value={(editingData?.requesting_provider_specialty as string) || ''}
                                onChange={(e) => updateEditingField('requesting_provider_specialty', e.target.value || null)}
                                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
                                placeholder="Specialty"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-muted mb-1">Fax Number</label>
                              <input
                                type="text"
                                value={(editingData?.requesting_provider_fax as string) || ''}
                                onChange={(e) => updateEditingField('requesting_provider_fax', e.target.value || null)}
                                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold font-mono"
                                placeholder="Fax number"
                              />
                            </div>
                          </div>
                        </fieldset>

                        {/* Clinical Section */}
                        <fieldset className="space-y-3">
                          <legend className="text-xs font-semibold text-navy uppercase tracking-wider mb-2">Clinical Information</legend>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-muted mb-1">Procedure Codes (comma-separated)</label>
                              <input
                                type="text"
                                value={Array.isArray(editingData?.procedure_codes) ? (editingData.procedure_codes as string[]).join(', ') : ''}
                                onChange={(e) => updateEditingArrayField('procedure_codes', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold font-mono"
                                placeholder="27447, 99213"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-muted mb-1">Diagnosis Codes (comma-separated)</label>
                              <input
                                type="text"
                                value={Array.isArray(editingData?.diagnosis_codes) ? (editingData.diagnosis_codes as string[]).join(', ') : ''}
                                onChange={(e) => updateEditingArrayField('diagnosis_codes', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold font-mono"
                                placeholder="M17.11, I10"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-muted mb-1">Procedure Description</label>
                            <textarea
                              value={(editingData?.procedure_description as string) || ''}
                              onChange={(e) => updateEditingField('procedure_description', e.target.value || null)}
                              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
                              rows={2}
                              placeholder="Description of the requested procedure"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-muted mb-1">Service Category</label>
                              <select
                                value={(editingData?.service_category as string) || ''}
                                onChange={(e) => updateEditingField('service_category', e.target.value || null)}
                                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/50"
                              >
                                <option value="">-- Select --</option>
                                <option value="imaging">Imaging</option>
                                <option value="surgery">Surgery</option>
                                <option value="specialty_referral">Specialty Referral</option>
                                <option value="dme">DME</option>
                                <option value="infusion">Infusion</option>
                                <option value="behavioral_health">Behavioral Health</option>
                                <option value="rehab_therapy">Rehab Therapy</option>
                                <option value="home_health">Home Health</option>
                                <option value="skilled_nursing">Skilled Nursing</option>
                                <option value="transplant">Transplant</option>
                                <option value="genetic_testing">Genetic Testing</option>
                                <option value="pain_management">Pain Management</option>
                                <option value="cardiology">Cardiology</option>
                                <option value="oncology">Oncology</option>
                                <option value="ophthalmology">Ophthalmology</option>
                                <option value="workers_comp">Workers Comp</option>
                                <option value="emergency_medicine">Emergency Medicine</option>
                                <option value="internal_medicine">Internal Medicine</option>
                                <option value="other">Other</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-muted mb-1">Priority</label>
                              <select
                                value={(editingData?.priority as string) || 'standard'}
                                onChange={(e) => updateEditingField('priority', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/50"
                              >
                                <option value="standard">Standard</option>
                                <option value="urgent">Urgent</option>
                                <option value="expedited">Expedited</option>
                              </select>
                            </div>
                          </div>
                        </fieldset>

                        {/* Facility & Payer */}
                        <fieldset className="space-y-3">
                          <legend className="text-xs font-semibold text-navy uppercase tracking-wider mb-2">Facility & Payer</legend>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-muted mb-1">Facility Name</label>
                              <input
                                type="text"
                                value={(editingData?.facility_name as string) || ''}
                                onChange={(e) => updateEditingField('facility_name', e.target.value || null)}
                                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
                                placeholder="Facility name"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-muted mb-1">Facility Type</label>
                              <select
                                value={(editingData?.facility_type as string) || ''}
                                onChange={(e) => updateEditingField('facility_type', e.target.value || null)}
                                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/50"
                              >
                                <option value="">-- Select --</option>
                                <option value="inpatient">Inpatient</option>
                                <option value="outpatient">Outpatient</option>
                                <option value="asc">ASC</option>
                                <option value="office">Office</option>
                                <option value="home">Home</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-muted mb-1">Payer Name</label>
                              <input
                                type="text"
                                value={(editingData?.payer_name as string) || ''}
                                onChange={(e) => updateEditingField('payer_name', e.target.value || null)}
                                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
                                placeholder="Payer name"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-muted mb-1">Plan Type</label>
                              <input
                                type="text"
                                value={(editingData?.plan_type as string) || ''}
                                onChange={(e) => updateEditingField('plan_type', e.target.value || null)}
                                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
                                placeholder="PPO, HMO, etc."
                              />
                            </div>
                          </div>
                        </fieldset>
                      </div>
                    </div>

                    {/* Right Panel: Status & Diagnostics */}
                    <div className="space-y-4">
                      {/* Processing Status */}
                      <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-border">
                          <h3 className="font-semibold text-navy">Processing Status</h3>
                        </div>
                        <div className="p-5 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted">Status</span>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                              selectedTriageItem.status === 'dead_letter'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : 'bg-orange-50 text-orange-700 border-orange-200'
                            }`}>
                              {selectedTriageItem.status === 'dead_letter' ? 'Dead Letter' : 'Manual Review'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted">OCR Confidence</span>
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    (selectedTriageItem.ocr_confidence ?? 0) >= 80 ? 'bg-green-500' :
                                    (selectedTriageItem.ocr_confidence ?? 0) >= 60 ? 'bg-amber-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${selectedTriageItem.ocr_confidence ?? 0}%` }}
                                />
                              </div>
                              <span className="text-xs font-mono text-foreground">{selectedTriageItem.ocr_confidence ?? 0}%</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted">Extraction Confidence</span>
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    ((editingData?.confidence as number) ?? 0) >= 80 ? 'bg-green-500' :
                                    ((editingData?.confidence as number) ?? 0) >= 60 ? 'bg-amber-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${(editingData?.confidence as number) ?? 0}%` }}
                                />
                              </div>
                              <span className="text-xs font-mono text-foreground">{(editingData?.confidence as number) ?? 0}%</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted">Extraction Method</span>
                            <span className="text-xs font-mono text-foreground">
                              {selectedTriageItem.extraction_method || 'none'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted">AI Model</span>
                            <span className="text-xs font-mono text-foreground">
                              {selectedTriageItem.extraction_model || '--'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted">Attempts</span>
                            <span className="text-xs font-mono text-foreground">
                              {selectedTriageItem.attempts} / {selectedTriageItem.max_attempts}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted">Provider</span>
                            <span className="text-xs font-mono text-foreground capitalize">
                              {selectedTriageItem.provider}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Flagging Reasons */}
                      <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-border">
                          <h3 className="font-semibold text-navy">Flagging Reasons</h3>
                        </div>
                        <div className="p-5">
                          {selectedTriageItem.manual_review_reasons.length > 0 ? (
                            <ul className="space-y-2">
                              {selectedTriageItem.manual_review_reasons.map((reason, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <svg className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                  </svg>
                                  <span className="text-sm text-foreground">{reason}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-muted">No specific reasons recorded</p>
                          )}
                        </div>
                      </div>

                      {/* Last Error */}
                      {selectedTriageItem.last_error && (
                        <div className="bg-red-50 rounded-xl border border-red-200 overflow-hidden">
                          <div className="px-5 py-4 border-b border-red-200">
                            <h3 className="font-semibold text-red-800">Last Processing Error</h3>
                          </div>
                          <div className="p-5">
                            <p className="text-sm text-red-700 font-mono whitespace-pre-wrap break-words">
                              {selectedTriageItem.last_error}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Queue List ─────────────────────────────── */
                <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-navy">CSR Triage Queue</h2>
                      <p className="text-xs text-muted mt-0.5">
                        eFax submissions requiring human review before case creation
                      </p>
                    </div>
                    <div className="text-xs text-muted bg-navy/5 px-3 py-1 rounded-full font-medium">
                      {triageItems.length} item{triageItems.length !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {triageItems.length === 0 ? (
                    <div className="p-12 text-center">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-50 flex items-center justify-center">
                        <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h3 className="text-base font-semibold text-foreground font-[family-name:var(--font-dm-serif)]">
                        Queue is clear
                      </h3>
                      <p className="mt-2 text-sm text-muted max-w-sm mx-auto">
                        No eFax submissions currently require manual review. New items will appear here when the AI extraction pipeline flags them.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-gray-50/80">
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider">From</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider">Patient</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider hidden md:table-cell">Pages</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider hidden lg:table-cell">Confidence</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider">Status</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider hidden sm:table-cell">Age</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider">Flags</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-navy uppercase tracking-wider">
                              <span className="sr-only">Action</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {triageItems.map((item) => (
                            <tr
                              key={item.id}
                              onClick={() => selectTriageItem(item)}
                              className="hover:bg-gold/[0.04] transition-colors cursor-pointer group"
                            >
                              <td className="px-4 py-3">
                                <div className="font-mono text-xs text-navy font-medium">{item.from_number || 'Unknown'}</div>
                                <div className="text-[10px] text-muted mt-0.5">{item.fax_id}</div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-sm text-foreground font-medium">
                                  {(item.extracted_data?.patient_name as string) || <span className="text-muted italic">Not extracted</span>}
                                </div>
                                {(() => {
                                  const codes = (item.extracted_data as Record<string, unknown>)?.procedure_codes as string[] | undefined;
                                  if (!codes || codes.length === 0) return null;
                                  return (
                                    <div className="flex gap-1 mt-0.5">
                                      {codes.slice(0, 2).map((code) => (
                                        <span key={code} className="inline-block bg-navy/5 text-navy px-1.5 py-0.5 rounded text-[10px] font-mono">
                                          {code}
                                        </span>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="px-4 py-3 text-muted text-xs hidden md:table-cell">{item.page_count}</td>
                              <td className="px-4 py-3 hidden lg:table-cell">
                                <div className="flex items-center gap-2">
                                  <div className="w-14 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        ((item.extracted_data?.confidence as number) ?? 0) >= 80 ? 'bg-green-500' :
                                        ((item.extracted_data?.confidence as number) ?? 0) >= 60 ? 'bg-amber-500' : 'bg-red-500'
                                      }`}
                                      style={{ width: `${(item.extracted_data?.confidence as number) ?? 0}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-mono text-muted">
                                    {(item.extracted_data?.confidence as number) ?? 0}%
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                  item.status === 'dead_letter'
                                    ? 'bg-red-50 text-red-700 border-red-200'
                                    : 'bg-orange-50 text-orange-700 border-orange-200'
                                }`}>
                                  {item.status === 'dead_letter' ? 'Dead Letter' : 'Manual Review'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-muted whitespace-nowrap hidden sm:table-cell">
                                {formatAge(item.created_at)}
                              </td>
                              <td className="px-4 py-3">
                                <div className="max-w-[200px]">
                                  {item.manual_review_reasons.slice(0, 2).map((reason, i) => (
                                    <p key={i} className="text-[10px] text-orange-600 truncate">{reason}</p>
                                  ))}
                                  {item.manual_review_reasons.length > 2 && (
                                    <p className="text-[10px] text-muted">+{item.manual_review_reasons.length - 2} more</p>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-gold-dark opacity-0 group-hover:opacity-100 transition-opacity">
                                  Review
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                  </svg>
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {triageItems.length > 0 && (
                    <div className="px-4 py-3 border-t border-border text-xs text-muted bg-gray-50/40">
                      Showing {triageItems.length} flagged item{triageItems.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              )}
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
