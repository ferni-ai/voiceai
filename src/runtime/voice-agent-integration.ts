/**
 * Voice Agent Runtime Integration
 *
 * Provides runtime-aware tool execution for voice agents.
 * This module bridges the voice agent session with the runtime's
 * tool/persona/memory services.
 *
 * Usage in voice-agent-entry.ts:
 *   import { createRuntimeToolProxy } from '../runtime/voice-agent-integration.js';
 *
 *   const toolProxy = await createRuntimeToolProxy(ctx, personaId, userId);
 *   // Use toolProxy.getToolDefinitions() for LLM tools
 *   // Use toolProxy.execute() for tool calls
 */

import type { JobContext } from '@livekit/agents';
import {
  getRuntime,
  type IRuntime,
  type ToolExecutionContext,
  type ToolExecutionResult,
} from './index.js';
import {
  executeMarketplaceTool,
  getTool as getMarketplaceTool,
  listInstallations,
  type ExecutionContext as MarketplaceContext,
} from '../marketplace/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface RuntimeToolProxy {
  /** Execute a tool via the runtime */
  execute(toolId: string, params: Record<string, unknown>): Promise<ToolExecutionResult>;

  /** Get tool definitions for LLM function calling */
  getToolDefinitions(): Promise<LLMToolDefinition[]>;

  /** Get persona system prompt via runtime */
  getSystemPrompt(): Promise<{
    systemPrompt: string;
    greeting: string;
    voiceConfig: { provider: string; voiceId: string };
  }>;

  /** Recall memories via runtime */
  recallMemories(query: string, limit?: number): Promise<Array<{ content: string; relevance: number }>>;

  /** Store a memory via runtime */
  storeMemory(content: string, metadata?: Record<string, unknown>): Promise<{ id: string }>;
}

export interface LLMToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

class VoiceAgentRuntimeProxy implements RuntimeToolProxy {
  private runtime: IRuntime;
  private ctx: ToolExecutionContext;
  private personaId: string;
  private marketplaceToolIds: Set<string> | null = null;

  constructor(runtime: IRuntime, ctx: ToolExecutionContext, personaId: string) {
    this.runtime = runtime;
    this.ctx = ctx;
    this.personaId = personaId;
  }

  /**
   * Load installed marketplace tools for this user
   */
  private async loadMarketplaceToolIds(): Promise<Set<string>> {
    if (this.marketplaceToolIds) return this.marketplaceToolIds;

    try {
      const installations = listInstallations(this.ctx.userId, { itemType: 'tool' });
      this.marketplaceToolIds = new Set(installations.map((i) => i.itemId));
    } catch {
      // If marketplace isn't available, return empty set
      this.marketplaceToolIds = new Set();
    }
    return this.marketplaceToolIds;
  }

  /**
   * Check if a tool ID is a marketplace tool (prefixed with 'mkt.' or in user's installations)
   */
  private async isMarketplaceTool(toolId: string): Promise<boolean> {
    // Quick check: marketplace tools are prefixed with 'mkt.'
    if (toolId.startsWith('mkt.')) return true;

    // Check if it's in the user's installed marketplace tools
    const installedIds = await this.loadMarketplaceToolIds();
    return installedIds.has(toolId);
  }

  async execute(toolId: string, params: Record<string, unknown>): Promise<ToolExecutionResult> {
    // Check if this is a marketplace tool
    if (await this.isMarketplaceTool(toolId)) {
      // Use marketplace executor
      const marketplaceCtx: MarketplaceContext = {
        userId: this.ctx.userId,
        sessionId: this.ctx.sessionId,
        agentId: this.ctx.agentId,
        tenantId: this.ctx.tenantId,
      };

      // Strip 'mkt.' prefix if present
      const marketplaceToolId = toolId.startsWith('mkt.') ? toolId.slice(4) : toolId;

      const result = await executeMarketplaceTool(marketplaceToolId, params, marketplaceCtx);

      // Convert marketplace result to runtime result format
      return {
        status: result.success ? 'success' : 'failed',
        data: result.data as Record<string, unknown> | undefined,
        summary: result.summary,
        error: result.error
          ? {
              code: result.error.code,
              message: result.error.message,
              userMessage: result.error.userMessage,
              retryable: result.error.retryable,
            }
          : undefined,
        metadata: {
          executionTimeMs: result.durationMs || 0,
          cacheHit: false,
        },
      };
    }

    // Use standard runtime tools
    return this.runtime.tools.execute(toolId, params, this.ctx);
  }

