/**
 * Marketplace Browse Routes
 *
 * Handles catalog browsing:
 * - GET /api/marketplace/browse/tools - List all tools
 * - GET /api/marketplace/browse/agents - List all agents
 * - GET /api/marketplace/browse/tools/:id - Get tool details
 * - GET /api/marketplace/browse/agents/:id - Get agent details
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getAgent, getTool, listAgents, listTools } from '../../marketplace/index.js';
import { sendJson } from './helpers.js';

/**
 * Handle browse routes
 */
export async function handleBrowseRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string
): Promise<boolean> {
  // GET /api/marketplace/browse/tools - List all tools
  if (pathname === '/api/marketplace/browse/tools' && method === 'GET') {
    try {
      const tools = listTools().map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description?.short || '',
        version: t.version,
        publisher: t.publisher,
        trustLevel: t.verification.trustLevel,
        verified: t.verification.verified,
      }));

      sendJson(res, 200, { tools, totalCount: tools.length });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/browse/agents - List all agents
  if (pathname === '/api/marketplace/browse/agents' && method === 'GET') {
    try {
      const agents = listAgents().map((a) => ({
        id: a.id,
        name: a.name,
        displayName: a.displayName,
        description: a.description || '',
        version: a.version,
        publisher: a.publisher,
        trustLevel: a.verification.trustLevel,
        verified: a.verification.verified,
      }));

      sendJson(res, 200, { agents, totalCount: agents.length });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/browse/tools/:id - Get tool details
  if (pathname.match(/^\/api\/marketplace\/browse\/tools\/[^/]+$/) && method === 'GET') {
    const toolId = pathname.split('/')[5];

    try {
      const tool = getTool(toolId);
      if (!tool) {
        sendJson(res, 404, { error: 'Tool not found' });
        return true;
      }

      sendJson(res, 200, { tool });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/browse/agents/:id - Get agent details
  if (pathname.match(/^\/api\/marketplace\/browse\/agents\/[^/]+$/) && method === 'GET') {
    const agentId = pathname.split('/')[5];

    try {
      const agent = getAgent(agentId);
      if (!agent) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      sendJson(res, 200, { agent });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  return false;
}

