/**
 * Gravity Rail API Client
 * Typed wrapper around https://api.gravityrail.com/api/v2
 *
 * Auth: Bearer API key in Authorization header
 * Base: https://api.gravityrail.com/api/v2
 *
 * Drop-in ready to swap for @gravity-rail/client once it ships on npm.
 */

const GR_BASE_URL = 'https://api.gravityrail.com/api/v2';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GRWorkspace {
  id: string;           // UUID
  name: string;
  slug: string;
  createdAt: string;
}

export type GRChatChannel =
  | 'web-chat'
  | 'phone-sms'
  | 'phone-voice'
  | 'email'
  | 'slack'
  | 'discord';

export interface GRChat {
  id: number;
  title?: string;
  channel: GRChatChannel;
  workflowId?: number;
  assignmentId?: number;
  paused: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GRMessage {
  id: number;
  chatId: number;
  content: string;
  role: 'user' | 'assistant' | 'system';
  createdAt: string;
}

export interface GRWorkflow {
  id: number;
  name: string;
  slug: string;
  assistantId?: number;
  createdAt: string;
}

export interface GRMember {
  id: number;
  email: string;
  name?: string;
  role: string;
  createdAt: string;
}

export interface GRDataType {
  id: number;
  name: string;
  slug: string;
  fields: GRDataField[];
  createdAt: string;
}

export interface GRDataField {
  name: string;
  slug: string;
  fieldType: 'text' | 'email' | 'number' | 'boolean' | 'date' | 'select' | 'url';
  required?: boolean;
  shouldIndex?: boolean;
}

export interface GRRecord {
  id: number;
  dataTypeId: number;
  memberId?: number;
  externalId?: string;
  fieldValues: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface GRCustomToolkit {
  id: number;
  name: string;
  slug: string;
  description?: string;
  enabled: boolean;
  createdAt: string;
}

export interface GRCustomTool {
  id: number;
  toolkitId: number;
  name: string;
  displayName: string;
  description?: string;
  prompt?: string;
  chatModel?: string;
  inputSchema?: Record<string, unknown>;
  createdAt: string;
}

export interface GRPaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GRError {
  error: string;
  code?: string;
  status: number;
}

export interface CreateChatParams {
  channel?: GRChatChannel;
  workflowId?: number;
  title?: string;
  assistantEnabled?: boolean;
}

export interface SendMessageParams {
  content: string;
}

export interface SendAssistantMessageParams {
  message: string;
}

export interface CreateDataTypeParams {
  name: string;
  slug: string;
  fields: GRDataField[];
}

export interface CreateRecordParams {
  fieldValues: Record<string, unknown>;
  memberId?: number;
  externalId?: string;
}

export interface UpsertRecordParams {
  fieldValues: Record<string, unknown>;
}

export interface BulkCreateRecordsParams {
  records: Array<{ fieldValues: Record<string, unknown>; externalId?: string }>;
  upsert?: boolean;
}

export interface CreateWorkflowParams {
  name: string;
  slug: string;
  assistantId?: number;
  defaultPhoneNumberId?: number;
}

export interface CreateCustomToolkitParams {
  name: string;
  slug: string;
  description?: string;
}

export interface CreateCustomToolParams {
  name: string;
  displayName: string;
  description?: string;
  prompt?: string;
  chatModel?: string;
  inputSchema?: Record<string, unknown>;
}

// ── Client ────────────────────────────────────────────────────────────────────

export class GravityRailClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl = GR_BASE_URL) {
    if (!apiKey) throw new Error('GravityRailClient: apiKey is required');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let data: unknown;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      const err = data as GRError;
      throw new GravityRailError(
        err?.error ?? `Request failed: ${res.status}`,
        err?.code,
        res.status,
      );
    }

