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
    personaId?: string;
    name: string;
    description: string;
    transport: MCPTransport;
    command?: string;
    args?: string[];
    endpoint?: string;
    headers?: Record<string, string>;
    secrets?: Record<string, string>;
    autoConnect: boolean;
    enabled: boolean;
    timeout?: number;
    status: MCPServerStatus;
    lastConnected?: Date;
    lastError?: string;
    toolCount?: number;
}
/** Webhook event types */
export type WebhookEventType = 'session.started' | 'session.ended' | 'conversation.turn.completed' | 'conversation.transcript.ready' | 'tool.called' | 'tool.completed' | 'tool.failed' | 'persona.handoff' | 'persona.installed' | 'activity.created' | 'workflow.step.completed' | 'workflow.completed' | 'workflow.failed';
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
    name: string;
    url: string;
    events: WebhookEventType[];
    secret: string;
    enabled: boolean;
    retryPolicy?: WebhookRetryPolicy;
    lastDeliveredAt?: Date;
    failureCount: number;
}
/** Webhook payload sent to developer endpoint */
export interface WebhookPayload {
    id: string;
    type: WebhookEventType;
    timestamp: string;
    publisherId: string;
    personaId?: string;
    userId?: string;
    sessionId?: string;
    data: Record<string, unknown>;
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
export declare const COLLECTIONS: {
    readonly MCP_SERVERS: "developer_mcp_servers";
    readonly TOOLS: "developer_tools";
    readonly WEBHOOKS: "developer_webhooks";
    readonly WEBHOOK_LOGS: "developer_webhook_logs";
    readonly ACTIVITIES: "developer_activities";
    readonly WORKFLOWS: "developer_workflows";
    readonly WORKFLOW_EXECUTIONS: "workflow_executions";
    readonly OAUTH_PROVIDERS: "developer_oauth_providers";
    readonly OAUTH_TOKENS: "developer_oauth_tokens";
};
/** Generate prefixed IDs for different entity types */
export declare const ID_PREFIXES: {
    readonly MCP_SERVER: "mcp_";
    readonly TOOL: "tool_";
    readonly WEBHOOK: "wh_";
    readonly ACTIVITY: "act_";
    readonly WORKFLOW: "wf_";
    readonly EXECUTION: "exec_";
    readonly OAUTH_PROVIDER: "oauth_";
    readonly OAUTH_TOKEN: "token_";
};
//# sourceMappingURL=developer-platform.d.ts.map