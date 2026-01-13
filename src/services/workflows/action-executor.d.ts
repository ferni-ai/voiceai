/**
 * Workflow Action Executor
 *
 * Executes workflow actions by calling real services.
 * This is the SINGLE source of truth for action execution.
 * Used by both:
 *   - life-automation-routes.ts (API-triggered runs)
 *   - workflow-engine.ts (time-based triggers)
 *
 * @module services/workflows/action-executor
 */
import type { WorkflowAction } from '../stores/workflow-store.js';
export interface ExecutionContext {
    userId: string;
    workflowId?: string;
    executionId?: string;
    variables: Record<string, unknown>;
}
export interface ExecutionResult {
    success: boolean;
    output?: unknown;
    error?: string;
}
/**
 * Execute a single workflow action
 * This is the REAL implementation that calls actual services.
 */
export declare function executeAction(action: WorkflowAction, context: ExecutionContext): Promise<ExecutionResult>;
export default executeAction;
//# sourceMappingURL=action-executor.d.ts.map