    return data as T;
  }

  // ── Workspaces ──────────────────────────────────────────────────────────────

  listWorkspaces(): Promise<GRPaginatedResponse<GRWorkspace>> {
    return this.request('GET', '/w');
  }

  getWorkspace(wid: string): Promise<GRWorkspace> {
    return this.request('GET', `/w/${wid}`);
  }

  // ── Chats ───────────────────────────────────────────────────────────────────

  listChats(wid: string, page = 1, pageSize = 50): Promise<GRPaginatedResponse<GRChat>> {
    return this.request('GET', `/w/${wid}/chats?page=${page}&pageSize=${pageSize}`);
  }

  getChat(wid: string, chatId: number): Promise<GRChat> {
    return this.request('GET', `/w/${wid}/chats/${chatId}`);
  }

  createChat(wid: string, params: CreateChatParams = {}): Promise<GRChat> {
    return this.request('POST', `/w/${wid}/chats`, {
      channel: 'web-chat',
      assistantEnabled: true,
      ...params,
    });
  }

  updateChat(wid: string, chatId: number, params: Partial<GRChat>): Promise<GRChat> {
    return this.request('PUT', `/w/${wid}/chats/${chatId}`, params);
  }

  getMessages(wid: string, chatId: number): Promise<GRPaginatedResponse<GRMessage>> {
    return this.request('GET', `/w/${wid}/chats/${chatId}/messages`);
  }

  sendMessage(wid: string, chatId: number, params: SendMessageParams): Promise<GRMessage> {
    return this.request('POST', `/w/${wid}/chats/${chatId}/messages`, params);
  }

  sendAssistantMessage(
    wid: string,
    chatId: number,
    params: SendAssistantMessageParams,
  ): Promise<GRMessage> {
    return this.request('POST', `/w/${wid}/chats/${chatId}/send-assistant-message`, params);
  }

  // ── Workflows ───────────────────────────────────────────────────────────────

  listWorkflows(wid: string): Promise<GRPaginatedResponse<GRWorkflow>> {
    return this.request('GET', `/w/${wid}/workflows`);
  }

  createWorkflow(wid: string, params: CreateWorkflowParams): Promise<GRWorkflow> {
    return this.request('POST', `/w/${wid}/workflows`, params);
  }

  updateWorkflow(wid: string, workflowId: number, params: Partial<GRWorkflow>): Promise<GRWorkflow> {
    return this.request('PUT', `/w/${wid}/workflows/${workflowId}`, params);
  }

  // ── Members ─────────────────────────────────────────────────────────────────

  listMembers(wid: string): Promise<GRPaginatedResponse<GRMember>> {
    return this.request('GET', `/w/${wid}/members`);
  }

  getMember(wid: string, memberId: number): Promise<GRMember> {
    return this.request('GET', `/w/${wid}/members/${memberId}`);
  }

  // ── Data Types (CRM) ────────────────────────────────────────────────────────

  listDataTypes(wid: string): Promise<GRPaginatedResponse<GRDataType>> {
    return this.request('GET', `/w/${wid}/data-types`);
  }

  createDataType(wid: string, params: CreateDataTypeParams): Promise<GRDataType> {
    return this.request('POST', `/w/${wid}/data-types`, params);
  }

  listRecords(
    wid: string,
    dataTypeId: number,
    opts: { search?: string; page?: number; pageSize?: number } = {},
  ): Promise<GRPaginatedResponse<GRRecord>> {
    const q = new URLSearchParams();
    if (opts.search) q.set('search', opts.search);
    if (opts.page) q.set('page', String(opts.page));
    if (opts.pageSize) q.set('page_size', String(opts.pageSize));
    const qs = q.toString() ? `?${q}` : '';
    return this.request('GET', `/w/${wid}/data-types/${dataTypeId}/records${qs}`);
  }

  createRecord(wid: string, dataTypeId: number, params: CreateRecordParams): Promise<GRRecord> {
    return this.request('POST', `/w/${wid}/data-types/${dataTypeId}/records`, params);
  }

  updateRecord(
    wid: string,
    dataTypeId: number,
    recordId: number,
    params: Partial<CreateRecordParams>,
  ): Promise<GRRecord> {
    return this.request('PUT', `/w/${wid}/data-types/${dataTypeId}/records/${recordId}`, params);
  }

  deleteRecord(wid: string, dataTypeId: number, recordId: number): Promise<void> {
    return this.request('DELETE', `/w/${wid}/data-types/${dataTypeId}/records/${recordId}`);
  }

  upsertRecord(
    wid: string,
    dataTypeId: number,
    externalId: string,
    params: UpsertRecordParams,
  ): Promise<GRRecord> {
    return this.request('POST', `/w/${wid}/data-types/${dataTypeId}/upsert/${externalId}`, params);
  }

  bulkCreateRecords(
    wid: string,
    dataTypeId: number,
    params: BulkCreateRecordsParams,
  ): Promise<{ success: boolean; totalCount: number; importedCount: number; results: unknown[]; errors: unknown }> {
    return this.request('POST', `/w/${wid}/data-types/${dataTypeId}/records/bulk`, params);
  }

  // ── Custom Toolkits ─────────────────────────────────────────────────────────

  listToolkits(wid: string): Promise<GRPaginatedResponse<GRCustomToolkit>> {
    return this.request('GET', `/w/${wid}/custom-toolkits`);
  }

  createToolkit(wid: string, params: CreateCustomToolkitParams): Promise<GRCustomToolkit> {
    return this.request('POST', `/w/${wid}/custom-toolkits`, params);
  }

  enableToolkit(wid: string, toolkitId: number): Promise<void> {
    return this.request('POST', `/w/${wid}/custom-toolkits/${toolkitId}/enable`);
  }

  disableToolkit(wid: string, toolkitId: number): Promise<void> {
    return this.request('POST', `/w/${wid}/custom-toolkits/${toolkitId}/disable`);
  }

  listTools(wid: string, toolkitId: number): Promise<GRPaginatedResponse<GRCustomTool>> {
    return this.request('GET', `/w/${wid}/custom-toolkits/${toolkitId}/tools`);
  }

  createTool(wid: string, toolkitId: number, params: CreateCustomToolParams): Promise<GRCustomTool> {
    return this.request('POST', `/w/${wid}/custom-toolkits/${toolkitId}/tools`, params);
  }

  updateTool(
    wid: string,
    toolkitId: number,
    toolId: number,
    params: Partial<CreateCustomToolParams>,
  ): Promise<GRCustomTool> {
    return this.request('PUT', `/w/${wid}/custom-toolkits/${toolkitId}/tools/${toolId}`, params);
  }

  deleteTool(wid: string, toolkitId: number, toolId: number): Promise<void> {
    return this.request('DELETE', `/w/${wid}/custom-toolkits/${toolkitId}/tools/${toolId}`);
  }
}

// ── Error class ───────────────────────────────────────────────────────────────

export class GravityRailError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'GravityRailError';
  }
}

// ── Singleton factory ─────────────────────────────────────────────────────────

let _client: GravityRailClient | null = null;

/**
 * Returns a singleton GravityRailClient using the GRAVITY_RAIL_API_KEY env var.
 * Safe to call server-side only — the API key is never exposed to the browser.
 */
export function getGravityRailClient(): GravityRailClient {
  if (!_client) {
    const apiKey = process.env.GRAVITY_RAIL_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GRAVITY_RAIL_API_KEY is not set. Add it to .env.local — see .env.local.example.',
      );
    }
    _client = new GravityRailClient(apiKey);
  }
  return _client;
}
