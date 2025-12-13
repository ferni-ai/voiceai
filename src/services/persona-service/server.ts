/**
 * Persona Service Server
 *
 * Standalone HTTP server for persona/agent context.
 * Provides system prompts, greetings, and voice configuration.
 *
 * Usage:
 *   node dist/services/persona-service/server.js
 *   # or
 *   pnpm service:personas
 */

import express from 'express';
import { createLogger } from '../../utils/logger.js';
import { AgentRegistry } from '../../personas/registry/unified-registry.js';

const log = createLogger('persona-service');

// Lazy-loaded modules (avoid heavy imports at startup)
let bundleLoader: typeof import('../../personas/bundles/loader.js') | null = null;

async function ensureInitialized(): Promise<void> {
  if (!bundleLoader) {
    bundleLoader = await import('../../personas/bundles/loader.js');
    log.info('Bundle loader initialized');
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface GetSystemPromptRequest {
  personaId: string;
  userId: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

interface GetSystemPromptResponse {
  systemPrompt: string;
  greeting: string;
  voiceConfig: {
    provider: string;
    voiceId: string;
  };
}

interface GetPersonaRequest {
  personaId: string;
}

interface GetPersonaResponse {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
}

// ============================================================================
// SERVER
// ============================================================================

const app = express();
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'persona-service', timestamp: new Date().toISOString() });
});

// Get system prompt
app.post('/ferni.personas.v1.PersonaService/GetSystemPrompt', async (req, res) => {
  const request = req.body as GetSystemPromptRequest;

  log.info({ personaId: request.personaId, userId: request.userId }, 'Getting system prompt');

  try {
    await ensureInitialized();

    const agent = await AgentRegistry.getAgentOrNull(request.personaId);
    if (!agent) {
      return res.status(404).json({ error: `Persona '${request.personaId}' not found` });
    }

    // Try to load bundle for richer content
    let systemPrompt = agent.description || '';
    let greeting = `Hello! I'm ${agent.displayName}.`;

    try {
      const bundle = await bundleLoader!.loadBundle(request.personaId);
      if (bundle) {
        // Get system prompt from bundle if available
        const identity = bundle.getIdentity?.();
        if (identity?.systemPrompt) {
          systemPrompt = identity.systemPrompt;
        }

        // Get greeting from bundle if available
        const behaviors = bundle.getBehaviors?.();
        if (behaviors?.greetings?.length > 0) {
          greeting = behaviors.greetings[0];
        }
      }
    } catch (bundleError) {
      log.warn({ personaId: request.personaId, error: String(bundleError) }, 'Bundle load failed, using defaults');
    }

    const response: GetSystemPromptResponse = {
      systemPrompt,
      greeting,
      voiceConfig: {
        provider: agent.voice?.provider || 'cartesia',
        voiceId: agent.voice?.voiceId || '',
      },
    };

    res.json(response);

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ personaId: request.personaId, error: err.message }, 'Failed to get system prompt');
    res.status(500).json({ error: err.message });
  }
});

// Get persona details
app.post('/ferni.personas.v1.PersonaService/GetPersona', async (req, res) => {
  const request = req.body as GetPersonaRequest;

  try {
    await ensureInitialized();

    const agent = await AgentRegistry.getAgentOrNull(request.personaId);
    if (!agent) {
      return res.status(404).json({ error: `Persona '${request.personaId}' not found` });
    }

    const response: GetPersonaResponse = {
      id: agent.id,
      name: agent.displayName,
      description: agent.description || '',
      capabilities: agent.capabilities || [],
    };

    res.json(response);

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ personaId: request.personaId, error: err.message }, 'Failed to get persona');
    res.status(500).json({ error: err.message });
  }
});

// List all personas
app.post('/ferni.personas.v1.PersonaService/ListPersonas', async (req, res) => {
  try {
    await ensureInitialized();

    const agents = await AgentRegistry.getAllAgents();

    const response = {
      personas: agents.map(agent => ({
        id: agent.id,
        name: agent.displayName,
        description: agent.description || '',
        role: agent.role || 'team',
      })),
      totalCount: agents.length,
    };

    res.json(response);

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message }, 'Failed to list personas');
    res.status(500).json({ error: err.message });
  }
});

// Health endpoint for gRPC style
app.post('/ferni.personas.v1.PersonaService/Health', (_req, res) => {
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
  const port = parseInt(process.env.PORT || '50052', 10);

  // Pre-initialize to catch startup errors
  await ensureInitialized();

  const agentCount = (await AgentRegistry.getAllAgents()).length;
  log.info({ agentCount }, 'Agent registry ready');

  app.listen(port, '0.0.0.0', () => {
    log.info({ port }, 'Persona service started');
  });
}

main().catch((error) => {
  log.error({ error: String(error) }, 'Failed to start persona service');
  process.exit(1);
});
