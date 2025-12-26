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
import { requireAuth } from '../auth-middleware.js';

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

  // POST /api/intelligence/correction - Record user correction for learning
  if (pathname === '/api/intelligence/correction' && req.method === 'POST') {
    return handleUserCorrection(req, res);
  }

  // POST /api/intelligence/batch-learn - Run batch learning (admin only)
  if (pathname === '/api/intelligence/batch-learn' && req.method === 'POST') {
    return handleBatchLearn(req, res);
  }

  // GET /api/intelligence/emotional-arc - Get user's emotional arc (7-day trend)
  if (pathname === '/api/intelligence/emotional-arc' && req.method === 'GET') {
    return handleGetEmotionalArc(req, res, parsedUrl);
  }

  // POST /api/intelligence/record-emotion - Record emotional data point
  if (pathname === '/api/intelligence/record-emotion' && req.method === 'POST') {
    return handleRecordEmotion(req, res, parsedUrl);
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
    // SECURITY: Use Firebase auth instead of deprecated x-user-id header
    const auth = await requireAuth(req, res);
    if (!auth) return true; // 401 already sent
    const { userId } = auth;

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
    // SECURITY: Use Firebase auth instead of deprecated x-user-id header
    const auth = await requireAuth(req, res);
    if (!auth) return true; // 401 already sent
    const { userId } = auth;

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
    // SECURITY: Use Firebase auth instead of deprecated x-user-id header
    const auth = await requireAuth(req, res);
    if (!auth) return true; // 401 already sent
    const { userId } = auth;

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

/**
 * POST /api/intelligence/correction
 *
 * Record a user correction for active learning.
 *
 * Body: {
 *   inputText: string;     // What the user said
 *   wrongTool: string;     // What we thought they wanted
 *   correctTool: string;   // What they actually wanted
 * }
 */
async function handleUserCorrection(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  try {
    // SECURITY: Use Firebase auth instead of deprecated x-user-id header
    const auth = await requireAuth(req, res);
    if (!auth) return true; // 401 already sent
    const { userId } = auth;

    const body = await parseBody<{
      inputText: string;
      wrongTool: string | null;
      correctTool: string;
    }>(req);

    if (!body.inputText || !body.correctTool) {
      sendError(res, 'inputText and correctTool required', 400);
      return true;
    }

    // Record the correction using the semantic router learning system
    const { recordUserCorrection } =
      await import('../../tools/semantic-router/voice-integration.js');

    await recordUserCorrection(userId, body.inputText, body.wrongTool, body.correctTool);

    log.info(
      {
        userId,
        from: body.wrongTool,
        to: body.correctTool,
        inputLength: body.inputText.length,
      },
      'User correction recorded via API'
    );

    sendJSON(res, {
      success: true,
      message: "Thanks! I'll remember that for next time.",
    });
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to record correction');
    sendError(res, 'Failed to record correction', 500);
    return true;
  }
}

/**
 * POST /api/intelligence/batch-learn
 *
 * Run batch learning to update calibration and consolidate patterns.
 * This is typically called by a cron job.
 *
 * Requires admin authentication.
 */
async function handleBatchLearn(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  try {
    // Check for admin key (simple auth for cron jobs)
    const authHeader = req.headers.authorization;
    const adminKey = process.env.ADMIN_API_KEY;

    if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
      sendError(res, 'Admin authorization required', 403);
      return true;
    }

    const { runBatchLearning } =
      await import('../../tools/semantic-router/advanced/learning-loop.js');

    const result = await runBatchLearning();

    log.info(result, 'Batch learning completed via API');

    sendJSON(res, {
      success: true,
      ...result,
    });
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to run batch learning');
    sendError(res, 'Failed to run batch learning', 500);
    return true;
  }
}

/**
 * GET /api/intelligence/emotional-arc
 *
 * Get the user's emotional arc (7-day trend with proactive interventions)
 */
async function handleGetEmotionalArc(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<boolean> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'User ID required', 401);
    return true;
  }

  try {
    const period = (parsedUrl.searchParams.get('period') || '7d') as '24h' | '7d' | '30d';

    const { analyzeEmotionalArc, loadEmotionalHistory, getEmotionalArcSummary } =
      await import('../../tools/semantic-router/advanced/better-than-human.js');

    // Load history from Firestore first
    await loadEmotionalHistory(userId);

    // Analyze emotional arc
    const arc = analyzeEmotionalArc(userId, period);

    sendJSON(res, {
      success: true,
      arc: {
        period: arc.period,
        dominantEmotion: arc.dominantEmotion,
        averageValence: arc.averageValence,
        volatility: arc.volatility,
        trend: arc.trend,
        dataPointCount: arc.dataPoints.length,
        concerningPatterns: arc.concerningPatterns,
        interventionOpportunities: arc.interventionOpportunities,
      },
      summary: getEmotionalArcSummary(arc),
    });
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get emotional arc');
    sendError(res, 'Failed to get emotional arc', 500);
    return true;
  }
}

/**
 * POST /api/intelligence/record-emotion
 *
 * Record an emotional data point (from frontend mood check-in, voice detection, etc.)
 */
async function handleRecordEmotion(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<boolean> {
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendError(res, 'User ID required', 401);
    return true;
  }

  try {
    const body = await parseBody<{
      emotion: string;
      intensity: number;
      valence: number;
      source: 'voice' | 'text' | 'inferred';
      context?: string;
    }>(req);

    if (!body.emotion || body.intensity === undefined || body.valence === undefined) {
      sendError(res, 'Missing required fields: emotion, intensity, valence', 400);
      return true;
    }

    const { recordEmotionalDataPoint, persistEmotionalHistory } =
      await import('../../tools/semantic-router/advanced/better-than-human.js');

    // Record the data point
    recordEmotionalDataPoint(
      userId,
      body.emotion,
      body.intensity,
      body.valence,
      body.source || 'inferred',
      body.context
    );

    // Persist to Firestore (async, don't block)
    persistEmotionalHistory(userId).catch((err) =>
      log.warn({ error: String(err) }, 'Failed to persist emotional history')
    );

    log.debug(
      {
        userId,
        emotion: body.emotion,
        intensity: body.intensity,
        valence: body.valence,
      },
      'Emotional data point recorded via API'
    );

    sendJSON(res, { success: true, recorded: true });
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to record emotion');
    sendError(res, 'Failed to record emotion', 500);
    return true;
  }
}

export default handleIntelligenceRoutes;
