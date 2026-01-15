/**
 * Workflow Data Store
 *
 * Persistent storage for automated workflows:
 * - Custom automations (IFTTT-style)
 * - Trigger definitions
 * - Action sequences
 * - Execution history
 *
 * Storage: Firestore (primary) with in-memory fallback
 * Document: /users/{userId}/life_automation/workflows
 *
 * @module services/stores/workflow-store
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getLifeAutomationData,
  saveLifeAutomationData,
  isFirestoreAvailable,
} from './firestore-life-adapter.js';

const log = createLogger({ module: 'workflow-store' });

// In-memory fallback when Firestore is unavailable
const workflowStorage: Map<string, WorkflowData> = new Map();

// ============================================================================
// TYPES
// ============================================================================

export type TriggerType =
  | 'time' // Scheduled (cron)
  | 'phrase' // Voice phrase detected
  | 'event' // System event
  | 'location' // Geofence
  | 'calendar' // Calendar event start/end
  | 'device' // Smart home device state
  | 'webhook'; // External webhook

export type WorkflowStatus = 'active' | 'paused' | 'disabled' | 'error';

export interface TimeTrigger {
  type: 'time';
  schedule: string; // cron expression
  timezone?: string;
}

export interface PhraseTrigger {
  type: 'phrase';
  phrases: string[]; // Multiple trigger phrases
  requireExactMatch: boolean;
}

export interface EventTrigger {
  type: 'event';
  eventName: string; // e.g., 'task_completed', 'habit_logged', 'call_ended'
  conditions?: Record<string, unknown>;
}

export interface LocationTrigger {
  type: 'location';
  locationName?: string;
  latitude?: number;
  longitude?: number;
  radiusMeters: number;
  triggerOn: 'enter' | 'exit' | 'both';
}

export interface CalendarTrigger {
  type: 'calendar';
  triggerOn: 'event_start' | 'event_end' | 'event_reminder';
  calendarId?: string;
  eventFilter?: {
    titleContains?: string;
    isAllDay?: boolean;
  };
  offsetMinutes?: number; // e.g., -15 for 15 min before
}

export interface DeviceTrigger {
  type: 'device';
  deviceId: string;
  deviceType: string;
  condition: {
    property: string;
    operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'changes_to';
    value: unknown;
  };
}

export interface WebhookTrigger {
  type: 'webhook';
  webhookId: string;
  secretKey: string;
}

export type WorkflowTrigger =
  | TimeTrigger
  | PhraseTrigger
  | EventTrigger
  | LocationTrigger
  | CalendarTrigger
  | DeviceTrigger
  | WebhookTrigger;

export type ActionType =
  | 'send_text'
  | 'send_email'
  | 'add_task'
  | 'complete_task'
  | 'add_reminder'
  | 'play_music'
  | 'set_thermostat'
  | 'control_lights'
  | 'lock_doors'
  | 'request_ride'
  | 'order_groceries'
  | 'log_habit'
  | 'send_notification'
  | 'speak_message'
  | 'set_variable'
  | 'wait'
  | 'condition'
  | 'webhook'
  | 'custom';

export interface WorkflowAction {
  id: string;
  type: ActionType;
  name: string;
  params: Record<string, unknown>;
  // For conditional actions
  condition?: {
    variable: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'is_set';
    value?: unknown;
    thenActions?: string[]; // Action IDs
    elseActions?: string[]; // Action IDs
  };
  // For wait actions
  waitSeconds?: number;
  // Error handling
  onError?: 'continue' | 'stop' | 'retry';
  maxRetries?: number;
}

export interface WorkflowCondition {
  variable: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'is_set';
  value?: unknown;
}

export interface Workflow {
  id: string;
  userId: string;
  name: string;
  description?: string;
  status: WorkflowStatus;

  // Trigger
  trigger: WorkflowTrigger;

  // Conditions (all must be true)
  conditions: WorkflowCondition[];

  // Actions (executed in order)
  actions: WorkflowAction[];

  // Variables (persisted between runs)
  variables: Record<string, unknown>;

  // Metadata
  category?: string;
  tags: string[];
  icon?: string;
  color?: string;

  // Stats
  runCount: number;
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'partial' | 'failed';
  lastError?: string;

  // Template
  isTemplate: boolean;
  templateId?: string; // If created from template

  // Audit
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  userId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  triggeredBy: string; // Trigger description
  startedAt: string;
  completedAt?: string;

  // Action execution log
  actionResults: Array<{
    actionId: string;
    actionName: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startedAt?: string;
    completedAt?: string;
    result?: unknown;
    error?: string;
  }>;

  // Variables at execution time
  variables: Record<string, unknown>;

  error?: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  tags: string[];
  icon?: string;
  popularity: number;
  createdAt: string;
}

export interface WorkflowData {
  userId: string;
  lastUpdated: Date | string;
  workflows: Workflow[];
  executions: WorkflowExecution[];
  settings: {
    maxConcurrentWorkflows: number;
    executionHistoryDays: number;
    defaultTimezone: string;
  };
}

// ============================================================================
// DEFAULT DATA
// ============================================================================

function createDefaultWorkflowData(userId: string): WorkflowData {
  return {
    userId,
    lastUpdated: new Date(),
    workflows: [],
    executions: [],
    settings: {
      maxConcurrentWorkflows: 5,
      executionHistoryDays: 30,
      defaultTimezone: 'America/New_York',
    },
  };
}

// ============================================================================
// STORE OPERATIONS
// ============================================================================

/**
 * Get workflow data for a user
 * Uses Firestore if available, falls back to in-memory
 */
