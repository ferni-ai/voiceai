/**
 * Admin Agents API Routes (v1)
 *
 * Unified API for managing AI agents and personas.
 *
 * Routes:
 * - GET    /api/v1/admin/agents           - List all agents
 * - GET    /api/v1/admin/agents/config    - Get agent configuration
 * - GET    /api/v1/admin/agents/stats     - Get registry statistics
 * - GET    /api/v1/admin/agents/:id       - Get specific agent
 * - PUT    /api/v1/admin/agents/:id       - Update agent settings
 * - POST   /api/v1/admin/agents/:id/enable - Enable/disable agent
 * - POST   /api/v1/admin/agents/validate  - Validate all agent bundles
 * - POST   /api/v1/admin/agents/order     - Update team roster order
 * - POST   /api/v1/admin/agents/register  - Register runtime persona (OCP)
 * - DELETE /api/v1/admin/agents/:id/runtime - Unregister runtime persona
 *
 * @module AdminAgentsAPI
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import fs from 'fs';
import path from 'path';
import { createLogger } from '../../../utils/safe-logger.js';
import { parseBody, sendJSON, sendError, handleCorsPreflightIfNeeded } from '../../helpers.js';
import { requireAuth, requireAdmin, rateLimit } from '../../auth-middleware.js';

const log = createLogger({ module: 'AdminAgentsAPI' });

// Base path for these routes
const BASE_PATH = '/api/v1/admin/agents';

// Helper to get config path
function getConfigPath(): string {
  return path.join(process.cwd(), 'data', 'agent-config.json');
}

// Helper to read agent config
function readAgentConfig(): { disabledAgents: string[]; teamOrder?: string[] } {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (e) {
    log.warn({ error: e }, 'Failed to read agent config');
  }
  return { disabledAgents: [] };
}

// Helper to write agent config
function writeAgentConfig(config: { disabledAgents: string[]; teamOrder?: string[] }): void {
  const configPath = getConfigPath();
  const dataDir = path.dirname(configPath);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Handle all agent admin routes
 * @returns true if the request was handled
 */
