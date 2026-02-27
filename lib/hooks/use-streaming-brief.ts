'use client';

import { useState, useCallback, useRef } from 'react';
import type { AIBrief, FactCheckResult } from '@/lib/types';
import type { StreamChunk } from '@/lib/chat/types';

interface UseStreamingBriefReturn {
  sections: Partial<AIBrief>;
  factCheck: FactCheckResult | null;
  isStreaming: boolean;
  progress: number; // 0-100
  currentSection: string | null;
  startStreaming: (caseId: string) => Promise<void>;
  reset: () => void;
}

const SECTION_ORDER = [
  'clinical_question',
  'patient_summary',
  'diagnosis_analysis',
  'procedure_analysis',
  'criteria_match',
  'documentation_review',
  'ai_recommendation',
  'reviewer_action',
];

export function useStreamingBrief(): UseStreamingBriefReturn {
  const [sections, setSections] = useState<Partial<AIBrief>>({});
  const [factCheck, setFactCheck] = useState<FactCheckResult | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentSection, setCurrentSection] = useState<string | null>(null);
  const [completedSections, setCompletedSections] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const startStreaming = useCallback(async (caseId: string) => {
    setIsStreaming(true);
    setSections({});
    setFactCheck(null);
    setCurrentSection(null);
    setCompletedSections(0);

    try {
      abortRef.current = new AbortController();

      const response = await fetch('/api/chat/brief-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_id: caseId }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Brief stream error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const chunk: StreamChunk = JSON.parse(data);

            if (chunk.type === 'brief_section' && chunk.briefSection) {
              setCurrentSection(chunk.briefSection);

              if (chunk.briefSection === 'fact_check') {
                setFactCheck(chunk.briefContent as FactCheckResult);
              } else {
                setSections((prev) => ({
                  ...prev,
                  [chunk.briefSection!]: chunk.briefContent,
                }));
                setCompletedSections((prev) => prev + 1);
              }
            }

            if (chunk.type === 'done') {
              setCurrentSection(null);
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Brief streaming error:', error);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setSections({});
    setFactCheck(null);
    setIsStreaming(false);
    setCurrentSection(null);
    setCompletedSections(0);
  }, []);

  return {
    sections,
    factCheck,
    isStreaming,
    progress: Math.round((completedSections / SECTION_ORDER.length) * 100),
    currentSection,
    startStreaming,
    reset,
  };
}
