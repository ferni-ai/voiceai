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
import { getLifeAutomationData, saveLifeAutomationData, isFirestoreAvailable, } from './firestore-life-adapter.js';
const log = createLogger({ module: 'workflow-store' });
// In-memory fallback when Firestore is unavailable
const workflowStorage = new Map();
// ============================================================================
// DEFAULT DATA
// ============================================================================
function createDefaultWorkflowData(userId) {
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
export async function getWorkflowData(userId) {
    try {
        // Try Firestore first
        if (isFirestoreAvailable()) {
            const firestoreData = await getLifeAutomationData(userId, 'workflows');
            if (firestoreData) {
                return {
                    ...createDefaultWorkflowData(userId),
                    ...firestoreData,
                    lastUpdated: typeof firestoreData.lastUpdated === 'string'
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
            lastUpdated: typeof data.lastUpdated === 'string'
                ? new Date(data.lastUpdated)
                : data.lastUpdated || new Date(),
        };
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get workflow data');
        return createDefaultWorkflowData(userId);
    }
}
/**
 * Save workflow data for a user
 * Saves to Firestore if available, always saves to in-memory as fallback
 */
export async function saveWorkflowData(userId, data) {
    try {
        const existing = await getWorkflowData(userId);
        const updated = {
            ...existing,
            ...data,
            lastUpdated: new Date(),
        };
        // Prune old executions
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - updated.settings.executionHistoryDays);
        updated.executions = updated.executions.filter((e) => new Date(e.startedAt) >= cutoffDate);
        // Always save to in-memory for fast access
        workflowStorage.set(userId, updated);
        // Save to Firestore if available
        if (isFirestoreAvailable()) {
            const firestoreData = {
                ...updated,
                lastUpdated: updated.lastUpdated.toISOString(),
            };
            const result = await saveLifeAutomationData(userId, 'workflows', firestoreData);
            if (!result.success) {
                log.warn({ userId, error: result.error }, 'Failed to save to Firestore, data in memory only');
            }
        }
        log.debug({ userId }, 'Workflow data saved');
    }
    catch (error) {
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
export async function createWorkflow(userId, workflow) {
    const data = await getWorkflowData(userId);
    const now = new Date().toISOString();
    const newWorkflow = {
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
export async function updateWorkflow(userId, workflowId, updates) {
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
export async function deleteWorkflow(userId, workflowId) {
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
export async function setWorkflowStatus(userId, workflowId, status) {
    return updateWorkflow(userId, workflowId, { status });
}
// ============================================================================
// QUERIES
// ============================================================================
/**
 * Get workflow by ID
 */
export async function getWorkflow(userId, workflowId) {
    const data = await getWorkflowData(userId);
    return data.workflows.find((w) => w.id === workflowId) || null;
}
/**
 * Get active workflows
 */
export async function getActiveWorkflows(userId) {
    const data = await getWorkflowData(userId);
    return data.workflows.filter((w) => w.status === 'active');
}
/**
 * Get workflows by trigger type
 */
export async function getWorkflowsByTriggerType(userId, triggerType) {
    const data = await getWorkflowData(userId);
    return data.workflows.filter((w) => w.status === 'active' && w.trigger.type === triggerType);
}
/**
 * Get workflows matching a phrase
 */
export async function getWorkflowsForPhrase(userId, phrase) {
    const data = await getWorkflowData(userId);
    const lowerPhrase = phrase.toLowerCase();
    return data.workflows.filter((w) => {
        if (w.status !== 'active' || w.trigger.type !== 'phrase')
            return false;
        const trigger = w.trigger;
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
export async function getDueScheduledWorkflows(userId) {
    const data = await getWorkflowData(userId);
    // This is a simplified check - real implementation would parse cron
    return data.workflows.filter((w) => w.status === 'active' && w.trigger.type === 'time');
}
// ============================================================================
// EXECUTIONS
// ============================================================================
/**
 * Record workflow execution start
 */
export async function startExecution(userId, workflowId, triggeredBy) {
    const data = await getWorkflowData(userId);
    const workflow = data.workflows.find((w) => w.id === workflowId);
    if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
    }
    const execution = {
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
export async function updateExecutionAction(userId, executionId, actionId, result) {
    const data = await getWorkflowData(userId);
    const execution = data.executions.find((e) => e.id === executionId);
    if (!execution)
        return;
    const actionResult = execution.actionResults.find((a) => a.actionId === actionId);
    if (actionResult) {
        Object.assign(actionResult, result);
    }
    await saveWorkflowData(userId, data);
}
/**
 * Complete workflow execution
 */
export async function completeExecution(userId, executionId, status, error) {
    const data = await getWorkflowData(userId);
    const execution = data.executions.find((e) => e.id === executionId);
    if (!execution)
        return;
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
export async function failExecution(userId, executionId, error) {
    return completeExecution(userId, executionId, 'failed', error);
}
/**
 * Get execution history for a workflow
 */
export async function getExecutionHistory(userId, workflowId, limit = 10) {
    const data = await getWorkflowData(userId);
    return data.executions
        .filter((e) => e.workflowId === workflowId)
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .slice(0, limit);
}
/**
 * Get recent executions for a user
 */
export async function getRecentExecutions(userId, limit = 20) {
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
export async function createFromTemplate(userId, template, customizations) {
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
export async function migrateUserToFirestore(userId) {
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
        lastUpdated: inMemoryData.lastUpdated instanceof Date
            ? inMemoryData.lastUpdated.toISOString()
            : inMemoryData.lastUpdated,
    };
    const result = await saveLifeAutomationData(userId, 'workflows', firestoreData);
    if (result.success) {
        log.info({ userId }, 'Successfully migrated workflow data to Firestore');
    }
    return result.success;
}
//# sourceMappingURL=workflow-store.js.map