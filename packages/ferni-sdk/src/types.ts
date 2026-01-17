/**
 * Ferni Developer Platform SDK Types
 * Generated from OpenAPI specification v2.0.0
 */

// =============================================================================
// API KEYS
// =============================================================================

export type ApiKeyType = 'live' | 'test';

export interface ApiKeyInfo {
  id: string;
  keyPrefix: string;
  type: ApiKeyType;
  name?: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface CreateApiKeyRequest {
  type: ApiKeyType;
  name?: string;
}

export interface CreateApiKeyResponse {
  success: boolean;
  key: {
    id: string;
    apiKey: string;
    type: ApiKeyType;
    createdAt: string;
  };
  warning: string;
}

export interface ListApiKeysResponse {
  success: boolean;
  keys: ApiKeyInfo[];
}

export interface RotateApiKeyResponse {
  success: boolean;
  key: {
    id: string;
    apiKey: string;
    createdAt: string;
  };
  warning: string;
}

// =============================================================================
// PERSONAS
// =============================================================================

export type PersonaStatus =
  | 'draft'
  | 'validating'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'published';

export interface PersonaIdentity {
  id: string;
  name: string;
  tagline: string;
  description?: string;
  aliases?: string[];
}

export interface PersonaVoice {
  provider: 'cartesia';
  voice_id: string;
  name?: string;
}

export interface PersonaPersonality {
  /** 0-1 scale: How warm and empathetic the persona is */
  warmth: number;
  /** 0-1 scale: How much humor the persona uses */
  humor_level: number;
  /** 0-1 scale: How direct vs. diplomatic the persona is */
  directness: number;
  /** 0-1 scale: How formal vs. casual the persona is */
  formality: number;
  /** At least 2 personality traits */
  traits: string[];
}

export interface PersonaKnowledge {
  category: string;
  domains: string[];
  expertise_tags?: string[];
}

export interface PersonaBehaviors {
  greetings?: string[];
  backchannels?: string[];
  thinking_sounds?: string[];
}

export interface PersonaManifest {
  identity: PersonaIdentity;
  voice: PersonaVoice;
  personality: PersonaPersonality;
  knowledge: PersonaKnowledge;
  behaviors?: PersonaBehaviors;
}

export interface PersonaSummary {
  id: string;
  name: string;
  tagline: string;
  category: string;
  status: PersonaStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaFull extends PersonaSummary {
  manifest: PersonaManifest;
  validationErrors?: string[];
  rejectionReason?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CreatePersonaRequest {
  manifest: PersonaManifest;
}

export interface CreatePersonaResponse {
  success: boolean;
  persona: PersonaSummary;
  validation: ValidationResult;
}

export interface ListPersonasResponse {
  success: boolean;
  personas: PersonaSummary[];
}

export interface GetPersonaResponse {
  success: boolean;
  persona: PersonaFull;
}

export interface UpdatePersonaResponse {
  success: boolean;
  persona: PersonaSummary;
  validation: ValidationResult;
}

export interface ValidatePersonaResponse {
  success: boolean;
  validation: ValidationResult;
  readyToSubmit: boolean;
}

export interface SubmitPersonaResponse {
  success: boolean;
  message: string;
  persona: PersonaSummary;
}

// =============================================================================
// WEBHOOKS
// =============================================================================

export type WebhookEventType =
  | 'session.started'
  | 'session.ended'
  | 'session.error'
  | 'persona.switched'
  | 'tool.executed'
  | 'transcript.ready';

export interface Webhook {
  id: string;
  publisherId: string;
  personaId?: string;
  name: string;
  url: string;
  events: WebhookEventType[];
  secret: string;
  enabled: boolean;
  failureCount: number;
  createdAt: string;
  lastDeliveredAt?: string;
}

export interface WebhookPayload {
  id: string;
  type: WebhookEventType;
  timestamp: string;
  publisherId: string;
  data: Record<string, unknown>;
}

export interface WebhookDeliveryLog {
  id: string;
  webhookId: string;
  eventId: string;
  eventType: WebhookEventType;
  statusCode: number;
  success: boolean;
  error?: string;
  executionTimeMs: number;
  attempt: number;
  createdAt: string;
}

export interface Pagination {
  limit: number;
  nextCursor?: string;
  hasMore: boolean;
}

export interface CreateWebhookRequest {
  name: string;
  url: string;
  events: WebhookEventType[];
  personaId?: string;
  enabled?: boolean;
}

export interface UpdateWebhookRequest {
  name?: string;
  url?: string;
  events?: WebhookEventType[];
  enabled?: boolean;
}

export interface ListWebhooksResponse {
  success: boolean;
  items: Webhook[];
  pagination: Pagination;
}

export interface WebhookResponse {
  success: boolean;
  data: Webhook;
}

export interface TestWebhookResponse {
  success: boolean;
  data: {
    success: boolean;
    statusCode: number;
    executionTimeMs: number;
    error?: string;
    payload: WebhookPayload;
  };
}

export interface WebhookLogsResponse {
  success: boolean;
  data: {
    items: WebhookDeliveryLog[];
    pagination: Pagination;
  };
}

/**
 * Webhook event handlers type for type-safe event handling
 */
export type WebhookEventHandlers = {
  [K in WebhookEventType]?: (event: WebhookPayload & { type: K }) => void | Promise<void>;
};

// =============================================================================
// ANALYTICS
// =============================================================================

export type AnalyticsPeriod = 'day' | 'week' | 'month' | 'year';

export interface AnalyticsOverview {
  totalApiCalls: number;
  totalApiCallsChange: number;
  activePersonas: number;
  activePersonasChange: number;
  uniqueUsers: number;
  uniqueUsersChange: number;
  errorRate: number;
  errorRateChange: number;
  avgResponseTime: number;
  avgResponseTimeChange: number;
}

export interface UsageDataPoint {
  date: string;
  apiCalls: number;
  uniqueUsers: number;
  errors: number;
}

export interface PersonaUsageStats {
  personaId: string;
  personaName: string;
  totalCalls: number;
  avgSessionDuration: number;
  uniqueUsers: number;
}

export interface ErrorBreakdown {
  code: string;
  message: string;
  count: number;
  lastOccurred: string;
}

export interface AnalyticsOverviewResponse {
  success: boolean;
  period: string;
  overview: AnalyticsOverview;
}

export interface UsageOverTimeResponse {
  success: boolean;
  period: string;
  usage: UsageDataPoint[];
}

export interface PersonaUsageResponse {
  success: boolean;
  period: string;
  personas: PersonaUsageStats[];
}

export interface ErrorBreakdownResponse {
  success: boolean;
  period: string;
  errors: ErrorBreakdown[];
}

// =============================================================================
// MCP SERVERS (v2)
// =============================================================================

export type MCPTransport = 'http' | 'websocket' | 'stdio';
export type MCPServerStatus = 'active' | 'error' | 'disabled';

export interface MCPServer {
  id: string;
  publisherId: string;
  personaId?: string;
  name: string;
  description: string;
  transport: MCPTransport;
  command?: string;
  args?: string[];
  endpoint?: string;
  headers?: Record<string, string>;
  autoConnect: boolean;
  enabled: boolean;
  timeout?: number;
  status: MCPServerStatus;
  toolCount: number;
  lastConnected?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMCPServerRequest {
  name: string;
  description: string;
  transport: MCPTransport;
  command?: string;
  args?: string[];
  endpoint?: string;
  headers?: Record<string, string>;
  secrets?: Record<string, string>;
  autoConnect?: boolean;
  enabled?: boolean;
  timeout?: number;
  personaId?: string;
}

export interface UpdateMCPServerRequest {
  name?: string;
  description?: string;
  transport?: MCPTransport;
  command?: string;
  args?: string[];
  endpoint?: string;
  headers?: Record<string, string>;
  secrets?: Record<string, string>;
  autoConnect?: boolean;
  enabled?: boolean;
  timeout?: number;
}

export interface MCPServerResponse {
  success: boolean;
  data: MCPServer;
}

export interface ListMCPServersResponse {
  success: boolean;
  data: MCPServer[];
  pagination: Pagination;
}

export interface MCPServerTestResponse {
  success: boolean;
  data: {
    success: boolean;
    connected: boolean;
    tools?: string[];
    error?: string;
    latencyMs?: number;
  };
}

export interface MCPServerToolsResponse {
  success: boolean;
  data: {
    tools: string[];
  };
}

// =============================================================================
// CUSTOM TOOLS (v2)
// =============================================================================

export type ToolExecutionType = 'webhook' | 'mcp' | 'prompt';

export interface ToolConfig {
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  serverId?: string;
  toolName?: string;
  prompt?: string;
}

export interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  additionalProperties?: boolean | JSONSchema;
}

export interface CustomTool {
  id: string;
  publisherId: string;
  personaId?: string;
  name: string;
  displayName: string;
  description: string;
  llmDescription: string;
  type: ToolExecutionType;
  config: ToolConfig;
  parameters: JSONSchema;
  returns?: JSONSchema;
  enabled: boolean;
  requiresAuth: boolean;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateToolRequest {
  name: string;
  displayName: string;
  description: string;
  llmDescription: string;
  type: ToolExecutionType;
  config: ToolConfig;
  parameters: JSONSchema;
  returns?: JSONSchema;
  enabled?: boolean;
  requiresAuth?: boolean;
  version?: string;
  personaId?: string;
}

export interface UpdateToolRequest {
  displayName?: string;
  description?: string;
  llmDescription?: string;
  type?: ToolExecutionType;
  config?: ToolConfig;
  parameters?: JSONSchema;
  returns?: JSONSchema;
  enabled?: boolean;
  requiresAuth?: boolean;
  version?: string;
}

export interface ToolResponse {
  success: boolean;
  data: CustomTool;
}

export interface ListToolsResponse {
  success: boolean;
  data: CustomTool[];
  pagination: Pagination;
}

export interface ToolTestResponse {
  success: boolean;
  data: {
    success: boolean;
    result?: unknown;
    error?: string;
    executionTimeMs?: number;
  };
}

// =============================================================================
// ACTIVITIES (v2)
// =============================================================================

export type ActivityStatus = 'started' | 'completed' | 'failed';

export interface Activity {
  id: string;
  publisherId: string;
  personaId?: string;
  userId?: string;
  sessionId?: string;
  type: string;
  name: string;
  data: Record<string, unknown>;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  status: ActivityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateActivityRequest {
  type: string;
  name: string;
  data?: Record<string, unknown>;
  status?: ActivityStatus;
  personaId?: string;
  userId?: string;
  sessionId?: string;
}

export interface UpdateActivityRequest {
  data?: Record<string, unknown>;
  status?: ActivityStatus;
  completedAt?: string;
}

export interface ActivityResponse {
  success: boolean;
  data: Activity;
}

export interface ListActivitiesResponse {
  success: boolean;
  data: Activity[];
  pagination: Pagination;
}

export interface ActivityStatsResponse {
  success: boolean;
  data: {
    totalCount: number;
    byType: Record<string, number>;
    byStatus: Record<ActivityStatus, number>;
    averageDurationMs?: number;
  };
}

// =============================================================================
// WORKFLOWS (v2)
// =============================================================================

export type WorkflowTriggerType = 'voice_command' | 'tool_call' | 'schedule' | 'event' | 'api';
export type WorkflowNodeType =
  | 'start'
  | 'end'
  | 'mcp_call'
  | 'webhook'
  | 'llm_prompt'
  | 'condition'
  | 'parallel'
  | 'join'
  | 'wait'
  | 'set_variable'
  | 'activity'
  | 'sub_workflow';
export type WorkflowExecutionStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface WorkflowTrigger {
  type: WorkflowTriggerType;
  config: {
    command?: string;
    toolName?: string;
    schedule?: string;
    eventType?: string;
  };
}

export interface WorkflowNode {
  id: string;
  name: string;
  type: WorkflowNodeType;
  config: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  condition?: string;
}

export interface WorkflowRetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
}

export interface Workflow {
  id: string;
  publisherId: string;
  personaId?: string;
  name: string;
  description: string;
  version: string;
  trigger: WorkflowTrigger;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  entryNodeId: string;
  exitNodeIds: string[];
  enabled: boolean;
  timeout?: number;
  retryPolicy?: WorkflowRetryPolicy;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  publisherId: string;
  userId?: string;
  sessionId?: string;
  triggeredBy: 'voice' | 'api' | 'schedule' | 'event';
  status: WorkflowExecutionStatus;
  currentNodeIds: string[];
  completedNodeIds: string[];
  variables: Record<string, unknown>;
  result?: unknown;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export interface CreateWorkflowRequest {
  name: string;
  description: string;
  version?: string;
  trigger: WorkflowTrigger;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  entryNodeId: string;
  exitNodeIds?: string[];
  enabled?: boolean;
  timeout?: number;
  retryPolicy?: WorkflowRetryPolicy;
  personaId?: string;
}

export interface UpdateWorkflowRequest {
  name?: string;
  description?: string;
  version?: string;
  trigger?: WorkflowTrigger;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  entryNodeId?: string;
  exitNodeIds?: string[];
  enabled?: boolean;
  timeout?: number;
  retryPolicy?: WorkflowRetryPolicy;
}

export interface WorkflowResponse {
  success: boolean;
  data: Workflow;
}

export interface ListWorkflowsResponse {
  success: boolean;
  data: Workflow[];
  pagination: Pagination;
}

export interface WorkflowExecuteResponse {
  success: boolean;
  data: WorkflowExecution;
}

export interface ListWorkflowExecutionsResponse {
  success: boolean;
  data: WorkflowExecution[];
  pagination: Pagination;
}

// =============================================================================
// OAUTH (v2)
// =============================================================================

export interface OAuthProvider {
  id: string;
  publisherId: string;
  name: string;
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  scopes: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OAuthToken {
  id: string;
  publisherId: string;
  providerId: string;
  userId?: string;
  expiresAt?: string;
  scopes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateOAuthProviderRequest {
  name: string;
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  enabled?: boolean;
}

export interface UpdateOAuthProviderRequest {
  name?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string[];
  enabled?: boolean;
}

export interface OAuthProviderResponse {
  success: boolean;
  data: OAuthProvider;
}

export interface ListOAuthProvidersResponse {
  success: boolean;
  data: OAuthProvider[];
  pagination: Pagination;
}

export interface OAuthAuthorizeResponse {
  success: boolean;
  data: {
    authorizationUrl: string;
    state: string;
  };
}

export interface OAuthTokenResponse {
  success: boolean;
  data: OAuthToken;
}

export interface ListOAuthTokensResponse {
  success: boolean;
  data: OAuthToken[];
  pagination: Pagination;
}

export interface OAuthAccessTokenResponse {
  success: boolean;
  data: {
    accessToken: string;
    expiresAt?: string;
  };
}

// =============================================================================
// ERRORS
// =============================================================================

export interface FerniError {
  success: false;
  error: string;
  code?: string;
}

export class FerniApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'FerniApiError';
  }
}

// =============================================================================
// SDK CONFIG
// =============================================================================

export interface FerniConfig {
  /** API key (ferni_live_xxx or ferni_test_xxx) */
  apiKey: string;
  /** Base URL (defaults to https://api.ferni.ai) */
  baseUrl?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Custom fetch implementation */
  fetch?: typeof fetch;
}
