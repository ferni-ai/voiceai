/**
 * Brand API Routes
 *
 * HTTP endpoints for brand validation, generation, and management.
 *
 * @module @ferni/api/brand-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  adaptForChannel,
  autoFixViolations,
  calculateBrandHealth,
  fitsChannelConstraints,
  generateBrandContent,
  generateForAllChannels,
  generateVariants,
  getClientBrandRules,
  getPersonaVoice,
  getRecentRuleChanges,
  loadBrandContext,
  PERSONA_VOICES,
  quickValidate,
  runDailyEvolution,
  validateBrandCompliance,
} from '../services/brand/index.js';
import type {
  Channel,
  ContextType,
  GenerationRequest,
  PersonaId,
} from '../services/brand/types.js';
import { createLogger } from '../utils/safe-logger.js';
import { requireAuth } from './auth-middleware.js';
import { parseRequestBody, sendError, sendJsonResponse } from './helpers.js';

const log = createLogger({ module: 'BrandRoutes' });

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle all brand-related routes
 */
export async function handleBrandRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  path: string
): Promise<boolean> {
  const method = req.method?.toUpperCase();

  try {
    // Public routes (no auth required)
    if (path === '/api/brand/rules' && method === 'GET') {
      return handleGetRules(req, res);
    }

    if (path === '/api/brand/validate' && method === 'POST') {
      return handleValidate(req, res);
    }

    if (path === '/api/brand/quick-validate' && method === 'POST') {
      return handleQuickValidate(req, res);
    }

    if (path === '/api/brand/personas' && method === 'GET') {
      return handleGetPersonas(req, res);
    }

    // Persona-specific route (public)
    const personaMatch = path.match(/^\/api\/brand\/personas\/([^/]+)$/);
    if (personaMatch && method === 'GET') {
      return handleGetPersona(req, res, personaMatch[1]);
    }

    // Protected routes (auth required)
    const authResult = await requireAuth(req, res);
    if (!authResult) return true; // 401 already sent

    if (path === '/api/brand/context' && method === 'GET') {
      return handleGetContext(req, res);
    }

    if (path === '/api/brand/generate' && method === 'POST') {
      return handleGenerate(req, res);
    }

    if (path === '/api/brand/generate-variants' && method === 'POST') {
      return handleGenerateVariants(req, res);
    }

    if (path === '/api/brand/auto-fix' && method === 'POST') {
      return handleAutoFix(req, res);
    }

    if (path === '/api/brand/adapt' && method === 'POST') {
      return handleAdapt(req, res);
    }

    if (path === '/api/brand/multi-channel' && method === 'POST') {
      return handleMultiChannel(req, res);
    }

    if (path === '/api/brand/health' && method === 'GET') {
      return handleGetHealth(req, res);
    }

    if (path === '/api/brand/evolution/run' && method === 'POST') {
      return handleRunEvolution(req, res);
    }

    if (path === '/api/brand/evolution/changes' && method === 'GET') {
      return handleGetChanges(req, res);
    }

    return false; // Route not handled
  } catch (error) {
    log.error({ error, path, method }, 'Brand route error');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}

// ============================================================================
// PUBLIC ENDPOINTS
// ============================================================================

/**
 * GET /api/brand/rules
 * Returns minimal brand rules for client-side validation
 */
async function handleGetRules(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const rules = getClientBrandRules();

  sendJsonResponse(res, 200, {
    bannedPhrases: rules.bannedPhrases,
    wordsToAvoid: rules.wordsToAvoid,
    wordsToUse: rules.wordsToUse,
  });

  return true;
}

/**
 * POST /api/brand/validate
 * Full brand validation with detailed violations
 */
async function handleValidate(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = await parseRequestBody<{
    content: string;
    persona?: PersonaId;
    context?: ContextType;
    strict?: boolean;
  }>(req);

  if (!body?.content) {
    sendError(res, 'Content is required', 400);
    return true;
  }

  const result = await validateBrandCompliance(body.content, {
    persona: body.persona,
    context: body.context,
    strict: body.strict,
  });

  sendJsonResponse(res, 200, {
    isCompliant: result.isCompliant,
    score: result.score,
    violations: result.violations,
    suggestions: result.suggestions,
  });

  return true;
}

/**
 * POST /api/brand/quick-validate
 * Fast validation for banned content only
 */
async function handleQuickValidate(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = await parseRequestBody<{ content: string }>(req);

  if (!body?.content) {
    sendError(res, 'Content is required', 400);
    return true;
  }

  const result = quickValidate(body.content);

  sendJsonResponse(res, 200, {
    hasBannedContent: result.hasBannedContent,
    issues: result.issues,
  });

  return true;
}

/**
 * GET /api/brand/personas
 * Returns list of all personas
 */
async function handleGetPersonas(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const personas = Object.values(PERSONA_VOICES).map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    archetype: p.archetype,
    tone: p.tone,
    colors: p.colors,
  }));

  sendJsonResponse(res, 200, { personas });
  return true;
}

/**
 * GET /api/brand/personas/:id
 * Returns detailed info for a specific persona
 */
