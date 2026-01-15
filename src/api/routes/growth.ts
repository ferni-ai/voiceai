/**
 * Growth Visibility API Routes
 *
 * Exposes the GrowthVisibilityEngine to the frontend for user-facing
 * progress visualization and insights.
 *
 * GET /api/growth/insights - Get growth insights for user
 * GET /api/growth/snapshots - Get historical snapshots
 * GET /api/growth/summary - Get growth summary for dashboard
 * POST /api/growth/reaction - Record user reaction to insight
 *
 * @module GrowthRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getGrowthVisibilityEngine,
  type GrowthInsight,
  type GrowthType,
} from '../../services/growth-visibility-engine.js';
import { createLogger } from '../../utils/safe-logger.js';
import { parseBody, requireUserId, sendJSON, sendJSONCached } from '../helpers.js';

const log = createLogger({ module: 'GrowthAPI' });

// ============================================================================
// TYPES
// ============================================================================

interface GrowthSummary {
  userId: string;
  totalInsights: number;
  surfacedInsights: number;
  resonatedInsights: number;
  byType: Record<GrowthType, number>;
  topGrowthAreas: string[];
  recentInsights: GrowthInsight[];
  growthScore: number; // 0-100 overall growth score
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * GET /api/growth/insights - Get all growth insights for user
 */
async function handleGetInsights(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const engine = getGrowthVisibilityEngine(userId);

    // Detect any new growth
    engine.detectGrowth();

    const insights = engine.getAllInsights();

    // Filter by type if requested
    const typeFilter = parsedUrl.searchParams.get('type') as GrowthType | null;
    const filteredInsights = typeFilter ? insights.filter((i) => i.type === typeFilter) : insights;

    // Sort by confidence and recency
    const sortedInsights = filteredInsights.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return new Date(b.timespan.end).getTime() - new Date(a.timespan.end).getTime();
    });

    // Limit results
    const limit = parseInt(parsedUrl.searchParams.get('limit') || '20', 10);
    const limitedInsights = sortedInsights.slice(0, limit);

    sendJSONCached(
      res,
      {
        success: true,
        insights: limitedInsights,
        total: filteredInsights.length,
      },
      60
    );
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get growth insights');
    sendJSON(res, { error: 'Failed to get growth insights' }, 500);
  }
}

/**
 * GET /api/growth/summary - Get growth summary for dashboard
 */
async function handleGetSummary(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const engine = getGrowthVisibilityEngine(userId);

    // Detect any new growth
    engine.detectGrowth();

    const stats = engine.getStats();
    const insights = engine.getAllInsights();

    // Calculate top growth areas
    const areaCounts = new Map<string, number>();
    for (const insight of insights) {
      const count = areaCounts.get(insight.area) || 0;
      areaCounts.set(insight.area, count + 1);
    }
    const topGrowthAreas = Array.from(areaCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([area]) => area);

    // Get recent insights (last 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentInsights = insights
      .filter((i) => new Date(i.timespan.end).getTime() > thirtyDaysAgo)
      .sort((a, b) => new Date(b.timespan.end).getTime() - new Date(a.timespan.end).getTime())
      .slice(0, 5);

    // Calculate growth score (0-100)
    // Based on: number of insights, resonance rate, variety of growth types
    const typeVariety = Object.keys(stats.byType).length;
    const resonanceRate = stats.surfaced > 0 ? stats.resonated / stats.surfaced : 0;
    const insightDensity = Math.min(stats.totalInsights / 10, 1); // Cap at 10 insights

    const growthScore = Math.round(
      (typeVariety / 7) * 30 + // Type variety: up to 30 points
        resonanceRate * 40 + // Resonance: up to 40 points
        insightDensity * 30 // Insight density: up to 30 points
    );

    const summary: GrowthSummary = {
      userId,
      totalInsights: stats.totalInsights,
      surfacedInsights: stats.surfaced,
      resonatedInsights: stats.resonated,
      byType: stats.byType,
      topGrowthAreas,
      recentInsights,
      growthScore: Math.min(100, growthScore),
    };

    sendJSONCached(res, { success: true, summary }, 120);
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get growth summary');
    sendJSON(res, { error: 'Failed to get growth summary' }, 500);
  }
}

