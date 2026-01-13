/**
 * Coordinated Tool Executor
 *
 * Wraps tool execution with intelligent speech coordination to prevent
 * overlap and ensure natural, human-like responses.
 *
 * REPLACES the ad-hoc approach in tool-call-sanitizer.ts with:
 * 1. SpeechCoordinator for priority-based queuing
 * 2. Adaptive timing for acknowledgments
 * 3. Persona-aware acknowledgment generation
 * 4. Clean state management via state machine
 *
 * @module speech/coordination/coordinated-tool-executor
 */
/** Tool execution request */
export interface ToolExecutionRequest {
    /** Tool ID/name */
    toolId: string;
    /** Tool arguments */
    args: Record<string, unknown>;
    /** Active persona ID */
    personaId: string;
    /** User ID (for preference learning) */
    userId?: string;
    /** Session for speaking results */
    session?: unknown;
    /** Estimated execution time (ms) */
    estimatedDurationMs?: number;
}
/** Tool execution result */
export interface ToolExecutionResult {
    success: boolean;
    result?: unknown;
    speakDirectly?: boolean;
    error?: string;
}
/** Tool executor function type */
export type ToolExecutor = (args: Record<string, unknown>) => Promise<ToolExecutionResult>;
interface ToolTimingStats {
    avgDurationMs: number;
    sampleCount: number;
    p95DurationMs: number;
    lastUpdated: number;
}
/**
 * Get estimated duration for a tool (learned or initial)
 */
export declare function getEstimatedDuration(toolId: string): number;
/**
 * Record actual tool execution time for learning
 */
export declare function recordToolDuration(toolId: string, durationMs: number): void;
/**
 * Execute a tool with intelligent speech coordination.
 * Handles acknowledgments, result speaking, and overlap prevention.
 */
export declare function executeToolWithCoordination(request: ToolExecutionRequest, executor: ToolExecutor): Promise<ToolExecutionResult>;
/**
 * Determine if a tool is "slow" (needs acknowledgment).
 * INTELLIGENT: Based on learned timing, not hardcoded list.
 */
export declare function isSlowTool(toolId: string): boolean;
/**
 * Get tool timing stats for debugging
 */
export declare function getToolTimingStats(): Map<string, ToolTimingStats>;
export {};
//# sourceMappingURL=coordinated-tool-executor.d.ts.map