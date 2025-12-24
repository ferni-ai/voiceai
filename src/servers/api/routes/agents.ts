/**
 * Agent Registry Routes
 *
 * Dynamic agent discovery and configuration.
 * Includes both built-in team members and user-created custom agents.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { rateLimit } from '../../../api/auth-middleware.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { listCustomAgents } from '../../../services/custom-agent/custom-agent-persistence.service.js';
import type { CustomAgent } from '../../../types/custom-agent-api.js';

const log = createLogger({ module: 'AgentRoutes' });

/**
 * Transform custom agent to UI agent format
 */
function customAgentToUiAgent(agent: CustomAgent): {
  id: string;
  name: string;
  initials: string;
  subtitle: string;
  role: 'coach' | 'team' | 'standalone';
  roleId: string;
  isCoordinator: boolean;
  canHandoff: boolean;
  handoffToolName: string;
  entrancePhrase: string;
  themeClass: string;
  voiceId: string;
  colors: { primary: string; secondary: string; gradient: string } | null;
  isCustomAgent: boolean;
  customAgentType: string;
} {
  // Get initials from display name or name
  const displayName = agent.displayName || agent.name;
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Get type-specific subtitle
  const typeSubtitles: Record<string, string> = {
    legacy: 'Remembered Voice',
    mentor: 'Personal Mentor',
    twin: 'Digital Twin',
    fictional: 'Fictional Character',
    professional: 'Professional Assistant',
  };

  // Generate gradient from personality or use defaults
  const warmth = agent.personality?.warmth || 0.5;
  const energy = agent.personality?.energy || 0.5;

  // Map warmth/energy to colors
  // High warmth = warmer colors (oranges/reds)
  // High energy = brighter colors
  const baseHue = Math.round(30 + warmth * 30); // 30-60 (orange to yellow-orange)
  const saturation = Math.round(40 + energy * 30); // 40-70%
  const lightness = Math.round(35 + (1 - energy) * 15); // 35-50%

  const primaryColor = `hsl(${baseHue}, ${saturation}%, ${lightness}%)`;
  const secondaryColor = `hsl(${baseHue - 10}, ${saturation - 10}%, ${lightness - 10}%)`;
  const gradient = `linear-gradient(135deg, ${secondaryColor}, ${primaryColor})`;

  return {
    id: agent.id,
    name: displayName,
    initials,
    subtitle: typeSubtitles[agent.type] || 'Custom Agent',
    role: 'standalone' as const, // Custom agents are standalone
    roleId: `custom-${agent.type}`,
    isCoordinator: false,
    canHandoff: true,
    handoffToolName: '', // Empty string for custom agents
    entrancePhrase: agent.behaviors?.greetings?.[0] || `Hello, I'm ${displayName}.`,
    themeClass: `theme-custom-${agent.type}`,
    voiceId: agent.voice?.voiceId || '', // Empty string if no voice
    colors: {
      primary: primaryColor,
      secondary: secondaryColor,
      gradient,
    },
    isCustomAgent: true,
    customAgentType: agent.type,
  };
}

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
  // Get all available agents (including custom agents)
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

      // Transform built-in agents for UI consumption
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
        isCustomAgent: false,
      }));

      // Fetch user's custom agents if user ID is provided
      const userId = req.headers['x-user-id'] as string | undefined;
      if (userId) {
        try {
          const customAgents = await listCustomAgents(userId);
          // Only include active custom agents in the main roster
          const activeCustomAgents = customAgents.filter(
            (a) => a.status === 'active' && a.voice?.status === 'ready'
          );

          for (const customAgent of activeCustomAgents) {
            // Push with type assertion to match uiAgents type
            const customUiAgent = customAgentToUiAgent(customAgent) as (typeof uiAgents)[0];
            uiAgents.push(customUiAgent);
          }

          log.debug(
            { userId, customAgentCount: activeCustomAgents.length },
            'Added custom agents to roster'
          );
        } catch (customErr) {
          log.warn({ error: (customErr as Error).message }, 'Could not fetch custom agents');
        }
      }

      // Sort: coordinator (Ferni) first, then built-in alphabetically, then custom agents
      uiAgents.sort((a, b) => {
        const aIsCoordinator = a.isCoordinator || a.id === 'ferni';
        const bIsCoordinator = b.isCoordinator || b.id === 'ferni';

        if (aIsCoordinator && !bIsCoordinator) return -1;
        if (!aIsCoordinator && bIsCoordinator) return 1;

        // Custom agents come after built-in agents
        const aIsCustom = 'isCustomAgent' in a && a.isCustomAgent;
        const bIsCustom = 'isCustomAgent' in b && b.isCustomAgent;

        if (!aIsCustom && bIsCustom) return -1;
        if (aIsCustom && !bIsCustom) return 1;

        return a.name.localeCompare(b.name);
      });

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=30', // Private cache for user-specific data
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

      // Short cache for config (private, changes via admin actions)
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=30',
      });
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

      // Edge cache for 1 hour (single agent data is static)
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        Vary: 'Accept-Encoding',
      });
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