/**
 * GET /api/growth/reflection - Get a growth reflection to surface
 */
async function handleGetReflection(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const engine = getGrowthVisibilityEngine(userId);

    // Detect any new growth
    engine.detectGrowth();

    // Get context from query params
    const currentTopic = parsedUrl.searchParams.get('topic') || undefined;
    const sessionStart = parsedUrl.searchParams.get('sessionStart') === 'true';
    const milestone = parsedUrl.searchParams.get('milestone') === 'true';

    const reflection = engine.getInsightToSurface({
      currentTopic,
      sessionStart,
      milestone,
    });

    if (reflection) {
      sendJSON(res, {
        success: true,
        hasReflection: true,
        reflection: {
          id: reflection.insight.id,
          text: reflection.reflection,
          ssml: reflection.ssml,
          suggestedMoment: reflection.suggestedMoment,
          type: reflection.insight.type,
          area: reflection.insight.area,
          confidence: reflection.insight.confidence,
        },
      });
    } else {
      sendJSON(res, {
        success: true,
        hasReflection: false,
        reflection: null,
      });
    }
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get growth reflection');
    sendJSON(res, { error: 'Failed to get growth reflection' }, 500);
  }
}

/**
 * POST /api/growth/reaction - Record user reaction to an insight
 */
async function handleRecordReaction(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const body = await parseBody(req);

    const { insightId, reaction } = body as {
      insightId?: string;
      reaction?: 'resonated' | 'neutral' | 'dismissed';
    };

    if (!insightId || !reaction) {
      sendJSON(res, { error: 'insightId and reaction are required' }, 400);
      return;
    }

    if (!['resonated', 'neutral', 'dismissed'].includes(reaction)) {
      sendJSON(res, { error: 'reaction must be resonated, neutral, or dismissed' }, 400);
      return;
    }

    const engine = getGrowthVisibilityEngine(userId);
    engine.recordReaction(insightId, reaction);

    log.info({ userId, insightId, reaction }, 'Growth insight reaction recorded');

    sendJSON(res, { success: true });
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to record growth reaction');
    sendJSON(res, { error: 'Failed to record reaction' }, 500);
  }
}

/**
 * POST /api/growth/snapshot - Capture a growth snapshot
 */
async function handleCaptureSnapshot(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const engine = getGrowthVisibilityEngine(userId);
    engine.captureSnapshot();

    // Detect growth after capturing snapshot
    const newInsights = engine.detectGrowth();

    log.info({ userId, newInsights: newInsights.length }, 'Growth snapshot captured');

    sendJSON(res, {
      success: true,
      newInsightsDetected: newInsights.length,
    });
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to capture growth snapshot');
    sendJSON(res, { error: 'Failed to capture snapshot' }, 500);
  }
}

/**
 * GET /api/growth/types - Get growth type definitions
 */
function handleGetTypes(_req: IncomingMessage, res: ServerResponse): void {
  const types = {
    capability_growth: {
      name: 'Capability Growth',
      description: "Skills and abilities you couldn't do before",
      icon: '🌱',
    },
    topic_comfort: {
      name: 'Topic Comfort',
      description: 'Topics you can now discuss more freely',
      icon: '💬',
    },
    pattern_break: {
      name: 'Pattern Break',
      description: "Old habits you've moved past",
      icon: '🔓',
    },
    consistency_improvement: {
      name: 'Consistency',
      description: 'Areas where you show up more regularly',
      icon: '📈',
    },
    depth_increase: {
      name: 'Depth',
      description: 'Deeper, more meaningful conversations',
      icon: '🌊',
    },
    emotional_regulation: {
      name: 'Emotional Regulation',
      description: 'Better handling of difficult emotions',
      icon: '🧘',
    },
    self_awareness: {
      name: 'Self-Awareness',
      description: 'Noticing patterns in yourself',
      icon: '🪞',
    },
  };

  sendJSONCached(res, { success: true, types }, 3600);
}

