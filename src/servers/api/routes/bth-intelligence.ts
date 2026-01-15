/**
 * Better Than Human Intelligence Debug API
 *
 * Provides endpoints for testing and debugging the BTH intelligence system:
 * - GET /api/bth/:userId - Get complete user knowledge
 * - GET /api/bth/:userId/query - Natural language query
 * - GET /api/bth/:userId/completeness - Knowledge completeness metrics
 * - POST /api/bth/:userId/refresh - Force refresh cache
 *
 * @module servers/api/routes/bth-intelligence
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { parse as parseUrl } from 'url';
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

  // ===========================================================================
  // BTH VALIDATION ROUTES (no userId required)
  // These routes are for service health monitoring and capability validation
  // ===========================================================================

  // GET /api/bth/health - Overall BTH health check
  if (pathname === '/api/bth/health' && req.method === 'GET') {
    try {
      const { checkSuperhumanServicesHealth } = await import(
        '../../../services/superhuman/health-check.js'
      );
      const healthResult = await checkSuperhumanServicesHealth();
      sendJson(res, healthResult.overall === 'healthy' ? 200 : 503, healthResult);
    } catch (error) {
      log.error({ error: String(error) }, 'BTH health check failed');
      sendJson(res, 503, {
        overall: 'unhealthy',
        message: String(error),
        services: [],
      });
    }
    return true;
  }

  // GET /api/bth/capabilities - List all BTH capabilities
  if (pathname === '/api/bth/capabilities' && req.method === 'GET') {
    try {
      const capabilities = [
        {
          id: 'perfect-memory',
          name: 'Perfect Memory',
          description: 'Never forgets anything you share',
          isActive: true,
        },
        {
          id: 'proactive-outreach',
          name: 'Proactive Outreach',
          description: 'Reaches out when you might need support',
          isActive: true,
        },
        {
          id: 'learning-engine',
          name: 'Learning Engine',
          description: 'Learns from your reactions to improve',
          isActive: true,
        },
        {
          id: 'commitment-keeper',
          name: 'Commitment Keeper',
          description: 'Never forgets what you said you would do',
          isActive: true,
        },
        {
          id: 'our-songs',
          name: 'Musical Memory',
          description: 'Remembers songs from meaningful moments',
          isActive: true,
        },
        {
          id: 'emotional-intelligence',
          name: 'Emotional Intelligence',
          description: 'Detects and responds to emotional signals',
          isActive: true,
        },
      ];
      sendJson(res, 200, { capabilities, timestamp: new Date().toISOString() });
    } catch (error) {
      log.error({ error: String(error) }, 'BTH capabilities fetch failed');
      sendError(res, 500, 'Failed to fetch capabilities');
    }
    return true;
  }

  // GET /api/bth/validation/:userId - Validate BTH for a user
  if (pathname?.startsWith('/api/bth/validation/') && req.method === 'GET') {
    const validationUserId = pathname.split('/')[4];
    if (!validationUserId) {
      sendError(res, 400, 'userId is required');
      return true;
    }
    try {
      const { getFirestoreDb } = await import('../../../utils/firestore-utils.js');
      const db = getFirestoreDb();
      if (!db) {
        sendError(res, 503, 'Database not available');
        return true;
      }

      const result = {
        userId: validationUserId,
        timestamp: new Date().toISOString(),
        overall: 'pass' as 'pass' | 'fail',
        capabilities: [] as Array<{ id: string; name: string; status: string; message: string }>,
        recommendations: [] as string[],
      };

      // Check memories
      const memoriesSnap = await db
        .collection('bogle_users')
        .doc(validationUserId)
        .collection('memories')
        .limit(1)
        .get();
      result.capabilities.push({
        id: 'perfect-memory',
        name: 'Perfect Memory',
        status: memoriesSnap.empty ? 'skip' : 'pass',
        message: memoriesSnap.empty
          ? 'No memories stored yet'
          : 'Memories are being stored correctly',
      });

      // Check commitments
      const commitmentsSnap = await db
        .collection('bogle_users')
        .doc(validationUserId)
        .collection('commitments')
        .limit(1)
        .get();
      result.capabilities.push({
        id: 'commitment-keeper',
        name: 'Commitment Keeper',
        status: commitmentsSnap.empty ? 'skip' : 'pass',
        message: commitmentsSnap.empty
          ? 'No commitments tracked yet'
          : 'Commitments are being tracked',
      });

      sendJson(res, 200, result);
    } catch (error) {
      log.error({ error: String(error), userId: validationUserId }, 'BTH validation failed');
      sendError(res, 500, 'Validation failed');
    }
    return true;
  }

  // GET /api/admin/bth/health - Admin health dashboard
  if (pathname === '/api/admin/bth/health' && req.method === 'GET') {
    try {
      const { checkSuperhumanServicesHealth } = await import(
        '../../../services/superhuman/health-check.js'
      );
      const healthResult = await checkSuperhumanServicesHealth();
      sendJson(res, 200, healthResult);
    } catch (error) {
      log.error({ error: String(error) }, 'Admin BTH health check failed');
      sendError(res, 500, 'Health check failed');
    }
    return true;
  }

  // POST /api/admin/bth/test/:serviceId - Test a specific service
  if (pathname?.startsWith('/api/admin/bth/test/') && req.method === 'POST') {
    const serviceId = pathname.split('/')[5];
    if (!serviceId) {
      sendError(res, 400, 'serviceId is required');
      return true;
    }
    try {
      const { checkService } = await import('../../../services/superhuman/health-check.js');
      const result = await checkService(serviceId);
      sendJson(res, result.status === 'healthy' ? 200 : 503, {
        success: result.status === 'healthy',
        message:
          result.status === 'healthy'
            ? `${serviceId} is working correctly`
            : `${serviceId} has issues`,
        details: result,
      });
    } catch (error) {
      log.error({ error: String(error), serviceId }, 'BTH service test failed');
      sendJson(res, 500, {
        success: false,
        message: `Test failed: ${error}`,
      });
    }
    return true;
  }

  await loadUserKnowledge();

  // Parse user ID from path: /api/bth/:userId or /api/bth/:userId/subpath
  const pathParts = pathname.split('/').filter(Boolean);
  // Expected: ['api', 'bth', 'userId', ...rest]
  if (pathParts.length < 3) {
    sendError(res, 400, 'Missing userId in path. Use /api/bth/:userId');
    return true;
  }

  const userId = pathParts[2];
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
