/**
 * Developer Platform API v2 - Main Router
 *
 * Dispatches requests to specific route handlers:
 * - /api/v2/developers/mcp-servers/* - MCP server registration
 * - /api/v2/developers/tools/* - Custom tool registration
 * - /api/v2/developers/webhooks/* - Webhook subscriptions
 * - /api/v2/developers/activities/* - Activity tracking
 * - /api/v2/developers/workflows/* - Workflow definitions
 * - /api/v2/developers/oauth/* - OAuth integration
 *
 * @module api/v2/developers
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { sendError } from '../../helpers.js';
import { handleCors } from './shared/middleware.js';
import { getLogger } from '../../../utils/safe-logger.js';

// Route handlers
import { handleMCPServersRoutes } from './mcp-servers-routes.js';
import { handleToolsRoutes } from './tools-routes.js';
import { handleWebhooksRoutes } from './webhooks-routes.js';
import { handleActivitiesRoutes } from './activities-routes.js';
import { handleWorkflowsRoutes } from './workflows-routes.js';
import { handleOAuthRoutes } from './oauth-routes.js';

const log = getLogger().child({ module: 'v2-developers-router' });

/** Base path for developer v2 API */
const BASE_PATH = '/api/v2/developers';

/**
 * Main handler for all developer platform v2 routes
 *
 * Follows the v1 pattern: each sub-handler returns boolean.
 * True = handled, False = try next handler.
 */
export async function handleDeveloperV2Routes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/v2/developers/* routes
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  // Handle CORS preflight
  if (handleCors(req, res)) {
    return true;
  }

  const subPath = pathname.slice(BASE_PATH.length);
  log.debug({ method: req.method, subPath }, 'Handling v2 developer request');

  try {
    // Route to specific handlers based on path prefix
    // Each handler returns true if it handled the request

    // Phase 1: MCP Servers
    if (subPath.startsWith('/mcp-servers')) {
      if (await handleMCPServersRoutes(req, res, pathname)) {
        return true;
      }
    }

    // Phase 2: Custom Tools
    if (subPath.startsWith('/tools')) {
      if (await handleToolsRoutes(req, res, pathname)) {
        return true;
      }
    }

    // Phase 3: Webhooks
    if (subPath.startsWith('/webhooks')) {
      if (await handleWebhooksRoutes(req, res, pathname)) {
        return true;
      }
    }

    // Phase 4: Activities
    if (subPath.startsWith('/activities')) {
      if (await handleActivitiesRoutes(req, res, pathname)) {
        return true;
      }
    }

    // Phase 5: Workflows
    if (subPath.startsWith('/workflows')) {
      if (await handleWorkflowsRoutes(req, res, pathname)) {
        return true;
      }
    }

    // Phase 6: OAuth
    if (subPath.startsWith('/oauth')) {
      if (await handleOAuthRoutes(req, res, pathname)) {
        return true;
      }
    }

    // API info endpoint
    if (subPath === '' || subPath === '/') {
      return handleApiInfo(res);
    }

    // No handler matched
    return false;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, pathname }, 'Error handling v2 developer request');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}

/**
 * Return API info and available endpoints
 */
function handleApiInfo(res: ServerResponse): boolean {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      success: true,
      data: {
        name: 'Ferni Developer Platform API',
        version: '2.0.0',
        description:
          'APIs for extending Ferni agents with custom workflows, tools, and integrations',
        endpoints: {
          '/api/v2/developers/mcp-servers': {
            description: 'Register and manage external MCP servers',
            status: 'available',
          },
          '/api/v2/developers/tools': {
            description: 'Register custom tools for agent use',
            status: 'available',
          },
          '/api/v2/developers/webhooks': {
            description: 'Subscribe to agent events',
            status: 'available',
          },
          '/api/v2/developers/activities': {
            description: 'Track custom activities and metrics',
            status: 'available',
          },
          '/api/v2/developers/workflows': {
            description: 'Define multi-step agent workflows',
            status: 'available',
          },
          '/api/v2/developers/oauth': {
            description: 'Manage OAuth providers for external services',
            status: 'available',
          },
        },
        documentation: 'https://developers.ferni.ai/docs/api/v2',
      },
    })
  );
  return true;
}

// Re-export types for consumers
export * from './shared/types.js';
export {
  // Schemas (named exports to avoid conflicts with types.ts)
  PaginationSchema,
  IdParamSchema,
  CreateMCPServerSchema,
  UpdateMCPServerSchema,
  CreateToolSchema,
  UpdateToolSchema,
  CreateWebhookSchema,
  UpdateWebhookSchema,
  CreateActivitySchema,
  UpdateActivitySchema,
  ActivityQuerySchema,
  CreateWorkflowSchema,
  UpdateWorkflowSchema,
  CreateOAuthProviderSchema,
  UpdateOAuthProviderSchema,
  // Enums
  MCPTransportSchema,
  ToolExecutionTypeSchema,
  WebhookEventTypeSchema,
  ActivityStatusSchema,
  WorkflowTriggerTypeSchema,
  WorkflowNodeTypeSchema,
  RetryPolicySchema,
} from './shared/validation.js';
export * from './shared/middleware.js';
