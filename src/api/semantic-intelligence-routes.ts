/**
 * Semantic Intelligence API Routes
 *
 * Exposes the "Better Than Human" semantic intelligence services to the frontend.
 * These power the "What I've Noticed" panel in the dev panel.
 *
 * Routes:
 * - GET /api/semantic-intelligence/insights - Proactive insights for surfacing
 * - GET /api/semantic-intelligence/open-loops - Open loops needing follow-up
 * - GET /api/semantic-intelligence/commitments - Ferni's commitments
 * - GET /api/semantic-intelligence/relationships - Relationship network summary
 * - GET /api/semantic-intelligence/temporal - Temporal patterns
 * - GET /api/semantic-intelligence/behavioral - Behavioral intelligence
 * - GET /api/semantic-intelligence/coaching - Coaching intelligence
 * - GET /api/semantic-intelligence/self-awareness - Self-awareness insights
 * - GET /api/semantic-intelligence/deep-analysis - Deep correlation analysis
 *
 * @module api/semantic-intelligence-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { sendJSON, sendError, handleCorsPreflightIfNeeded } from './helpers.js';

// Import semantic intelligence services
import {
  getInsightsToSurface,
  getAllOpenLoops,
  getLoopsReadyForFollowUp,
  getPendingCommitments,
  getRememberedThings,
  getAvoidanceTopics,
  getGraphSummary,
  getAllPeople,
  getTopSupporters,
  getMostMentioned,
  getTemporalContext,
  getSabotagePatterns,
  getBaseline,
  getEffectivenessProfile,
  getLearningStyle,
  getResistancePattern,
  getBlindSpots,
  getValuesAlignment,
  getMisalignedValues,
  buildSemanticIntelligenceContext,
} from '../services/superhuman/semantic-intelligence/index.js';

const log = createLogger({ module: 'api:semantic-intelligence' });

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * GET /api/semantic-intelligence/insights
 * Get proactive insights ready to surface
 */
async function getInsights(res: ServerResponse, userId: string): Promise<void> {
  try {
    const insights = await getInsightsToSurface(userId, {
      hourOfDay: new Date().getHours(),
    });

    const formatted = insights.map((i) => ({
      id: i.id,
      insight: i.insight,
      context: i.context,
      priority: i.priority,
      source: i.source,
      created: i.created instanceof Date ? i.created.toISOString() : String(i.created),
    }));

    sendJSON(res, { insights: formatted });
    log.debug({ userId, count: formatted.length }, 'Insights fetched');
  } catch (error) {
    log.error({ error, userId }, 'Failed to get insights');
    sendError(res, 'Failed to fetch insights', 500);
  }
}

/**
 * GET /api/semantic-intelligence/open-loops
 * Get open loops needing follow-up
 */
async function getOpenLoops(res: ServerResponse, userId: string): Promise<void> {
  try {
    const [allLoops, readyLoops] = await Promise.all([
      getAllOpenLoops(userId),
      getLoopsReadyForFollowUp(userId),
    ]);

    const formatted = allLoops.map((l) => ({
      id: l.id,
      type: l.type,
      content: l.content,
      context: l.context,
      created: l.created instanceof Date ? l.created.toISOString() : String(l.created),
      status: l.status,
    }));

    sendJSON(res, {
      loops: formatted,
      readyForFollowUp: readyLoops.map((l) => l.id),
    });
    log.debug({ userId, count: formatted.length }, 'Open loops fetched');
  } catch (error) {
    log.error({ error, userId }, 'Failed to get open loops');
    sendError(res, 'Failed to fetch open loops', 500);
  }
}

/**
 * GET /api/semantic-intelligence/commitments
 * Get Ferni's commitments (pending and remembered)
 */
async function getCommitments(res: ServerResponse, userId: string): Promise<void> {
  try {
    const [pending, remembered, avoidance] = await Promise.all([
      getPendingCommitments(userId),
      getRememberedThings(userId),
      getAvoidanceTopics(userId),
    ]);

    // Safe formatter that handles various commitment shapes
    const formatCommitment = (c: unknown) => {
      const commitment = c as Record<string, unknown>;
      return {
        id: String(commitment.id ?? ''),
        type: String(commitment.type ?? ''),
        content: String(commitment.commitment ?? commitment.content ?? ''),
        context: String(commitment.context ?? ''),
        created:
          commitment.madeAt instanceof Date
            ? (commitment.madeAt as Date).toISOString()
            : String(commitment.madeAt ?? ''),
        status: commitment.fulfilled ? 'fulfilled' : 'pending',
      };
    };

    sendJSON(res, {
      pending: pending.map(formatCommitment),
      remembered: remembered.map(formatCommitment),
      avoidanceTopics: avoidance,
    });
    log.debug({ userId, pendingCount: pending.length }, 'Commitments fetched');
  } catch (error) {
    log.error({ error, userId }, 'Failed to get commitments');
    sendError(res, 'Failed to fetch commitments', 500);
  }
}

