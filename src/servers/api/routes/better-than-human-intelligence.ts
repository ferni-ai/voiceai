/**
 * Better Than Human Intelligence Debug API
 *
 * Provides endpoints for testing and debugging the BTH intelligence system:
 * - GET /api/bth/:userId - Get complete user knowledge
 * - GET /api/bth/:userId/query - Natural language query
 * - GET /api/bth/:userId/completeness - Knowledge completeness metrics
 * - POST /api/bth/:userId/refresh - Force refresh cache
 *
 * @module servers/api/routes/better-than-human-intelligence
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { parse as parseUrl } from 'url';
import { requireAuth } from '../../../api/auth-middleware.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'BTH-API' });

// Lazy imports to avoid circular dependencies
let getUserKnowledgeImpl: typeof import('../../../intelligence/user-knowledge/index.js').getUserKnowledge;
let formatKnowledgeForContextImpl: typeof import('../../../intelligence/user-knowledge/index.js').formatKnowledgeForContext;
let clearKnowledgeCacheImpl: typeof import('../../../intelligence/user-knowledge/index.js').clearKnowledgeCache;
let askAboutUserImpl: typeof import('../../../intelligence/user-knowledge/index.js').askAboutUser;
let getKnowledgeCompletenessImpl: typeof import('../../../intelligence/user-knowledge/index.js').getKnowledgeCompleteness;

async function loadUserKnowledge(): Promise<void> {
  if (!getUserKnowledgeImpl) {
    const module = await import('../../../intelligence/user-knowledge/index.js');
    getUserKnowledgeImpl = module.getUserKnowledge;
    formatKnowledgeForContextImpl = module.formatKnowledgeForContext;
    clearKnowledgeCacheImpl = module.clearKnowledgeCache;
    askAboutUserImpl = module.askAboutUser;
    getKnowledgeCompletenessImpl = module.getKnowledgeCompleteness;
  }
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

function sendError(res: ServerResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, { error: message });
}

/**
 * Handle BTH Intelligence routes
 */
export async function handleBTHIntelligenceRoutes(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const { pathname, query } = parseUrl(req.url || '', true);

  // Only handle /api/bth/* routes
  if (!pathname?.startsWith('/api/bth')) {
    return false;
  }

  // SECURITY: Require auth before returning user knowledge (PII)
  const auth = await requireAuth(req, res);
  if (!auth) return true;

  await loadUserKnowledge();

  // Parse user ID from path: /api/bth/:userId or /api/bth/:userId/subpath
  const pathParts = pathname.split('/').filter(Boolean);
  // Expected: ['api', 'bth', 'userId', ...rest]
  if (pathParts.length < 3) {
    sendError(res, 400, 'Missing userId in path. Use /api/bth/:userId');
    return true;
  }

  const userId = pathParts[2];
  // SECURITY: Callers may only read their own knowledge (admins may read any)
  if (userId !== auth.userId && !auth.isAdmin) {
    log.warn(
      { authUserId: auth.userId, requestedUserId: userId },
      'SECURITY: Blocked cross-user BTH knowledge access'
    );
    sendError(res, 403, 'Forbidden');
    return true;
  }

  const subPath = pathParts.slice(3).join('/');

  try {
    // GET /api/bth/:userId - Get complete user knowledge
    if (req.method === 'GET' && !subPath) {
      log.debug({ userId }, 'Getting complete user knowledge');

      const knowledge = await getUserKnowledgeImpl(userId);
      const formattedContext = formatKnowledgeForContextImpl(knowledge, {
        maxTokens: 800,
        style: 'detailed',
        includeHeaders: true,
      });

      sendJson(res, 200, {
        success: true,
        userId,
        knowledge,
        formattedContext,
        completeness: knowledge.metadata.completeness,
        sources: knowledge.metadata.sources,
      });
      return true;
    }

    // GET /api/bth/:userId/query?q=question
    if (req.method === 'GET' && subPath === 'query') {
      const question = query.q as string;
      if (!question) {
        sendError(res, 400, 'Missing query parameter: q');
        return true;
      }

      log.debug({ userId, question }, 'Querying user knowledge');

      const result = await askAboutUserImpl(userId, question);

      sendJson(res, 200, {
        success: true,
        userId,
        question,
        result,
      });
      return true;
    }

    // GET /api/bth/:userId/completeness
    if (req.method === 'GET' && subPath === 'completeness') {
      log.debug({ userId }, 'Getting knowledge completeness');

      const completeness = await getKnowledgeCompletenessImpl(userId);

      sendJson(res, 200, {
        success: true,
        userId,
        completeness,
      });
      return true;
    }

    // GET /api/bth/:userId/context - Get LLM-ready context only
    if (req.method === 'GET' && subPath === 'context') {
      const maxTokens = parseInt(query.maxTokens as string) || 400;
      const style = (query.style as string) || 'concise';

      log.debug({ userId, maxTokens, style }, 'Getting LLM context');

      const knowledge = await getUserKnowledgeImpl(userId);
      const context = formatKnowledgeForContextImpl(knowledge, {
        maxTokens,
        style: style as 'detailed' | 'concise' | 'bullet',
        includeHeaders: true,
        prioritySections: ['boundaries', 'emotional', 'relationships', 'aspirations'],
      });

      sendJson(res, 200, {
        success: true,
        userId,
        context,
        estimatedTokens: Math.ceil(context.length / 4),
      });
      return true;
    }

    // POST /api/bth/:userId/refresh - Force refresh cache
    if (req.method === 'POST' && subPath === 'refresh') {
      log.debug({ userId }, 'Force refreshing user knowledge cache');

      clearKnowledgeCacheImpl(userId);
      const knowledge = await getUserKnowledgeImpl(userId, { forceRefresh: true });

      sendJson(res, 200, {
        success: true,
        userId,
        message: 'Cache refreshed',
        completeness: knowledge.metadata.completeness,
      });
      return true;
    }

    // Unknown subpath
    sendError(res, 404, `Unknown BTH endpoint: ${subPath}`);
    return true;
  } catch (error) {
    log.error({ error: String(error), userId }, 'BTH API error');
    sendError(res, 500, `BTH API error: ${String(error)}`);
    return true;
  }
}

export default handleBTHIntelligenceRoutes;