export async function handleAdminAgentsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  const method = req.method || 'GET';

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Only handle /api/v1/admin/agents routes
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  // Rate limiting
  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
    return true;
  }

  // All admin routes require auth (read operations allow dev mode)
  if (method === 'GET') {
    const auth = requireAuth(req, res, { allowDevMode: true });
    if (!auth) return true;
  } else {
    const auth = requireAdmin(req, res);
    if (!auth) return true;
  }

  // Get the path after the base path
  const subPath = pathname.slice(BASE_PATH.length) || '/';

  try {
    // Dynamically import AgentRegistry
    const { AgentRegistry } = await import('../../../personas/registry/unified-registry.js');

    // ========================================================================
    // LIST ALL AGENTS
    // ========================================================================
    if (subPath === '/' && method === 'GET') {
      const registryAgents = await AgentRegistry.getEnabledAgents();

      // If no agents, return hardcoded fallback (simplified agent list for UI)
      const agents =
        registryAgents && registryAgents.length > 0 ? registryAgents : getFallbackAgents();

      sendJSON(res, {
        agents,
        count: agents.length,
      });
      return true;
    }

    // ========================================================================
    // GET AGENT CONFIG
    // ========================================================================
    if (subPath === '/config' && method === 'GET') {
      const config = readAgentConfig();
      sendJSON(res, config);
      return true;
    }

    // ========================================================================
    // GET REGISTRY STATS (OCP)
    // ========================================================================
    if (subPath === '/stats' && method === 'GET') {
      const { getPersonaRegistry } =
        await import('../../../personas/registry/persona-registry-impl.js');
      const registry = getPersonaRegistry();
      const stats = await registry.getStats();

      sendJSON(res, {
        ...stats,
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    // ========================================================================
    // REGISTER RUNTIME PERSONA (OCP - Open-Closed Principle)
    // ========================================================================
    if (subPath === '/register' && method === 'POST') {
      const { getPersonaRegistry } =
        await import('../../../personas/registry/persona-registry-impl.js');
      const registry = getPersonaRegistry();

      const body = (await parseBody(req)) as {
        id: string;
        name: string;
        description?: string;
        voice?: { voiceId: string; provider: 'cartesia' | 'openai' | 'elevenlabs' };
        role?: 'team' | 'coach' | 'standalone';
        aliases?: string[];
        overwrite?: boolean;
        source?: 'runtime' | 'plugin';
      };

      if (!body.id || !body.name) {
        sendError(res, 'id and name are required', 400);
        return true;
      }

      const persona = {
        id: body.id,
        name: body.name,
        description: body.description || '',
        voice: body.voice || { voiceId: 'default', provider: 'cartesia' as const },
        role: body.role || ('team' as const),
        aliases: body.aliases || [],
      };

      const result = await registry.register(persona, {
        overwrite: body.overwrite || false,
        source: body.source || 'runtime',
      });

      if (result.success) {
        log.info(
          { personaId: result.personaId, replaced: result.replaced },
          'Runtime persona registered via API'
        );
        sendJSON(res, {
          success: true,
          personaId: result.personaId,
          replaced: result.replaced,
          message: result.message,
        });
      } else {
        log.warn(
          { personaId: body.id, message: result.message },
          'Runtime persona registration failed'
        );
        sendError(res, result.message || 'Registration failed', 400);
      }
      return true;
    }

    // ========================================================================
    // VALIDATE ALL AGENTS (Admin only)
    // ========================================================================
    if (subPath === '/validate' && method === 'POST') {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      try {
        const { stdout, stderr } = await execAsync('npm run personas:validate', {
          cwd: process.cwd(),
          timeout: 30000,
        });

        sendJSON(res, {
          success: true,
          output: stdout,
          errors: stderr || null,
        });
      } catch (e) {
        const error = e as { stdout?: string; stderr?: string; message: string };
        sendJSON(res, {
          success: false,
          output: error.stdout || '',
          errors: error.stderr || error.message,
        });
      }
      return true;
    }

    // ========================================================================
    // UPDATE TEAM ORDER
    // ========================================================================
    if (subPath === '/order' && method === 'POST') {
      const body = (await parseBody(req)) as { order?: string[] };

      if (!body.order || !Array.isArray(body.order)) {
        sendError(res, 'order array is required', 400);
        return true;
      }

      const config = readAgentConfig();
      config.teamOrder = body.order;
      writeAgentConfig(config);

      log.info({ order: body.order }, 'Team order updated via API');
      sendJSON(res, { success: true, order: body.order });
      return true;
    }

    // ========================================================================
    // CREATE AGENT FROM TEMPLATE
    // ========================================================================
    if (subPath === '/create-from-template' && method === 'POST') {
      const body = (await parseBody(req)) as {
        id: string;
        name: string;
        subtitle?: string;
        template: string;
        personality?: string;
        colors?: { primary: string; secondary: string };
        initials?: string;
        voiceStyle?: string;
      };

      if (!body.id || !body.name || !body.template) {
        sendError(res, 'id, name, and template are required', 400);
        return true;
      }

      // Validate agent ID format
      if (!/^[a-z0-9-]+$/.test(body.id)) {
        sendError(res, 'Agent ID must be lowercase letters, numbers, and hyphens only', 400);
        return true;
      }

      // Check if agent already exists
      const existingAgent = await AgentRegistry.getAgentOrNull(body.id);
      if (existingAgent) {
        sendError(res, `Agent "${body.id}" already exists`, 409);
        return true;
      }

      // Store agent configuration
      const configPath = path.join(process.cwd(), 'data', 'agent-customizations.json');
      let customizations: Record<string, unknown> = {};

      try {
        if (fs.existsSync(configPath)) {
          customizations = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
      } catch {
        // Start fresh
      }

      const agentConfig = {
        id: body.id,
        name: body.name,
        subtitle: body.subtitle || '',
        template: body.template,
        personality: body.personality || '',
        colors: body.colors || { primary: '#4a6741', secondary: '#3d5a35' },
        initials: body.initials || body.name.slice(0, 2).toUpperCase(),
        voiceStyle: body.voiceStyle || 'neutral',
        createdAt: new Date().toISOString(),
        createdFromTemplate: true,
      };

      customizations[body.id] = agentConfig;

      const dataDir = path.dirname(configPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(customizations, null, 2));

      // Optionally scaffold a persona bundle directory
      let bundlePath: string | null = null;
      const bundleDir = path.join(process.cwd(), 'src', 'personas', 'bundles', body.id);

      if (!fs.existsSync(bundleDir)) {
        try {
          // Create basic bundle structure
          fs.mkdirSync(bundleDir, { recursive: true });
          fs.mkdirSync(path.join(bundleDir, 'identity'), { recursive: true });
          fs.mkdirSync(path.join(bundleDir, 'content', 'behaviors'), { recursive: true });

          // Create manifest
          const manifest = {
            id: body.id,
            version: '1.0.0',
            name: body.name,
            subtitle: body.subtitle || '',
            template: body.template,
            enabled: true,
            colors: body.colors,
            voice: {
              provider: 'elevenlabs',
              style: body.voiceStyle || 'neutral',
            },
          };
          fs.writeFileSync(
            path.join(bundleDir, 'persona.manifest.json'),
            JSON.stringify(manifest, null, 2)
          );

          // Create basic system prompt
          const systemPrompt = `# ${body.name}

## Role
${body.subtitle || 'AI Assistant'}

## Personality
${body.personality || 'Friendly and helpful'}

## Communication Style
- Warm and conversational
- Clear and concise
- Supportive and encouraging

## Template
Created from the "${body.template}" template.
`;
          fs.writeFileSync(path.join(bundleDir, 'identity', 'system-prompt.md'), systemPrompt);

          // Create basic greetings behavior
          const greetings = {
            greetings: [
              {
                context: 'first_meeting',
                phrases: [
                  `Hi! I'm ${body.name}. It's great to meet you!`,
                  `Hello there! I'm ${body.name}, nice to connect with you.`,
                ],
              },
              {
                context: 'returning_user',
                phrases: [`Welcome back! Great to see you again.`, `Hey there! How have you been?`],
              },
            ],
          };
          fs.writeFileSync(
            path.join(bundleDir, 'content', 'behaviors', 'greetings.json'),
            JSON.stringify(greetings, null, 2)
          );

          bundlePath = bundleDir;
          log.info({ agentId: body.id, bundlePath }, 'Persona bundle scaffolded');
        } catch (e) {
          log.warn({ error: e, agentId: body.id }, 'Failed to scaffold persona bundle');
          // Continue - config was saved even if bundle scaffolding failed
        }
      }

      log.info({ agentId: body.id, template: body.template }, 'Agent created from template');
      sendJSON(res, {
        success: true,
        agent: agentConfig,
        bundlePath,
        message: bundlePath
          ? `Agent "${body.name}" created with persona bundle at ${bundlePath}`
          : `Agent "${body.name}" configuration saved. Create persona bundle manually.`,
      });
      return true;
    }

    // ========================================================================
    // SINGLE AGENT OPERATIONS
    // ========================================================================
    const agentIdMatch = subPath.match(/^\/([^/]+)$/);
    const enableMatch = subPath.match(/^\/([^/]+)\/enable$/);
    const runtimeDeleteMatch = subPath.match(/^\/([^/]+)\/runtime$/);

    // DELETE /api/v1/admin/agents/:id/runtime - Unregister runtime persona
    if (runtimeDeleteMatch && method === 'DELETE') {
      const personaId = decodeURIComponent(runtimeDeleteMatch[1]);
      const { getPersonaRegistry } =
        await import('../../../personas/registry/persona-registry-impl.js');
      const registry = getPersonaRegistry();

      const removed = await registry.unregister(personaId);

      if (removed) {
        log.info({ personaId }, 'Runtime persona unregistered via API');
        sendJSON(res, {
          success: true,
          personaId,
          message: `Persona "${personaId}" unregistered successfully`,
        });
      } else {
        sendError(res, `Persona "${personaId}" not found or is not a runtime persona`, 404);
      }
      return true;
    }

    // POST /api/v1/admin/agents/:id/enable - Enable/disable agent
    if (enableMatch && method === 'POST') {
      const agentId = decodeURIComponent(enableMatch[1]);
      const body = (await parseBody(req)) as { enabled?: boolean };
      const enabled = body.enabled !== false;

      const config = readAgentConfig();

      if (enabled) {
        config.disabledAgents = config.disabledAgents.filter((id) => id !== agentId);
      } else {
        if (!config.disabledAgents.includes(agentId)) {
          config.disabledAgents.push(agentId);
        }
      }

      writeAgentConfig(config);

      log.info({ agentId, enabled }, 'Agent enable/disable via API');
      sendJSON(res, {
        success: true,
        agentId,
        enabled,
        disabledAgents: config.disabledAgents,
      });
      return true;
    }

    // GET /api/v1/admin/agents/:id - Get specific agent
    if (agentIdMatch && method === 'GET') {
      const agentId = decodeURIComponent(agentIdMatch[1]);
      const agent = await AgentRegistry.getAgentOrNull(agentId);

      if (!agent) {
        sendError(res, `Agent "${agentId}" not found`, 404);
        return true;
      }

      sendJSON(res, { agent });
      return true;
    }

    // PUT /api/v1/admin/agents/:id - Update agent settings
    if (agentIdMatch && method === 'PUT') {
      const agentId = decodeURIComponent(agentIdMatch[1]);
      const body = (await parseBody(req)) as {
        colors?: { primary: string; secondary: string };
        subtitle?: string;
      };

      // Verify agent exists
      const agent = await AgentRegistry.getAgentOrNull(agentId);
      if (!agent) {
        sendError(res, `Agent "${agentId}" not found`, 404);
        return true;
      }

      // Store customizations in config file
      const configPath = path.join(process.cwd(), 'data', 'agent-customizations.json');
      let customizations: Record<string, unknown> = {};

      try {
        if (fs.existsSync(configPath)) {
          customizations = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
      } catch {
        // Start fresh
      }

      customizations[agentId] = {
        ...((customizations[agentId] as Record<string, unknown>) || {}),
        ...body,
        updatedAt: new Date().toISOString(),
      };

      const dataDir = path.dirname(configPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(customizations, null, 2));

      log.info({ agentId, updates: body }, 'Agent customization updated via API');
      sendJSON(res, {
        success: true,
        agentId,
        customizations: customizations[agentId],
      });
      return true;
    }

    // Route not matched
    return false;
  } catch (error) {
    log.error({ error, pathname, method }, 'Admin agents API error');
    sendError(res, 'Internal server error');
    return true;
  }
}

/**
 * Fallback agents when registry is unavailable
 */
function getFallbackAgents() {
  return [
    {
      id: 'ferni',
      name: 'Ferni',
      subtitle: 'Life Coach',
      initials: 'F',
      roleId: 'life-coach',
      isCoordinator: true,
      colors: { primary: '#4a6741', secondary: '#3d5a35' },
    },
    {
      id: 'jack',
      name: 'Jack',
      subtitle: 'Sage Mentor',
      initials: 'J',
      roleId: 'sage',
      colors: { primary: '#9a7b5a', secondary: '#7d6348' },
    },
    {
      id: 'peter',
      name: 'Peter',
      subtitle: 'Research Expert',
      initials: 'PJ',
      roleId: 'researcher',
      colors: { primary: '#3a6b73', secondary: '#2d5359' },
    },
    {
      id: 'alex',
      name: 'Alex',
      subtitle: 'Communications Pro',
      initials: 'AC',
      roleId: 'communications',
      colors: { primary: '#5a6b8a', secondary: '#4a5a73' },
    },
    {
      id: 'maya',
      name: 'Maya',
      subtitle: 'Habits Coach',
      initials: 'MS',
      roleId: 'habits',
      colors: { primary: '#a67a6a', secondary: '#8a635a' },
    },
    {
      id: 'jordan',
      name: 'Jordan',
      subtitle: 'Event Planner',
      initials: 'JT',
      roleId: 'events',
      colors: { primary: '#c4856a', secondary: '#a86d55' },
    },
  ];
}

export default { handleAdminAgentsRoutes };
