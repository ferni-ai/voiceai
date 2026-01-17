/**
 * Developer Platform Types - Shared
 *
 * Types shared between lower layers (memory, personas, tools) and higher layers (api).
 * These types define the data structures without coupling to API implementation.
 *
 * ARCHITECTURE NOTE:
 * This file is at level 10 (types/) so it can be imported by all layers.
 * The full API types remain in api/v2/developers/shared/types.ts.
 *
 * @module types/developer-platform
 */

// ============================================================================
// MCP SERVER TYPES
// ============================================================================

/** Transport type for MCP servers */
export type MCPTransport = 'stdio' | 'http' | 'websocket';

/** MCP server status */
export type MCPServerStatus = 'active' | 'error' | 'disabled';

/** Base entity with common fields */
export interface BaseEntity {
  id: string;
  publisherId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Developer-registered MCP server */
export interface DeveloperMCPServer extends BaseEntity {
  personaId?: string; // Optional: specific persona

  // MCP Configuration
  name: string;
  description: string;
  transport: MCPTransport;

  // Transport-specific config
  command?: string; // For stdio
  args?: string[]; // For stdio
  endpoint?: string; // For http/websocket
  headers?: Record<string, string>;

  // Secrets (stored encrypted, references only in API responses)
  secrets?: Record<string, string>; // e.g., { API_KEY: 'xxx' }

  // Behavior
  autoConnect: boolean;
  enabled: boolean;
  timeout?: number; // Connection timeout (ms)

  // Status
  status: MCPServerStatus;
  lastConnected?: Date;
  lastError?: string;
  toolCount?: number; // Discovered tools
}

// ============================================================================
// WEBHOOK TYPES
// ============================================================================

/** Webhook event types */
export type WebhookEventType =
  // Session lifecycle
  | 'session.started'
  | 'session.ended'
  // Conversation
  | 'conversation.turn.completed'
  | 'conversation.transcript.ready'
  // Tool execution
  | 'tool.called'
  | 'tool.completed'
  | 'tool.failed'
  // Persona
  | 'persona.handoff'
  | 'persona.installed'
  // Custom
  | 'activity.created'
  // Workflow execution
  | 'workflow.step.completed'
  | 'workflow.completed'
  | 'workflow.failed';

/** Webhook delivery status */
export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed' | 'retrying';

/** Retry policy for webhooks */
export interface WebhookRetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
}

/** Developer webhook subscription */
export interface DeveloperWebhook extends BaseEntity {
  personaId?: string;

  // Webhook config
  name: string;
  url: string;
  events: WebhookEventType[];

  // Security
  secret: string; // For HMAC signing

  // Behavior
  enabled: boolean;
  retryPolicy?: WebhookRetryPolicy;

  // Status
  lastDeliveredAt?: Date;
  failureCount: number;
}

/** Webhook payload sent to developer endpoint */
export interface WebhookPayload {
  id: string; // Event ID
  type: WebhookEventType;
  timestamp: string; // ISO timestamp
  publisherId: string;
  personaId?: string;
  userId?: string; // User (if consented)
  sessionId?: string;
  data: Record<string, unknown>; // Event-specific data
}

/** Webhook delivery log entry */
export interface WebhookDeliveryLog {
  id: string;
  webhookId: string;
  eventId: string;
  eventType: WebhookEventType;
  status: WebhookDeliveryStatus;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  attempt: number;
  deliveredAt?: Date;
  createdAt: Date;
}

// ============================================================================
// FIRESTORE COLLECTION NAMES
// ============================================================================

export const COLLECTIONS = {
  MCP_SERVERS: 'developer_mcp_servers',
  TOOLS: 'developer_tools',
  WEBHOOKS: 'developer_webhooks',
  WEBHOOK_LOGS: 'developer_webhook_logs',
  ACTIVITIES: 'developer_activities',
  WORKFLOWS: 'developer_workflows',
  WORKFLOW_EXECUTIONS: 'workflow_executions',
  OAUTH_PROVIDERS: 'developer_oauth_providers',
  OAUTH_TOKENS: 'developer_oauth_tokens',
} as const;

// ============================================================================
// ID PREFIX GENERATORS
// ============================================================================

/** Generate prefixed IDs for different entity types */
export const ID_PREFIXES = {
  MCP_SERVER: 'mcp_',
  TOOL: 'tool_',
  WEBHOOK: 'wh_',
  ACTIVITY: 'act_',
  WORKFLOW: 'wf_',
  EXECUTION: 'exec_',
  OAUTH_PROVIDER: 'oauth_',
  OAUTH_TOKEN: 'token_',
} as const;
