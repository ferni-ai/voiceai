/**
 * Tool Service Server
 *
 * Standalone HTTP/gRPC server for tool execution.
 * Can run locally or as a Cloud Run service.
 *
 * Usage:
 *   node dist/services/tool-service/server.js
 *   # or
 *   pnpm service:tools
 */

import express from 'express';
import { getLogger } from '../../utils/safe-logger.js';
import { toolRegistry } from '../../tools/registry/index.js';
import type { ToolContext, ToolDefinition } from '../../tools/registry/types.js';
import { initializeToolRegistry } from '../../tools/registry/loader.js';

const log = getLogger().child({ module: 'tool-service' });

// ============================================================================
// TYPES
// ============================================================================

interface ExecuteRequest {
  toolId: string;
  parameters: Record<string, unknown>;
  context: {
    userId: string;
    sessionId: string;
    agentId: string;
    agentDisplayName: string;
    subscriptionTier: string;
    recentTurns?: Array<{ role: string; content: string }>;
    tenantId?: string;
  };
  timeout?: number;
  idempotencyKey?: string;
}

interface ExecuteResponse {
  status: string;
  result?: {
    data: Record<string, unknown>;
    summary: string;
    suggestedActions?: Array<{ toolId: string; description: string }>;
    sideEffects?: Array<{ type: string; description: string }>;
  };
  error?: {
    code: string;
    message: string;
    userMessage: string;
    retryable: boolean;
  };
  metadata?: {
    executionTimeMs: number;
    toolVersion: string;
    cacheStatus: string;
  };
}

// ============================================================================
// SERVER
// ============================================================================

const app = express();
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'tool-service', timestamp: new Date().toISOString() });
});

// gRPC-Web compatible endpoint (Connect protocol)
app.post('/ferni.tools.v1.ToolService/Execute', async (req, res) => {
  const startTime = Date.now();
  const request = req.body as ExecuteRequest;

  log.info({ toolId: request.toolId, userId: request.context?.userId }, 'Executing tool');

  try {
    // Get tool definition
    const toolDef = toolRegistry.get(request.toolId);
    if (!toolDef) {
      const response: ExecuteResponse = {
        status: 'EXECUTION_STATUS_NOT_FOUND',
        error: {
          code: 'TOOL_NOT_FOUND',
          message: `Tool '${request.toolId}' not found`,
          userMessage: "I don't have that capability right now.",
          retryable: false,
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          toolVersion: '0.0.0',
          cacheStatus: 'CACHE_STATUS_MISS',
        },
      };
      res.status(404).json(response);
      return;
    }

    // Create tool context
    const ctx: ToolContext = {
      userId: request.context.userId,
      agentId: request.context.agentId,
      agentDisplayName: request.context.agentDisplayName,
      services: {
        has: () => false,
        get: () => {
          throw new Error('Service not available');
        },
        getOptional: () => undefined,
      },
    };

    // Create and execute tool
    const tool = toolDef.create(ctx);
    const result = await tool.execute(request.parameters);

    // Format response
    const response: ExecuteResponse = {
      status: 'EXECUTION_STATUS_SUCCESS',
      result: {
        data: typeof result === 'object' ? result : { value: result },
        summary: typeof result === 'string' ? result : JSON.stringify(result).slice(0, 500),
        suggestedActions: [],
        sideEffects: [],
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        toolVersion: '1.0.0',
        cacheStatus: 'CACHE_STATUS_MISS',
      },
    };

    log.info(
      { toolId: request.toolId, durationMs: Date.now() - startTime },
      'Tool executed successfully'
    );
    res.json(response);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ toolId: request.toolId, error: err.message }, 'Tool execution failed');

    const response: ExecuteResponse = {
      status: 'EXECUTION_STATUS_FAILED',
      error: {
        code: 'EXECUTION_ERROR',
        message: err.message,
        userMessage: `Hmm, that's being stubborn. Let me try another way.`,
        retryable: true,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        toolVersion: '0.0.0',
        cacheStatus: 'CACHE_STATUS_MISS',
      },
    };
    res.status(500).json(response);
  }
});

// List tools endpoint
app.post('/ferni.tools.v1.ToolService/ListTools', async (req, res) => {
  const { agentId, subscriptionTier, domains, tags } = req.body;

  try {
    let tools: ToolDefinition[] = [];

    if (domains && domains.length > 0) {
      for (const domain of domains) {
        const domainTools = toolRegistry.getByDomain(domain);
        tools.push(...domainTools);
      }
    } else {
      tools = toolRegistry.getAll();
    }

    // Filter by tags if provided
    if (tags && tags.length > 0) {
      tools = tools.filter((t) => t.tags?.some((tag) => tags.includes(tag)));
    }

    const response = {
      tools: tools.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description || '',
        domain: t.domain,
        tags: t.tags || [],
        requiredTier: 'SUBSCRIPTION_TIER_FREE',
        deprecated: t.deprecated || false,
      })),
      totalCount: tools.length,
    };

    res.json(response);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message }, 'Failed to list tools');
    res.status(500).json({ error: err.message });
  }
});

// Get tool details
app.post('/ferni.tools.v1.ToolService/GetTool', async (req, res) => {
  const { toolId } = req.body;

  try {
    const tool = toolRegistry.get(toolId);
    if (!tool) {
      res.status(404).json({ error: 'Tool not found' });
      return;
    }

    res.json({
      tool: {
        id: tool.id,
        name: tool.name,
        description: tool.description || '',
        domain: tool.domain,
        additionalDomains: tool.additionalDomains || [],
        tags: tool.tags || [],
        requiredTier: 'SUBSCRIPTION_TIER_FREE',
        supportsStreaming: false,
        version: '1.0.0',
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message }, 'Failed to get tool');
    res.status(500).json({ error: err.message });
  }
});

// Health endpoint for gRPC
app.post('/ferni.tools.v1.ToolService/Health', (_req, res) => {
  res.json({
    status: 'SERVICE_HEALTH_HEALTHY',
    components: {
      registry: { status: 'SERVICE_HEALTH_HEALTHY', message: 'OK', latencyMs: 1 },
    },
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// ============================================================================
// STARTUP
// ============================================================================

async function main() {
  const port = parseInt(process.env.PORT || '50051', 10);

  log.info('Initializing tool registry...');
  await initializeToolRegistry({ lazyLoading: false });

  const toolCount = toolRegistry.getAll().length;
  log.info({ toolCount }, 'Tool registry initialized');

  app.listen(port, '0.0.0.0', () => {
    log.info({ port }, 'Tool service started');
  });
}

main().catch((error) => {
  log.error({ error: String(error) }, 'Failed to start tool service');
  process.exit(1);
});