/**
 * GET /api/semantic-intelligence/relationships
 * Get relationship network summary
 */
async function getRelationships(res: ServerResponse, userId: string): Promise<void> {
  try {
    const [summary, people, supporters, mostMentioned] = await Promise.all([
      getGraphSummary(userId),
      getAllPeople(userId),
      getTopSupporters(userId, 3),
      getMostMentioned(userId, 1),
    ]);

    // Find top supporter and energy drainer
    const topSupporter = supporters[0]?.name;
    const energyDrainer = people.find((p) => p.emotionalImpact < -0.3)?.name;

    sendJSON(res, {
      totalPeople: summary?.totalPeople ?? people.length,
      summary: {
        topSupporter,
        energyDrainer,
        mostMentioned: mostMentioned[0]?.name,
      },
    });
    log.debug({ userId, totalPeople: people.length }, 'Relationships fetched');
  } catch (error) {
    log.error({ error, userId }, 'Failed to get relationships');
    sendError(res, 'Failed to fetch relationships', 500);
  }
}

/**
 * GET /api/semantic-intelligence/temporal
 * Get temporal patterns (best time of day, energy patterns)
 */
async function getTemporal(res: ServerResponse, userId: string): Promise<void> {
  try {
    const temporal = await getTemporalContext(userId);

    // Extract useful info from temporal context
    const currentHour = temporal?.currentHourPattern;
    const bestTimeOfDay = currentHour ? getTimeOfDayLabel(currentHour.hour) : undefined;
    const currentEnergy = currentHour?.energyLevel
      ? getEnergyLabel(currentHour.energyLevel)
      : undefined;

    sendJSON(res, {
      bestTimeOfDay,
      currentEnergy,
      seasonalPattern: temporal?.seasonalContext || undefined,
    });
    log.debug({ userId }, 'Temporal context fetched');
  } catch (error) {
    log.error({ error, userId }, 'Failed to get temporal context');
    sendError(res, 'Failed to fetch temporal context', 500);
  }
}

/**
 * GET /api/semantic-intelligence/behavioral
 * Get behavioral intelligence (sabotage patterns, emotional baseline)
 */
async function getBehavioral(res: ServerResponse, userId: string): Promise<void> {
  try {
    const [patterns, baseline] = await Promise.all([
      getSabotagePatterns(userId),
      getBaseline(userId),
    ]);

    // Find dominant emotion from the distribution map
    let dominantEmotion = 'neutral';
    if (baseline?.emotionDistribution) {
      let maxFreq = 0;
      for (const [emotion, freq] of baseline.emotionDistribution.entries()) {
        if (freq > maxFreq) {
          maxFreq = freq;
          dominantEmotion = emotion;
        }
      }
    }

    sendJSON(res, {
      sabotagePatterns: patterns.map((p) => ({
        pattern: p.behavior,
        frequency: p.frequency,
        trigger: p.trigger,
      })),
      emotionalBaseline: baseline
        ? {
            dominantEmotion,
            stability: 1 - (baseline.emotionVariance || 0),
            averageValence: baseline.averageValence,
          }
        : null,
    });
    log.debug({ userId, patternCount: patterns.length }, 'Behavioral fetched');
  } catch (error) {
    log.error({ error, userId }, 'Failed to get behavioral intelligence');
    sendError(res, 'Failed to fetch behavioral intelligence', 500);
  }
}

/**
 * GET /api/semantic-intelligence/coaching
 * Get coaching intelligence (learning style, effectiveness, resistance)
 */
async function getCoaching(res: ServerResponse, userId: string): Promise<void> {
  try {
    const [effectiveness, learningStyle, resistance] = await Promise.all([
      getEffectivenessProfile(userId),
      getLearningStyle(userId),
      getResistancePattern(userId),
    ]);

    // Find the most effective approach
    let bestApproach: string | undefined;
    if (effectiveness?.effectiveApproaches) {
      const approaches = Object.entries(effectiveness.effectiveApproaches);
      const sorted = approaches.sort((a, b) => (b[1] as number) - (a[1] as number));
      bestApproach = sorted[0]?.[0];
    }

    sendJSON(res, {
      learningStyle: learningStyle
        ? {
            primary: learningStyle.primary,
          }
        : null,
      effectiveness: effectiveness
        ? {
            bestApproach,
          }
        : null,
      resistance: resistance
        ? {
            sensitiveTopics: resistance.deflectedTopics?.map((t) => t.topic) || [],
          }
        : null,
    });
    log.debug({ userId }, 'Coaching intelligence fetched');
  } catch (error) {
    log.error({ error, userId }, 'Failed to get coaching intelligence');
    sendError(res, 'Failed to fetch coaching intelligence', 500);
  }
}