// ============================================================================
// GROWTH JOURNAL ROUTES
// ============================================================================

/**
 * GET /api/journal/growth - Get auto-generated growth journal entries
 *
 * Returns Ferni-written reflections on the user's journey, including:
 * - Milestones achieved
 * - Patterns noticed
 * - Insights surfaced
 * - Celebrations
 * - Gentle nudges
 */
async function handleGetJournalEntries(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const engine = getGrowthVisibilityEngine(userId);
    engine.detectGrowth();

    const insights = engine.getAllInsights();
    const stats = engine.getStats();

    // Transform insights into journal entries
    const entries = insights.map((insight) => {
      // Determine entry type based on insight characteristics
      let entryType: 'milestone' | 'pattern' | 'insight' | 'celebration' | 'nudge' = 'insight';
      if (insight.type === 'capability_growth' || insight.type === 'consistency_improvement') {
        entryType = 'milestone';
      } else if (insight.type === 'pattern_break') {
        entryType = 'pattern';
      } else if (insight.type === 'self_awareness' || insight.type === 'depth_increase') {
        // Check if insight was surfaced and resonated (if reactions exist)
        const insightData = insight as GrowthInsight & { reactions?: { resonated?: boolean } };
        entryType = insightData.reactions?.resonated ? 'celebration' : 'insight';
      }

      // Generate a warm, human-readable title
      const titles: Record<GrowthType, string> = {
        capability_growth: 'A new capability emerged',
        topic_comfort: 'Opening up about something new',
        pattern_break: 'Breaking an old pattern',
        consistency_improvement: 'Showing up more consistently',
        depth_increase: 'Going deeper',
        emotional_regulation: 'Handling emotions better',
        self_awareness: 'Noticing something about yourself',
      };

      return {
        id: insight.id,
        date: insight.timespan.end,
        title: titles[insight.type] || 'A moment of growth',
        content: insight.evidence.join(' '),
        type: entryType,
        tags: [insight.area, insight.type.replace(/_/g, ' ')],
        personaId: 'ferni',
      };
    });

    // Sort by date (newest first)
    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Limit to reasonable number
    const limitedEntries = entries.slice(0, 20);

    // Calculate streak (days with consecutive growth events)
    let streakDays = 0;
    const today = new Date();
    const sortedDates = entries
      .map((e) => new Date(e.date).toDateString())
      .filter((v, i, a) => a.indexOf(v) === i); // unique dates

    for (const dateStr of sortedDates) {
      const entryDate = new Date(dateStr);
      const diffDays = Math.floor((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === streakDays) {
        streakDays++;
      } else {
        break;
      }
    }

    sendJSONCached(
      res,
      {
        entries: limitedEntries,
        lastUpdated: new Date().toISOString(),
        streakDays,
        totalInsights: stats.totalInsights,
      },
      120 // Cache for 2 minutes
    );
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get growth journal entries');
    sendJSON(res, { entries: [], lastUpdated: new Date().toISOString(), streakDays: 0 }, 500);
  }
}

// ============================================================================
// PATTERN INSIGHTS ROUTES
// ============================================================================

/**
 * GET /api/insights/patterns - Get behavioral pattern insights
 *
 * Returns patterns Ferni has noticed across conversations:
 * - Communication preferences
 * - Time patterns
 * - Topic preferences
 * - Emotional patterns
 */
