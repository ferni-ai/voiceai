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
};
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
};
//# sourceMappingURL=developer-platform.js.map