/**
 * GET /api/semantic-intelligence/self-awareness
 * Get self-awareness insights (blind spots, values alignment)
 */
async function getSelfAwareness(res: ServerResponse, userId: string): Promise<void> {
  try {
    const [blindSpots, misaligned] = await Promise.all([
      getBlindSpots(userId),
      getMisalignedValues(userId),
    ]);

    sendJSON(res, {
      blindSpots: blindSpots.map((b) => ({
        area: b.pattern,
        evidence: Array.isArray(b.evidence) ? b.evidence.slice(0, 2).join('; ') : '',
        confidence: b.confidence,
      })),
      valuesAlignment: {
        aligned: [], // We only have misaligned values easily accessible
        misaligned: misaligned.map((v) => ({
          value: v.value,
          behavior: v.examples?.[0] || 'behavior not tracked',
        })),
      },
    });
    log.debug({ userId, blindSpotCount: blindSpots.length }, 'Self-awareness fetched');
  } catch (error) {
    log.error({ error, userId }, 'Failed to get self-awareness');
    sendError(res, 'Failed to fetch self-awareness', 500);
  }
}

/**
 * GET /api/semantic-intelligence/deep-analysis
 * Get deep correlation analysis
 */
async function getDeepAnalysis(res: ServerResponse, userId: string): Promise<void> {
  try {
    const semanticContext = await buildSemanticIntelligenceContext(userId, {});

    sendJSON(res, {
      correlations:
        semanticContext.activeCorrelations.length > 0
          ? semanticContext.activeCorrelations.map((c) => ({
              observation: c,
              surfacingContext: 'proactive',
            }))
          : [],
      emotionalArcs:
        semanticContext.emotionalArcs.length > 0
          ? semanticContext.emotionalArcs.map((a) => ({ insight: a }))
          : [],
      summary: {
        hasCorrelations: semanticContext.activeCorrelations.length > 0,
        hasArcs: semanticContext.emotionalArcs.length > 0,
      },
    });
    log.debug({ userId }, 'Deep analysis fetched');
  } catch (error) {
    log.error({ error, userId }, 'Failed to get deep analysis');
    sendError(res, 'Failed to fetch deep analysis', 500);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getTimeOfDayLabel(hour: number): string {
  if (hour >= 5 && hour < 9) return 'Early morning';
  if (hour >= 9 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 14) return 'Midday';
  if (hour >= 14 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 20) return 'Evening';
  if (hour >= 20 && hour < 23) return 'Night';
  return 'Late night';
}

function getEnergyLabel(level: number): string {
  if (level > 0.7) return 'High energy';
  if (level > 0.4) return 'Moderate energy';
  if (level > 0.2) return 'Low energy';
  return 'Very low energy';
}

// ============================================================================
// MAIN ROUTER
// ============================================================================

/**
 * Handle all /api/semantic-intelligence/* routes
 */
export async function handleSemanticIntelligenceRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/semantic-intelligence routes
  if (!pathname.startsWith('/api/semantic-intelligence')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Extract userId from query params
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const userId = url.searchParams.get('userId');

  if (!userId) {
    sendError(res, 'Missing userId parameter', 400);
    return true;
  }

  // Route to appropriate handler
  const route = pathname.replace('/api/semantic-intelligence', '');

  try {
    switch (route) {
      case '/insights':
        await getInsights(res, userId);
        return true;

      case '/open-loops':
        await getOpenLoops(res, userId);
        return true;

      case '/commitments':
        await getCommitments(res, userId);
        return true;

      case '/relationships':
        await getRelationships(res, userId);
        return true;

      case '/temporal':
        await getTemporal(res, userId);
        return true;

      case '/behavioral':
        await getBehavioral(res, userId);
        return true;

      case '/coaching':
        await getCoaching(res, userId);
        return true;

      case '/self-awareness':
        await getSelfAwareness(res, userId);
        return true;

      case '/deep-analysis':
        await getDeepAnalysis(res, userId);
        return true;

      default:
        return false;
    }
  } catch (error) {
    log.error({ error, pathname, userId }, 'Unhandled error in semantic intelligence routes');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}
