/**
 * Developer Platform API v2 - Shared Types
 *
 * Central type definitions for all developer platform APIs:
 * - MCP Server registration
 * - Custom tool registration
 * - Webhook events
 * - Activity tracking
 * - Workflow definitions
 * - OAuth integration
 *
 * ARCHITECTURE NOTE:
 * Core types that need to be accessed by lower layers (memory, services, tools)
 * are defined in types/developer-platform.ts and re-exported here.
 * This ensures proper layer dependency direction.
 *
 * @module api/v2/developers/shared/types
 */

// Re-export core types from the shared types module (level 10)
// These can be imported by ANY layer without violating architecture
export {
  // MCP types
  type MCPTransport,
  type MCPServerStatus,
  type BaseEntity,
  type DeveloperMCPServer,
  // Webhook types
  type WebhookEventType,
  type WebhookDeliveryStatus,
  type WebhookRetryPolicy,
  type DeveloperWebhook,
  type WebhookPayload,
  type WebhookDeliveryLog,
  // Collections
  COLLECTIONS,
  ID_PREFIXES,
} from '../../../../types/developer-platform.js';

// Also import for local use within this file
import type {
  MCPTransport,
  BaseEntity,
  WebhookEventType,
  WebhookRetryPolicy,
} from '../../../../types/developer-platform.js';

// JSON Schema type (simplified from json-schema package)
// Using inline type to avoid dependency issues
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
  oneOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
  $ref?: string;
  $defs?: Record<string, JSONSchema>;
}

// ============================================================================
// COMMON TYPES
// ============================================================================

/** Standard API response wrapper */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

/** Pagination parameters */
export interface PaginationParams {
  page?: number;
  limit?: number;
  cursor?: string;
}

// ============================================================================
// MCP SERVER INPUT/OUTPUT TYPES (API-specific)
// ============================================================================
// Note: Core types (BaseEntity, MCPTransport, MCPServerStatus, DeveloperMCPServer)
// are re-exported from types/developer-platform.ts at the top of this file.

/** Input for creating an MCP server */
export interface CreateMCPServerInput {
  personaId?: string;
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
}

/** Input for updating an MCP server */
export interface UpdateMCPServerInput {
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

/** MCP server test result */
export interface MCPServerTestResult {
  success: boolean;
  connected: boolean;
  tools?: string[];
  error?: string;
  latencyMs?: number;
}

// ============================================================================
// CUSTOM TOOL TYPES (Phase 2)
// ============================================================================

/** Tool execution type */
export type ToolExecutionType = 'webhook' | 'mcp' | 'prompt';

/** Developer-registered custom tool */
export interface DeveloperTool extends BaseEntity {
  personaId?: string;

  // Tool definition
  name: string; // kebab-case
  displayName: string;
  description: string;
  llmDescription: string; // For LLM context

  // Execution
  type: ToolExecutionType;
  config: ToolConfig;

  // Schema
  parameters: JSONSchema; // Input schema
  returns?: JSONSchema; // Output schema

  // Behavior
  enabled: boolean;
  requiresAuth: boolean;

  // Metadata
  version: string;
}

/** Tool execution configuration */
export interface ToolConfig {
  // For webhook
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;

  // For mcp
  serverId?: string;
  toolName?: string;

  // For prompt
  prompt?: string;
}

/** Input for creating a tool */
export interface CreateToolInput {
  personaId?: string;
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
}

/** Input for updating a tool */
export interface UpdateToolInput {
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

/** Tool test result */
export interface ToolTestResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTimeMs?: number;
}

// ============================================================================
// WEBHOOK INPUT/OUTPUT TYPES (API-specific)
// ============================================================================
// Note: Core types (WebhookEventType, WebhookDeliveryStatus, DeveloperWebhook,
// WebhookPayload, WebhookDeliveryLog, WebhookRetryPolicy) are re-exported from
// types/developer-platform.ts at the top of this file.

/** Input for creating a webhook */
export interface CreateWebhookInput {
  personaId?: string;
  name: string;
  url: string;
  events: WebhookEventType[];
  enabled?: boolean;
  retryPolicy?: WebhookRetryPolicy;
}

/** Input for updating a webhook */
export interface UpdateWebhookInput {
  name?: string;
  url?: string;
  events?: WebhookEventType[];
  enabled?: boolean;
  retryPolicy?: WebhookRetryPolicy;
}

// ============================================================================
// ACTIVITY TYPES (Phase 4)
// ============================================================================

/** Activity status */
export type ActivityStatus = 'started' | 'completed' | 'failed';

/** Developer activity tracking */
export interface DeveloperActivity extends BaseEntity {
  personaId?: string;
  userId?: string;
  sessionId?: string;

  // Activity data
  type: string; // Developer-defined type
  name: string;
  data: Record<string, unknown>;

