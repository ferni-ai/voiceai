/**
 * Developer Platform API v2 - Validation Schemas
 *
 * Zod schemas for validating API request payloads.
 * All inputs are validated before processing to ensure type safety.
 *
 * @module api/v2/developers/shared/validation
 */

import { z } from 'zod';

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

/** Pagination query parameters */
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

/** ID parameter */
export const IdParamSchema = z.object({
  id: z.string().min(1),
});

/** JSON Schema definition (simplified) */
export const JSONSchemaSchema: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      type: z.union([z.string(), z.array(z.string())]).optional(),
      properties: z.record(z.string(), JSONSchemaSchema).optional(),
      required: z.array(z.string()).optional(),
      items: JSONSchemaSchema.optional(),
      enum: z.array(z.unknown()).optional(),
      description: z.string().optional(),
      default: z.unknown().optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      minLength: z.number().optional(),
      maxLength: z.number().optional(),
      pattern: z.string().optional(),
      format: z.string().optional(),
      additionalProperties: z.union([z.boolean(), JSONSchemaSchema]).optional(),
      oneOf: z.array(JSONSchemaSchema).optional(),
      anyOf: z.array(JSONSchemaSchema).optional(),
      allOf: z.array(JSONSchemaSchema).optional(),
      $ref: z.string().optional(),
      $defs: z.record(z.string(), JSONSchemaSchema).optional(),
    })
    .passthrough()
);

// ============================================================================
// MCP SERVER SCHEMAS (Phase 1)
// ============================================================================

/** MCP transport type */
export const MCPTransportSchema = z.enum(['stdio', 'http', 'websocket']);

/** Create MCP server input */
export const CreateMCPServerSchema = z
  .object({
    personaId: z.string().optional(),
    name: z.string().min(1).max(100),
    description: z.string().max(500),
    transport: MCPTransportSchema,
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    endpoint: z.string().url().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    secrets: z.record(z.string(), z.string()).optional(),
    autoConnect: z.boolean().default(true),
    enabled: z.boolean().default(true),
    timeout: z.number().int().min(1000).max(60000).optional(),
  })
  .refine(
    (data) => {
      // Stdio requires command
      if (data.transport === 'stdio' && !data.command) {
        return false;
      }
      // HTTP/WebSocket require endpoint
      if ((data.transport === 'http' || data.transport === 'websocket') && !data.endpoint) {
        return false;
      }
      return true;
    },
    {
      message: 'stdio transport requires command; http/websocket require endpoint',
    }
  );

/** Update MCP server input */
export const UpdateMCPServerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  transport: MCPTransportSchema.optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  endpoint: z.string().url().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  secrets: z.record(z.string(), z.string()).optional(),
  autoConnect: z.boolean().optional(),
  enabled: z.boolean().optional(),
  timeout: z.number().int().min(1000).max(60000).optional(),
});

// ============================================================================
// CUSTOM TOOL SCHEMAS (Phase 2)
// ============================================================================

/** Tool execution type */
export const ToolExecutionTypeSchema = z.enum(['webhook', 'mcp', 'prompt']);

/** Tool config */
export const ToolConfigSchema = z.object({
  // For webhook
  url: z.string().url().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  // For mcp
  serverId: z.string().optional(),
  toolName: z.string().optional(),
  // For prompt
  prompt: z.string().optional(),
});

/** Create tool input */
export const CreateToolSchema = z
  .object({
    personaId: z.string().optional(),
    name: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'Name must be kebab-case')
      .min(1)
      .max(50),
    displayName: z.string().min(1).max(100),
    description: z.string().max(500),
    llmDescription: z.string().max(1000),
    type: ToolExecutionTypeSchema,
    config: ToolConfigSchema,
    parameters: JSONSchemaSchema,
    returns: JSONSchemaSchema.optional(),
    enabled: z.boolean().default(true),
    requiresAuth: z.boolean().default(false),
    version: z.string().default('1.0.0'),
  })
  .refine(
    (data) => {
      // Webhook requires url
      if (data.type === 'webhook' && !data.config.url) {
        return false;
      }
      // MCP requires serverId and toolName
      if (data.type === 'mcp' && (!data.config.serverId || !data.config.toolName)) {
        return false;
      }
      // Prompt requires prompt
      if (data.type === 'prompt' && !data.config.prompt) {
        return false;
      }
      return true;
    },
    {
      message:
        'Tool config must match type: webhook needs url, mcp needs serverId+toolName, prompt needs prompt',
    }
  );