async function handleGetPatternInsights(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { getDefaultStore } = await import('../../memory/index.js');
    const { extractLearnedMemories } = await import('../../services/memory/learned-memories.js');

    const store = getDefaultStore();
    const profile = await store.getProfile(userId);

    if (!profile) {
      sendJSON(res, { patterns: [], summary: 'Keep chatting - patterns will emerge!' });
      return;
    }

    // Extract patterns from profile
    const { patterns: rawPatterns } = extractLearnedMemories(
      profile as Parameters<typeof extractLearnedMemories>[0]
    );

    // Transform patterns for the UI
    const patterns = rawPatterns.map((pattern) => ({
      id: (pattern as { id?: string }).id || `pattern-${Math.random().toString(36).slice(2)}`,
      category: (pattern as { category?: string }).category || 'general',
      pattern: (pattern as { pattern?: string }).pattern || '',
      frequency: (pattern as { frequency?: number }).frequency || 1,
      examples: (pattern as { examples?: string[] }).examples || [],
      confidence: Math.min(100, ((pattern as { frequency?: number }).frequency || 1) * 10),
    }));

    // Group by category
    const byCategory: Record<string, typeof patterns> = {};
    for (const p of patterns) {
      if (!byCategory[p.category]) {
        byCategory[p.category] = [];
      }
      byCategory[p.category].push(p);
    }

    // Generate a warm summary
    const totalPatterns = patterns.length;
    const summaryPhrases = [
      totalPatterns === 0 ? "I'm still learning about you" : null,
      totalPatterns > 0 && totalPatterns < 5 ? "I'm starting to notice some patterns" : null,
      totalPatterns >= 5 && totalPatterns < 10 ? "I'm getting to know you pretty well" : null,
      totalPatterns >= 10 ? 'I feel like I really understand how you tick' : null,
    ].filter(Boolean);

    sendJSONCached(
      res,
      {
        patterns,
        byCategory,
        totalPatterns,
        summary: summaryPhrases[0] || "Let's keep talking!",
        lastUpdated: new Date().toISOString(),
      },
      180 // Cache for 3 minutes
    );
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get pattern insights');
    sendJSON(res, { patterns: [], byCategory: {}, totalPatterns: 0, summary: '' }, 500);
  }
}

// ============================================================================
// MAIN ROUTE HANDLER
// ============================================================================

/**
 * Route handler for growth endpoints
 */
export async function handleGrowthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  const method = req.method || 'GET';

  // GET /api/growth/insights
  if (pathname === '/api/growth/insights' && method === 'GET') {
    await handleGetInsights(req, res, parsedUrl);
    return true;
  }

  // GET /api/growth/summary
  if (pathname === '/api/growth/summary' && method === 'GET') {
    await handleGetSummary(req, res, parsedUrl);
    return true;
  }

  // GET /api/growth/reflection
  if (pathname === '/api/growth/reflection' && method === 'GET') {
    await handleGetReflection(req, res, parsedUrl);
    return true;
  }

  // POST /api/growth/reaction
  if (pathname === '/api/growth/reaction' && method === 'POST') {
    await handleRecordReaction(req, res, parsedUrl);
    return true;
  }

  // POST /api/growth/snapshot
  if (pathname === '/api/growth/snapshot' && method === 'POST') {
    await handleCaptureSnapshot(req, res, parsedUrl);
    return true;
  }

  // GET /api/growth/types
  if (pathname === '/api/growth/types' && method === 'GET') {
    handleGetTypes(req, res);
    return true;
  }

  // GET /api/journal/growth - Growth Journal entries
  if (pathname === '/api/journal/growth' && method === 'GET') {
    await handleGetJournalEntries(req, res, parsedUrl);
    return true;
  }

  // GET /api/insights/patterns - Pattern Insights
  if (pathname === '/api/insights/patterns' && method === 'GET') {
    await handleGetPatternInsights(req, res, parsedUrl);
    return true;
  }

  return false;
}

export default handleGrowthRoutes;
