'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { DataExtractionPanel } from '@/components/chat/DataExtractionPanel';
import { ConfirmationDialog } from '@/components/chat/ConfirmationDialog';
import { useChat } from '@/lib/hooks/use-chat';
import { StatusBadge } from '@/components/StatusBadge';
import type { Case } from '@/lib/types';

export default function CommandCenterPage() {
  const router = useRouter();
  const [cases, setCases] = useState<Case[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewCaseId, setReviewCaseId] = useState<string | null>(null);

  const mode = reviewCaseId ? 'review' : 'intake';

  const chat = useChat({
    mode: mode as 'intake' | 'review',
    caseId: reviewCaseId || undefined,
  });

  // Fetch recent cases
  useEffect(() => {
    fetch('/api/cases')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setCases(data.slice(0, 10));
      })
      .catch(console.error);
  }, []);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    const caseId = await chat.submitCase();
    setIsSubmitting(false);
    setShowConfirmation(false);

    if (caseId) {
      router.push(`/cases/${caseId}`);
    }
  }, [chat, router]);

  const switchToReview = useCallback(
    (caseId: string) => {
      chat.resetChat();
      setReviewCaseId(caseId);
    },
    [chat]
  );

  const switchToIntake = useCallback(() => {
    chat.resetChat();
    setReviewCaseId(null);
  }, [chat]);

  // Stats
  const casesToday = cases.filter(
    (c) => new Date(c.created_at).toDateString() === new Date().toDateString()
  ).length;
  const briefsReady = cases.filter((c) => c.status === 'brief_ready' || c.status === 'in_review').length;
  const pendingReview = cases.filter((c) => c.status === 'in_review').length;
  const slaAlerts = cases.filter((c) => {
    if (!c.turnaround_deadline) return false;
    const deadline = new Date(c.turnaround_deadline);
    const hoursLeft = (deadline.getTime() - Date.now()) / (1000 * 60 * 60);
    return hoursLeft < 12 && hoursLeft > -24 && !['determination_made', 'delivered'].includes(c.status);
  });

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Stats Bar */}
      <div className="border-b border-border bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Cases Today" value={casesToday} icon="📋" />
            <StatCard label="Briefs Ready" value={briefsReady} icon="📄" />
            <StatCard label="Pending Review" value={pendingReview} icon="🔍" />
            <StatCard label="SLA Alerts" value={slaAlerts.length} icon="⏰" alert={slaAlerts.length > 0} />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex gap-4">
          {/* Sidebar */}
          <div className="hidden lg:block w-80 flex-shrink-0 space-y-4">
            {/* Mode Switcher */}
            <div className="bg-surface border border-border rounded-xl p-3">
              <button
                onClick={switchToIntake}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  !reviewCaseId
                    ? 'bg-gold/10 text-gold-dark'
                    : 'text-muted hover:text-foreground hover:bg-background'
                }`}
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  New Case Intake
                </span>
              </button>
            </div>

            {/* SLA Alerts */}
            {slaAlerts.length > 0 && (
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-red-50 border-b border-border">
                  <h3 className="text-xs font-semibold text-red-700 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    SLA Alerts ({slaAlerts.length})
                  </h3>
                </div>
                <div className="divide-y divide-border/50">
                  {slaAlerts.slice(0, 5).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => switchToReview(c.id)}
                      className="w-full text-left px-3 py-2 hover:bg-background transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-foreground">{c.case_number}</span>
                        <StatusBadge status={c.status} />
                      </div>
                      <p className="text-[10px] text-muted mt-0.5 truncate">{c.patient_name}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Case Queue */}
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-navy/5 border-b border-border">
                <h3 className="text-xs font-semibold text-foreground">Recent Cases</h3>
              </div>
              <div className="divide-y divide-border/50 max-h-96 overflow-y-auto">
                {cases.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => switchToReview(c.id)}
                    className={`w-full text-left px-3 py-2 hover:bg-background transition-colors ${
                      reviewCaseId === c.id ? 'bg-gold/5 border-l-2 border-gold' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-foreground">{c.case_number}</span>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="text-[10px] text-muted mt-0.5 truncate">
                      {c.patient_name} • {c.procedure_codes?.join(', ')}
                    </p>
                  </button>
                ))}
                {cases.length === 0 && (
                  <div className="px-3 py-6 text-center text-xs text-muted">
                    No cases yet. Start a new intake above.
                  </div>
                )}
              </div>
            </div>

            {/* Quick Links */}
            <div className="bg-surface border border-border rounded-xl p-3 space-y-1">
              <h3 className="text-xs font-semibold text-muted mb-2">Quick Links</h3>
              <QuickLink href="/cases" label="Case Portal" />
              <QuickLink href="/cases/new" label="Traditional Form" />
              <QuickLink href="/batch" label="Batch Upload" />
              <QuickLink href="/reviewers" label="Reviewers" />
            </div>
          </div>

          {/* Main Chat Area */}
          <div className="flex-1 min-w-0">
            {/* Mode indicator */}
            <div className="mb-3 flex items-center gap-2">
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                mode === 'intake'
                  ? 'bg-gold/10 text-gold-dark border border-gold/20'
                  : 'bg-navy/10 text-navy border border-navy/20'
              }`}>
                {mode === 'intake' ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    New Case Intake
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25M9 16.5v.75m3-3v3M15 12v5.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    Case Review
                  </span>
                )}
              </div>
              {reviewCaseId && (
                <button
                  onClick={switchToIntake}
                  className="text-xs text-muted hover:text-foreground transition-colors"
                >
                  ← Back to intake
                </button>
              )}
            </div>

            <div className="flex gap-4">
              {/* Chat */}
              <div className="flex-1 min-w-0 bg-surface border border-border rounded-2xl overflow-hidden" style={{ height: 'calc(100vh - 14rem)' }}>
                <ChatPanel
                  messages={chat.messages}
                  extractedData={chat.extractedData}
                  isReady={chat.isReady}
                  isStreaming={chat.isStreaming}
                  mode={mode as 'intake' | 'review'}
                  onSend={chat.sendMessage}
                  onSwitchToForm={() => router.push('/cases/new?mode=form')}
                  onSubmit={() => setShowConfirmation(true)}
                />
              </div>

              {/* Extraction Panel (intake mode only) */}
              {mode === 'intake' && (
                <div className="hidden xl:block w-72 flex-shrink-0">
                  <DataExtractionPanel
                    extractedData={chat.extractedData}
                    requiredFieldsStatus={chat.requiredFieldsStatus}
                    completionPercent={chat.completionPercent}
                    isReady={chat.isReady}
                    onSubmit={() => setShowConfirmation(true)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        extractedData={chat.extractedData}
        requiredFieldsStatus={chat.requiredFieldsStatus}
        isOpen={showConfirmation}
        isSubmitting={isSubmitting}
        onConfirm={handleSubmit}
        onCancel={() => setShowConfirmation(false)}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  alert,
}: {
  label: string;
  value: number;
  icon: string;
  alert?: boolean;
}) {
  return (
    <div className={`rounded-xl px-3 py-2 border ${
      alert ? 'border-red-200 bg-red-50' : 'border-border bg-background'
    }`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <div>
          <p className={`text-lg font-bold ${alert ? 'text-red-600' : 'text-foreground'}`}>{value}</p>
          <p className="text-[10px] text-muted">{label}</p>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="block px-3 py-1.5 rounded-lg text-xs text-muted hover:text-foreground hover:bg-background transition-colors"
    >
      {label}
    </a>
  );
}
