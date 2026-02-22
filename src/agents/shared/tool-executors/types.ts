/**
 * Types for Tool Executors
 *
 * Shared types used across all domain-specific tool executors.
 *
 * @module agents/shared/tool-executors/types
 */

/** Context for tool execution */
export interface ToolExecutionContext {
  userId?: string;
  sessionId?: string;
  personaId?: string;
  /** User's IP-detected location (for weather, local content) */
  userLocation?: {
    city?: string;
    regionCode?: string;
    countryCode?: string;
  };
  /** Callback when a tool starts executing */
  onToolStart?: (fn: string, args: Record<string, unknown>) => void;
  /** Callback when a tool finishes */
  onToolComplete?: (result: ToolExecutionResult) => void;
  /** Callback for handoff requests */
  onHandoff?: (target: string, reason: string) => Promise<void>;
}

/** Result of tool execution */
export interface ToolExecutionResult {
  success: boolean;
  fn: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  durationMs: number;
}

/**
 * Handler function signature for domain executors.
 * Returns the result if handled, or null if this executor doesn't handle the tool.
 */
export type ToolHandler = (
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
) => Promise<unknown | null>;

/**
 * Domain executor interface.
 * Each domain exports a handler that returns null if the tool isn't handled.
 */
export interface DomainExecutor {
  /** Unique domain name for logging */
  domain: string;
  /** List of tool names this domain handles (lowercase) */
  handles: readonly string[];
  /** Execute the tool - returns null if not handled */
  execute: ToolHandler;
}
