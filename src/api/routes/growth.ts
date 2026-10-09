/**
 * Growth Visibility API Routes
 *
 * Live paths only: growth journal and pattern insights.
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
import { requireUserId, sendJSON, sendJSONCached } from '../helpers.js';

const log = createLogger({ module: 'GrowthAPI' });

/**
 * GET /api/journal/growth - Auto-generated growth journal entries
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

    const entries = insights.map((insight) => {
      let entryType: 'milestone' | 'pattern' | 'insight' | 'celebration' | 'nudge' = 'insight';
      if (insight.type === 'capability_growth' || insight.type === 'consistency_improvement') {
        entryType = 'milestone';
      } else if (insight.type === 'pattern_break') {
        entryType = 'pattern';
      } else if (insight.type === 'self_awareness' || insight.type === 'depth_increase') {
        const insightData = insight as GrowthInsight & { reactions?: { resonated?: boolean } };
        entryType = insightData.reactions?.resonated ? 'celebration' : 'insight';
      }

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

    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const limitedEntries = entries.slice(0, 20);

    let streakDays = 0;
    const today = new Date();
    const sortedDates = entries
      .map((e) => new Date(e.date).toDateString())
      .filter((v, i, a) => a.indexOf(v) === i);

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
      120
    );
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get growth journal entries');
    sendJSON(res, { entries: [], lastUpdated: new Date().toISOString(), streakDays: 0 }, 500);
  }
}

/**
 * GET /api/insights/patterns - Behavioral pattern insights
 */
async function handleGetPatternInsights(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const userId = requireUserId(req, res, parsedUrl);
  if (!userId) return;

  try {
    const { getStore } = await import('../../memory/store-factory.js');
    const { extractLearnedMemories } = await import('../../services/memory/learned-memories.js');

    const store = await getStore();
    const profile = await store.getProfile(userId);

    if (!profile) {
      sendJSON(res, { patterns: [], summary: 'Keep chatting - patterns will emerge!' });
      return;
    }

    const { patterns: rawPatterns } = await extractLearnedMemories(
      profile as Parameters<typeof extractLearnedMemories>[0]
    );

    const patterns = rawPatterns.map((pattern) => ({
      id: (pattern as { id?: string }).id || `pattern-${Math.random().toString(36).slice(2)}`,
      category: (pattern as { category?: string }).category || 'general',
      pattern: (pattern as { pattern?: string }).pattern || '',
      frequency: (pattern as { frequency?: number }).frequency || 1,
      examples: (pattern as { examples?: string[] }).examples || [],
      confidence: Math.min(100, ((pattern as { frequency?: number }).frequency || 1) * 10),
    }));

    const byCategory: Record<string, typeof patterns> = {};
    for (const p of patterns) {
      if (!byCategory[p.category]) byCategory[p.category] = [];
      byCategory[p.category].push(p);
    }

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
      180
    );
  } catch (err) {
    log.error({ error: err, userId }, 'Failed to get pattern insights');
    sendJSON(res, { patterns: [], byCategory: {}, totalPatterns: 0, summary: '' }, 500);
  }
}

export async function handleGrowthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  const method = req.method || 'GET';

  if (pathname === '/api/journal/growth' && method === 'GET') {
    await handleGetJournalEntries(req, res, parsedUrl);
    return true;
  }

  if (pathname === '/api/insights/patterns' && method === 'GET') {
    await handleGetPatternInsights(req, res, parsedUrl);
    return true;
  }

  return false;
}

export default handleGrowthRoutes;
