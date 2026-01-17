/**
 * Developer Platform API v2 - Custom Tools Routes
 *
 * Manages developer-registered custom tools.
 *
 * Endpoints:
 *   POST   /api/v2/developers/tools          - Register tool
 *   GET    /api/v2/developers/tools          - List tools
 *   GET    /api/v2/developers/tools/:id      - Get tool
 *   PUT    /api/v2/developers/tools/:id      - Update tool
 *   DELETE /api/v2/developers/tools/:id      - Delete tool
 *   POST   /api/v2/developers/tools/:id/test - Test tool execution
 *
 * @module api/v2/developers/tools-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../../utils/safe-logger.js';
import { sendSuccess, sendError } from '../../helpers.js';
import {
  requireApiKeyAuth,
  extractIdFromPath,
  parseJsonBody,
  generateId,
} from './shared/middleware.js';
import { CreateToolSchema, UpdateToolSchema, PaginationSchema } from './shared/validation.js';
import type {
  DeveloperTool,
  CreateToolInput,
  UpdateToolInput,
  ToolTestResult,
} from './shared/types.js';
import { COLLECTIONS, ID_PREFIXES } from './shared/types.js';

const log = getLogger().child({ module: 'tools-routes' });

/** Base path for tools API */
const BASE_PATH = '/api/v2/developers/tools';

/** Helper to convert Firestore timestamp to Date */
function convertTimestamp(value: unknown): Date | undefined {
  if (!value) return undefined;
  // Firestore Timestamp has toDate() method
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  // Already a Date or date-like
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  return undefined;
}

// ============================================================================
// MAIN ROUTER
// ============================================================================

/**
 * Handle all tools routes
 *
 * Returns true if request was handled, false otherwise.
 */
export async function handleToolsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  const method = req.method?.toUpperCase() || 'GET';
  const subPath = pathname.slice(BASE_PATH.length);

  log.debug({ method, subPath }, 'Handling tools request');

  try {
    // POST /tools - Create new tool
    if (method === 'POST' && (subPath === '' || subPath === '/')) {
      return handleCreateTool(req, res);
    }

    // GET /tools - List tools
    if (method === 'GET' && (subPath === '' || subPath === '/')) {
      return handleListTools(req, res);
    }

    // Routes with :id parameter
    const toolId = extractIdFromPath(subPath, '/');

    if (!toolId) {
      return false;
    }

    // POST /tools/:id/test - Test tool
    if (method === 'POST' && subPath.endsWith('/test')) {
      return handleTestTool(req, res, toolId);
    }

    // GET /tools/:id - Get tool
    if (method === 'GET' && subPath === `/${toolId}`) {
      return handleGetTool(req, res, toolId);
    }

    // PUT /tools/:id - Update tool
    if (method === 'PUT' && subPath === `/${toolId}`) {
      return handleUpdateTool(req, res, toolId);
    }

    // DELETE /tools/:id - Delete tool
    if (method === 'DELETE' && subPath === `/${toolId}`) {
      return handleDeleteTool(req, res, toolId);
    }

    return false;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, pathname }, 'Error handling tools request');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * POST /tools - Register a new custom tool
 */
async function handleCreateTool(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse body
  const body = await parseJsonBody(req);
  if (!body) {
    sendError(res, 'Invalid JSON body', 400);
    return true;
  }

  // Validate input
  const parseResult = CreateToolSchema.safeParse(body);
  if (!parseResult.success) {
    sendError(res, parseResult.error.issues[0]?.message || 'Invalid input', 400);
    return true;
  }

  const input = parseResult.data as CreateToolInput;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Check for duplicate name
    const existingSnapshot = await db
      .collection(COLLECTIONS.TOOLS)
      .where('publisherId', '==', auth.publisherId)
      .where('name', '==', input.name)
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      sendError(res, `Tool with name "${input.name}" already exists`, 409);
      return true;
    }

    // Generate ID and create tool
    const toolId = generateId(ID_PREFIXES.TOOL);
    const now = new Date();

    const tool: DeveloperTool = {
      id: toolId,
      publisherId: auth.publisherId,
      personaId: input.personaId,
      name: input.name,
      displayName: input.displayName,
      description: input.description,
      llmDescription: input.llmDescription,
      type: input.type,
      config: input.config,
      parameters: input.parameters,
      returns: input.returns,
      enabled: input.enabled ?? true,
      requiresAuth: input.requiresAuth ?? false,
      version: input.version ?? '1.0.0',
      createdAt: now,
      updatedAt: now,
    };

    await db.collection(COLLECTIONS.TOOLS).doc(toolId).set(tool);

    log.info({ toolId, publisherId: auth.publisherId, name: input.name }, 'Tool created');

    sendSuccess(res, tool, 201);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message }, 'Failed to create tool');
    sendError(res, 'Failed to create tool', 500);
    return true;
  }
}

/**
 * GET /tools - List all tools for publisher
 */
