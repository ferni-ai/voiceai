/**
 * Tool Proxy - Routes tool execution through Tool Service
 *
 * This module provides a proxy layer that can route tool execution either:
 * - LOCAL: Execute in-process (current behavior, fastest)
 * - REMOTE: Execute via HTTP to Tool Service (isolated, scalable)
 *
 * The proxy is transparent to the LLM - it wraps tools with the same
 * interface (llm.tool) but execution happens remotely.
 *
 * Usage:
 *   // Create a proxied tool that calls Tool Service
 *   const proxiedTool = createProxiedTool(toolDef, { mode: 'remote', serviceUrl: '...' });
 *
 *   // Or wrap an entire tool set
 *   const proxiedTools = await createProxiedToolSet(toolSet, options);
 */

/* global AbortController */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../utils/safe-logger.js';
import type { Tool, ToolContext, ToolDefinition } from './registry/types.js';

const log = getLogger().child({ module: 'tool-proxy' });

// ============================================================================
// TYPES
// ============================================================================

export type ToolExecutionMode = 'local' | 'remote' | 'hybrid';

export interface ToolProxyConfig {
  /** Execution mode */
  mode: ToolExecutionMode;

  /** Tool Service URL (for remote/hybrid mode) */
  serviceUrl?: string;

  /** Timeout for remote calls in ms */
  timeout?: number;

  /** Tools to always run locally (even in remote mode) */
  localOverrides?: string[];

  /** Tools to always run remotely (even in local mode) */
  remoteOverrides?: string[];
}

export interface ProxiedToolContext extends ToolContext {
  /** Session ID for tracking */
  sessionId: string;

  /** Subscription tier for authorization */
  subscriptionTier: 'free' | 'friend' | 'partner';

  /** Recent conversation turns for context */
  recentTurns?: Array<{ role: string; content: string }>;
}