async function handleGetPersona(
  req: IncomingMessage,
  res: ServerResponse,
  personaId: string
): Promise<boolean> {
  const persona = getPersonaVoice(personaId as PersonaId);

  if (!persona) {
    sendError(res, 'Persona not found', 404);
    return true;
  }

  sendJsonResponse(res, 200, { persona });
  return true;
}

// ============================================================================
// PROTECTED ENDPOINTS
// ============================================================================

/**
 * GET /api/brand/context
 * Returns full brand context (for admin/internal use)
 */
async function handleGetContext(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const context = await loadBrandContext();

  sendJsonResponse(res, 200, {
    identity: context.identity,
    voice: {
      principles: context.voice.principles,
      bannedPhrases: context.voice.bannedPhrases,
      wordsToUse: context.voice.wordsToUse.length,
      wordsToAvoid: context.voice.wordsToAvoid.length,
    },
    personas: Object.keys(context.personas).length,
    meta: context.meta,
  });

  return true;
}

/**
 * POST /api/brand/generate
 * Generate brand-compliant content
 */
async function handleGenerate(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = await parseRequestBody<GenerationRequest>(req);

  if (!body?.type || !body?.context) {
    sendError(res, 'Type and context are required', 400);
    return true;
  }

  const result = await generateBrandContent(body);

  sendJsonResponse(res, 200, {
    content: result.content,
    alternatives: result.alternatives,
    complianceScore: result.complianceScore,
    violations: result.violations,
    meta: result.meta,
  });

  return true;
}

/**
 * POST /api/brand/generate-variants
 * Generate multiple variants for A/B testing
 */
async function handleGenerateVariants(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = await parseRequestBody<GenerationRequest & { count?: number }>(req);

  if (!body?.type || !body?.context) {
    sendError(res, 'Type and context are required', 400);
    return true;
  }

  const count = body.count || 3;
  const results = await generateVariants(body, count);

  sendJsonResponse(res, 200, {
    variants: results.map((r) => ({
      content: r.content,
      score: r.complianceScore,
    })),
    count: results.length,
  });

  return true;
}

/**
 * POST /api/brand/auto-fix
 * Auto-fix brand violations in content
 */
async function handleAutoFix(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = await parseRequestBody<{ content: string }>(req);

  if (!body?.content) {
    sendError(res, 'Content is required', 400);
    return true;
  }

  const { fixed, changes } = autoFixViolations(body.content);

  sendJsonResponse(res, 200, {
    original: body.content,
    fixed,
    changes,
    wasModified: changes.length > 0,
  });

  return true;
}

/**
 * POST /api/brand/adapt
 * Adapt content for a specific channel
 */
async function handleAdapt(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = await parseRequestBody<{
    content: string;
    channel: Channel;
    persona?: PersonaId;
    context?: ContextType;
  }>(req);

  if (!body?.content || !body?.channel) {
    sendError(res, 'Content and channel are required', 400);
    return true;
  }

  const adapted = adaptForChannel(body.content, body.channel, {
    persona: body.persona,
    context: body.context,
  });

  const constraints = fitsChannelConstraints(adapted, body.channel);

  sendJsonResponse(res, 200, {
    original: body.content,
    adapted,
    channel: body.channel,
    fitsConstraints: constraints.fits,
    issues: constraints.issues,
  });

  return true;
}

/**
 * POST /api/brand/multi-channel
 * Generate content for multiple channels
 */
async function handleMultiChannel(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = await parseRequestBody<{
    content: string;
    channels?: Channel[];
    persona?: PersonaId;
    context?: ContextType;
  }>(req);

  if (!body?.content) {
    sendError(res, 'Content is required', 400);
    return true;
  }

  const result = generateForAllChannels(body.content, {
    channels: body.channels,
    persona: body.persona,
    context: body.context,
  });

  sendJsonResponse(res, 200, {
    original: body.content,
    channels: result,
  });

  return true;
}

/**
 * GET /api/brand/health
 * Get brand health metrics
 */
async function handleGetHealth(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const health = await calculateBrandHealth();

  sendJsonResponse(res, 200, {
    complianceRate: health.complianceRate,
    averageScore: health.averageComplianceScore,
    topViolations: health.topViolations.slice(0, 5),
    voiceConsistency: health.voiceConsistencyScore,
    personaDistinctiveness: health.personaDistinctiveness,
    experimentVelocity: health.experimentVelocity,
    recentLearnings: health.recentLearnings.length,
    updatedAt: health.updatedAt,
  });

  return true;
}

/**
 * POST /api/brand/evolution/run
 * Manually trigger brand evolution analysis
 */
async function handleRunEvolution(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  log.info('Manual brand evolution triggered');

  const result = await runDailyEvolution();

  sendJsonResponse(res, 200, {
    learnings: result.learnings.length,
    changes: result.changes.length,
    details: {
      learnings: result.learnings.map((l) => l.pattern),
      changes: result.changes.map((c) => c.rule),
    },
  });

  return true;
}

/**
 * GET /api/brand/evolution/changes
 * Get recent brand rule changes
 */
async function handleGetChanges(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const days = parseInt(url.searchParams.get('days') || '30', 10);

  const changes = await getRecentRuleChanges(days);

  sendJsonResponse(res, 200, {
    changes,
    count: changes.length,
    days,
  });

  return true;
}
