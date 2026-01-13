/**
 * Tool Execution Wrapper
 *
 * Wraps tool execution with:
 * - Input validation
 * - High-stakes confirmation handling
 * - Standardized response formatting
 * - Error handling and recovery
 * - Analytics and logging
 *
 * @see https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling
 */
import type { ToolContext, ToolDefinition } from '../registry/types.js';
import { type ToolResponse } from './tool-response.js';
/**
 * Pending confirmation store
 */
interface PendingConfirmation {
    toolId: string;
    params: Record<string, unknown>;
    description: string;
    createdAt: number;
    ttlMs: number;
    userId: string;
    sessionId: string;
}
/**
 * Wrapper options
 */
export interface ExecutionWrapperOptions {
    /** Enable confirmation for high-stakes tools */
    enableConfirmation?: boolean;
    /** Enable input validation */
    enableValidation?: boolean;
    /** Enable analytics/logging */
    enableAnalytics?: boolean;
    /** Custom validation function */
    customValidator?: (toolId: string, params: Record<string, unknown>) => {
        valid: boolean;
        error?: string;
    };
    /** Timeout for tool execution (ms) */
    timeoutMs?: number;
    /** Whether to convert legacy responses to ToolResponse format */
    convertLegacyResponses?: boolean;
}
/**
 * Store a pending confirmation
 */
export declare function storePendingConfirmation(userId: string, sessionId: string, toolId: string, params: Record<string, unknown>, description: string, ttlMs?: number): void;
/**
 * Get and clear a pending confirmation
 */
export declare function getPendingConfirmation(userId: string, sessionId: string, toolId: string): PendingConfirmation | null;
/**
 * Clear a pending confirmation
 */
export declare function clearPendingConfirmation(userId: string, sessionId: string, toolId: string): void;
/**
 * Check if there's a pending confirmation for a tool
 */
export declare function hasPendingConfirmation(userId: string, sessionId: string, toolId: string): boolean;
/**
 * Process a confirmation response from user
 */
export declare function processConfirmation(userId: string, sessionId: string, toolId: string, confirmed: boolean, executeTool: (params: Record<string, unknown>) => Promise<unknown>): Promise<ToolResponse>;
/**
 * Create a wrapped tool executor with validation, confirmation, and standardized responses
 */
export declare function wrapToolExecution(toolId: string, originalExecute: (params: Record<string, unknown>, context?: {
    ctx: ToolContext;
}) => Promise<unknown>, ctx: ToolContext, options?: ExecutionWrapperOptions): (params: Record<string, unknown>, context?: {
    ctx: ToolContext;
}) => Promise<string>;
/**
 * Wrap a tool definition to use the execution wrapper
 */
export declare function wrapToolDefinition(definition: ToolDefinition, options?: ExecutionWrapperOptions): ToolDefinition;
/**
 * Detect if user input is confirming or denying a pending action
 */
export declare function detectConfirmationIntent(userInput: string): 'confirm' | 'deny' | 'unclear';
declare const _default: {
    wrapToolExecution: typeof wrapToolExecution;
    wrapToolDefinition: typeof wrapToolDefinition;
    storePendingConfirmation: typeof storePendingConfirmation;
    getPendingConfirmation: typeof getPendingConfirmation;
    clearPendingConfirmation: typeof clearPendingConfirmation;
    hasPendingConfirmation: typeof hasPendingConfirmation;
    processConfirmation: typeof processConfirmation;
    detectConfirmationIntent: typeof detectConfirmationIntent;
};
export default _default;
//# sourceMappingURL=tool-execution-wrapper.d.ts.map