export async function getWorkflowData(userId: string): Promise<WorkflowData> {
  try {
    // Try Firestore first
    if (isFirestoreAvailable()) {
      const firestoreData = await getLifeAutomationData<WorkflowData>(userId, 'workflows');
      if (firestoreData) {
        return {
          ...createDefaultWorkflowData(userId),
          ...firestoreData,
          lastUpdated:
            typeof firestoreData.lastUpdated === 'string'
              ? new Date(firestoreData.lastUpdated)
              : firestoreData.lastUpdated || new Date(),
        };
      }
    }

    // Fall back to in-memory
    const data = workflowStorage.get(userId);
    if (!data) {
      return createDefaultWorkflowData(userId);
    }
    return {
      ...createDefaultWorkflowData(userId),
      ...data,
      lastUpdated:
        typeof data.lastUpdated === 'string'
          ? new Date(data.lastUpdated)
          : data.lastUpdated || new Date(),
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get workflow data');
    return createDefaultWorkflowData(userId);
  }
}

/**
 * Save workflow data for a user
 * Saves to Firestore if available, always saves to in-memory as fallback
 */
export async function saveWorkflowData(userId: string, data: Partial<WorkflowData>): Promise<void> {
  try {
    const existing = await getWorkflowData(userId);
    const updated: WorkflowData = {
      ...existing,
      ...data,
      lastUpdated: new Date(),
    };

    // Prune old executions
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - updated.settings.executionHistoryDays);
    updated.executions = updated.executions.filter(
      (e) => new Date(e.startedAt) >= cutoffDate
    );

    // Always save to in-memory for fast access
    workflowStorage.set(userId, updated);

    // Save to Firestore if available
    if (isFirestoreAvailable()) {
      const firestoreData = {
        ...updated,
        lastUpdated: (updated.lastUpdated as Date).toISOString(),
      };
      const result = await saveLifeAutomationData(userId, 'workflows', firestoreData);
      if (!result.success) {
        log.warn({ userId, error: result.error }, 'Failed to save to Firestore, data in memory only');
      }
    }

    log.debug({ userId }, 'Workflow data saved');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to save workflow data');
    throw error;
  }
}

// ============================================================================
// WORKFLOW CRUD
// ============================================================================

/**
 * Create a new workflow
 */
