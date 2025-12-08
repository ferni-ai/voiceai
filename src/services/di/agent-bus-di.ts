// @ts-nocheck
/**
 * Agent Bus - DI-Enabled Version
 *
 * Dependency-injected version of the agent message bus.
 * Enables cross-agent communication with configurable handlers.
 *
 * Key differences from legacy version:
 * 1. Dependencies injected via constructor
 * 2. Returns Result types instead of throwing
 * 3. Registered with DI container
 */

import { getLogger } from '../../utils/safe-logger.js';

import { EventEmitter } from 'events';
import type { Container } from './container.js';
import { Tokens, type Factory } from './container.js';
import type { Result, AsyncResult } from '../../types/result.js';
import { success, failure, RateLimitError } from '../../types/result.js';

// ============================================================================
// TYPES
// ============================================================================

export type AgentId =
  | 'jordan'
  | 'jordan-taylor'
  | 'event-planner'
  | 'maya'
  | 'maya-santos'
  | 'spend-save'
  | 'alex'
  | 'alex-chen'
  | 'comm-specialist'
  | 'peter'
  | 'peter-john'
  | 'nayan'
  | 'nayan-patel'
  | 'jack-b'
  | 'ferni';

export interface AgentMessage {
  id: string;
  timestamp: Date;
  fromAgent: AgentId;
  toAgent: AgentId;
  type: 'tool_request' | 'tool_response' | 'context_share' | 'notification';
  payload: AgentMessagePayload;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  userId?: string;
  sessionId?: string;
}

export interface AgentMessagePayload {
  toolName?: string;
  toolParams?: Record<string, unknown>;
  context?: Record<string, unknown>;
  result?: string;
  success?: boolean;
  error?: string;
  notificationType?: string;
  notificationData?: Record<string, unknown>;
}

export interface ToolExecutionRequest {
  toolName: string;
  params: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
  context?: Record<string, unknown>;
}

export interface ToolExecutionResult {
  success: boolean;
  result?: string;
  error?: string;
  executedBy: AgentId;
}

// ============================================================================
// RATE LIMITING
// ============================================================================

interface RateLimitState {
  requestCount: number;
  windowStart: number;
}

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 100;
const MAX_TOTAL_REQUESTS_PER_WINDOW = 500;

// ============================================================================
// DEPENDENCIES
// ============================================================================

export interface AgentBusDeps {
  logger?: ReturnType<typeof getLogger>;
  rateLimitConfig?: {
    windowMs: number;
    maxPerUser: number;
    maxTotal: number;
  };
}

// ============================================================================
// SERVICE
// ============================================================================

