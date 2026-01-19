/**
 * Reliability Services Interfaces
 *
 * DI interfaces for the function calling reliability system.
 * These interfaces enable testability and explicit dependency management.
 *
 * Services:
 * - ISessionHealthMonitor: Tracks session health and function calling decay
 * - IParallelToolExecutor: Executes critical tools with parallel fallback
 * - IContextPruner: Prunes conversation context to improve LLM reliability
 *
 * @module agents/shared/interfaces/reliability-services
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Session health state
 */
export interface SessionHealth {
  /** Total turn count in this session */
  turnCount: number;
  /** Turn number of last successful tool call */
  lastToolCallTurn: number;
  /** Count of consecutive tool call leakages */
  consecutiveLeakages: number;
  /** Total successful tool calls */
  totalToolCalls: number;
  /** Total tool call leakages */
  totalLeakages: number;
  /** Whether the session should be refreshed */
  shouldRefresh: boolean;
  /** Reason for refresh recommendation */
  refreshReason: string | null;
  /** Timestamp of last health check */
  lastCheckTime: number;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  /** Whether the tool execution succeeded */
  success: boolean;
  /** Result data if successful */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** Which attempt produced this result (1-indexed) */
  attempt?: number;
  /** Execution time in milliseconds */
  durationMs?: number;
}

/**
 * Tool executor function type
 */
export type ToolExecutor = (args: Record<string, unknown>) => Promise<ToolResult>;

/**
 * Conversation turn for pruning
 */
export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  /** Index in original conversation */
  index: number;
  /** Whether this is a priming turn */
  isPriming?: boolean;
  /** Whether this turn contains a successful tool call */
  hasToolCall?: boolean;
  /** Timestamp of the turn */
  timestamp?: number;
}

/**
 * Context pruning configuration
 */
export interface ContextPruningConfig {
  /** Maximum turns to keep (including priming) */
  maxTurns: number;
  /** Always keep last N user/assistant turns */
  minRecentTurns: number;
  /** Whether to preserve turns with successful tool calls */
  preserveToolCalls: boolean;
  /** Token limit to trigger pruning (approximate) */
  tokenThreshold: number;
  /** Whether pruning is enabled */
  enabled: boolean;
}

/**
 * Pruning result
 */
export interface PruningResult {
  /** Turns to keep */
  keptTurns: ConversationTurn[];
  /** Turns that were pruned */
  prunedTurns: ConversationTurn[];
  /** Whether pruning was applied */
  wasApplied: boolean;
  /** Reason for pruning */
  reason: string | null;
  /** Estimated tokens before pruning */
  estimatedTokensBefore: number;
  /** Estimated tokens after pruning */
  estimatedTokensAfter: number;
}

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Session Health Monitor Interface
 *
 * Tracks session health to detect and combat function calling degradation.
 * Monitors tool call success/failure patterns and triggers context refresh
 * when health degrades.
 */
export interface ISessionHealthMonitor {
  /**
   * Initialize health monitoring for a session.
   * @param sessionId - Unique session identifier
   * @param refreshCallback - Optional callback to execute when refresh is needed
   */
  initialize(sessionId: string, refreshCallback?: () => Promise<void>): void;

  /**
   * Record a new conversation turn.
   * @param sessionId - Session identifier
   */
  recordTurn(sessionId: string): void;

  /**
   * Record a successful tool call.
   * @param sessionId - Session identifier
   */
  recordToolCallSuccess(sessionId: string): void;

  /**
   * Record a tool call leakage (model spoke instead of calling tool).
   * @param sessionId - Session identifier
   * @param toolName - Name of the tool that should have been called
   */
  recordToolCallLeakage(sessionId: string, toolName?: string): void;

  /**
   * Get current health status for a session.
   * @param sessionId - Session identifier
   * @returns Current health state or null if not tracked
   */
  getHealth(sessionId: string): SessionHealth | null;

  /**
   * Clear health monitoring for a session (cleanup on session end).
   * @param sessionId - Session identifier
   */
  clear(sessionId: string): void;
}

/**
 * Parallel Tool Executor Interface
 *
 * Executes high-stakes tools with parallel attempt strategy.
 * For critical tools (handoffs, crisis, phone calls), runs multiple
 * attempts in parallel and uses the first valid result.
 */
export interface IParallelToolExecutor {
  /**
   * Execute a tool with optional parallel fallback.
   * @param toolId - Tool identifier
   * @param args - Arguments to pass to the tool
   * @param executor - Function that executes the tool
   * @returns Tool result
   */
  execute(
    toolId: string,
    args: Record<string, unknown>,
    executor: ToolExecutor
  ): Promise<ToolResult>;

  /**
   * Check if a tool should use parallel execution strategy.
   * @param toolId - Tool identifier
   * @returns Whether the tool is considered critical
   */
  isCritical(toolId: string): boolean;
}

/**
 * Context Pruner Interface
 *
 * Prunes conversation context to improve LLM reliability.
 * Research shows that large context degrades function calling.
 * Preserves priming turns and recent context while removing middle content.
 */
export interface IContextPruner {
  /**
   * Check if pruning is recommended based on current context.
   * @param turns - Current conversation history
   * @param config - Optional pruning configuration
   * @returns Whether pruning should be applied and reason
   */
  shouldPrune(
    turns: ConversationTurn[],
    config?: Partial<ContextPruningConfig>
  ): { shouldPrune: boolean; reason: string };

  /**
   * Prune conversation context.
   * @param turns - Current conversation history
   * @param config - Optional pruning configuration
   * @returns Pruning result with kept and pruned turns
   */
  prune(
    turns: ConversationTurn[],
    config?: Partial<ContextPruningConfig>
  ): PruningResult;
}