async function handleListTools(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse pagination
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const paginationResult = PaginationSchema.safeParse({
    page: url.searchParams.get('page'),
    limit: url.searchParams.get('limit'),
    cursor: url.searchParams.get('cursor'),
  });

  const pagination = paginationResult.success
    ? paginationResult.data
    : { page: 1, limit: 20 };

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Query tools for this publisher
    let query = db
      .collection(COLLECTIONS.TOOLS)
      .where('publisherId', '==', auth.publisherId)
      .orderBy('createdAt', 'desc')
      .limit(pagination.limit);

    // Use cursor if provided
    if (pagination.cursor) {
      const cursorDoc = await db.collection(COLLECTIONS.TOOLS).doc(pagination.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();

    const tools: DeveloperTool[] = snapshot.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        ...data,
        id: doc.id,
        createdAt: convertTimestamp(data.createdAt),
        updatedAt: convertTimestamp(data.updatedAt),
      } as DeveloperTool;
    });

    // Get next cursor
    const nextCursor = tools.length === pagination.limit ? tools[tools.length - 1]?.id : undefined;

    sendSuccess(res, {
      items: tools,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        nextCursor,
        hasMore: !!nextCursor,
      },
    });
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message }, 'Failed to list tools');
    sendError(res, 'Failed to list tools', 500);
    return true;
  }
}

/**
 * GET /tools/:id - Get a specific tool
 */
async function handleGetTool(
  req: IncomingMessage,
  res: ServerResponse,
  toolId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    const doc = await db.collection(COLLECTIONS.TOOLS).doc(toolId).get();

    if (!doc.exists) {
      sendError(res, 'Tool not found', 404);
      return true;
    }

    const data = doc.data() as Record<string, unknown> | undefined;

    // Verify ownership
    if (data?.publisherId !== auth.publisherId) {
      sendError(res, 'Tool not found', 404);
      return true;
    }

    const tool: DeveloperTool = {
      ...data,
      id: doc.id,
      createdAt: convertTimestamp(data?.createdAt),
      updatedAt: convertTimestamp(data?.updatedAt),
    } as DeveloperTool;

    sendSuccess(res, tool);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, toolId }, 'Failed to get tool');
    sendError(res, 'Failed to get tool', 500);
    return true;
  }
}

/**
 * PUT /tools/:id - Update a tool
 */
async function handleUpdateTool(
  req: IncomingMessage,
  res: ServerResponse,
  toolId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse body
  const body = await parseJsonBody(req);
  if (!body) {
    sendError(res, 'Invalid JSON body', 400);
    return true;
  }

  // Validate input
  const parseResult = UpdateToolSchema.safeParse(body);
  if (!parseResult.success) {
    sendError(res, parseResult.error.issues[0]?.message || 'Invalid input', 400);
    return true;
  }

  const input = parseResult.data as UpdateToolInput;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Verify ownership
    const doc = await db.collection(COLLECTIONS.TOOLS).doc(toolId).get();

    if (!doc.exists) {
      sendError(res, 'Tool not found', 404);
      return true;
    }

    const existingData = doc.data();
    if (existingData?.publisherId !== auth.publisherId) {
      sendError(res, 'Tool not found', 404);
      return true;
    }

    // Update
    const updates: Record<string, unknown> = {
      ...input,
      updatedAt: new Date(),
    };

    await db.collection(COLLECTIONS.TOOLS).doc(toolId).update(updates);

    // Return updated tool
    const updatedDoc = await db.collection(COLLECTIONS.TOOLS).doc(toolId).get();
    const data = updatedDoc.data() as Record<string, unknown> | undefined;

    const tool: DeveloperTool = {
      ...data,
      id: updatedDoc.id,
      createdAt: convertTimestamp(data?.createdAt),
      updatedAt: convertTimestamp(data?.updatedAt),
    } as DeveloperTool;

    log.info({ toolId, publisherId: auth.publisherId }, 'Tool updated');

    sendSuccess(res, tool);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, toolId }, 'Failed to update tool');
    sendError(res, 'Failed to update tool', 500);
    return true;
  }
}

/**
 * DELETE /tools/:id - Delete a tool
 */
async function handleDeleteTool(
  req: IncomingMessage,
  res: ServerResponse,
  toolId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Verify ownership
    const doc = await db.collection(COLLECTIONS.TOOLS).doc(toolId).get();

    if (!doc.exists) {
      sendError(res, 'Tool not found', 404);
      return true;
    }

    const data = doc.data();
    if (data?.publisherId !== auth.publisherId) {
      sendError(res, 'Tool not found', 404);
      return true;
    }

    // Delete
    await db.collection(COLLECTIONS.TOOLS).doc(toolId).delete();

    log.info({ toolId, publisherId: auth.publisherId }, 'Tool deleted');

    sendSuccess(res, { deleted: true });
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, toolId }, 'Failed to delete tool');
    sendError(res, 'Failed to delete tool', 500);
    return true;
  }
}

/**
 * POST /tools/:id/test - Test tool execution
 */