export async function createWorkflow(
  userId: string,
  workflow: Omit<Workflow, 'id' | 'userId' | 'runCount' | 'createdAt' | 'updatedAt' | 'status'> & { status?: WorkflowStatus }
): Promise<Workflow> {
  const data = await getWorkflowData(userId);
  const now = new Date().toISOString();

  const newWorkflow: Workflow = {
    ...workflow,
    id: `wf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    userId,
    status: workflow.status || 'paused', // Default to paused
    runCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  data.workflows.push(newWorkflow);
  await saveWorkflowData(userId, data);

  log.info({ userId, workflowId: newWorkflow.id, name: newWorkflow.name }, 'Workflow created');
  return newWorkflow;
}

/**
 * Update a workflow
 */
export async function updateWorkflow(
  userId: string,
  workflowId: string,
  updates: Partial<Workflow>
): Promise<Workflow | null> {
  const data = await getWorkflowData(userId);
  const index = data.workflows.findIndex((w) => w.id === workflowId);

  if (index === -1) {
    return null;
  }

  data.workflows[index] = {
    ...data.workflows[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await saveWorkflowData(userId, data);
  return data.workflows[index];
}

/**
 * Delete a workflow
 */
export async function deleteWorkflow(userId: string, workflowId: string): Promise<boolean> {
  const data = await getWorkflowData(userId);
  const index = data.workflows.findIndex((w) => w.id === workflowId);

  if (index === -1) {
    return false;
  }

  data.workflows.splice(index, 1);
  await saveWorkflowData(userId, data);
  return true;
}

/**
 * Enable/disable a workflow
 */
export async function setWorkflowStatus(
  userId: string,
  workflowId: string,
  status: WorkflowStatus
): Promise<Workflow | null> {
  return updateWorkflow(userId, workflowId, { status });
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get workflow by ID
 */
export async function getWorkflow(userId: string, workflowId: string): Promise<Workflow | null> {
  const data = await getWorkflowData(userId);
  return data.workflows.find((w) => w.id === workflowId) || null;
}

/**
 * Get active workflows
 */
export async function getActiveWorkflows(userId: string): Promise<Workflow[]> {
  const data = await getWorkflowData(userId);
  return data.workflows.filter((w) => w.status === 'active');
}

/**
 * Get workflows by trigger type
 */
export async function getWorkflowsByTriggerType(
  userId: string,
  triggerType: TriggerType
): Promise<Workflow[]> {
  const data = await getWorkflowData(userId);
  return data.workflows.filter(
    (w) => w.status === 'active' && w.trigger.type === triggerType
  );
}

/**
 * Get workflows matching a phrase
 */
export async function getWorkflowsForPhrase(userId: string, phrase: string): Promise<Workflow[]> {
  const data = await getWorkflowData(userId);
  const lowerPhrase = phrase.toLowerCase();

  return data.workflows.filter((w) => {
    if (w.status !== 'active' || w.trigger.type !== 'phrase') return false;
    const trigger = w.trigger as PhraseTrigger;

    return trigger.phrases.some((p) => {
      if (trigger.requireExactMatch) {
        return p.toLowerCase() === lowerPhrase;
      }
      return lowerPhrase.includes(p.toLowerCase());
    });
  });
}

/**
 * Get scheduled workflows due for execution
 */
export async function getDueScheduledWorkflows(userId: string): Promise<Workflow[]> {
  const data = await getWorkflowData(userId);

  // This is a simplified check - real implementation would parse cron
  return data.workflows.filter(
    (w) => w.status === 'active' && w.trigger.type === 'time'
  );
}

// ============================================================================
// EXECUTIONS
// ============================================================================

/**
 * Record workflow execution start
 */
export async function startExecution(
  userId: string,
  workflowId: string,
  triggeredBy: string
): Promise<WorkflowExecution> {
  const data = await getWorkflowData(userId);
  const workflow = data.workflows.find((w) => w.id === workflowId);

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  const execution: WorkflowExecution = {
    id: `exec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    workflowId,
    userId,
    status: 'running',
    triggeredBy,
    startedAt: new Date().toISOString(),
    actionResults: workflow.actions.map((a) => ({
      actionId: a.id,
      actionName: a.name,
      status: 'pending',
    })),
    variables: { ...workflow.variables },
  };

  data.executions.push(execution);

  // Update workflow stats
  workflow.runCount++;
  workflow.lastRunAt = execution.startedAt;

  await saveWorkflowData(userId, data);
  return execution;
}

