/**
 * Life Automation Service
 *
 * Frontend service for interacting with the Life Automation API.
 * Manages workflows, templates, and integrations.
 *
 * @module services/life-automation.service
 */

import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('LifeAutomationService');

// ============================================================================
// TYPES
// ============================================================================

export type WorkflowStatus = 'active' | 'paused' | 'error';

export type TriggerType = 'time' | 'phrase' | 'event' | 'location' | 'calendar' | 'device' | 'webhook';

export interface WorkflowTrigger {
  type: TriggerType;
  // Time trigger
  schedule?: string;
  timezone?: string;
  // Phrase trigger
  phrases?: string[];
  // Event trigger
  eventName?: string;
  conditions?: Record<string, unknown>;
  // Location trigger
  locationName?: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  triggerOn?: 'enter' | 'exit' | 'both';
  // Calendar trigger
  calendarId?: string;
  offsetMinutes?: number;
}

export interface WorkflowAction {
  id: string;
  type: string;
  name: string;
  params: Record<string, unknown>;
}

export interface WorkflowCondition {
  field: string;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than';
  value: unknown;
}

export interface Workflow {
  id: string;
  userId: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  variables: Record<string, unknown>;
  category?: string;
  tags: string[];
  icon?: string;
  color?: string;
  runCount: number;
  lastRunAt?: string;
  templateId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  variables: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'time' | 'location';
    label: string;
    description?: string;
    defaultValue: unknown;
    required: boolean;
  }>;
  estimatedTimeToSetup: string;
  tags: string[];
  popularity: number;
  featured: boolean;
  requiredIntegrations: string[];
  requiredPermissions: string[];
}

export interface TemplateCategory {
  category: string;
  count: number;
  label: string;
}

export interface Integration {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: string;
  authType: 'oauth' | 'api_key' | 'basic';
  scopes?: string[];
}

export interface ConnectionStatus {
  connected: boolean;
  status: 'connected' | 'disconnected' | 'expired' | 'error';
  connectedAt?: string;
  expiresAt?: string;
  scopes?: string[];
}

