/**
 * Domain Tool Executor
 *
 * Main entry point for executing real tools from semantic routing.
 * Handles lookup, argument transformation, factory instantiation, and execution.
 *
 * @module tools/semantic-router/domain-bridge/executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getTool as getDomainTool } from '../../registry/index.js';
import type { ServiceRegistry } from '../../registry/types.js';
import type { ToolExecutionContext, ToolExecutionResult } from '../types.js';
import type { ToolMapping } from './types.js';
import { generateFallbackResponse } from './fallbacks.js';

const log = createLogger({ module: 'domain-bridge' });

/**
 * Execute a domain tool via the semantic router bridge.
 *
 * This is the main entry point for executing real tools from semantic routing.
 * It handles:
 * 1. Looking up the domain tool mapping
 * 2. Transforming arguments
 * 3. Executing the real domain tool
 * 4. Returning the result in a format the semantic router understands
 */
export async function executeDomainTool(
  semanticToolId: string,
  args: Record<string, unknown>,
  context: Omit<ToolExecutionContext, 'originalText' | 'confidence'>,
  toolMappings: Record<string, ToolMapping>
): Promise<ToolExecutionResult> {
  const mapping = toolMappings[semanticToolId];

  if (!mapping) {
    log.warn({ semanticToolId }, 'No domain mapping found for semantic tool');
    return {
      success: false,
      error: `No domain implementation for ${semanticToolId}`,
      naturalResponse: "I couldn't find the tool to do that. Let me try another way.",
    };
  }

  // Get the real domain tool
  const domainTool = getDomainTool(mapping.domainToolId);

  if (!domainTool) {
    // GRACEFUL FALLBACK: Domain tool not implemented yet
    // Instead of failing, provide a helpful response and allow LLM to handle
    log.warn(
      { semanticToolId, domainToolId: mapping.domainToolId },
      'Domain tool not found in registry - using graceful fallback'
    );

    // Generate a helpful fallback response based on the semantic tool category
    const fallbackResponse = generateFallbackResponse(semanticToolId, args);

    return {
      success: true, // Mark as success so caller doesn't retry
      naturalResponse: fallbackResponse,
      speakImmediately: true,
      data: {
        fallback: true,
        semanticToolId,
        requestedDomainTool: mapping.domainToolId,
        hint: `LLM should handle "${semanticToolId}" conversationally since domain tool is not yet implemented`,
      },
    };
  }

  // Transform arguments
  const transformedArgs = mapping.transformArgs ? mapping.transformArgs(args) : args;

  log.info(
    {
      semanticToolId,
      domainToolId: mapping.domainToolId,
      originalArgs: args,
      transformedArgs,
    },
    '🔗 Bridging semantic tool to domain tool'
  );

  try {
    // Domain tools use a `create` factory pattern
    // We need to create the tool instance first, then execute it
    if (!domainTool.create) {
      log.warn({ domainToolId: mapping.domainToolId }, 'Domain tool has no create method');
      return {
        success: false,
        error: 'Domain tool has no create method',
        naturalResponse: "I couldn't run that tool. Let me try another way.",
      };
    }

    // Create empty service registry for semantic routing execution
    // This throws on get() since no services are available
    const emptyServices: ServiceRegistry = {
      has: () => false,
      get: () => {
        throw new Error('No services available in semantic routing context');
      },
      getOptional: () => undefined,
    };

    // Create tool instance with context
    const toolInstance = domainTool.create({
      userId: context.userId,
      agentId: context.personaId || 'ferni',
      agentDisplayName: context.personaId || 'Ferni',
      services: (context.services as ServiceRegistry | undefined) ?? emptyServices,
    });

    // Execute the tool
    // The tool instance is a Vercel AI SDK tool with an execute function
    if (toolInstance && typeof toolInstance.execute === 'function') {
      const startTime = performance.now();
      const result = await toolInstance.execute(transformedArgs, {
        // AbortSignal (optional)
      });
      const durationMs = Math.round(performance.now() - startTime);

      // Telemetry: Track which layer handled this tool call
      // 'semantic-router' = Pre-LLM routing bypassed the LLM entirely
      log.info(
        {
          semanticToolId,
          domainToolId: mapping.domainToolId,
          durationMs,
          handledBy: 'semantic-router',
          sessionId: context.sessionId,
          trace: 'E2E_TOOL_SUCCESS',
        },
        `🔍 E2E TRACE [TOOL] Completed: ${mapping.domainToolId} in ${durationMs}ms (via semantic-router)`
      );

      // Domain tools return strings, convert to ToolExecutionResult
      if (typeof result === 'string') {
        return {
          success: true,
          naturalResponse: result,
          speakImmediately: true,
          data: { result },
        };
      }

      // If already a result object, return as-is
      return {
        success: true,
        naturalResponse: String(result),
        speakImmediately: true,
        data: { result },
      };
    }

    log.warn({ domainToolId: mapping.domainToolId }, 'Domain tool instance has no execute method');
    return {
      success: false,
      error: 'Domain tool instance has no execute method',
      naturalResponse: "I couldn't run that tool. Let me try another way.",
    };
  } catch (error) {
    log.error(
      {
        semanticToolId,
        domainToolId: mapping.domainToolId,
        error: String(error),
      },
      'Domain tool execution failed'
    );

    return {
      success: false,
      error: String(error),
      naturalResponse: 'Something went wrong. Let me try another way.',
    };
  }
}
