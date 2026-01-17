/**
 * Ferni Developer Platform SDK Client
 */

import type {
  FerniConfig,
  // API Keys
  ListApiKeysResponse,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  RotateApiKeyResponse,
  // Personas
  ListPersonasResponse,
  CreatePersonaResponse,
  GetPersonaResponse,
  UpdatePersonaResponse,
  ValidatePersonaResponse,
  SubmitPersonaResponse,
  PersonaManifest,
  // Webhooks
  ListWebhooksResponse,
  CreateWebhookRequest,
  WebhookResponse,
  UpdateWebhookRequest,
  TestWebhookResponse,
  WebhookLogsResponse,
  // Analytics
  AnalyticsPeriod,
  AnalyticsOverviewResponse,
  UsageOverTimeResponse,
  PersonaUsageResponse,
  ErrorBreakdownResponse,
  // MCP Servers (v2)
  ListMCPServersResponse,
  MCPServerResponse,
  CreateMCPServerRequest,
  UpdateMCPServerRequest,
  MCPServerTestResponse,
  MCPServerToolsResponse,
  // Custom Tools (v2)
  ListToolsResponse,
  ToolResponse,
  CreateToolRequest,
  UpdateToolRequest,
  ToolTestResponse,
  // Activities (v2)
  ListActivitiesResponse,
  ActivityResponse,
  CreateActivityRequest,
  UpdateActivityRequest,
  ActivityStatsResponse,
  // Workflows (v2)
  ListWorkflowsResponse,
  WorkflowResponse,
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  WorkflowExecuteResponse,
  ListWorkflowExecutionsResponse,
  // OAuth (v2)
  ListOAuthProvidersResponse,
  OAuthProviderResponse,
  CreateOAuthProviderRequest,
  UpdateOAuthProviderRequest,
  OAuthAuthorizeResponse,
  ListOAuthTokensResponse,
  OAuthAccessTokenResponse,
} from './types.js';
import { FerniApiError } from './types.js';

const DEFAULT_BASE_URL = 'https://api.ferni.ai';
const DEFAULT_TIMEOUT = 30000;

