/**
 * Commands API Routes
 *
 * HTTP endpoints for persona slash commands.
 * Commands are markdown files in persona bundles that define
 * prompts users can invoke via the UI.
 *
 * @module @ferni/api/commands-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getCommand,
  loadCommandsWithCache,
  renderCommand,
} from '../personas/bundles/commands-loader.js';
import { createLogger } from '../utils/safe-logger.js';
import { parseRequestBody, sendError, sendJsonResponse, sendJSONEdgeCached } from './helpers.js';

const log = createLogger({ module: 'CommandsRoutes' });

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle all command-related routes
 */
export async function handleCommandsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  path: string
): Promise<boolean> {
  const method = req.method?.toUpperCase();

  try {
    // GET /api/commands/:personaId - List commands for a persona
    const listMatch = path.match(/^\/api\/commands\/([^/]+)$/);
    if (listMatch && method === 'GET') {
      return handleListCommands(req, res, listMatch[1]);
    }

    // GET /api/commands/:personaId/:commandId - Get a specific command
    const getMatch = path.match(/^\/api\/commands\/([^/]+)\/([^/]+)$/);
    if (getMatch && method === 'GET') {
      return handleGetCommand(req, res, getMatch[1], getMatch[2]);
    }

    // POST /api/commands/:personaId/:commandId/render - Render command with args
    const renderMatch = path.match(/^\/api\/commands\/([^/]+)\/([^/]+)\/render$/);
    if (renderMatch && method === 'POST') {
      return handleRenderCommand(req, res, renderMatch[1], renderMatch[2]);
    }

    return false; // Route not handled
  } catch (error) {
    log.error({ error, path, method }, 'Commands route error');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}

// ============================================================================
// ENDPOINTS
// ============================================================================

/**
 * GET /api/commands/:personaId
 * Returns list of commands for a persona
 *
 * Edge cached for 1 hour (commands are static content)
 */
async function handleListCommands(
  req: IncomingMessage,
  res: ServerResponse,
  personaId: string
): Promise<boolean> {
  log.debug({ personaId }, 'Listing commands for persona');

  const commands = await loadCommandsWithCache(personaId);

  // Return minimal command info for UI display
  const commandList = commands.map((cmd) => ({
    id: cmd.id,
    name: cmd.name,
    description: cmd.description,
    category: cmd.category,
    icon: cmd.icon,
    shortcut: cmd.shortcut,
    requiresConfirmation: cmd.requiresConfirmation,
    hasArguments: (cmd.arguments?.length ?? 0) > 0,
  }));

  // Edge cache for 1 hour (commands are static per-persona)
  sendJSONEdgeCached(
    res,
    {
      personaId,
      commands: commandList,
      count: commandList.length,
    },
    3600
  ); // 1 hour

  return true;
}

/**
 * GET /api/commands/:personaId/:commandId
 * Returns detailed info for a specific command
 *
 * Edge cached for 1 hour (command definitions are static)
 */
async function handleGetCommand(
  req: IncomingMessage,
  res: ServerResponse,
  personaId: string,
  commandId: string
): Promise<boolean> {
  log.debug({ personaId, commandId }, 'Getting command');

  const command = await getCommand(personaId, commandId);

  if (!command) {
    sendError(res, 'Command not found', 404);
    return true;
  }

  // Edge cache for 1 hour (command definitions are static)
  sendJSONEdgeCached(
    res,
    {
      command: {
        id: command.id,
        name: command.name,
        description: command.description,
        category: command.category,
        icon: command.icon,
        shortcut: command.shortcut,
        requiresConfirmation: command.requiresConfirmation,
        arguments: command.arguments,
        // Include prompt for full view (used when executing)
        prompt: command.prompt,
      },
    },
    3600
  ); // 1 hour

  return true;
}

/**
 * POST /api/commands/:personaId/:commandId/render
 * Renders a command with provided arguments
 */
async function handleRenderCommand(
  req: IncomingMessage,
  res: ServerResponse,
  personaId: string,
  commandId: string
): Promise<boolean> {
  log.debug({ personaId, commandId }, 'Rendering command');

  const body = await parseRequestBody<{
    args?: Record<string, string>;
  }>(req);

  const command = await getCommand(personaId, commandId);

  if (!command) {
    sendError(res, 'Command not found', 404);
    return true;
  }

  const renderedPrompt = renderCommand(command, body?.args || {});

  sendJsonResponse(res, 200, {
    commandId,
    renderedPrompt,
    originalPrompt: command.prompt,
    args: body?.args || {},
  });

  return true;
}

export default handleCommandsRoutes;
