/**
 * Admin Model Configuration API Routes (v1)
 *
 * Manage LLM model parameters, system prompts, and tool configuration via admin dashboard.
 *
 * Routes:
 * - GET    /api/v1/admin/model-config                    - Get full config store
 * - GET    /api/v1/admin/model-config/defaults           - Get default Gemini config
 * - PUT    /api/v1/admin/model-config/defaults           - Update default Gemini config
 * - GET    /api/v1/admin/model-config/models             - List available models
 * - GET    /api/v1/admin/model-config/tool-domains       - List available tool domains
 * - GET    /api/v1/admin/model-config/tool-defaults      - Get default tool config
 * - PUT    /api/v1/admin/model-config/tool-defaults      - Update default tool config
 * - GET    /api/v1/admin/model-config/persona/:id        - Get persona config
 * - PUT    /api/v1/admin/model-config/persona/:id        - Update persona config
 * - DELETE /api/v1/admin/model-config/persona/:id        - Delete persona config (revert to defaults)
 * - PUT    /api/v1/admin/model-config/persona/:id/prompt - Update system prompt only
 * - GET    /api/v1/admin/model-config/persona/:id/tools  - Get persona tool config
 * - PUT    /api/v1/admin/model-config/persona/:id/tools  - Update persona tool config
 * - POST   /api/v1/admin/model-config/reset              - Reset all to defaults
 *
 * @module AdminModelConfigAPI
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { createLogger } from '../../../utils/safe-logger.js';
import { parseBody, sendJSON, sendError, handleCorsPreflightIfNeeded } from '../../helpers.js';
import { requireAuth, requireAdmin, rateLimit } from '../../auth-middleware.js';
import {
  modelConfig,
  validateGeminiConfig,
  AVAILABLE_TOOL_DOMAINS,
  type GeminiModelConfig,
  type PersonaModelConfig,
  type ToolConfig,
} from '../../../services/llm/model-config.js';

const log = createLogger({ module: 'AdminModelConfigAPI' });

// Base path for these routes
const BASE_PATH = '/api/v1/admin/model-config';

/**
 * Handle all model config admin routes
 * @returns true if the request was handled
 */