export interface JobStatus {
  id: string;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  deadLetter: number;
  throughput: number;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class LifeAutomationService {
  private baseUrl = '/api/life-automation';

  // ==========================================================================
  // WORKFLOWS
  // ==========================================================================

  /**
   * List all workflows for a user
   */
  async listWorkflows(userId: string): Promise<Workflow[]> {
    const response = await apiGet<{ workflows: Workflow[] }>(
      `${this.baseUrl}/workflows?userId=${encodeURIComponent(userId)}`
    );

    if (!response.ok || !response.data) {
      log.error('Failed to list workflows');
      return [];
    }

    return response.data.workflows;
  }

  /**
   * Get a specific workflow
   */
  async getWorkflow(workflowId: string, userId: string): Promise<Workflow | null> {
    const response = await apiGet<{ workflow: Workflow }>(
      `${this.baseUrl}/workflows/${workflowId}?userId=${encodeURIComponent(userId)}`
    );

    if (!response.ok || !response.data) {
      return null;
    }

    return response.data.workflow;
  }

  /**
   * Create a new workflow
   */
  async createWorkflow(
    userId: string,
    data: {
      name: string;
      description?: string;
      trigger: WorkflowTrigger;
      conditions?: WorkflowCondition[];
      actions?: WorkflowAction[];
      tags?: string[];
      icon?: string;
      color?: string;
    }
  ): Promise<Workflow | null> {
    const response = await apiPost<{ workflow: Workflow }>(`${this.baseUrl}/workflows`, {
      userId,
      ...data,
    });

    if (!response.ok || !response.data) {
      log.error('Failed to create workflow');
      return null;
    }

    return response.data.workflow;
  }

  /**
   * Update a workflow
   */
  async updateWorkflow(
    workflowId: string,
    userId: string,
    updates: Partial<Workflow>
  ): Promise<Workflow | null> {
    const response = await apiPut<{ workflow: Workflow }>(
      `${this.baseUrl}/workflows/${workflowId}`,
      { userId, ...updates }
    );

    if (!response.ok || !response.data) {
      log.error('Failed to update workflow');
      return null;
    }

    return response.data.workflow;
  }

  /**
   * Delete a workflow
   */
  async deleteWorkflow(workflowId: string, userId: string): Promise<boolean> {
    const response = await apiDelete<{ success: boolean }>(
      `${this.baseUrl}/workflows/${workflowId}?userId=${encodeURIComponent(userId)}`
    );

    return response.ok && response.data?.success === true;
  }

  /**
   * Activate a workflow
   */
  async activateWorkflow(workflowId: string, userId: string): Promise<Workflow | null> {
    const response = await apiPost<{ workflow: Workflow }>(
      `${this.baseUrl}/workflows/${workflowId}/activate`,
      { userId }
    );

    if (!response.ok || !response.data) {
      log.error('Failed to activate workflow');
      return null;
    }

    return response.data.workflow;
  }

  /**
   * Pause a workflow
   */
  async pauseWorkflow(workflowId: string, userId: string): Promise<Workflow | null> {
    const response = await apiPost<{ workflow: Workflow }>(
      `${this.baseUrl}/workflows/${workflowId}/pause`,
      { userId }
    );

    if (!response.ok || !response.data) {
      log.error('Failed to pause workflow');
      return null;
    }

    return response.data.workflow;
  }

  /**
   * Manually run a workflow
   */
  async runWorkflow(
    workflowId: string,
    userId: string,
    variables?: Record<string, unknown>
  ): Promise<{ jobId: string } | null> {
    const response = await apiPost<{ jobId: string; status: string }>(
      `${this.baseUrl}/workflows/${workflowId}/run`,
      { userId, variables }
    );

    if (!response.ok || !response.data) {
      log.error('Failed to run workflow');
      return null;
    }

    return { jobId: response.data.jobId };
  }

  // ==========================================================================
  // TEMPLATES
  // ==========================================================================

  /**
   * List all templates
   */
  async listTemplates(): Promise<{
    templates: WorkflowTemplate[];
    categories: TemplateCategory[];
    featured: WorkflowTemplate[];
  }> {
    const response = await apiGet<{
      templates: WorkflowTemplate[];
      categories: TemplateCategory[];
      featured: WorkflowTemplate[];
    }>(`${this.baseUrl}/templates`);

    if (!response.ok || !response.data) {
      return { templates: [], categories: [], featured: [] };
    }

    return response.data;
  }

  /**
   * Get a specific template
   */
  async getTemplate(templateId: string): Promise<WorkflowTemplate | null> {
    const response = await apiGet<{ template: WorkflowTemplate }>(
      `${this.baseUrl}/templates/${templateId}`
    );

    if (!response.ok || !response.data) {
      return null;
    }

    return response.data.template;
  }

  /**
   * Create a workflow from a template
   */
  async createFromTemplate(
    templateId: string,
    userId: string,
    variables?: Record<string, unknown>
  ): Promise<Workflow | null> {
    const response = await apiPost<{ workflow: Workflow }>(
      `${this.baseUrl}/templates/${templateId}/create`,
      { userId, variables }
    );

    if (!response.ok || !response.data) {
      log.error('Failed to create from template');
      return null;
    }

    return response.data.workflow;
  }

  // ==========================================================================
  // INTEGRATIONS
  // ==========================================================================

  /**
   * List available integrations
   */
  async listIntegrations(): Promise<Integration[]> {
    const response = await apiGet<{ integrations: Integration[] }>(
      `${this.baseUrl}/integrations`
    );

    if (!response.ok || !response.data) {
      return [];
    }

    return response.data.integrations;
  }

  /**
   * Get connected integrations for a user
   */
  async getConnectedIntegrations(
    userId: string
  ): Promise<Array<{ provider: string; status: string; connectedAt: string; scopes: string[] }>> {
    const response = await apiGet<{
      connections: Array<{ provider: string; status: string; connectedAt: string; scopes: string[] }>;
    }>(`${this.baseUrl}/integrations/connected?userId=${encodeURIComponent(userId)}`);

    if (!response.ok || !response.data) {
      return [];
    }

    return response.data.connections;
  }

  /**
   * Get connection status for a specific integration
   */
  async getIntegrationStatus(provider: string, userId: string): Promise<ConnectionStatus> {
    const response = await apiGet<ConnectionStatus>(
      `${this.baseUrl}/integrations/${provider}/status?userId=${encodeURIComponent(userId)}`
    );

    if (!response.ok || !response.data) {
      return { connected: false, status: 'disconnected' };
    }

    return response.data;
  }

  /**
   * Disconnect an integration
   */
  async disconnectIntegration(provider: string, userId: string): Promise<boolean> {
    const response = await apiPost<{ success: boolean }>(
      `${this.baseUrl}/integrations/${provider}/disconnect`,
      { userId }
    );

    return response.ok && response.data?.success === true;
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthorizationUrl(provider: string, userId: string, redirectPath?: string): string {
    let url = `/api/oauth/${provider}/authorize?userId=${encodeURIComponent(userId)}`;
    if (redirectPath) {
      url += `&redirect=${encodeURIComponent(redirectPath)}`;
    }
    return url;
  }

  // ==========================================================================
  // JOBS
  // ==========================================================================

  /**
   * Get job queue stats
   */
  async getJobStats(): Promise<QueueStats | null> {
    const response = await apiGet<{ stats: QueueStats }>(`${this.baseUrl}/jobs/stats`);

    if (!response.ok || !response.data) {
      return null;
    }

    return response.data.stats;
  }

  /**
   * Get job status
   */
  async getJob(jobId: string): Promise<JobStatus | null> {
    const response = await apiGet<{ job: JobStatus }>(`${this.baseUrl}/jobs/${jobId}`);

    if (!response.ok || !response.data) {
      return null;
    }

    return response.data.job;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let serviceInstance: LifeAutomationService | null = null;

export function getLifeAutomationService(): LifeAutomationService {
  if (!serviceInstance) {
    serviceInstance = new LifeAutomationService();
  }
  return serviceInstance;
}

export default getLifeAutomationService;
