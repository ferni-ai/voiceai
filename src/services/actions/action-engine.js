/**
 * Action Engine
 *
 * Two-phase transactional execution engine for life automation actions.
 * Workflow: prepare -> confirm -> execute -> (rollback if needed)
 *
 * @module services/actions/action-engine
 */
import { createLogger } from '../../utils/safe-logger.js';
import { randomUUID } from 'crypto';
import { getActionStore } from './action-store.js';
import { getIntegrationHub } from '../integrations/index.js';
const log = createLogger({ module: 'action-engine' });
// ============================================================================
// ACTION TYPE REGISTRY
// ============================================================================
const actionTypeRegistry = new Map();
/**
 * Register an action type with its executor
 */
export function registerActionType(config) {
    actionTypeRegistry.set(config.type, config);
    log.debug({ type: config.type }, 'Action type registered');
}
/**
 * Get action type configuration
 */
export function getActionTypeConfig(type) {
    return actionTypeRegistry.get(type);
}
// ============================================================================
// ACTION ENGINE CLASS
// ============================================================================
export class ActionEngine {
    store = getActionStore();
    integrationHub = getIntegrationHub();
    // Default expiry times by priority (seconds)
    defaultExpiry = {
        critical: 60, // 1 minute
        high: 180, // 3 minutes
        normal: 300, // 5 minutes
        low: 600, // 10 minutes
    };
    constructor() {
        log.info('Action engine initialized');
    }
    // ==========================================================================
    // PREPARE ACTION
    // ==========================================================================
    /**
     * Prepare an action for user confirmation
     *
     * This is the first phase - validates the action, gets estimates,
     * and stores it pending confirmation.
     */
    async prepareAction(params) {
        const { userId, sessionId, type, payload, priority = 'normal', description, personaId, expirySeconds, } = params;
        // Get action type config
        const typeConfig = actionTypeRegistry.get(type);
        if (!typeConfig) {
            log.warn({ type }, 'Unknown action type');
            return { success: false, error: `Unknown action type: ${type}` };
        }
        // Check required integrations
        if (typeConfig.requiredIntegrations) {
            for (const integrationId of typeConfig.requiredIntegrations) {
                if (!this.integrationHub.isConnected(userId, integrationId)) {
                    return {
                        success: false,
                        error: `Please connect your ${this.integrationHub.get(integrationId)?.name || integrationId} account first`,
                    };
                }
            }
        }
        // Build execution context
        const context = {
            userId,
            sessionId,
            personaId,
        };
        // Run prepare function to validate and enrich payload
        let confirmationMessage = description || typeConfig.description;
        let warnings;
        let estimatedCost;
        let enrichedPayload = payload;
        if (typeConfig.prepare) {
            try {
                const prepareResult = await typeConfig.prepare(payload, context);
                if (!prepareResult.valid) {
                    return { success: false, error: prepareResult.error || 'Action validation failed' };
                }
                confirmationMessage = prepareResult.confirmationMessage;
                warnings = prepareResult.warnings;
                estimatedCost = prepareResult.estimatedCost;
                if (prepareResult.enrichedPayload) {
                    enrichedPayload = prepareResult.enrichedPayload;
                }
            }
            catch (error) {
                log.error({ error: String(error), type }, 'Action prepare failed');
                return { success: false, error: `Failed to prepare action: ${String(error)}` };
            }
        }
        // Calculate expiry
        const expiryTime = expirySeconds ||
            typeConfig.defaultExpirySeconds ||
            this.defaultExpiry[priority];
        const expiresAt = new Date(Date.now() + expiryTime * 1000);
        // Create the action
        const action = {
            id: `act_${randomUUID().replace(/-/g, '')}`,
            userId,
            sessionId,
            type,
            status: 'pending_confirmation',
            priority,
            payload: enrichedPayload,
            description: description || typeConfig.name,
            confirmationMessage,
            preparedAt: new Date(),
            expiresAt,
            personaId,
        };
        // Store the action
        this.store.save(action);
        log.info({ actionId: action.id, userId, type, expiresAt: expiresAt.toISOString() }, 'Action prepared and awaiting confirmation');
        return {
            success: true,
            actionId: action.id,
            confirmationDetails: {
                actionId: action.id,
                type,
                description: action.description,
                confirmationMessage,
                expiresAt,
                estimatedCost,
                warnings,
                canModify: !!typeConfig.prepare,
            },
        };
    }
    // ==========================================================================
    // CONFIRM ACTION
    // ==========================================================================
    /**
     * Confirm a prepared action
     *
     * This is the second phase - user has approved, now execute.
     */
    async confirmAction(actionId, modifiedPayload) {
        const action = this.store.get(actionId);
        if (!action) {
            return { success: false, error: 'Action not found' };
        }
        if (action.status !== 'pending_confirmation') {
            return { success: false, error: `Action is ${action.status}, cannot confirm` };
        }
        if (action.expiresAt < new Date()) {
            this.store.update(actionId, { status: 'expired' });
            return { success: false, error: 'Action has expired. Please start again.' };
        }
        // Apply modifications if provided
        if (modifiedPayload) {
            // Type assertion needed because payload is a union type and TypeScript
            // can't guarantee the spread is safe across different payload types
            action.payload = { ...action.payload, ...modifiedPayload };
        }
        // Update status to confirmed
        this.store.update(actionId, {
            status: 'confirmed',
            confirmedAt: new Date(),
        });
        log.info({ actionId, userId: action.userId, type: action.type }, 'Action confirmed');
        // Execute the action
        return this.executeAction(actionId);
    }
    // ==========================================================================
    // CANCEL ACTION
    // ==========================================================================
    /**
     * Cancel a pending action
     */
    cancelAction(actionId) {
        const action = this.store.get(actionId);
        if (!action) {
            return { success: false, error: 'Action not found' };
        }
        if (!['pending_confirmation', 'confirmed'].includes(action.status)) {
            return { success: false, error: `Cannot cancel action with status: ${action.status}` };
        }
        this.store.update(actionId, {
            status: 'cancelled',
            completedAt: new Date(),
        });
        log.info({ actionId, userId: action.userId, type: action.type }, 'Action cancelled');
        return { success: true };
    }
    // ==========================================================================
    // EXECUTE ACTION
    // ==========================================================================
    /**
     * Execute a confirmed action
     */
    async executeAction(actionId) {
        const action = this.store.get(actionId);
        if (!action) {
            return { success: false, error: 'Action not found' };
        }
        const typeConfig = actionTypeRegistry.get(action.type);
        if (!typeConfig) {
            return { success: false, error: `No executor for action type: ${action.type}` };
        }
        // Update status to executing
        this.store.update(actionId, {
            status: 'executing',
            executionStartedAt: new Date(),
        });
        log.info({ actionId, type: action.type }, 'Executing action');
        // Build execution context
        const context = {
            userId: action.userId,
            sessionId: action.sessionId,
            personaId: action.personaId,
        };
        try {
            // Execute the action
            const result = await typeConfig.executor(action, context);
            // Update based on result
            if (result.success) {
                this.store.update(actionId, {
                    status: 'completed',
                    completedAt: new Date(),
                    result,
                    externalIds: result.externalId
                        ? { ...action.externalIds, primary: result.externalId }
                        : action.externalIds,
                });
                log.info({ actionId, type: action.type, externalId: result.externalId }, 'Action completed successfully');
            }
            else {
                this.store.update(actionId, {
                    status: 'failed',
                    completedAt: new Date(),
                    result,
                    error: result.message,
                });
                log.warn({ actionId, type: action.type, error: result.message }, 'Action execution failed');
            }
            return { success: result.success, result, error: result.message };
        }
        catch (error) {
            const errorMessage = String(error);
            this.store.update(actionId, {
                status: 'failed',
                completedAt: new Date(),
                error: errorMessage,
            });
            log.error({ error: errorMessage, actionId, type: action.type }, 'Action execution error');
            return { success: false, error: errorMessage };
        }
    }
    // ==========================================================================
    // ROLLBACK ACTION
    // ==========================================================================
    /**
     * Attempt to rollback a completed action
     */
    async rollbackAction(actionId) {
        const action = this.store.get(actionId);
        if (!action) {
            return { success: false, error: 'Action not found' };
        }
        if (action.status !== 'completed') {
            return { success: false, error: `Cannot rollback action with status: ${action.status}` };
        }
        const typeConfig = actionTypeRegistry.get(action.type);
        if (!typeConfig?.canRollback || !typeConfig.rollback) {
            return { success: false, error: 'This action type cannot be rolled back' };
        }
        const context = {
            userId: action.userId,
            sessionId: action.sessionId,
            personaId: action.personaId,
        };
        try {
            const result = await typeConfig.rollback(action, context);
            if (result.success) {
                this.store.update(actionId, {
                    status: 'rolled_back',
                });
                log.info({ actionId, type: action.type }, 'Action rolled back');
                return { success: true };
            }
            else {
                log.warn({ actionId, type: action.type, error: result.message }, 'Rollback failed');
                return { success: false, error: result.message };
            }
        }
        catch (error) {
            log.error({ error: String(error), actionId }, 'Rollback error');
            return { success: false, error: String(error) };
        }
    }
    // ==========================================================================
    // QUERY METHODS
    // ==========================================================================
    /**
     * Get an action by ID
     */
    getAction(actionId) {
        return this.store.get(actionId);
    }
    /**
     * Get pending actions for a user
     */
    getPendingActions(userId) {
        return this.store.getPending(userId);
    }
    /**
     * Get all active actions for a user
     */
    getActiveActions(userId) {
        return this.store.getActive(userId);
    }
    /**
     * Get recent completed actions
     */
    getRecentActions(userId, limit = 10) {
        return this.store.getRecentCompleted(userId, limit);
    }
    /**
     * Get action history for audit
     */
    getActionAudit(actionId) {
        return this.store.getAuditLog(actionId);
    }
}
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
let actionEngineInstance = null;
export function getActionEngine() {
    if (!actionEngineInstance) {
        actionEngineInstance = new ActionEngine();
    }
    return actionEngineInstance;
}
export function resetActionEngine() {
    actionEngineInstance = null;
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Format action for voice response
 */
export function formatActionForVoice(action) {
    switch (action.status) {
        case 'pending_confirmation':
            return action.confirmationMessage;
        case 'confirmed':
            return `${action.description} confirmed. Processing now...`;
        case 'executing':
            return `${action.description} is in progress...`;
        case 'completed':
            return `Done! ${action.result?.message || action.description} completed.`;
        case 'failed':
            return `Sorry, ${action.description} failed: ${action.error}`;
        case 'cancelled':
            return `${action.description} has been cancelled.`;
        case 'expired':
            return `${action.description} expired. Would you like to try again?`;
        default:
            return action.description;
    }
}
/**
 * Check if a pending action needs attention
 */
export function actionNeedsAttention(action) {
    if (action.status !== 'pending_confirmation') {
        return false;
    }
    const timeLeft = action.expiresAt.getTime() - Date.now();
    const halfExpiry = (action.expiresAt.getTime() - action.preparedAt.getTime()) / 2;
    return timeLeft < halfExpiry;
}
//# sourceMappingURL=action-engine.js.map