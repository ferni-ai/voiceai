/**
 * Action Engine
 *
 * Two-phase transactional execution engine for life automation actions.
 * Workflow: prepare -> confirm -> execute -> (rollback if needed)
 *
 * @module services/actions/action-engine
 */
import type { Action, ActionPayload, ActionType, ActionResult, ActionTypeConfig, ActionConfirmationDetails, ActionPriority } from './action-types.js';
/**
 * Register an action type with its executor
 */
export declare function registerActionType(config: ActionTypeConfig): void;
/**
 * Get action type configuration
 */
export declare function getActionTypeConfig(type: ActionType): ActionTypeConfig | undefined;
export declare class ActionEngine {
    private store;
    private integrationHub;
    private readonly defaultExpiry;
    constructor();
    /**
     * Prepare an action for user confirmation
     *
     * This is the first phase - validates the action, gets estimates,
     * and stores it pending confirmation.
     */
    prepareAction<T extends ActionPayload>(params: {
        userId: string;
        sessionId?: string;
        type: ActionType;
        payload: T;
        priority?: ActionPriority;
        description?: string;
        personaId?: string;
        expirySeconds?: number;
    }): Promise<{
        success: boolean;
        actionId?: string;
        confirmationDetails?: ActionConfirmationDetails;
        error?: string;
    }>;
    /**
     * Confirm a prepared action
     *
     * This is the second phase - user has approved, now execute.
     */
    confirmAction(actionId: string, modifiedPayload?: Partial<ActionPayload>): Promise<{
        success: boolean;
        result?: ActionResult;
        error?: string;
    }>;
    /**
     * Cancel a pending action
     */
    cancelAction(actionId: string): {
        success: boolean;
        error?: string;
    };
    /**
     * Execute a confirmed action
     */
    private executeAction;
    /**
     * Attempt to rollback a completed action
     */
    rollbackAction(actionId: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Get an action by ID
     */
    getAction(actionId: string): Action | undefined;
    /**
     * Get pending actions for a user
     */
    getPendingActions(userId: string): Action[];
    /**
     * Get all active actions for a user
     */
    getActiveActions(userId: string): Action[];
    /**
     * Get recent completed actions
     */
    getRecentActions(userId: string, limit?: number): Action[];
    /**
     * Get action history for audit
     */
    getActionAudit(actionId: string): import("./action-types.js").ActionAuditEntry[];
}
export declare function getActionEngine(): ActionEngine;
export declare function resetActionEngine(): void;
/**
 * Format action for voice response
 */
export declare function formatActionForVoice(action: Action): string;
/**
 * Check if a pending action needs attention
 */
export declare function actionNeedsAttention(action: Action): boolean;
//# sourceMappingURL=action-engine.d.ts.map