interface RemoteExecuteResponse {
  status: string;
  result?: {
    data?: Record<string, unknown>;
    summary?: string;
  };
  error?: {
    code: string;
    message: string;
    userMessage: string;
    retryable: boolean;
  };
  metadata?: {
    executionTimeMs: number;
    cacheStatus: string;
  };
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: ToolProxyConfig = {
  mode: 'local',
  serviceUrl: process.env.TOOL_SERVICE_URL || 'http://localhost:50051',
  timeout: 30000,
  // These tools should always run locally for speed/reliability
  localOverrides: [
    'meetTheTeam',
    'softTeamIntro',
    'handoffToFerni',
    'handoffToMaya',
    'handoffToAlex',
    'handoffToPeter',
    'handoffToJordan',
    'handoffToNayan',
  ],
  remoteOverrides: [],
};

// ============================================================================
// PROXY CREATION
// ============================================================================

/**
 * Create a proxied tool that routes execution based on config
 */
export function createProxiedTool(
  toolDef: ToolDefinition,
  ctx: ProxiedToolContext,
  config: ToolProxyConfig = DEFAULT_CONFIG
): Tool {
  const effectiveMode = getEffectiveMode(toolDef.id, config);

  if (effectiveMode === 'local') {
    // Just return the normal local tool
    return toolDef.create(ctx);
  }

  // Create a remote proxy tool
  return createRemoteProxyTool(toolDef, ctx, config);
}

/**
 * Determine effective execution mode for a specific tool
 */
function getEffectiveMode(toolId: string, config: ToolProxyConfig): ToolExecutionMode {
  // Check local overrides first
  if (config.localOverrides?.includes(toolId)) {
    return 'local';
  }

  // Check remote overrides
  if (config.remoteOverrides?.includes(toolId)) {
    return 'remote';
  }

  // Use default mode
  return config.mode;
}

/**
 * Create a tool that proxies execution to the Tool Service
 */
function createRemoteProxyTool(
  toolDef: ToolDefinition,
  ctx: ProxiedToolContext,
  config: ToolProxyConfig
): Tool {
  // Create a generic proxy tool that accepts any parameters
  // The actual validation happens on the Tool Service side
  const proxyTool = llm.tool({
    description: toolDef.description || toolDef.name,
    parameters: z.object({}).passthrough(), // Accept any parameters

    execute: async (params) => {
      const startTime = Date.now();
      const serviceUrl = config.serviceUrl || DEFAULT_CONFIG.serviceUrl;

      log.debug(
        { toolId: toolDef.id, userId: ctx.userId, mode: 'remote' },
        'Proxying tool execution to service'
      );

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          config.timeout || DEFAULT_CONFIG.timeout!
        );

        const response = await fetch(`${serviceUrl}/ferni.tools.v1.ToolService/Execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            toolId: toolDef.id,
            parameters: params,
            context: {
              userId: ctx.userId,
              sessionId: ctx.sessionId,
              agentId: ctx.agentId,
              agentDisplayName: ctx.agentDisplayName,
              subscriptionTier: tierToProto(ctx.subscriptionTier),
              recentTurns: ctx.recentTurns,
            },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          log.error(
            { toolId: toolDef.id, status: response.status, error: errorText },
            'Tool service returned error'
          );
          return `I had trouble with that. Let me try a different approach.`;
        }

        const result = (await response.json()) as RemoteExecuteResponse;

        log.info(
          {
            toolId: toolDef.id,
            status: result.status,
            executionTimeMs: Date.now() - startTime,
            remoteTimeMs: result.metadata?.executionTimeMs,
          },
          'Remote tool execution completed'
        );

        if (result.status === 'EXECUTION_STATUS_SUCCESS' && result.result) {
          // Return the summary for speech, or stringify data
          return result.result.summary || JSON.stringify(result.result.data);
        }

        if (result.error) {
          log.warn({ toolId: toolDef.id, error: result.error }, 'Tool execution failed');
          return result.error.userMessage || 'Something went wrong. Let me try again.';
        }

        return 'I completed that action.';
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        if (err.name === 'AbortError') {
          log.error({ toolId: toolDef.id }, 'Tool execution timed out');
          return 'That took too long. Let me try a simpler approach.';
        }

        log.error({ toolId: toolDef.id, error: err.message }, 'Tool proxy error');

        // Fallback to local execution if remote fails
        if (config.mode === 'hybrid') {
          log.info({ toolId: toolDef.id }, 'Falling back to local execution');
          try {
            const localTool = toolDef.create(ctx);
            return await localTool.execute(params);
          } catch (localError) {
            log.error(
              { toolId: toolDef.id, error: String(localError) },
              'Local fallback also failed'
            );
          }
        }

        return 'I had trouble with that. Let me try something else.';
      }
    },
  });

  return proxyTool as Tool;
}

// ============================================================================
// TOOL SET PROXYING
// ============================================================================

/**
 * Wrap an entire tool set with proxies based on config
 */
export async function createProxiedToolSet(
  toolSet: Record<string, Tool>,
  toolDefs: ToolDefinition[],
  ctx: ProxiedToolContext,
  config: ToolProxyConfig = DEFAULT_CONFIG
): Promise<Record<string, Tool>> {
  if (config.mode === 'local' && !config.remoteOverrides?.length) {
    // Pure local mode, no proxying needed
    return toolSet;
  }

  const proxiedTools: Record<string, Tool> = {};

  for (const [name, tool] of Object.entries(toolSet)) {
    // Find the corresponding definition
    const toolDef = toolDefs.find((d) => d.id === name || d.name === name);

    if (!toolDef) {
      // No definition found, keep original tool
      proxiedTools[name] = tool;
      continue;
    }

    const effectiveMode = getEffectiveMode(toolDef.id, config);

    if (effectiveMode === 'remote') {
      // Create proxied version
      proxiedTools[name] = createRemoteProxyTool(toolDef, ctx, config);
    } else {
      // Keep local version
      proxiedTools[name] = tool;
    }
  }

  log.info(
    {
      mode: config.mode,
      totalTools: Object.keys(toolSet).length,
      proxiedTools: Object.keys(proxiedTools).filter((n) => {
        const def = toolDefs.find((d) => d.id === n || d.name === n);
        return def && getEffectiveMode(def.id, config) === 'remote';
      }).length,
    },
    'Created proxied tool set'
  );

  return proxiedTools;
}

// ============================================================================
// CONFIG FROM ENVIRONMENT
// ============================================================================

/**
 * Get tool proxy config from environment
 */
export function getToolProxyConfig(): ToolProxyConfig {
  const mode = (process.env.TOOL_EXECUTION_MODE as ToolExecutionMode) || 'local';
  const serviceUrl = process.env.TOOL_SERVICE_URL || DEFAULT_CONFIG.serviceUrl;

  // Parse local overrides from env (comma-separated)
  const localOverrides = process.env.TOOLS_LOCAL_OVERRIDE
    ? process.env.TOOLS_LOCAL_OVERRIDE.split(',').map((s) => s.trim())
    : DEFAULT_CONFIG.localOverrides;

  // Parse remote overrides from env (comma-separated)
  const remoteOverrides = process.env.TOOLS_REMOTE_OVERRIDE
    ? process.env.TOOLS_REMOTE_OVERRIDE.split(',').map((s) => s.trim())
    : DEFAULT_CONFIG.remoteOverrides;

  return {
    mode,
    serviceUrl,
    timeout: parseInt(process.env.TOOL_SERVICE_TIMEOUT || '30000', 10),
    localOverrides,
    remoteOverrides,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function tierToProto(tier: 'free' | 'friend' | 'partner'): string {
  const map = {
    free: 'SUBSCRIPTION_TIER_FREE',
    friend: 'SUBSCRIPTION_TIER_FRIEND',
    partner: 'SUBSCRIPTION_TIER_PARTNER',
  };
  return map[tier] || 'SUBSCRIPTION_TIER_FREE';
}