/** Update tool input */
export const UpdateToolSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  llmDescription: z.string().max(1000).optional(),
  type: ToolExecutionTypeSchema.optional(),
  config: ToolConfigSchema.optional(),
  parameters: JSONSchemaSchema.optional(),
  returns: JSONSchemaSchema.optional(),
  enabled: z.boolean().optional(),
  requiresAuth: z.boolean().optional(),
  version: z.string().optional(),
});

// ============================================================================
// WEBHOOK SCHEMAS (Phase 3)
// ============================================================================

/** Webhook event types */
export const WebhookEventTypeSchema = z.enum([
  'session.started',
  'session.ended',
  'conversation.turn.completed',
  'conversation.transcript.ready',
  'tool.called',
  'tool.completed',
  'tool.failed',
  'persona.handoff',
  'persona.installed',
  'activity.created',
  'workflow.step.completed',
  'workflow.completed',
]);

/** Retry policy */
export const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10).default(3),
  backoffMs: z.number().int().min(100).max(60000).default(1000),
  backoffMultiplier: z.number().min(1).max(5).default(2),
});

/** Create webhook input */
export const CreateWebhookSchema = z.object({
  personaId: z.string().optional(),
  name: z.string().min(1).max(100),
  url: z.string().url(),
  events: z.array(WebhookEventTypeSchema).min(1),
  enabled: z.boolean().default(true),
  retryPolicy: RetryPolicySchema.optional(),
});

/** Update webhook input */
export const UpdateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  events: z.array(WebhookEventTypeSchema).min(1).optional(),
  enabled: z.boolean().optional(),
  retryPolicy: RetryPolicySchema.optional(),
});

// ============================================================================
// ACTIVITY SCHEMAS (Phase 4)
// ============================================================================

/** Activity status */
export const ActivityStatusSchema = z.enum(['started', 'completed', 'failed']);

/** Create activity input */
export const CreateActivitySchema = z.object({
  personaId: z.string().optional(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  type: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  data: z.record(z.string(), z.unknown()).default({}),
  status: ActivityStatusSchema.default('started'),
});

/** Update activity input */
export const UpdateActivitySchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
  status: ActivityStatusSchema.optional(),
  completedAt: z.coerce.date().optional(),
});

/** Activity query parameters */
export const ActivityQuerySchema = PaginationSchema.extend({
  type: z.string().optional(),
  status: ActivityStatusSchema.optional(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// ============================================================================
// WORKFLOW SCHEMAS (Phase 5)
// ============================================================================

/** Workflow trigger types */
export const WorkflowTriggerTypeSchema = z.enum([
  'voice_command',
  'tool_call',
  'schedule',
  'event',
  'api',
]);

/** Workflow node types */
export const WorkflowNodeTypeSchema = z.enum([
  'start',
  'end',
  'mcp_call',
  'webhook',
  'llm_prompt',
  'condition',
  'parallel',
  'join',
  'wait',
  'set_variable',
  'activity',
  'sub_workflow',
]);

/** Workflow trigger config */
export const WorkflowTriggerSchema = z.object({
  type: WorkflowTriggerTypeSchema,
  config: z.object({
    command: z.string().optional(),
    toolName: z.string().optional(),
    schedule: z.string().optional(),
    eventType: z.string().optional(),
  }),
});

/** Node config */
export const NodeConfigSchema = z.object({
  // For mcp_call
  serverId: z.string().optional(),
  toolName: z.string().optional(),
  arguments: z.record(z.string(), z.string()).optional(),
  // For webhook
  url: z.string().url().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  // For llm_prompt
  prompt: z.string().optional(),
  model: z.string().optional(),
  outputVariable: z.string().optional(),
  // For condition
  expression: z.string().optional(),
  trueEdgeId: z.string().optional(),
  falseEdgeId: z.string().optional(),
  // For parallel
  branchNodeIds: z.array(z.string()).optional(),
  // For wait
  duration: z.number().int().min(0).optional(),
  event: z.string().optional(),
  // For set_variable
  variable: z.string().optional(),
  value: z.string().optional(),
});

/** Workflow node */
export const WorkflowNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  type: WorkflowNodeTypeSchema,
  config: NodeConfigSchema,
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
});

/** Workflow edge */
export const WorkflowEdgeSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  label: z.string().optional(),
  condition: z.string().optional(),
});

