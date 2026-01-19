/**
 * Tool Executor Interface
 *
 * Abstract interface for tool execution.
 * Enables different execution strategies (direct, sandboxed, remote).
 *
 * @module tools/interfaces/tool-executor.interface
 */

import type { IToolContext, IToolExecuteParams } from './tool-definition.interface.js';
import type { IToolResult } from './tool-result.interface.js';

/**
 * Interface for tool executors.
 * Implementations handle the actual execution of tools.
 */
export interface IToolExecutor {
  /**
   * Execute a tool by ID with given arguments.
   * @returns Result or null if tool not handled by this executor
   */
  execute(params: IToolExecuteParams): Promise<IToolResult | null>;

  /**
   * Check if this executor can handle a specific tool.
   */
  canHandle(toolId: string): boolean;

  /**
   * Get the executor's domain/name for logging.
   */
  readonly domain: string;

  /**
   * Get list of tool IDs this executor handles.
   */
  getHandledToolIds(): readonly string[];
}

/**
 * Options for tool execution.
 */
export interface IToolExecutionOptions {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Retry attempts on failure */
  retries?: number;
  /** Whether to cache the result */
  cache?: boolean;
  /** Cache TTL in seconds */
  cacheTtl?: number;
  /** Whether to run in sandbox (for marketplace tools) */
  sandbox?: boolean;
}

/**
 * Tool execution event for telemetry/logging.
 */
export interface IToolExecutionEvent {
  /** Tool ID */
  toolId: string;
  /** Start timestamp */
  startTime: Date;
  /** End timestamp (if completed) */
  endTime?: Date;
  /** Duration in ms */
  durationMs?: number;
  /** Whether execution succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** User ID */
  userId?: string;
  /** Session ID */
  sessionId?: string;
  /** Persona ID */
  personaId?: string;
  /** Executor that handled the tool */
  executor: string;
}

/**
 * Listener for tool execution events.
 */
export interface IToolExecutionListener {
  onToolStart?(event: Omit<IToolExecutionEvent, 'endTime' | 'durationMs' | 'success' | 'error'>): void;
  onToolComplete?(event: IToolExecutionEvent): void;
  onToolError?(event: IToolExecutionEvent): void;
}

/**
 * Executor registry for routing tools to appropriate executors.
 */
export interface IExecutorRegistry {
  /**
   * Register an executor.
   */
  register(executor: IToolExecutor): void;

  /**
   * Unregister an executor by domain.
   */
  unregister(domain: string): void;

  /**
   * Get executor for a tool ID.
   */
  getExecutorForTool(toolId: string): IToolExecutor | undefined;

  /**
   * Execute a tool through the appropriate executor.
   */
  execute(params: IToolExecuteParams): Promise<IToolResult>;

  /**
   * Add execution listener.
   */
  addListener(listener: IToolExecutionListener): void;

  /**
   * Remove execution listener.
   */
  removeListener(listener: IToolExecutionListener): void;
}