export class FerniClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: FerniConfig) {
    if (!config.apiKey) {
      throw new Error('API key is required');
    }

    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
    this.fetchFn = config.fetch || fetch;
  }

  // ===========================================================================
  // HTTP HELPERS
  // ===========================================================================

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const data = (await response.json()) as T & { error?: string; code?: string };

      if (!response.ok) {
        throw new FerniApiError(
          data.error || 'Unknown error',
          response.status,
          data.code
        );
      }

      return data;
    } catch (error) {
      if (error instanceof FerniApiError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new FerniApiError('Request timeout', 408);
      }
      throw new FerniApiError(
        error instanceof Error ? error.message : 'Network error',
        0
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  private delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  // ===========================================================================
  // API KEYS
  // ===========================================================================

  /**
   * List all API keys (returns prefix only for security)
   */
  async listApiKeys(): Promise<ListApiKeysResponse> {
    return this.get('/api/v1/developers/keys');
  }

  /**
   * Create a new API key
   * @param options Key type (live or test) and optional name
   * @returns The full API key - save it immediately!
   */
  async createApiKey(options: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
    return this.post('/api/v1/developers/keys', options);
  }

  /**
   * Rotate an API key (revoke old, generate new)
   * @param keyId The key ID to rotate
   * @returns The new full API key
   */
  async rotateApiKey(keyId: string): Promise<RotateApiKeyResponse> {
    return this.post(`/api/v1/developers/keys/${keyId}/rotate`);
  }

  /**
   * Revoke an API key immediately
   * @param keyId The key ID to revoke
   */
  async revokeApiKey(keyId: string): Promise<{ success: boolean; message: string }> {
    return this.delete(`/api/v1/developers/keys/${keyId}`);
  }

  // ===========================================================================
  // PERSONAS
  // ===========================================================================

  /**
   * List all your personas
   */
  async listPersonas(): Promise<ListPersonasResponse> {
    return this.get('/api/v1/developers/personas');
  }

  /**
   * Create a new persona draft
   * @param manifest The persona manifest
   */
  async createPersona(manifest: PersonaManifest): Promise<CreatePersonaResponse> {
    return this.post('/api/v1/developers/personas', { manifest });
  }

  /**
   * Get full persona details including manifest
   * @param personaId The persona ID
   */
  async getPersona(personaId: string): Promise<GetPersonaResponse> {
    return this.get(`/api/v1/developers/personas/${personaId}`);
  }

  /**
   * Update a persona draft or rejected persona
   * @param personaId The persona ID
   * @param manifest The updated manifest
   */
  async updatePersona(
    personaId: string,
    manifest: PersonaManifest
  ): Promise<UpdatePersonaResponse> {
    return this.put(`/api/v1/developers/personas/${personaId}`, { manifest });
  }

  /**
   * Delete a persona draft
   * @param personaId The persona ID
   */
  async deletePersona(personaId: string): Promise<{ success: boolean; message: string }> {
    return this.delete(`/api/v1/developers/personas/${personaId}`);
  }

  /**
   * Validate a persona against platform requirements
   * @param personaId The persona ID
   */
  async validatePersona(personaId: string): Promise<ValidatePersonaResponse> {
    return this.post(`/api/v1/developers/personas/${personaId}/validate`);
  }

  /**
   * Submit a persona for review
   * @param personaId The persona ID
   */
  async submitPersona(personaId: string): Promise<SubmitPersonaResponse> {
    return this.post(`/api/v1/developers/personas/${personaId}/submit`);
  }

  // ===========================================================================
  // WEBHOOKS
  // ===========================================================================

  /**
   * List all webhooks
   * @param options Pagination options
   */
  async listWebhooks(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<ListWebhooksResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    const query = params.toString();
    return this.get(`/api/v2/developers/webhooks${query ? `?${query}` : ''}`);
  }

  /**
   * Create a new webhook
   * @param webhook Webhook configuration
   */
  async createWebhook(webhook: CreateWebhookRequest): Promise<WebhookResponse> {
    return this.post('/api/v2/developers/webhooks', webhook);
  }

  /**
   * Get webhook details
   * @param webhookId The webhook ID
   */
  async getWebhook(webhookId: string): Promise<WebhookResponse> {
    return this.get(`/api/v2/developers/webhooks/${webhookId}`);
  }

  /**
   * Update a webhook
   * @param webhookId The webhook ID
   * @param updates Fields to update
   */
  async updateWebhook(
    webhookId: string,
    updates: UpdateWebhookRequest
  ): Promise<WebhookResponse> {
    return this.put(`/api/v2/developers/webhooks/${webhookId}`, updates);
  }

  /**
   * Delete a webhook
   * @param webhookId The webhook ID
   */
  async deleteWebhook(
    webhookId: string
  ): Promise<{ success: boolean; data: { deleted: boolean } }> {
    return this.delete(`/api/v2/developers/webhooks/${webhookId}`);
  }

  /**
   * Send a test event to a webhook
   * @param webhookId The webhook ID
   */
  async testWebhook(webhookId: string): Promise<TestWebhookResponse> {
    return this.post(`/api/v2/developers/webhooks/${webhookId}/test`);
  }

  /**
   * Get webhook delivery logs
   * @param webhookId The webhook ID
   * @param options Pagination options
   */
  async getWebhookLogs(
    webhookId: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<WebhookLogsResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    const query = params.toString();
    return this.get(
      `/api/v2/developers/webhooks/${webhookId}/logs${query ? `?${query}` : ''}`
    );
  }

  // ===========================================================================
  // ANALYTICS
  // ===========================================================================

  /**
   * Get analytics overview with comparison to previous period
   * @param period Time period (day, week, month, year)
   */
  async getAnalyticsOverview(
    period: AnalyticsPeriod = 'week'
  ): Promise<AnalyticsOverviewResponse> {
    return this.get(`/api/v1/developers/analytics/overview?period=${period}`);
  }

  /**
   * Get usage data over time
   * @param period Time period (day, week, month, year)
   */
  async getUsageOverTime(
    period: AnalyticsPeriod = 'week'
  ): Promise<UsageOverTimeResponse> {
    return this.get(`/api/v1/developers/analytics/usage?period=${period}`);
  }

  /**
   * Get per-persona usage statistics
   * @param period Time period (day, week, month, year)
   */
  async getPersonaUsage(
    period: AnalyticsPeriod = 'week'
  ): Promise<PersonaUsageResponse> {
    return this.get(`/api/v1/developers/analytics/personas?period=${period}`);
  }

  /**
   * Get error breakdown by error code
   * @param period Time period (day, week, month, year)
   */
  async getErrorBreakdown(
    period: AnalyticsPeriod = 'week'
  ): Promise<ErrorBreakdownResponse> {
    return this.get(`/api/v1/developers/analytics/errors?period=${period}`);
  }

  // ===========================================================================
  // MCP SERVERS (v2)
  // ===========================================================================

  /**
   * List all MCP servers
   * @param options Pagination options
   */
  async listMCPServers(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<ListMCPServersResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    const query = params.toString();
    return this.get(`/api/v2/developers/mcp-servers${query ? `?${query}` : ''}`);
  }

  /**
   * Create a new MCP server
   * @param server Server configuration
   */
  async createMCPServer(server: CreateMCPServerRequest): Promise<MCPServerResponse> {
    return this.post('/api/v2/developers/mcp-servers', server);
  }

  /**
   * Get MCP server details
   * @param serverId The server ID
   */
  async getMCPServer(serverId: string): Promise<MCPServerResponse> {
    return this.get(`/api/v2/developers/mcp-servers/${serverId}`);
  }

  /**
   * Update an MCP server
   * @param serverId The server ID
   * @param updates Fields to update
   */
  async updateMCPServer(
    serverId: string,
    updates: UpdateMCPServerRequest
  ): Promise<MCPServerResponse> {
    return this.put(`/api/v2/developers/mcp-servers/${serverId}`, updates);
  }

  /**
   * Delete an MCP server
   * @param serverId The server ID
   */
  async deleteMCPServer(
    serverId: string
  ): Promise<{ success: boolean; data: { deleted: boolean } }> {
    return this.delete(`/api/v2/developers/mcp-servers/${serverId}`);
  }

  /**
   * Test MCP server connection
   * @param serverId The server ID
   */
  async testMCPServer(serverId: string): Promise<MCPServerTestResponse> {
    return this.post(`/api/v2/developers/mcp-servers/${serverId}/test`);
  }

  /**
   * Get tools from an MCP server
   * @param serverId The server ID
   */
  async getMCPServerTools(serverId: string): Promise<MCPServerToolsResponse> {
    return this.get(`/api/v2/developers/mcp-servers/${serverId}/tools`);
  }

  // ===========================================================================
  // CUSTOM TOOLS (v2)
  // ===========================================================================

  /**
   * List all custom tools
   * @param options Pagination options
   */
  async listTools(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<ListToolsResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    const query = params.toString();
    return this.get(`/api/v2/developers/tools${query ? `?${query}` : ''}`);
  }

  /**
   * Create a new custom tool
   * @param tool Tool configuration
   */
  async createTool(tool: CreateToolRequest): Promise<ToolResponse> {
    return this.post('/api/v2/developers/tools', tool);
  }

  /**
   * Get custom tool details
   * @param toolId The tool ID
   */
  async getTool(toolId: string): Promise<ToolResponse> {
    return this.get(`/api/v2/developers/tools/${toolId}`);
  }

  /**
   * Update a custom tool
   * @param toolId The tool ID
   * @param updates Fields to update
   */
  async updateTool(
    toolId: string,
    updates: UpdateToolRequest
  ): Promise<ToolResponse> {
    return this.put(`/api/v2/developers/tools/${toolId}`, updates);
  }

  /**
   * Delete a custom tool
   * @param toolId The tool ID
   */
  async deleteTool(
    toolId: string
  ): Promise<{ success: boolean; data: { deleted: boolean } }> {
    return this.delete(`/api/v2/developers/tools/${toolId}`);
  }

  /**
   * Test a custom tool
   * @param toolId The tool ID
   * @param input Optional test input
   */
  async testTool(
    toolId: string,
    input?: Record<string, unknown>
  ): Promise<ToolTestResponse> {
    return this.post(`/api/v2/developers/tools/${toolId}/test`, input);
  }

  // ===========================================================================
  // ACTIVITIES (v2)
  // ===========================================================================

  /**
   * List all activities
   * @param options Pagination and filter options
   */
  async listActivities(options?: {
    limit?: number;
    cursor?: string;
    type?: string;
    status?: string;
  }): Promise<ListActivitiesResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    if (options?.type) params.set('type', options.type);
    if (options?.status) params.set('status', options.status);
    const query = params.toString();
    return this.get(`/api/v2/developers/activities${query ? `?${query}` : ''}`);
  }

  /**
   * Create a new activity
   * @param activity Activity data
   */
  async createActivity(activity: CreateActivityRequest): Promise<ActivityResponse> {
    return this.post('/api/v2/developers/activities', activity);
  }

  /**
   * Get activity details
   * @param activityId The activity ID
   */
  async getActivity(activityId: string): Promise<ActivityResponse> {
    return this.get(`/api/v2/developers/activities/${activityId}`);
  }

  /**
   * Update an activity
   * @param activityId The activity ID
   * @param updates Fields to update
   */
  async updateActivity(
    activityId: string,
    updates: UpdateActivityRequest
  ): Promise<ActivityResponse> {
    return this.put(`/api/v2/developers/activities/${activityId}`, updates);
  }

  /**
   * Delete an activity
   * @param activityId The activity ID
   */
  async deleteActivity(
    activityId: string
  ): Promise<{ success: boolean; data: { deleted: boolean } }> {
    return this.delete(`/api/v2/developers/activities/${activityId}`);
  }

  /**
   * Get activity statistics
   * @param options Filter options
   */
  async getActivityStats(options?: {
    type?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<ActivityStatsResponse> {
    const params = new URLSearchParams();
    if (options?.type) params.set('type', options.type);
    if (options?.startDate) params.set('startDate', options.startDate);
    if (options?.endDate) params.set('endDate', options.endDate);
    const query = params.toString();
    return this.get(`/api/v2/developers/activities/stats${query ? `?${query}` : ''}`);
  }

  // ===========================================================================
  // WORKFLOWS (v2)
  // ===========================================================================

  /**
   * List all workflows
   * @param options Pagination options
   */
  async listWorkflows(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<ListWorkflowsResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    const query = params.toString();
    return this.get(`/api/v2/developers/workflows${query ? `?${query}` : ''}`);
  }

  /**
   * Create a new workflow
   * @param workflow Workflow definition
   */
  async createWorkflow(workflow: CreateWorkflowRequest): Promise<WorkflowResponse> {
    return this.post('/api/v2/developers/workflows', workflow);
  }

  /**
   * Get workflow details
   * @param workflowId The workflow ID
   */
  async getWorkflow(workflowId: string): Promise<WorkflowResponse> {
    return this.get(`/api/v2/developers/workflows/${workflowId}`);
  }

  /**
   * Update a workflow
   * @param workflowId The workflow ID
   * @param updates Fields to update
   */
  async updateWorkflow(
    workflowId: string,
    updates: UpdateWorkflowRequest
  ): Promise<WorkflowResponse> {
    return this.put(`/api/v2/developers/workflows/${workflowId}`, updates);
  }

  /**
   * Delete a workflow
   * @param workflowId The workflow ID
   */
  async deleteWorkflow(
    workflowId: string
  ): Promise<{ success: boolean; data: { deleted: boolean } }> {
    return this.delete(`/api/v2/developers/workflows/${workflowId}`);
  }

  /**
   * Execute a workflow
   * @param workflowId The workflow ID
   * @param context Optional execution context
   */
  async executeWorkflow(
    workflowId: string,
    context?: Record<string, unknown>
  ): Promise<WorkflowExecuteResponse> {
    return this.post(`/api/v2/developers/workflows/${workflowId}/execute`, context);
  }

  /**
   * List workflow executions
   * @param workflowId The workflow ID
   * @param options Pagination options
   */
  async listWorkflowExecutions(
    workflowId: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<ListWorkflowExecutionsResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    const query = params.toString();
    return this.get(
      `/api/v2/developers/workflows/${workflowId}/executions${query ? `?${query}` : ''}`
    );
  }

  // ===========================================================================
  // OAUTH PROVIDERS (v2)
  // ===========================================================================

  /**
   * List all OAuth providers
   * @param options Pagination options
   */
  async listOAuthProviders(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<ListOAuthProvidersResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    const query = params.toString();
    return this.get(`/api/v2/developers/oauth/providers${query ? `?${query}` : ''}`);
  }

  /**
   * Create a new OAuth provider
   * @param provider Provider configuration
   */
  async createOAuthProvider(
    provider: CreateOAuthProviderRequest
  ): Promise<OAuthProviderResponse> {
    return this.post('/api/v2/developers/oauth/providers', provider);
  }

  /**
   * Get OAuth provider details
   * @param providerId The provider ID
   */
  async getOAuthProvider(providerId: string): Promise<OAuthProviderResponse> {
    return this.get(`/api/v2/developers/oauth/providers/${providerId}`);
  }

  /**
   * Update an OAuth provider
   * @param providerId The provider ID
   * @param updates Fields to update
   */
  async updateOAuthProvider(
    providerId: string,
    updates: UpdateOAuthProviderRequest
  ): Promise<OAuthProviderResponse> {
    return this.put(`/api/v2/developers/oauth/providers/${providerId}`, updates);
  }

  /**
   * Delete an OAuth provider
   * @param providerId The provider ID
   */
  async deleteOAuthProvider(
    providerId: string
  ): Promise<{ success: boolean; data: { deleted: boolean } }> {
    return this.delete(`/api/v2/developers/oauth/providers/${providerId}`);
  }

  /**
   * Start OAuth authorization flow
   * @param providerId The provider ID
   * @param redirectUri Your callback URL
   */
  async authorizeOAuth(
    providerId: string,
    redirectUri: string
  ): Promise<OAuthAuthorizeResponse> {
    return this.post('/api/v2/developers/oauth/authorize', {
      providerId,
      redirectUri,
    });
  }

  /**
   * List OAuth tokens
   * @param options Pagination options
   */
  async listOAuthTokens(options?: {
    limit?: number;
    cursor?: string;
    providerId?: string;
  }): Promise<ListOAuthTokensResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    if (options?.providerId) params.set('providerId', options.providerId);
    const query = params.toString();
    return this.get(`/api/v2/developers/oauth/tokens${query ? `?${query}` : ''}`);
  }

  /**
   * Get an access token (auto-refreshes if expired)
   * @param tokenId The token ID
   */
  async getOAuthAccessToken(tokenId: string): Promise<OAuthAccessTokenResponse> {
    return this.get(`/api/v2/developers/oauth/tokens/${tokenId}/access`);
  }

  /**
   * Revoke an OAuth token
   * @param tokenId The token ID
   */
  async revokeOAuthToken(
    tokenId: string
  ): Promise<{ success: boolean; data: { revoked: boolean } }> {
    return this.delete(`/api/v2/developers/oauth/tokens/${tokenId}`);
  }
}
