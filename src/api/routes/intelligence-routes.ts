/**
 * Intelligence API Routes
 *
 * Exposes the Unified Intelligence Layer to the frontend for:
 * - Viewing user intelligence profiles (debugging, visualization)
 * - Getting proactive suggestions
 * - Checking emotion-aware tool boosts
 *
 * @module api/routes/intelligence-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { parseBody, sendJSON, sendError, getUserId } from '../helpers.js';

const log = createLogger({ module: 'intelligence-routes' });

// ============================================================================
// TYPES
// ============================================================================

interface VoiceEmotionInput {
  primary: string;
  valence: number;
  arousal: number;
  stressLevel: number;
  anxietyMarkers: boolean;
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleIntelligenceRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // GET /api/intelligence/profile - Get user's intelligence profile
  if (pathname === '/api/intelligence/profile' && req.method === 'GET') {
    return handleGetProfile(req, res, parsedUrl);
  }

  // GET /api/intelligence/suggestions - Get proactive tool suggestions
  if (pathname === '/api/intelligence/suggestions' && req.method === 'GET') {
    return handleGetSuggestions(req, res, parsedUrl);
  }

  // POST /api/intelligence/emotion-boost - Check emotion-aware boosts
  if (pathname === '/api/intelligence/emotion-boost' && req.method === 'POST') {
    return handleEmotionBoost(req, res);
  }

  // POST /api/intelligence/record-outreach-response - Record outreach response
  if (pathname === '/api/intelligence/record-outreach-response' && req.method === 'POST') {
    return handleRecordOutreachResponse(req, res);
  }

  // POST /api/intelligence/trigger-outreach - Check and trigger proactive outreach
  if (pathname === '/api/intelligence/trigger-outreach' && req.method === 'POST') {
    return handleTriggerOutreach(req, res);
  }

  // GET /api/intelligence/metrics - Get intelligence layer metrics
  if (pathname === '/api/intelligence/metrics' && req.method === 'GET') {
    return handleGetMetrics(req, res);
  }

  return false;
}

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * GET /api/intelligence/profile
 *
 * Returns the user's intelligence profile including:
 * - Tool affinities
 * - Time patterns
 * - Vocabulary mappings
 * - Outreach patterns
 */
async function handleGetProfile(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<boolean> {
  try {
    const userId = getUserId(req, parsedUrl) || parsedUrl.searchParams.get('userId');
    if (!userId) {
      sendError(res, 'User ID required', 401);
      return true;
    }

    const { getUnifiedIntelligence } = await import('../../tools/intelligence/index.js');
    const intelligence = getUnifiedIntelligence();

    // Get the enhancement to see what the profile looks like
    const enhancement = await intelligence.enhanceToolSelection(userId, {
      personaId: 'ferni',
      timeOfDay: new Date(),
    });

    // Build a summary for the frontend
    const profileSummary = {
      userId,
      isReturningUser: enhancement.contextHints.isReturningUser,
      preferredDomains: enhancement.contextHints.preferredDomains,
      anticipatedTools: enhancement.anticipatedTools,
      proactiveSuggestions: enhancement.proactiveSuggestions.map((s) => ({
        toolId: s.toolId,
        reason: s.reason,
      })),
      timeContext: enhancement.contextHints.timeContext,
      // Include emotion-aware boosts if present
      emotionAwareBoosts: enhancement.emotionAwareBoosts,
      // Include proactive outreach if applicable
      proactiveOutreach: enhancement.proactiveOutreach,
    };

    sendJSON(res, profileSummary);
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get intelligence profile');
    sendError(res, 'Failed to get intelligence profile', 500);
    return true;
  }
}

/**
 * GET /api/intelligence/suggestions
 *
 * Returns proactive tool suggestions based on user patterns
 */
async function handleGetSuggestions(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<boolean> {
  try {
    const userId = getUserId(req, parsedUrl) || parsedUrl.searchParams.get('userId');
    if (!userId) {
      sendError(res, 'User ID required', 401);
      return true;
    }

    const { getUnifiedIntelligence } = await import('../../tools/intelligence/index.js');
    const intelligence = getUnifiedIntelligence();

    const enhancement = await intelligence.enhanceToolSelection(userId, {
      personaId: 'ferni',
      timeOfDay: new Date(),
    });

    sendJSON(res, {
      suggestions: enhancement.proactiveSuggestions,
      anticipatedTools: enhancement.anticipatedTools,
      proactiveOutreach: enhancement.proactiveOutreach,
    });
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get suggestions');
    sendError(res, 'Failed to get suggestions', 500);
    return true;
  }
}

/**
 * POST /api/intelligence/emotion-boost
 *
 * Check what emotion-aware boosts would apply for given voice emotion state
 *
 * Body: { voiceEmotion: VoiceEmotionInput }
 */
async function handleEmotionBoost(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      sendError(res, 'User ID required', 401);
      return true;
    }

    const body = await parseBody<{ voiceEmotion?: VoiceEmotionInput }>(req);
    const voiceEmotion = body.voiceEmotion;

    if (!voiceEmotion) {
      sendError(res, 'voiceEmotion required in body', 400);
      return true;
    }

    const { getUnifiedIntelligence } = await import('../../tools/intelligence/index.js');
    const intelligence = getUnifiedIntelligence();

    const enhancement = await intelligence.enhanceToolSelection(userId, {
      personaId: 'ferni',
      timeOfDay: new Date(),
      voiceEmotion,
    });

    sendJSON(res, {
      emotionAwareBoosts: enhancement.emotionAwareBoosts,
      stressDetected: voiceEmotion.stressLevel > 0.6,
      anxietyDetected: voiceEmotion.anxietyMarkers,
    });
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to check emotion boost');
    sendError(res, 'Failed to check emotion boost', 500);
    return true;
  }
}

