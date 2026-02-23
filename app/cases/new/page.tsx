'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CaseForm } from '@/components/CaseForm';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { DataExtractionPanel } from '@/components/chat/DataExtractionPanel';
import { ConfirmationDialog } from '@/components/chat/ConfirmationDialog';
import { useChat } from '@/lib/hooks/use-chat';
import type { Client, CaseFormData } from '@/lib/types';

export default function NewCasePage() {
  return (
    <Suspense fallback={
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="skeleton skeleton-heading w-48 mb-4" />
        <div className="skeleton skeleton-text w-full" />
      </div>
    }>
      <NewCaseContent />
    </Suspense>
  );
}

function NewCaseContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get('mode') === 'form' ? 'form' : 'chat';

  const [intakeMode, setIntakeMode] = useState<'chat' | 'form'>(initialMode);
  const [clients, setClients] = useState<Client[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const chat = useChat({ mode: 'intake' });

  useEffect(() => {
    fetch('/api/clients')
      .then((res) => res.json())
      .then(setClients)
      .catch(() => setClients([]));
  }, []);

  async function handleFormSubmit(data: CaseFormData) {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create case');
      }
      const newCase = await res.json();
      router.push(`/cases/${newCase.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create case');
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleChatSubmit = useCallback(async () => {
    setIsSubmitting(true);
    const caseId = await chat.submitCase();
    setIsSubmitting(false);
    setShowConfirmation(false);

    if (caseId) {
      router.push(`/cases/${caseId}`);
    } else {
      setError('Failed to create case. Please check all required fields.');
    }
  }, [chat, router]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl text-navy">
              New Case Intake
            </h1>
            <p className="text-muted mt-1">Submit a new case for AI-powered clinical brief generation</p>
          </div>

          {/* Mode toggle */}
          <div className="flex items-center bg-background border border-border rounded-xl p-1">
            <button
              onClick={() => setIntakeMode('chat')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                intakeMode === 'chat'
                  ? 'bg-gold text-navy shadow-sm'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              AI Chat
            </button>
            <button
              onClick={() => setIntakeMode('form')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                intakeMode === 'form'
                  ? 'bg-navy text-white shadow-sm'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
              </svg>
              Form
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
          {error}
        </div>
      )}

      {intakeMode === 'chat' ? (
        <div className="flex gap-4">
          {/* Chat panel */}
          <div className="flex-1 min-w-0 bg-surface border border-border rounded-2xl overflow-hidden" style={{ height: 'calc(100vh - 16rem)' }}>
            <ChatPanel
              messages={chat.messages}
              extractedData={chat.extractedData}
              isReady={chat.isReady}
              isStreaming={chat.isStreaming}
              mode="intake"
              onSend={chat.sendMessage}
              onSwitchToForm={() => setIntakeMode('form')}
              onSubmit={() => setShowConfirmation(true)}
            />
          </div>

          {/* Extraction panel */}
          <div className="hidden lg:block w-72 flex-shrink-0">
            <DataExtractionPanel
              extractedData={chat.extractedData}
              requiredFieldsStatus={chat.requiredFieldsStatus}
              completionPercent={chat.completionPercent}
              isReady={chat.isReady}
              onSubmit={() => setShowConfirmation(true)}
            />
          </div>

          {/* Confirmation dialog */}
          <ConfirmationDialog
            extractedData={chat.extractedData}
            requiredFieldsStatus={chat.requiredFieldsStatus}
            isOpen={showConfirmation}
            isSubmitting={isSubmitting}
            onConfirm={handleChatSubmit}
            onCancel={() => setShowConfirmation(false)}
          />
        </div>
      ) : (
        <div className="max-w-4xl">
          <div className="bg-surface rounded-lg border border-border shadow-sm p-6">
            <CaseForm clients={clients} onSubmit={handleFormSubmit} isSubmitting={isSubmitting} />
          </div>
        </div>
      )}
    </div>
  );
}
