/**
 * Agent Registry Routes
 *
 * Dynamic agent discovery and configuration.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { rateLimit } from '../../../api/auth-middleware.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'AgentRoutes' });

// Helper to parse JSON body
function parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

/**
 * Handle agent routes
 */
export async function handleAgentRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Get all available agents
  if (pathname === '/api/agents' && req.method === 'GET') {
    try {
      const { AgentRegistry } = await import('../../../personas/registry/unified-registry.js');
      let agents = await AgentRegistry.getEnabledAgents();

      // Load disabled agents from config
      const configPath = path.join(process.cwd(), 'data', 'agent-config.json');
      let disabledAgents: string[] = [];
      try {
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          disabledAgents = config.disabledAgents || [];
        }
      } catch (configErr) {
        log.warn({ error: (configErr as Error).message }, 'Could not read agent config');
      }

      // Filter out disabled agents (but never disable the coordinator)
      if (disabledAgents.length > 0) {
        agents = agents.filter((a) => a.isCoordinator || !disabledAgents.includes(a.id));
      }

      // Transform agents for UI consumption
      const uiAgents = agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        initials: agent.ui.initials,
        subtitle: agent.ui.subtitle,
        role: agent.role,
        roleId: agent.roleId,
        isCoordinator: agent.isCoordinator,
        canHandoff: agent.canHandoff,
        handoffToolName: agent.handoffToolName,
        entrancePhrase: agent.ui.entrancePhrase,
        themeClass: agent.ui.themeClass,
        voiceId: agent.voiceId,
        // Cast to extended manifest to access marketplace colors (optional field)
        colors:
          (agent.manifest as { marketplace?: { colors?: unknown } }).marketplace?.colors || null,
      }));

      // Sort: coordinator (Ferni) first, then alphabetically
      uiAgents.sort((a, b) => {
        const aIsCoordinator = a.isCoordinator || a.id === 'ferni';
        const bIsCoordinator = b.isCoordinator || b.id === 'ferni';

        if (aIsCoordinator && !bIsCoordinator) return -1;
        if (!aIsCoordinator && bIsCoordinator) return 1;
        return a.name.localeCompare(b.name);
      });

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      });
      res.end(
        JSON.stringify({
          agents: uiAgents,
          count: uiAgents.length,
          timestamp: new Date().toISOString(),
        })
      );
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Failed to get agents');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Failed to load agents',
          message: (err as Error).message,
          fallback: [
            'ferni',
            'peter-john',
            'alex-chen',
            'maya-santos',
            'jordan-taylor',
            'nayan-patel',
          ],
        })
      );
    }
    return true;
  }

  // Get agent configuration
  if (pathname === '/api/agents/config' && req.method === 'GET') {
    try {
      const configPath = path.join(process.cwd(), 'data', 'agent-config.json');
      let config: { disabledAgents: string[] } = { disabledAgents: [] };

      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          disabledAgents: config.disabledAgents || [],
          timestamp: new Date().toISOString(),
        })
      );
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Failed to read agent config');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to read config', message: (err as Error).message }));
    }
    return true;
  }

  // Get a single agent by ID
  if (
    pathname.startsWith('/api/agents/') &&
    req.method === 'GET' &&
    !pathname.includes('/config') &&
    !pathname.includes('/validate') &&
    !pathname.includes('/enable')
  ) {
    const agentId = pathname.replace('/api/agents/', '');

    try {
      const { AgentRegistry } = await import('../../../personas/registry/unified-registry.js');
      const agent = await AgentRegistry.getAgentOrNull(agentId);

      if (!agent) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Agent not found: ${agentId}` }));
        return true;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: agent.id,
          name: agent.name,
          initials: agent.ui.initials,
          subtitle: agent.ui.subtitle,
          role: agent.role,
          roleId: agent.roleId,
          isCoordinator: agent.isCoordinator,
          canHandoff: agent.canHandoff,
          handoffToolName: agent.handoffToolName,
          entrancePhrase: agent.ui.entrancePhrase,
          themeClass: agent.ui.themeClass,
          voiceId: agent.voiceId,
          aliases: agent.aliases,
          handoffTriggers: agent.handoffTriggers,
          // Cast to extended manifest to access marketplace colors (optional field)
          colors:
            (agent.manifest as { marketplace?: { colors?: unknown } }).marketplace?.colors || null,
        })
      );
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Failed to get agent');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load agent', message: (err as Error).message }));
    }
    return true;
  }

  // Save team order
  if (pathname === '/api/team/order' && req.method === 'POST') {
    if (rateLimit(req, res, { maxRequests: 10, windowMs: 60000 })) {
      return true;
    }

    try {
      const body = await parseJsonBody(req);
      const order = body.order as string[];

      if (!Array.isArray(order)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'order must be an array of agent IDs' }));
        return true;
      }

      const configPath = path.join(process.cwd(), 'data', 'team-order.json');
      const dataDir = path.dirname(configPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      fs.writeFileSync(
        configPath,
        JSON.stringify({ order, updatedAt: new Date().toISOString() }, null, 2)
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Failed to save team order');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to save order' }));
    }
    return true;
  }

  // Validate agent configuration
  if (pathname === '/api/agents/validate' && req.method === 'POST') {
    try {
      const { AgentRegistry } = await import('../../../personas/registry/unified-registry.js');
      const agents = await AgentRegistry.getEnabledAgents();

      const issues: string[] = [];
      for (const agent of agents) {
        if (!agent.voiceId) {
          issues.push(`Agent ${agent.id} has no voiceId`);
        }
        if (!agent.ui?.initials) {
          issues.push(`Agent ${agent.id} has no initials`);
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          valid: issues.length === 0,
          issues,
          agentCount: agents.length,
        })
      );
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Validation failed', message: (err as Error).message }));
    }
    return true;
  }

  // Enable/disable agent
  if (pathname.match(/^\/api\/agents\/[^/]+\/enable$/) && req.method === 'POST') {
    if (rateLimit(req, res, { maxRequests: 10, windowMs: 60000 })) {
      return true;
    }

    const agentId = pathname.split('/')[3];

    try {
      const body = await parseJsonBody(req);
      const enabled = body.enabled as boolean;

      const configPath = path.join(process.cwd(), 'data', 'agent-config.json');
      const dataDir = path.dirname(configPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      let config: { disabledAgents: string[] } = { disabledAgents: [] };
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }

      if (enabled) {
        config.disabledAgents = config.disabledAgents.filter((id) => id !== agentId);
      } else {
        if (!config.disabledAgents.includes(agentId)) {
          config.disabledAgents.push(agentId);
        }
      }

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, enabled }));
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Failed to update agent config');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to update config' }));
    }
    return true;
  }

  return false;
}
