'use client';

import { useState, useCallback, useRef } from 'react';
import type { CaseFormData } from '@/lib/types';
import type { ChatMessage, ChatMode, StreamChunk, RequiredFieldStatus } from '@/lib/chat/types';
import {
  mergeExtraction,
  getRequiredFieldsStatus,
  isReadyForSubmission,
  getCompletionPercent,
} from '@/lib/chat/extraction-engine';

interface UseChatOptions {
  mode: ChatMode;
  caseId?: string;
  onExtraction?: (data: Partial<CaseFormData>) => void;
}

interface UseChatReturn {
  messages: ChatMessage[];
  extractedData: Partial<CaseFormData>;
  requiredFieldsStatus: RequiredFieldStatus[];
  completionPercent: number;
  isStreaming: boolean;
  isReady: boolean;
  sendMessage: (content: string) => Promise<void>;
  resetChat: () => void;
  submitCase: () => Promise<string | null>;
  updateExtraction: (data: Partial<CaseFormData>) => void;
}

export function useChat(options: UseChatOptions): UseChatReturn {
  const { mode, caseId, onExtraction } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [extractedData, setExtractedData] = useState<Partial<CaseFormData>>({});
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming || !content.trim()) return;

      // Add user message
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        isStreaming: true,
        toolResults: [],
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);

      // Build the message history for the API
      const apiMessages = [...messages, userMessage].map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      try {
        abortRef.current = new AbortController();

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiMessages,
            mode,
            caseId,
            extractedData,
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`Chat API error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process SSE lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data) continue;

            try {
              const chunk: StreamChunk = JSON.parse(data);

              switch (chunk.type) {
                case 'text':
                  if (chunk.content) {
                    setMessages((prev) => {
                      const updated = [...prev];
                      const last = updated[updated.length - 1];
                      if (last && last.role === 'assistant') {
                        updated[updated.length - 1] = {
                          ...last,
                          content: last.content + chunk.content,
                        };
                      }
                      return updated;
                    });
                  }
                  break;

                case 'extraction':
                  if (chunk.extraction) {
                    setExtractedData((prev) => {
                      const merged = mergeExtraction(prev, chunk.extraction!);
                      onExtraction?.(merged);
                      return merged;
                    });
                  }
                  break;

                case 'tool_result':
                  if (chunk.toolResult) {
                    setMessages((prev) => {
                      const updated = [...prev];
                      const last = updated[updated.length - 1];
                      if (last && last.role === 'assistant') {
                        updated[updated.length - 1] = {
                          ...last,
                          toolResults: [...(last.toolResults || []), chunk.toolResult!],
                        };
                      }
                      return updated;
                    });
                  }
                  break;

                case 'error':
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last && last.role === 'assistant') {
                      updated[updated.length - 1] = {
                        ...last,
                        content: last.content || 'Sorry, I encountered an error. Please try again.',
                        isStreaming: false,
                      };
                    }
                    return updated;
                  });
                  break;

                case 'done':
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last && last.role === 'assistant') {
                      updated[updated.length - 1] = { ...last, isStreaming: false };
                    }
                    return updated;
                  });
                  break;
              }
            } catch {
              // Skip malformed chunks
            }
          }
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                content: 'I\'m sorry, I couldn\'t connect to the AI service. Please try again.',
                isStreaming: false,
              };
            }
            return updated;
          });
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, mode, caseId, extractedData, isStreaming, onExtraction]
  );

  const resetChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setExtractedData({});
    setIsStreaming(false);
  }, []);

  const submitCase = useCallback(async (): Promise<string | null> => {
    if (!isReadyForSubmission(extractedData)) return null;

    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...extractedData,
          // Set a default client_id for demo
          client_id: extractedData.client_id || 'demo-client-001',
          vertical: 'medical',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create case');
      }

      const data = await response.json();
      return data.id || data.case_number || null;
    } catch (error) {
      console.error('Submit case error:', error);
      return null;
    }
  }, [extractedData]);

  const updateExtraction = useCallback(
    (data: Partial<CaseFormData>) => {
      setExtractedData((prev) => {
        const merged = mergeExtraction(prev, data);
        onExtraction?.(merged);
        return merged;
      });
    },
    [onExtraction]
  );

  return {
    messages,
    extractedData,
    requiredFieldsStatus: getRequiredFieldsStatus(extractedData),
    completionPercent: getCompletionPercent(extractedData),
    isStreaming,
    isReady: isReadyForSubmission(extractedData),
    sendMessage,
    resetChat,
    submitCase,
    updateExtraction,
  };
}