export async function handleAdminModelConfigRoutes(
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

  // Only handle /api/v1/admin/model-config routes
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
    // =========================================================================
    // GET /api/v1/admin/model-config - Get full config store
    // =========================================================================
    if (subPath === '/' && method === 'GET') {
      const store = modelConfig.getStore();
      sendJSON(res, {
        success: true,
        data: store,
      });
      return true;
    }

    // =========================================================================
    // GET /api/v1/admin/model-config/models - List available models
    // =========================================================================
    if (subPath === '/models' && method === 'GET') {
      sendJSON(res, {
        success: true,
        models: modelConfig.availableModels,
      });
      return true;
    }

    // =========================================================================
    // GET /api/v1/admin/model-config/tool-domains - List available tool domains
    // =========================================================================
    if (subPath === '/tool-domains' && method === 'GET') {
      sendJSON(res, {
        success: true,
        domains: AVAILABLE_TOOL_DOMAINS,
      });
      return true;
    }

    // =========================================================================
    // GET /api/v1/admin/model-config/tool-defaults - Get default tool config
    // =========================================================================
    if (subPath === '/tool-defaults' && method === 'GET') {
      const toolDefaults = modelConfig.getDefaultToolConfig();
      sendJSON(res, {
        success: true,
        toolDefaults,
        domains: AVAILABLE_TOOL_DOMAINS,
      });
      return true;
    }

    // =========================================================================
    // PUT /api/v1/admin/model-config/tool-defaults - Update default tool config
    // =========================================================================
    if (subPath === '/tool-defaults' && method === 'PUT') {
      const body = (await parseBody(req)) as Partial<ToolConfig> & { updatedBy?: string };
      const { updatedBy, ...config } = body;
      modelConfig.setDefaultToolConfig(config, updatedBy);

      log.info({ updatedBy }, 'Default tool config updated via API');
      sendJSON(res, {
        success: true,
        toolDefaults: modelConfig.getDefaultToolConfig(),
      });
      return true;
    }

    // =========================================================================
    // GET /api/v1/admin/model-config/defaults - Get default config
    // =========================================================================
    if (subPath === '/defaults' && method === 'GET') {
      const defaults = modelConfig.getDefault();
      sendJSON(res, {
        success: true,
        defaults,
      });
      return true;
    }

    // =========================================================================
    // PUT /api/v1/admin/model-config/defaults - Update default config
    // =========================================================================
    if (subPath === '/defaults' && method === 'PUT') {
      const body = (await parseBody(req)) as Partial<GeminiModelConfig> & { updatedBy?: string };

      // Validate
      const validation = validateGeminiConfig(body);
      if (!validation.valid) {
        sendError(res, `Invalid configuration: ${validation.errors.join(', ')}`, 400);
        return true;
      }

      // Extract updatedBy from body
      const { updatedBy, ...config } = body;
      modelConfig.setDefault(config, updatedBy);

      log.info({ updatedBy }, 'Default model config updated via API');
      sendJSON(res, {
        success: true,
        defaults: modelConfig.getDefault(),
      });
      return true;
    }

    // =========================================================================
    // Persona-specific routes: /persona/:id, /persona/:id/prompt, /persona/:id/tools
    // =========================================================================
    const personaMatch = subPath.match(/^\/persona\/([^/]+)(\/prompt|\/tools)?$/);
    if (personaMatch) {
      const personaId = decodeURIComponent(personaMatch[1]);
      const subRoute = personaMatch[2]; // undefined, '/prompt', or '/tools'
      const isPromptOnly = subRoute === '/prompt';
      const isToolsOnly = subRoute === '/tools';

      // GET /api/v1/admin/model-config/persona/:id/tools - Get persona tool config
      if (method === 'GET' && isToolsOnly) {
        const tools = modelConfig.getToolConfig(personaId);
        sendJSON(res, {
          success: true,
          personaId,
          tools,
          domains: AVAILABLE_TOOL_DOMAINS,
        });
        return true;
      }

      // PUT /api/v1/admin/model-config/persona/:id/tools - Update persona tool config
      if (method === 'PUT' && isToolsOnly) {
        const body = (await parseBody(req)) as Partial<ToolConfig> & { updatedBy?: string };
        const { updatedBy, ...config } = body;
        const tools = modelConfig.setToolConfig(personaId, config, updatedBy);

        log.info({ personaId, updatedBy }, 'Persona tool config updated via API');
        sendJSON(res, {
          success: true,
          personaId,
          tools,
        });
        return true;
      }

      // GET /api/v1/admin/model-config/persona/:id
      if (method === 'GET' && !isPromptOnly && !isToolsOnly) {
        const config = modelConfig.getPersona(personaId);
        sendJSON(res, {
          success: true,
          persona: config,
        });
        return true;
      }

      // PUT /api/v1/admin/model-config/persona/:id/prompt - Update prompt only
      if (method === 'PUT' && isPromptOnly) {
        const body = (await parseBody(req)) as {
          systemPrompt: string;
          enabled: boolean;
          updatedBy?: string;
        };

        if (typeof body.systemPrompt !== 'string') {
          sendError(res, 'systemPrompt is required', 400);
          return true;
        }

        modelConfig.setSystemPrompt(
          personaId,
          body.systemPrompt,
          body.enabled !== false,
          body.updatedBy
        );

        log.info(
          { personaId, updatedBy: body.updatedBy, enabled: body.enabled },
          'Persona system prompt updated'
        );
        sendJSON(res, {
          success: true,
          persona: modelConfig.getPersona(personaId),
        });
        return true;
      }

      // PUT /api/v1/admin/model-config/persona/:id - Full update
      if (method === 'PUT' && !isPromptOnly && !isToolsOnly) {
        const body = (await parseBody(req)) as Partial<PersonaModelConfig> & { updatedBy?: string };

        // Validate gemini config if provided
        if (body.gemini) {
          const validation = validateGeminiConfig(body.gemini);
          if (!validation.valid) {
            sendError(res, `Invalid Gemini configuration: ${validation.errors.join(', ')}`, 400);
            return true;
          }
        }

        const { updatedBy, ...config } = body;
        const updated = modelConfig.setPersona(personaId, config, updatedBy);

        log.info({ personaId, updatedBy }, 'Persona model config updated via API');
        sendJSON(res, {
          success: true,
          persona: updated,
        });
        return true;
      }

      // DELETE /api/v1/admin/model-config/persona/:id
      if (method === 'DELETE' && !isPromptOnly && !isToolsOnly) {
        const deleted = modelConfig.deletePersona(personaId);

        log.info({ personaId, deleted }, 'Persona config deletion attempted');
        sendJSON(res, {
          success: true,
          deleted,
          message: deleted
            ? `Persona ${personaId} config deleted, reverted to defaults`
            : `No custom config found for persona ${personaId}`,
        });
        return true;
      }
    }

    // =========================================================================
    // POST /api/v1/admin/model-config/reset - Reset all to defaults
    // =========================================================================
    if (subPath === '/reset' && method === 'POST') {
      modelConfig.resetAll();

      log.warn('All model configs reset to defaults via API');
      sendJSON(res, {
        success: true,
        message: 'All model configurations reset to defaults',
        defaults: modelConfig.getDefault(),
      });
      return true;
    }

    // Route not matched
    sendError(res, 'Not found', 404);
    return true;
  } catch (error) {
    log.error({ error, pathname, method }, 'Error handling model config request');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}

export default { handleAdminModelConfigRoutes };
