import { commonMedicalCodes, getCriteriaForCodes } from '@/lib/medical-criteria';
import { findKnownGuideline } from '@/lib/known-guidelines';
import type { CaseFormData } from '@/lib/types';
import type { ToolResult } from './types';

/**
 * Execute a tool call from Claude and return the result.
 */
export function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>
): ToolResult {
  switch (toolName) {
    case 'extract_case_data':
      return handleExtractCaseData(toolInput);
    case 'lookup_cpt_code':
      return handleLookupCptCode(toolInput);
    case 'lookup_criteria':
      return handleLookupCriteria(toolInput);
    case 'check_guideline':
      return handleCheckGuideline(toolInput);
    default:
      return {
        tool: toolName,
        input: toolInput,
        result: { error: `Unknown tool: ${toolName}` },
        displayText: `Unknown tool: ${toolName}`,
      };
  }
}

// ── Tool Handlers ───────────────────────────────────────────────────────────

function handleExtractCaseData(input: Record<string, unknown>): ToolResult {
  // Filter out null/undefined/empty values
  const cleaned: Partial<CaseFormData> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cleaned as any)[key] = value;
  }

  const fieldCount = Object.keys(cleaned).length;
  const fields = Object.keys(cleaned).join(', ');

  return {
    tool: 'extract_case_data',
    input,
    result: cleaned,
    displayText: fieldCount > 0
      ? `Extracted ${fieldCount} field${fieldCount !== 1 ? 's' : ''}: ${fields}`
      : 'No new data extracted',
  };
}

function handleLookupCptCode(input: Record<string, unknown>): ToolResult {
  const query = String(input.query || '').trim();
  if (!query) {
    return {
      tool: 'lookup_cpt_code',
      input,
      result: [],
      displayText: 'No search query provided',
    };
  }

  const lowerQuery = query.toLowerCase();
  const matches = commonMedicalCodes.filter(
    (code) =>
      code.code.toLowerCase().includes(lowerQuery) ||
      code.description.toLowerCase().includes(lowerQuery) ||
      code.category.toLowerCase().includes(lowerQuery)
  ).slice(0, 10);

  if (matches.length === 0) {
    return {
      tool: 'lookup_cpt_code',
      input,
      result: [],
      displayText: `No codes found matching "${query}"`,
    };
  }

  const display = matches
    .slice(0, 5)
    .map((m) => `${m.code}: ${m.description}`)
    .join('; ');

  return {
    tool: 'lookup_cpt_code',
    input,
    result: matches,
    displayText: `Found ${matches.length} code${matches.length !== 1 ? 's' : ''} — ${display}`,
  };
}

function handleLookupCriteria(input: Record<string, unknown>): ToolResult {
  const code = String(input.code || '').trim().toUpperCase();
  if (!code) {
    return {
      tool: 'lookup_criteria',
      input,
      result: null,
      displayText: 'No code provided',
    };
  }

  const criteria = getCriteriaForCodes([code]);
  const match = criteria[code];

  if (!match) {
    return {
      tool: 'lookup_criteria',
      input,
      result: null,
      displayText: `No detailed criteria found for code ${code}`,
    };
  }

  return {
    tool: 'lookup_criteria',
    input,
    result: match,
    displayText: `Found criteria for ${code}: ${match.name} — ${match.typical_criteria.length} criteria, ${match.common_denial_reasons.length} common denial reasons`,
  };
}

function handleCheckGuideline(input: Record<string, unknown>): ToolResult {
  const guideline = String(input.guideline || '').trim();
  if (!guideline) {
    return {
      tool: 'check_guideline',
      input,
      result: null,
      displayText: 'No guideline reference provided',
    };
  }

  const match = findKnownGuideline(guideline);

  if (!match) {
    return {
      tool: 'check_guideline',
      input,
      result: { recognized: false },
      displayText: `Guideline "${guideline}" not found in the recognized database`,
    };
  }

  return {
    tool: 'check_guideline',
    input,
    result: { recognized: true, ...match },
    displayText: `Verified: ${match.name} by ${match.organization} (${match.category})`,
  };
}
