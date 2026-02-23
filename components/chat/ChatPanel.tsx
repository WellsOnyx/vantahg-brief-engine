'use client';

import { useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { QuickActions } from './QuickActions';
import type { ChatMessage as ChatMessageType } from '@/lib/chat/types';
import type { CaseFormData } from '@/lib/types';

interface Props {
  messages: ChatMessageType[];
  extractedData: Partial<CaseFormData>;
  isReady: boolean;
  isStreaming: boolean;
  mode: 'intake' | 'review';
  onSend: (message: string) => void;
  onSwitchToForm?: () => void;
  onSubmit?: () => void;
  placeholder?: string;
}

export function ChatPanel({
  messages,
  extractedData,
  isReady,
  isStreaming,
  mode,
  onSend,
  onSwitchToForm,
  onSubmit,
  placeholder,
}: Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const defaultPlaceholder = mode === 'intake'
    ? 'Tell me about this case...'
    : 'Ask about this case...';

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin"
      >
        {messages.length === 0 && <WelcomeMessage mode={mode} />}

        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-border/50 bg-background/50 backdrop-blur-sm">
        <QuickActions
          mode={mode}
          extractedData={extractedData}
          isReady={isReady}
          isStreaming={isStreaming}
          onAction={onSend}
          onSwitchToForm={onSwitchToForm}
          onSubmit={onSubmit}
        />
        <ChatInput
          onSend={onSend}
          disabled={isStreaming}
          placeholder={placeholder || defaultPlaceholder}
        />
      </div>
    </div>
  );
}

function WelcomeMessage({ mode }: { mode: 'intake' | 'review' }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4 animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-gold-gradient flex items-center justify-center mb-4 shadow-lg shadow-gold/20">
        <svg className="w-7 h-7 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
        </svg>
      </div>

      {mode === 'intake' ? (
        <>
          <h3 className="text-lg font-semibold text-foreground mb-2 font-[family-name:var(--font-dm-serif)]">
            Submit a New Case
          </h3>
          <p className="text-sm text-muted max-w-md leading-relaxed">
            Describe the case you want to submit — the procedure, patient info, and any clinical context.
            I&apos;ll organize everything and find the right CPT/HCPCS codes automatically.
          </p>
        </>
      ) : (
        <>
          <h3 className="text-lg font-semibold text-foreground mb-2 font-[family-name:var(--font-dm-serif)]">
            Case Review Assistant
          </h3>
          <p className="text-sm text-muted max-w-md leading-relaxed">
            Ask me anything about this case — criteria analysis, guideline references,
            missing documentation, or determination recommendations.
          </p>
        </>
      )}
    </div>
  );
}