  async getToolDefinitions(): Promise<LLMToolDefinition[]> {
    // Get standard runtime tools
    const tools = await this.runtime.tools.listTools(
      this.ctx.agentId,
      this.ctx.subscriptionTier
    );

    const definitions: LLMToolDefinition[] = tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.id,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    }));

    // Also include installed marketplace tools
    try {
      const installations = listInstallations(this.ctx.userId, { itemType: 'tool' });

      for (const installation of installations) {
        const tool = getMarketplaceTool(installation.itemId);
        if (tool) {
          definitions.push({
            type: 'function' as const,
            function: {
              // Prefix marketplace tools with 'mkt.' for disambiguation
              name: `mkt.${tool.id}`,
              description: tool.description.short,
              parameters: tool.interface?.parametersSchema || {
                type: 'object',
                properties: {},
                required: [],
              },
            },
          });
        }
      }
    } catch {
      // Marketplace not available, continue with just runtime tools
    }

    return definitions;
  }

  async getSystemPrompt(): Promise<{
    systemPrompt: string;
    greeting: string;
    voiceConfig: { provider: string; voiceId: string };
  }> {
    return this.runtime.personas.getSystemPrompt({
      personaId: this.personaId,
      userId: this.ctx.userId,
    });
  }

  async recallMemories(
    query: string,
    limit: number = 5
  ): Promise<Array<{ content: string; relevance: number }>> {
    const memories = await this.runtime.memory.recall(this.ctx.userId, query, { limit });
    return memories.map((m) => ({
      content: m.content,
      relevance: m.relevance,
    }));
  }

  async storeMemory(
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<{ id: string }> {
    return this.runtime.memory.store(this.ctx.userId, content, metadata);
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a runtime tool proxy for a voice agent session.
 *
 * @example
 * ```typescript
 * // In voice-agent-entry.ts
 * const toolProxy = await createRuntimeToolProxy(ctx, 'ferni', userId);
 *
 * // Get LLM tools
 * const tools = await toolProxy.getToolDefinitions();
 *
 * // Execute a tool
 * const result = await toolProxy.execute('habitCoaching.createHabit', {
 *   name: 'Morning meditation',
 *   frequency: 'daily',
 * });
 *
 * if (result.status === 'success') {
 *   await session.say(result.summary);
 * }
 * ```
 */
export async function createRuntimeToolProxy(
  jobCtx: JobContext,
  personaId: string,
  options: {
    userId?: string;
    subscriptionTier?: 'free' | 'friend' | 'partner';
  } = {}
): Promise<RuntimeToolProxy> {
  const runtime = await getRuntime();

  // Extract user info from job metadata
  const metadata = jobCtx.job.metadata ? JSON.parse(jobCtx.job.metadata) : {};
  const userId = options.userId || metadata.user_id || 'anonymous';
  const subscriptionTier = options.subscriptionTier || metadata.subscription_tier || 'free';

  // Get persona display name
  const persona = await runtime.personas.getPersona(personaId);

  const ctx: ToolExecutionContext = {
    userId,
    sessionId: jobCtx.job.id,
    agentId: personaId,
    agentDisplayName: persona?.name || personaId,
    subscriptionTier,
  };

  return new VoiceAgentRuntimeProxy(runtime, ctx, personaId);
}

/**
 * Create a tool call handler for LLM function calling.
 *
 * @example
 * ```typescript
 * const handleToolCall = createToolCallHandler(toolProxy);
 *
 * session.on('function_call', async (call) => {
 *   const result = await handleToolCall(call.name, call.arguments);
 *   // Result is formatted for voice output
 *   await session.say(result);
 * });
 * ```
 */
export function createToolCallHandler(
  proxy: RuntimeToolProxy
): (toolId: string, params: Record<string, unknown>) => Promise<string> {
  return async (toolId: string, params: Record<string, unknown>): Promise<string> => {
    const result = await proxy.execute(toolId, params);

    if (result.status === 'success') {
      return result.summary || 'Done!';
    }

    // Return user-friendly error message
    return result.error?.userMessage || 'Sorry, something went wrong.';
  };
}

// ============================================================================
// HELPER: Check if runtime is available (for gradual migration)
// ============================================================================

/**
 * Check if the runtime should be used based on environment and feature flags.
 *
 * During migration, you can use this to gradually roll out the runtime:
 *
 * @example
 * ```typescript
 * if (shouldUseRuntime()) {
 *   const proxy = await createRuntimeToolProxy(ctx, personaId);
 *   // Use runtime-based tools
 * } else {
 *   // Use legacy direct tool loading
 *   const tools = await buildAgentTools(personaId);
 * }
 * ```
 */
export function shouldUseRuntime(): boolean {
  // Feature flag
  if (process.env.USE_RUNTIME === 'true') return true;
  if (process.env.USE_RUNTIME === 'false') return false;

  // In remote mode (Cloud Run), use runtime by default
  if (process.env.SERVICE_MODE === 'remote') return true;

  // In local mode, use runtime only if services are running
  if (process.env.SERVICE_MODE === 'hybrid') return true;

  // Default: don't use runtime (backward compatible)
  return false;
}