/**
 * POST /api/intelligence/record-outreach-response
 *
 * Record whether user responded to proactive outreach (for learning)
 *
 * Body: { responded: boolean }
 */
async function handleRecordOutreachResponse(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      sendError(res, 'User ID required', 401);
      return true;
    }

    const body = await parseBody<{ responded?: boolean }>(req);
    const responded = body.responded;

    if (typeof responded !== 'boolean') {
      sendError(res, 'responded (boolean) required in body', 400);
      return true;
    }

    const { getUnifiedIntelligence } = await import('../../tools/intelligence/index.js');
    const intelligence = getUnifiedIntelligence();

    intelligence.recordOutreachResponse(userId, responded);

    sendJSON(res, { success: true, recorded: responded });
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to record outreach response');
    sendError(res, 'Failed to record outreach response', 500);
    return true;
  }
}

/**
 * POST /api/intelligence/trigger-outreach
 *
 * Check if proactive outreach should be triggered and trigger it
 * This can be called by the frontend on app open or by scheduled jobs
 */
async function handleTriggerOutreach(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      sendError(res, 'User ID required', 401);
      return true;
    }

    const { getUnifiedIntelligence } = await import('../../tools/intelligence/index.js');
    const intelligence = getUnifiedIntelligence();

    // Get enhancement which includes proactive outreach suggestion
    const enhancement = await intelligence.enhanceToolSelection(userId, {
      personaId: 'ferni',
      timeOfDay: new Date(),
    });

    if (!enhancement.proactiveOutreach?.shouldTrigger) {
      sendJSON(res, {
        triggered: false,
        reason: 'No outreach needed at this time',
      });
      return true;
    }

    // Trigger the outreach
    const result = await intelligence.triggerProactiveOutreach(
      userId,
      enhancement.proactiveOutreach
    );

    sendJSON(res, {
      triggered: result.triggered,
      messageId: result.messageId,
      type: enhancement.proactiveOutreach.type,
      suggestedMessage: enhancement.proactiveOutreach.suggestedMessage,
      reason: result.reason,
    });
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to trigger outreach');
    sendError(res, 'Failed to trigger outreach', 500);
    return true;
  }
}

/**
 * GET /api/intelligence/metrics
 *
 * Returns intelligence layer metrics (for debugging/monitoring)
 */
async function handleGetMetrics(_req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  try {
    const { getUnifiedIntelligence } = await import('../../tools/intelligence/index.js');
    const intelligence = getUnifiedIntelligence();

    const metrics = intelligence.getMetrics();

    sendJSON(res, metrics);
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get metrics');
    sendError(res, 'Failed to get metrics', 500);
    return true;
  }
}

export default handleIntelligenceRoutes;
