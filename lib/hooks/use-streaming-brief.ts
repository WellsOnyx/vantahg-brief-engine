'use client';

import { useState, useCallback, useRef } from 'react';
import type { AIBrief, FactCheckResult } from '@/lib/types';
import type { StreamChunk } from '@/lib/chat/types';

export interface RefinementEvent {
  passNumber: number;
  message: string;
  issues?: string[];
  sectionsRevised?: string[];
  scoreBefore?: number;
  scoreAfter?: number;
}

interface UseStreamingBriefReturn {
  sections: Partial<AIBrief>;
  factCheck: FactCheckResult | null;
  isStreaming: boolean;
  progress: number; // 0-100
  currentSection: string | null;
  currentPass: number | null;
  refinementLog: RefinementEvent[];
  generationMetadata: AIBrief['generation_metadata'] | null;
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
  const [currentPass, setCurrentPass] = useState<number | null>(null);
  const [refinementLog, setRefinementLog] = useState<RefinementEvent[]>([]);
  const [generationMetadata, setGenerationMetadata] = useState<AIBrief['generation_metadata'] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startStreaming = useCallback(async (caseId: string) => {
    setIsStreaming(true);
    setSections({});
    setFactCheck(null);
    setCurrentSection(null);
    setCompletedSections(0);
    setCurrentPass(null);
    setRefinementLog([]);
    setGenerationMetadata(null);

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

            if (chunk.type === 'brief_pass') {
              setCurrentPass(chunk.passNumber ?? null);
              if (chunk.passNumber && chunk.message) {
                setRefinementLog((prev) => [
                  ...prev,
                  {
                    passNumber: chunk.passNumber!,
                    message: chunk.message!,
                  },
                ]);
              }
            }

            if (chunk.type === 'refinement_update' && chunk.message) {
              const evt: RefinementEvent = {
                passNumber: chunk.passNumber || 1,
                message: chunk.message,
                issues: chunk.issues,
                sectionsRevised: chunk.sectionsRevised,
                scoreBefore: chunk.scoreBefore,
                scoreAfter: chunk.scoreAfter,
              };
              setRefinementLog((prev) => [...prev, evt]);
            }

            if (chunk.type === 'brief_section' && chunk.briefSection) {
              setCurrentSection(chunk.briefSection);

              if (chunk.briefSection === 'fact_check') {
                setFactCheck(chunk.briefContent as FactCheckResult);
              } else if (chunk.briefSection === 'generation_metadata') {
                setGenerationMetadata(chunk.briefContent as AIBrief['generation_metadata']);
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
              // If we received metadata via the final event, ensure it is captured
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
    setCurrentPass(null);
    setRefinementLog([]);
    setGenerationMetadata(null);
  }, []);

  return {
    sections,
    factCheck,
    isStreaming,
    progress: Math.round((completedSections / SECTION_ORDER.length) * 100),
    currentSection,
    currentPass,
    refinementLog,
    generationMetadata,
    startStreaming,
    reset,
  };
}
