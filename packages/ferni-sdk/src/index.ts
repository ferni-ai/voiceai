/**
 * Ferni Developer Platform SDK
 *
 * Build AI-powered voice experiences with human-like conversational capabilities.
 *
 * @example
 * ```typescript
 * import { FerniClient } from '@ferni/sdk';
 *
 * const ferni = new FerniClient({
 *   apiKey: 'ferni_live_xxxxxxxxxxxxx',
 * });
 *
 * // List your personas
 * const { personas } = await ferni.listPersonas();
 *
 * // Create a new persona
 * const { persona } = await ferni.createPersona({
 *   identity: {
 *     id: 'wellness-guide',
 *     name: 'Aria',
 *     tagline: 'Your personal wellness companion',
 *   },
 *   voice: {
 *     provider: 'cartesia',
 *     voice_id: 'xxx',
 *   },
 *   personality: {
 *     warmth: 0.9,
 *     humor_level: 0.3,
 *     directness: 0.6,
 *     formality: 0.4,
 *     traits: ['empathetic', 'patient', 'encouraging'],
 *   },
 *   knowledge: {
 *     category: 'wellness',
 *     domains: ['meditation', 'mindfulness', 'stress-management'],
 *   },
 * });
 *
 * // Set up webhooks
 * await ferni.createWebhook({
 *   name: 'Session Events',
 *   url: 'https://api.yourapp.com/webhooks/ferni',
 *   events: ['session.started', 'session.ended', 'transcript.ready'],
 * });
 * ```
 *
 * @packageDocumentation
 */

// Main client
export { FerniClient } from './client.js';

// Webhook utilities
export {
  verifyWebhookSignature,
  parseWebhookEvent,
  createWebhookRouter,
  parseSignatureHeader,
  computeSignature,
  isEventType,
} from './webhooks.js';

// All types
export type {
  // Config
  FerniConfig,

  // API Keys
  ApiKeyType,
  ApiKeyInfo,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  ListApiKeysResponse,
  RotateApiKeyResponse,

  // Personas
  PersonaStatus,
  PersonaIdentity,
  PersonaVoice,
  PersonaPersonality,
  PersonaKnowledge,
  PersonaBehaviors,
  PersonaManifest,
  PersonaSummary,
  PersonaFull,
  ValidationResult,
  CreatePersonaRequest,
  CreatePersonaResponse,
  ListPersonasResponse,
  GetPersonaResponse,
  UpdatePersonaResponse,
  ValidatePersonaResponse,
  SubmitPersonaResponse,

  // Webhooks
  WebhookEventType,
  Webhook,
  WebhookPayload,
  WebhookDeliveryLog,
  Pagination,
  CreateWebhookRequest,
  UpdateWebhookRequest,
  ListWebhooksResponse,
  WebhookResponse,
  TestWebhookResponse,
  WebhookLogsResponse,
  WebhookEventHandlers,

  // Analytics
  AnalyticsPeriod,
  AnalyticsOverview,
  UsageDataPoint,
  PersonaUsageStats,
  ErrorBreakdown,
  AnalyticsOverviewResponse,
  UsageOverTimeResponse,
  PersonaUsageResponse,
  ErrorBreakdownResponse,

  // MCP Servers (v2)
  MCPTransport,
  MCPServerStatus,
  MCPServer,
  CreateMCPServerRequest,
  UpdateMCPServerRequest,
  MCPServerResponse,
  ListMCPServersResponse,
  MCPServerTestResponse,
  MCPServerToolsResponse,

  // Custom Tools (v2)
  ToolExecutionType,
  ToolConfig,
  JSONSchema,
  CustomTool,
  CreateToolRequest,
  UpdateToolRequest,
  ToolResponse,
  ListToolsResponse,
  ToolTestResponse,

  // Activities (v2)
  ActivityStatus,
  Activity,
  CreateActivityRequest,
  UpdateActivityRequest,
  ActivityResponse,
  ListActivitiesResponse,
  ActivityStatsResponse,

  // Workflows (v2)
  WorkflowTriggerType,
  WorkflowNodeType,
  WorkflowExecutionStatus,
  WorkflowTrigger,
  WorkflowNode,
  WorkflowEdge,
  WorkflowRetryPolicy,
  Workflow,
  WorkflowExecution,
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  WorkflowResponse,
  ListWorkflowsResponse,
  WorkflowExecuteResponse,
  ListWorkflowExecutionsResponse,

  // OAuth (v2)
  OAuthProvider,
  OAuthToken,
  CreateOAuthProviderRequest,
  UpdateOAuthProviderRequest,
  OAuthProviderResponse,
  ListOAuthProvidersResponse,
  OAuthAuthorizeResponse,
  OAuthTokenResponse,
  ListOAuthTokensResponse,
  OAuthAccessTokenResponse,

  // Errors
  FerniError,
} from './types.js';

// Error class (re-export as value)
export { FerniApiError } from './types.js';