export class AgentBusService extends EventEmitter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly getLogger: () => any;
  private readonly config: Required<NonNullable<AgentBusDeps['rateLimitConfig']>>;

  private messages = new Map<string, AgentMessage>();
  private pendingRequests = new Map<string, AgentMessage[]>();
  private toolHandlers = new Map<
    string,
    (request: ToolExecutionRequest) => Promise<ToolExecutionResult>
  >();
  private userRateLimits = new Map<string, RateLimitState>();
  private globalRateLimit: RateLimitState = { requestCount: 0, windowStart: Date.now() };

  constructor(deps: AgentBusDeps = {}) {
    super();
    const loggerDep = deps.logger;
    this.getLogger = typeof loggerDep === 'function' ? loggerDep : () => loggerDep ?? getLogger();
    this.config = {
      windowMs: deps.rateLimitConfig?.windowMs ?? RATE_LIMIT_WINDOW_MS,
      maxPerUser: deps.rateLimitConfig?.maxPerUser ?? MAX_REQUESTS_PER_WINDOW,
      maxTotal: deps.rateLimitConfig?.maxTotal ?? MAX_TOTAL_REQUESTS_PER_WINDOW,
    };
    this.getLogger().info('🚌 Agent Bus Service initialized (DI)');
  }

  // ==========================================================================
  // RATE LIMITING (with Result types)
  // ==========================================================================

  checkRateLimit(userId?: string): Result<void, RateLimitError> {
    const now = Date.now();

    // Reset global window if needed
    if (now - this.globalRateLimit.windowStart > this.config.windowMs) {
      this.globalRateLimit = { requestCount: 0, windowStart: now };
    }

    // Check global limit
    if (this.globalRateLimit.requestCount >= this.config.maxTotal) {
      return failure(new RateLimitError('global', this.config.windowMs));
    }

    // Check per-user limit
    if (userId) {
      let userLimit = this.userRateLimits.get(userId);
      if (!userLimit || now - userLimit.windowStart > this.config.windowMs) {
        userLimit = { requestCount: 0, windowStart: now };
        this.userRateLimits.set(userId, userLimit);
      }

      if (userLimit.requestCount >= this.config.maxPerUser) {
        return failure(new RateLimitError(`user:${userId}`, this.config.windowMs));
      }
    }

    return success(undefined);
  }

  private incrementRateLimits(userId?: string): void {
    this.globalRateLimit.requestCount++;
    if (userId) {
      const userLimit = this.userRateLimits.get(userId);
      if (userLimit) {
        userLimit.requestCount++;
      }
    }
  }

  // ==========================================================================
  // MESSAGE HANDLING (with Result types)
  // ==========================================================================

  async sendMessage(
    fromAgent: AgentId,
    toAgent: AgentId,
    payload: AgentMessagePayload,
    userId?: string,
    sessionId?: string
  ): AsyncResult<AgentMessage, Error> {
    // Check rate limit
    const rateLimitResult = this.checkRateLimit(userId);
    if (!rateLimitResult.success) {
      return failure(rateLimitResult.error);
    }

    try {
      const message: AgentMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        timestamp: new Date(),
        fromAgent,
        toAgent,
        type: payload.toolName ? 'tool_request' : 'notification',
        payload,
        status: 'pending',
        userId,
        sessionId,
      };

      this.messages.set(message.id, message);
      this.incrementRateLimits(userId);

      // Add to pending queue for target agent
      const pending = this.pendingRequests.get(toAgent) || [];
      pending.push(message);
      this.pendingRequests.set(toAgent, pending);

      this.emit('message', message);
      this.getLogger().debug(
        { messageId: message.id, from: fromAgent, to: toAgent },
        'Message sent'
      );

      return success(message);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ==========================================================================
  // TOOL EXECUTION (with Result types)
  // ==========================================================================

  registerToolHandler(
    agentId: AgentId,
    handler: (request: ToolExecutionRequest) => Promise<ToolExecutionResult>
  ): void {
    this.toolHandlers.set(agentId, handler);
    this.getLogger().debug({ agentId }, 'Tool handler registered');
  }

  async executeToolOnBehalf(
    requestingAgent: AgentId,
    targetAgent: AgentId,
    request: ToolExecutionRequest
  ): AsyncResult<ToolExecutionResult, Error> {
    const handler = this.toolHandlers.get(targetAgent);
    if (!handler) {
      return failure(new Error(`No handler registered for agent: ${targetAgent}`));
    }

    try {
      // Send request message
      const msgResult = await this.sendMessage(
        requestingAgent,
        targetAgent,
        {
          toolName: request.toolName,
          toolParams: request.params,
          context: request.context,
        },
        request.userId,
        request.sessionId
      );

      if (!msgResult.success) {
        return failure(msgResult.error);
      }

      const message = msgResult.data;
      message.status = 'processing';

      // Execute tool
      const result = await handler(request);

      message.status = result.success ? 'completed' : 'failed';
      message.payload.result = result.result;
      message.payload.success = result.success;
      message.payload.error = result.error;

      return success(result);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ==========================================================================
  // QUERY METHODS
  // ==========================================================================

  getPendingMessages(agentId: AgentId): AgentMessage[] {
    return this.pendingRequests.get(agentId) || [];
  }

  getMessage(messageId: string): AgentMessage | undefined {
    return this.messages.get(messageId);
  }

  clearPendingMessages(agentId: AgentId): void {
    this.pendingRequests.delete(agentId);
  }

  // ==========================================================================
  // STATS
  // ==========================================================================

  getStats(): {
    totalMessages: number;
    pendingByAgent: Record<string, number>;
    registeredHandlers: string[];
  } {
    const pendingByAgent: Record<string, number> = {};
    for (const [agent, messages] of this.pendingRequests) {
      pendingByAgent[agent] = messages.length;
    }

    return {
      totalMessages: this.messages.size,
      pendingByAgent,
      registeredHandlers: Array.from(this.toolHandlers.keys()),
    };
  }
}

// ============================================================================
// DI REGISTRATION
// ============================================================================

export const AgentBusToken = Symbol('AgentBusService');

export const createAgentBusService: Factory<AgentBusService> = () => {
  return new AgentBusService();
};

export function registerAgentBusService(container: Container): void {
  container.registerSingleton(AgentBusToken, createAgentBusService);
}

export function getAgentBusService(container: Container): AgentBusService {
  if (!container.has(AgentBusToken)) {
    registerAgentBusService(container);
  }
  return container.resolve<AgentBusService>(AgentBusToken);
}