/** Create workflow input */
export const CreateWorkflowSchema = z.object({
  personaId: z.string().optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  version: z.string().default('1.0.0'),
  trigger: WorkflowTriggerSchema,
  nodes: z.array(WorkflowNodeSchema).min(2), // At least start and end
  edges: z.array(WorkflowEdgeSchema).min(1),
  entryNodeId: z.string().min(1),
  exitNodeIds: z.array(z.string()).optional(),
  enabled: z.boolean().default(true),
  timeout: z.number().int().min(1000).max(3600000).optional(), // 1s to 1hr
  retryPolicy: RetryPolicySchema.optional(),
});

/** Update workflow input */
export const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  version: z.string().optional(),
  trigger: WorkflowTriggerSchema.optional(),
  nodes: z.array(WorkflowNodeSchema).min(2).optional(),
  edges: z.array(WorkflowEdgeSchema).min(1).optional(),
  entryNodeId: z.string().min(1).optional(),
  exitNodeIds: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
  timeout: z.number().int().min(1000).max(3600000).optional(),
  retryPolicy: RetryPolicySchema.optional(),
});

// ============================================================================
// OAUTH SCHEMAS (Phase 6)
// ============================================================================

/** Create OAuth provider input */
export const CreateOAuthProviderSchema = z.object({
  name: z.string().min(1).max(100),
  authorizationUrl: z.string().url(),
  tokenUrl: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  scopes: z.array(z.string()),
  enabled: z.boolean().default(true),
});

/** Update OAuth provider input */
export const UpdateOAuthProviderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  authorizationUrl: z.string().url().optional(),
  tokenUrl: z.string().url().optional(),
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().min(1).optional(),
  scopes: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
});

// ============================================================================
// TYPE INFERENCE HELPERS
// ============================================================================
// Use types from ./types.ts for API contracts
// These inferred types are useful for validating parsed data matches schemas
// They're prefixed with "Parsed" to distinguish from the canonical types

export type ParsedCreateMCPServerInput = z.infer<typeof CreateMCPServerSchema>;
export type ParsedUpdateMCPServerInput = z.infer<typeof UpdateMCPServerSchema>;
export type ParsedCreateToolInput = z.infer<typeof CreateToolSchema>;
export type ParsedUpdateToolInput = z.infer<typeof UpdateToolSchema>;
export type ParsedCreateWebhookInput = z.infer<typeof CreateWebhookSchema>;
export type ParsedUpdateWebhookInput = z.infer<typeof UpdateWebhookSchema>;
export type ParsedCreateActivityInput = z.infer<typeof CreateActivitySchema>;
export type ParsedUpdateActivityInput = z.infer<typeof UpdateActivitySchema>;
export type ParsedActivityQuery = z.infer<typeof ActivityQuerySchema>;
export type ParsedCreateWorkflowInput = z.infer<typeof CreateWorkflowSchema>;
export type ParsedUpdateWorkflowInput = z.infer<typeof UpdateWorkflowSchema>;
export type ParsedCreateOAuthProviderInput = z.infer<typeof CreateOAuthProviderSchema>;
export type ParsedUpdateOAuthProviderInput = z.infer<typeof UpdateOAuthProviderSchema>;