/**
 * Update execution action result
 */
export async function updateExecutionAction(
  userId: string,
  executionId: string,
  actionId: string,
  result: Partial<WorkflowExecution['actionResults'][0]>
): Promise<void> {
  const data = await getWorkflowData(userId);
  const execution = data.executions.find((e) => e.id === executionId);

  if (!execution) return;

  const actionResult = execution.actionResults.find((a) => a.actionId === actionId);
  if (actionResult) {
    Object.assign(actionResult, result);
  }

  await saveWorkflowData(userId, data);
}

/**
 * Complete workflow execution
 */
export async function completeExecution(
  userId: string,
  executionId: string,
  status: 'completed' | 'failed' | 'cancelled',
  error?: string
): Promise<void> {
  const data = await getWorkflowData(userId);
  const execution = data.executions.find((e) => e.id === executionId);

  if (!execution) return;

  execution.status = status;
  execution.completedAt = new Date().toISOString();
  execution.error = error;

  // Update workflow last run status
  const workflow = data.workflows.find((w) => w.id === execution.workflowId);
  if (workflow) {
    workflow.lastRunStatus = status === 'completed' ? 'success' : 'failed';
    workflow.lastError = error;
  }

  await saveWorkflowData(userId, data);
}

/**
 * Fail workflow execution (convenience wrapper)
 */
export async function failExecution(
  userId: string,
  executionId: string,
  error: string
): Promise<void> {
  return completeExecution(userId, executionId, 'failed', error);
}

/**
 * Get execution history for a workflow
 */
export async function getExecutionHistory(
  userId: string,
  workflowId: string,
  limit: number = 10
): Promise<WorkflowExecution[]> {
  const data = await getWorkflowData(userId);

  return data.executions
    .filter((e) => e.workflowId === workflowId)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, limit);
}

/**
 * Get recent executions for a user
 */
export async function getRecentExecutions(
  userId: string,
  limit: number = 20
): Promise<WorkflowExecution[]> {
  const data = await getWorkflowData(userId);

  return data.executions
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, limit);
}

// ============================================================================
// TEMPLATES
// ============================================================================

/**
 * Create workflow from template
 */
export async function createFromTemplate(
  userId: string,
  template: WorkflowTemplate,
  customizations?: Partial<Workflow>
): Promise<Workflow> {
  return createWorkflow(userId, {
    name: template.name,
    description: template.description,
    status: 'paused', // Start paused so user can configure
    trigger: template.trigger,
    conditions: template.conditions,
    actions: template.actions.map((a) => ({
      ...a,
      id: `action_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    })),
    variables: {},
    category: template.category,
    tags: template.tags,
    icon: template.icon,
    isTemplate: false,
    templateId: template.id,
    ...customizations,
  });
}

// ============================================================================
// MIGRATION HELPER
// ============================================================================

/**
 * Migrate in-memory data to Firestore (for existing users)
 */
export async function migrateUserToFirestore(userId: string): Promise<boolean> {
  const inMemoryData = workflowStorage.get(userId);
  if (!inMemoryData) {
    return false;
  }

  if (!isFirestoreAvailable()) {
    log.warn({ userId }, 'Cannot migrate: Firestore unavailable');
    return false;
  }

  const firestoreData = {
    ...inMemoryData,
    lastUpdated:
      inMemoryData.lastUpdated instanceof Date
        ? inMemoryData.lastUpdated.toISOString()
        : inMemoryData.lastUpdated,
  };

  const result = await saveLifeAutomationData(userId, 'workflows', firestoreData);
  if (result.success) {
    log.info({ userId }, 'Successfully migrated workflow data to Firestore');
  }

  return result.success;
}
