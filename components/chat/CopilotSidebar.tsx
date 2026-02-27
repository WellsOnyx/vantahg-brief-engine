'use client';

import { useState } from 'react';
import { ChatPanel } from './ChatPanel';
import { useChat } from '@/lib/hooks/use-chat';
import type { Case } from '@/lib/types';

interface Props {
  caseData: Case;
}

export function CopilotSidebar({ caseData }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const chat = useChat({
    mode: 'review',
    caseId: caseData.id,
  });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed right-4 bottom-4 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all duration-300 ${
          isOpen
            ? 'bg-navy text-white hover:bg-navy-dark'
            : 'bg-gold text-navy hover:bg-gold-dark shadow-gold/20'
        }`}
      >
        {isOpen ? (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="text-sm font-medium">Close</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            <span className="text-sm font-semibold">Ask VantaHG</span>
          </>
        )}
      </button>

      {/* Sidebar panel */}
      <div
        className={`fixed right-0 top-16 bottom-0 w-full sm:w-[420px] bg-background border-l border-border shadow-2xl z-30 transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-navy/5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gold-gradient flex items-center justify-center">
              <span className="text-navy text-[10px] font-bold">V</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Case Copilot</h3>
              <p className="text-[10px] text-muted">{caseData.case_number}</p>
            </div>
          </div>
        </div>

        {/* Chat panel */}
        <div className="h-[calc(100%-52px)]">
          <ChatPanel
            messages={chat.messages}
            extractedData={chat.extractedData}
            isReady={false}
            isStreaming={chat.isStreaming}
            mode="review"
            onSend={chat.sendMessage}
            placeholder={`Ask about case ${caseData.case_number}...`}
          />
        </div>
      </div>

      {/* Backdrop on mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-navy/20 z-20 sm:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