  // Tracking
  startedAt?: Date;
  completedAt?: Date;
  duration?: number; // Milliseconds
  status: ActivityStatus;
}

/** Input for creating an activity */
export interface CreateActivityInput {
  personaId?: string;
  userId?: string;
  sessionId?: string;
  type: string;
  name: string;
  data?: Record<string, unknown>;
  status?: ActivityStatus;
}

/** Input for updating an activity */
export interface UpdateActivityInput {
  data?: Record<string, unknown>;
  status?: ActivityStatus;
  completedAt?: Date;
}

/** Activity statistics */
export interface ActivityStats {
  totalCount: number;
  byType: Record<string, number>;
  byStatus: Record<ActivityStatus, number>;
  averageDurationMs?: number;
}

// ============================================================================
// WORKFLOW TYPES (Phase 5)
// ============================================================================

/** Workflow trigger types */
export type WorkflowTriggerType = 'voice_command' | 'tool_call' | 'schedule' | 'event' | 'api';

/** Workflow node types */
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

/** Workflow execution status */
export type WorkflowExecutionStatus = 'running' | 'completed' | 'failed' | 'cancelled';

/** Workflow trigger configuration */
export interface WorkflowTrigger {
  type: WorkflowTriggerType;
  config: {
    command?: string; // For voice_command: "start daily standup"
    toolName?: string; // For tool_call
    schedule?: string; // For schedule: cron expression
    eventType?: string; // For event: session.started
  };
}

/** Workflow node */
export interface WorkflowNode {
  id: string;
  name: string;
  type: WorkflowNodeType;
  config: NodeConfig;
  position?: { x: number; y: number }; // For visual editor
}

/** Node configuration */
export interface NodeConfig {
  // For mcp_call
  serverId?: string;
  toolName?: string;
  arguments?: Record<string, string>; // Can include {{ variables }}

  // For webhook
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string; // JSON template with {{ variables }}

  // For llm_prompt
  prompt?: string;
  model?: string;
  outputVariable?: string;

  // For condition
  expression?: string; // JavaScript expression
  trueEdgeId?: string;
  falseEdgeId?: string;

  // For parallel
  branchNodeIds?: string[];

  // For wait
  duration?: number; // Milliseconds
  event?: string; // Event to wait for

  // For set_variable
  variable?: string;
  value?: string; // Expression
}

/** Workflow edge connecting nodes */
export interface WorkflowEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  condition?: string; // For conditional edges: "result.success === true"
}

/** Retry policy for workflows */
export interface WorkflowRetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
}

/** Developer workflow definition */
export interface DeveloperWorkflow extends BaseEntity {
  personaId?: string;

  // Workflow definition
  name: string;
  description: string;
  version: string;

  // Graph structure
  trigger: WorkflowTrigger;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];

  // Entry/exit
  entryNodeId: string;
  exitNodeIds: string[];

  // Behavior
  enabled: boolean;
  timeout?: number; // Max execution time (ms)
  retryPolicy?: WorkflowRetryPolicy;
}

/** Input for creating a workflow */
export interface CreateWorkflowInput {
  personaId?: string;
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
}

/** Input for updating a workflow */
export interface UpdateWorkflowInput {
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

/** Workflow execution instance */
export interface WorkflowExecution {
  id: string;
  workflowId: string;
  publisherId: string;

  // Context
  userId?: string;
  sessionId?: string;
  triggeredBy: 'voice' | 'api' | 'schedule' | 'event';

  // State
  status: WorkflowExecutionStatus;
  currentNodeIds: string[]; // Currently executing nodes (supports parallel)
  completedNodeIds: string[];
  variables: Record<string, unknown>;

  // Results
  result?: unknown;
  error?: string;

  // Timing
  startedAt: Date;
  completedAt?: Date;
}

/** Workflow test result */
export interface WorkflowTestResult {
  success: boolean;
  execution?: WorkflowExecution;
  error?: string;
}

// ============================================================================
// OAUTH TYPES (Phase 6)
// ============================================================================

/** OAuth provider configuration */
export interface DeveloperOAuthProvider extends BaseEntity {
  // Provider config
  name: string;
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string; // Stored encrypted
  scopes: string[];

  // Behavior
  enabled: boolean;
}

/** OAuth token storage */
export interface DeveloperOAuthToken {
  id: string;
  publisherId: string;
  providerId: string;
  userId?: string; // User-specific token

  // Token data
  accessToken: string; // Stored encrypted
  refreshToken?: string; // Stored encrypted
  expiresAt?: Date;
  scopes: string[];

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

/** Input for creating an OAuth provider */
export interface CreateOAuthProviderInput {
  name: string;
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  enabled?: boolean;
}

/** Input for updating an OAuth provider */
export interface UpdateOAuthProviderInput {
  name?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string[];
  enabled?: boolean;
}

// ============================================================================
// COLLECTION & ID PREFIX CONSTANTS
// ============================================================================
// Note: COLLECTIONS and ID_PREFIXES are re-exported from types/developer-platform.ts
// at the top of this file. Import them from there or from this file.
