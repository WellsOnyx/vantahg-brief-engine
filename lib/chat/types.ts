import type { CaseFormData } from '@/lib/types';

// ── Chat Core Types ─────────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant';
export type ChatMode = 'intake' | 'review' | 'general';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  /** Structured data extracted from this message (intake mode) */
  extractions?: Partial<CaseFormData>;
  /** Tool results surfaced to the user (code lookups, guideline checks) */
  toolResults?: ToolResult[];
  /** Whether the message is still being streamed */
  isStreaming?: boolean;
}

export interface ToolResult {
  tool: string;
  input: Record<string, unknown>;
  result: unknown;
  /** Human-readable summary to display inline */
  displayText?: string;
}

// ── Streaming Types ─────────────────────────────────────────────────────────

export type StreamChunkType =
  | 'text'
  | 'extraction'
  | 'tool_use'
  | 'tool_result'
  | 'brief_section'
  | 'error'
  | 'done';

export interface StreamChunk {
  type: StreamChunkType;
  content?: string;
  extraction?: Partial<CaseFormData>;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: ToolResult;
  briefSection?: string;
  briefContent?: unknown;
  error?: string;
}

// ── Extraction State ────────────────────────────────────────────────────────

export interface RequiredFieldStatus {
  field: string;
  label: string;
  filled: boolean;
}

export interface ExtractionState {
  data: Partial<CaseFormData>;
  requiredFields: RequiredFieldStatus[];
  completionPercent: number;
  ready: boolean;
}

// ── Chat API Request/Response ───────────────────────────────────────────────

export interface ChatRequest {
  messages: { role: ChatRole; content: string }[];
  mode: ChatMode;
  caseId?: string;
  extractedData?: Partial<CaseFormData>;
}
