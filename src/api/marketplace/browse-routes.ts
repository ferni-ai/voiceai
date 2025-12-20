/**
 * Marketplace Browse Routes
 *
 * Handles catalog browsing:
 * - GET /api/marketplace/registry - Full registry with agents and categories
 * - GET /api/marketplace/browse/tools - List all tools
 * - GET /api/marketplace/browse/agents - List all agents
 * - GET /api/marketplace/browse/tools/:id - Get tool details
 * - GET /api/marketplace/browse/agents/:id - Get agent details
 */

import { readFileSync, existsSync } from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getAgent, getTool, listAgents, listTools } from '../../marketplace/index.js';
import { getLogger } from '../../utils/safe-logger.js';
import { sendJson } from './helpers.js';

const log = getLogger().child({ module: 'marketplace-browse' });

// Get the path to the marketplace-agents registry
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MARKETPLACE_REGISTRY_PATH = join(__dirname, '../../../apps/marketplace-agents/registry.json');

// Cache for the marketplace registry
let cachedRegistry: MarketplaceRegistryData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

interface MarketplaceRegistryAgent {
  id: string;
  name: string;
  display_name: string;
  description: string;
  short_description: string;
  category: string;
  tags: string[];
  icon: string;
  version: string;
  author: string;
  license: 'free' | 'premium' | 'enterprise';
  colors: {
    primary: string;
    secondary: string;
    gradient?: string;
    glow?: string;
  };
  downloads: number;
  rating: number;
}

interface MarketplaceCategory {
  id: string;
  name: string;
  description: string;
}

interface MarketplaceRegistryData {
  version: string;
  name: string;
  description: string;
  repository: string;
  updated_at: string;
  categories: MarketplaceCategory[];
  agents: MarketplaceRegistryAgent[];
}

/**
 * Load the marketplace registry from apps/marketplace-agents/registry.json
 * with caching to avoid repeated filesystem reads
 */
function loadMarketplaceRegistry(): MarketplaceRegistryData | null {
  const now = Date.now();

  // Return cached if still valid
  if (cachedRegistry && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRegistry;
  }

  try {
    if (!existsSync(MARKETPLACE_REGISTRY_PATH)) {
      log.warn({ path: MARKETPLACE_REGISTRY_PATH }, 'Marketplace registry file not found');
      return null;
    }

    const content = readFileSync(MARKETPLACE_REGISTRY_PATH, 'utf-8');
    cachedRegistry = JSON.parse(content) as MarketplaceRegistryData;
    cacheTimestamp = now;
    log.info({ agentCount: cachedRegistry.agents.length }, 'Loaded marketplace registry');
    return cachedRegistry;
  } catch (error) {
    log.error({ error: String(error), path: MARKETPLACE_REGISTRY_PATH }, 'Failed to load marketplace registry');
    return null;
  }
}

/**
 * Handle browse routes
 */
export async function handleBrowseRoutes(
  _req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string
): Promise<boolean> {
  // GET /api/marketplace/registry - Full registry for frontend marketplace UI
  // Loads from apps/marketplace-agents/registry.json (external marketplace agents)
  if (pathname === '/api/marketplace/registry' && method === 'GET') {
    try {
      // Load from the curated marketplace registry
      const registry = loadMarketplaceRegistry();

      if (!registry) {
        // Return empty registry if file not found
        sendJson(res, 200, {
          version: '1.0.0',
          name: 'Ferni Marketplace',
          description: 'Discover AI coaches and tools for personal growth',
          repository: 'https://github.com/sethdford/voiceai-agents',
          agents: [],
          categories: [],
          updated_at: new Date().toISOString(),
        });
        return true;
      }

      // Add path field to each agent for manifest loading
      const agentsWithPath = registry.agents.map((agent) => ({
        ...agent,
        path: `agents/${agent.id}`,
      }));

      sendJson(res, 200, {
        ...registry,
        agents: agentsWithPath,
      });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error({ error: err.message }, 'Failed to serve marketplace registry');
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

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

