'use client';

import type { ChatMessage as ChatMessageType } from '@/lib/chat/types';

interface Props {
  message: ChatMessageType;
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex gap-3 animate-slide-up ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        {isUser ? (
          <div className="w-8 h-8 rounded-full bg-navy-light flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-gold-gradient flex items-center justify-center">
            <span className="text-navy text-xs font-bold">V</span>
          </div>
        )}
      </div>

      {/* Message bubble */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-navy text-white rounded-tr-sm'
            : 'bg-surface border border-border text-foreground rounded-tl-sm shadow-sm'
        }`}
      >
        {/* Message content with basic markdown rendering */}
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          <MessageContent content={message.content} />
          {message.isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-gold ml-0.5 animate-pulse-soft" />
          )}
        </div>

        {/* Tool results */}
        {message.toolResults && message.toolResults.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {message.toolResults.map((tr, i) => (
              <div
                key={i}
                className={`text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 ${
                  isUser
                    ? 'bg-white/10 text-white/80'
                    : 'bg-gold/10 text-gold-dark'
                }`}
              >
                <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
                {tr.displayText || tr.tool}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Simple markdown-like rendering for chat messages.
 * Handles **bold**, `code`, and bullet lists.
 */
function MessageContent({ content }: { content: string }) {
  if (!content) return null;

  const parts = content.split(/(\*\*[^*]+\*\*|`[^`]+`|\n)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code
              key={i}
              className="px-1 py-0.5 rounded bg-navy/10 text-navy text-xs font-mono"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part === '\n') {
          return <br key={i} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