async function handleTestTool(
  req: IncomingMessage,
  res: ServerResponse,
  toolId: string
): Promise<boolean> {
  // Authenticate
  const auth = await requireApiKeyAuth(req, res);
  if (!auth) return true;

  // Parse test parameters from body
  const body = await parseJsonBody(req);
  const testParams: Record<string, unknown> = (body?.params as Record<string, unknown>) || {};

  try {
    const { getFirestore } = await import('../../v1/developers/shared/developer-auth.js');
    const db = await getFirestore();

    // Get tool
    const doc = await db.collection(COLLECTIONS.TOOLS).doc(toolId).get();

    if (!doc.exists) {
      sendError(res, 'Tool not found', 404);
      return true;
    }

    const data = doc.data() as Record<string, unknown> | undefined;
    if (data?.publisherId !== auth.publisherId) {
      sendError(res, 'Tool not found', 404);
      return true;
    }

    const tool = data as unknown as DeveloperTool;

    // Execute tool based on type
    const startTime = Date.now();
    let result: ToolTestResult;

    try {
      switch (tool.type) {
        case 'webhook':
          result = await testWebhookTool(tool, testParams);
          break;
        case 'mcp':
          result = await testMCPTool(tool, testParams, auth.publisherId);
          break;
        case 'prompt':
          result = testPromptTool(tool, testParams);
          break;
        default:
          result = {
            success: false,
            error: `Unknown tool type: ${tool.type}`,
          };
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      result = {
        success: false,
        error: err.message,
      };
    }

    result.executionTimeMs = Date.now() - startTime;

    log.info(
      {
        toolId,
        toolType: tool.type,
        success: result.success,
        executionTimeMs: result.executionTimeMs,
      },
      'Tool test executed'
    );

    sendSuccess(res, result);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, toolId }, 'Failed to test tool');
    sendError(res, 'Failed to test tool', 500);
    return true;
  }
}

// ============================================================================
// TOOL EXECUTION HELPERS
// ============================================================================

/**
 * Test a webhook tool by calling its URL
 */
async function testWebhookTool(
  tool: DeveloperTool,
  params: Record<string, unknown>
): Promise<ToolTestResult> {
  if (!tool.config.url) {
    return { success: false, error: 'Webhook URL not configured' };
  }

  try {
    const method = tool.config.method || 'POST';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(tool.config.headers || {}),
    };

    const response = await fetch(tool.config.url, {
      method,
      headers,
      body: method !== 'GET' ? JSON.stringify(params) : undefined,
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    let result: unknown;

    if (contentType.includes('application/json')) {
      result = await response.json();
    } else {
      result = await response.text();
    }

    return {
      success: true,
      result,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      success: false,
      error: `Webhook call failed: ${err.message}`,
    };
  }
}

/**
 * Test an MCP tool by calling the registered MCP server
 */
async function testMCPTool(
  tool: DeveloperTool,
  params: Record<string, unknown>,
  publisherId: string
): Promise<ToolTestResult> {
  if (!tool.config.serverId || !tool.config.toolName) {
    return { success: false, error: 'MCP server or tool name not configured' };
  }

  try {
    // Get the MCP server
    const { getDeveloperMCPServer } = await import(
      '../../../services/developer-mcp-registry.js'
    );
    const server = await getDeveloperMCPServer(tool.config.serverId, publisherId);

    if (!server) {
      return { success: false, error: 'MCP server not found' };
    }

    // Try to call the tool via MCP
    const { callMCPTool, connectToMCPServer } = await import(
      '../../../personas/bundles/mcp-loader.js'
    );

    // Convert to bundle format for connection
    const bundleServer = {
      id: server.serverId || server.name,
      name: server.name,
      transport: server.transport,
      command: server.command,
      args: server.args,
      url: server.endpoint,
      env: server.env,
      timeout: server.timeout,
    };

    // Connect if not already connected
    const connection = await connectToMCPServer(bundleServer);
    if (connection.status !== 'connected') {
      return {
        success: false,
        error: `Failed to connect to MCP server: ${connection.error}`,
      };
    }

    // Call the tool
    const result = await callMCPTool(
      bundleServer.id,
      tool.config.toolName,
      params as Record<string, unknown>
    );

    return {
      success: true,
      result,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      success: false,
      error: `MCP call failed: ${err.message}`,
    };
  }
}

/**
 * Test a prompt tool (returns the rendered prompt)
 */
function testPromptTool(
  tool: DeveloperTool,
  params: Record<string, unknown>
): ToolTestResult {
  if (!tool.config.prompt) {
    return { success: false, error: 'Prompt not configured' };
  }

  try {
    // Simple template interpolation
    let renderedPrompt = tool.config.prompt;

    for (const [key, value] of Object.entries(params)) {
      const placeholder = `{{${key}}}`;
      renderedPrompt = renderedPrompt.replace(new RegExp(placeholder, 'g'), String(value));
    }

    return {
      success: true,
      result: {
        type: 'prompt',
        rendered: renderedPrompt,
        note: 'Prompt tools return rendered prompts that would be injected into LLM context',
      },
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      success: false,
      error: `Prompt rendering failed: ${err.message}`,
    };
  }
}

export default { handleToolsRoutes };
