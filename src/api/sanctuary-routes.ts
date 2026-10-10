/**
 * Sanctuary Routes
 *
 * API endpoints for "The Sanctuary" immersive guided practice experience.
 * Provides insights, practice recommendations, and chat support.
 *
 * Endpoints:
 * - GET  /api/sanctuary/insights - Get personalized insights for the user
 * - GET  /api/sanctuary/practices - Get recommended practices
 * - POST /api/sanctuary/practice/start - Start a guided practice
 * - POST /api/sanctuary/practice/complete - Mark practice complete
 *
 * @module SanctuaryRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { localeForRequest, tFor, type SupportedLocale } from '../i18n/index.js';
import {
  ALL_PRACTICES,
  GREETING_KEYS,
  INSIGHT_SOURCE_TITLE_KEYS,
  INSPIRATIONS,
} from './sanctuary-content.js';
import { getUserId, parseBody, sendJSON } from './helpers.js';
import { requireAuth } from './auth-middleware.js';
import { buildSuperhumanContext, type SuperhumanContext } from '../services/superhuman/index.js';
import { loadUserPatterns } from '../services/superhuman/predictive-coaching.js';
import { getInsightsToSurface } from '../services/superhuman/semantic-intelligence/insight-broker.js';
import { getFirestoreDb, cleanForFirestore } from '../services/superhuman/firestore-utils.js';
import { timeOfDay, wallClock } from './local-clock.js';

const log = createLogger({ module: 'SanctuaryRoutes' });

// ============================================================================
// TYPES
// ============================================================================

interface SanctuaryInsight {
  id: string;
  type: 'superhuman' | 'pattern' | 'growth' | 'seasonal' | 'commitment';
  title: string;
  description: string;
  icon: string;
  priority: 'high' | 'medium' | 'low';
  actionLabel?: string;
  actionType?: 'start_practice' | 'view_details' | 'dismiss';
  relatedPracticeId?: string;
}

interface SanctuaryPractice {
  id: string;
  name: string;
  description: string;
  category: 'ground' | 'reflect' | 'connect' | 'grow';
  icon: string;
  duration: string;
  prompt: string;
  tags: string[];
  recommended: boolean;
  reasonRecommended?: string;
}

interface SanctuaryData {
  greeting: string;
  timeContext: 'morning' | 'afternoon' | 'evening' | 'night';
  insights: SanctuaryInsight[];
  practices: SanctuaryPractice[];
  inspiration: {
    quote: string;
    source: string;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  sendJSON(res, data, status);
}

// `now` throughout is the person's wall clock (wallClock), not the server's
function getGreeting(locale: SupportedLocale, timeContext: SanctuaryData['timeContext'], now: Date): string {
  const day = now.toLocaleDateString(locale, { weekday: 'long' }).toLocaleUpperCase(locale);
  return tFor(locale, GREETING_KEYS[timeContext], { day });
}

function getInspiration(
  locale: SupportedLocale,
  timeContext: SanctuaryData['timeContext']
): { quote: string; source: string } {
  const options = INSPIRATIONS[timeContext];
  const pick = options[Math.floor(Math.random() * options.length)];
  return {
    quote: tFor(locale, pick.key),
    source: pick.author ?? tFor(locale, 'sanctuary.quotes.unknownAuthor'),
  };
}

/**
 * Pick the plural form for a count. English ships `one` and `other`; other
 * languages may add zero/two/few/many keys, and anything missing falls back
 * to `other`.
 */
function tPlural(locale: SupportedLocale, baseKey: string, count: number): string {
  const category = new Intl.PluralRules(locale).select(count);
  const specific = tFor(locale, `${baseKey}.${category}`, { count });
  return specific === `${baseKey}.${category}`
    ? tFor(locale, `${baseKey}.other`, { count })
    : specific;
}

// ============================================================================
// INSIGHT GENERATION
// ============================================================================

async function generateSanctuaryInsights(
  locale: SupportedLocale,
  userId: string,
  now: Date
): Promise<SanctuaryInsight[]> {
  const insights: SanctuaryInsight[] = [];

  try {
    // Get superhuman context for rich insights
    const superhumanCtx = await buildSuperhumanContext(userId);

    // Get proactive insights from semantic intelligence
    const proactiveInsights = await getInsightsToSurface(userId, {
      hourOfDay: now.getHours(),
      isSessionStart: true,
    });

    // Convert proactive insights to Sanctuary format
    for (const insight of proactiveInsights.slice(0, 2)) {
      // Map priority (ProactiveInsight uses 'critical' | 'high' | 'medium' | 'low')
      const mappedPriority = insight.priority === 'critical' ? 'high' : insight.priority;

      insights.push({
        id: insight.id,
        type: 'superhuman',
        title: INSIGHT_SOURCE_TITLE_KEYS[insight.source]
          ? tFor(locale, INSIGHT_SOURCE_TITLE_KEYS[insight.source])
          : insight.source,
        description: insight.insight, // Generated upstream by the insight broker
        icon: getInsightIcon(insight.source),
        priority: mappedPriority as 'high' | 'medium' | 'low',
        actionLabel: tFor(locale, 'sanctuary.insights.actions.explore'),
        actionType: 'view_details',
      });
    }

    // Add commitment-based insights
    if (superhumanCtx.commitments) {
      const commitmentLines = superhumanCtx.commitments.split('\n').filter((l) => l.trim());
      if (commitmentLines.length > 0) {
        insights.push({
          id: 'commitment_reminder',
          type: 'commitment',
          title: tFor(locale, 'sanctuary.insights.commitments.title'),
          description: tPlural(
            locale,
            'sanctuary.insights.commitments.description',
            commitmentLines.length
          ),
          icon: 'clipboard-check',
          priority: 'medium',
          actionLabel: tFor(locale, 'sanctuary.insights.actions.review'),
          actionType: 'view_details',
        });
      }
    }

    // Add pattern-based insights
    const patterns = await loadUserPatterns(userId);
    if (patterns.length > 0) {
      const topPattern = patterns[0];
      insights.push({
        id: `pattern_${topPattern.id}`,
        type: 'pattern',
        title: tFor(locale, 'sanctuary.insights.pattern.title'),
        description: tFor(locale, 'sanctuary.insights.pattern.description', {
          trigger: topPattern.trigger,
          outcome: topPattern.outcome,
        }),
        icon: 'eye',
        priority: 'medium',
      });
    }

    // Add growth insights if available
    if (superhumanCtx.narrative) {
      insights.push({
        id: 'growth_narrative',
        type: 'growth',
        title: tFor(locale, 'sanctuary.insights.growth.title'),
        description: tFor(locale, 'sanctuary.insights.growth.description'),
        icon: 'book-open',
        priority: 'low',
        actionLabel: tFor(locale, 'sanctuary.insights.actions.viewJourney'),
        actionType: 'view_details',
      });
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to generate superhuman insights');
  }

  // Ensure we always have at least one insight
  if (insights.length === 0) {
    insights.push({
      id: 'welcome',
      type: 'growth',
      title: tFor(locale, 'sanctuary.insights.welcome.title'),
      description: tFor(locale, 'sanctuary.insights.welcome.description'),
      icon: 'heart',
      priority: 'medium',
    });
  }

  return insights;
}

function getInsightIcon(type: string): string {
  const icons: Record<string, string> = {
    commitment: 'clipboard-check',
    pattern: 'eye',
    prediction: 'sparkles',
    growth: 'trending-up',
    seasonal: 'sun',
    reminder: 'bell',
    reflection: 'book-open',
    celebration: 'star',
  };
  return icons[type] || 'lightbulb';
}

// ============================================================================
// PRACTICE RECOMMENDATIONS
// ============================================================================

function getRecommendedPractices(
  locale: SupportedLocale,
  timeContext: SanctuaryData['timeContext'],
  superhumanCtx: Partial<SuperhumanContext> | undefined,
  now: Date
): SanctuaryPractice[] {
  // Determine recommendations based on time and context
  const recommendations: string[] = [];

  if (timeContext === 'morning') {
    recommendations.push('daily-checkin', 'gratitude');
  } else if (timeContext === 'evening') {
    recommendations.push('wind-down', 'gratitude');
  } else if (timeContext === 'night') {
    recommendations.push('wind-down', 'breath-focus');
  } else {
    recommendations.push('brainstorm', 'values-check');
  }

  // Check day of week for weekly review
  const dayOfWeek = now.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 5) {
    // Sunday or Friday
    recommendations.push('weekly-review');
  }

  // Add context-based recommendations
  if (superhumanCtx?.commitments) {
    recommendations.push('brainstorm');
  }

  if (superhumanCtx?.capacity) {
    recommendations.push('breath-focus');
  }

  // Render text for this request's locale and mark recommended practices
  return ALL_PRACTICES.map(({ key, ...practice }) => {
    const recommended = recommendations.includes(practice.id);
    return {
      ...practice,
      name: tFor(locale, `${key}.name`),
      description: tFor(locale, `${key}.description`),
      duration: tFor(locale, `${key}.duration`),
      prompt: tFor(locale, `${key}.prompt`),
      recommended,
      reasonRecommended: recommended ? tFor(locale, `${key}.reason`) : undefined,
    };
  });
}

// ============================================================================
// PRACTICE TRACKING
// ============================================================================

async function recordPracticeStart(
  userId: string,
  practiceId: string,
  metadata?: Record<string, unknown>
): Promise<{ sessionId: string }> {
  const sessionId = `practice_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  const db = getFirestoreDb();
  if (db) {
    try {
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection('practice_sessions')
        .doc(sessionId)
        .set(
          cleanForFirestore({
            practiceId,
            startedAt: new Date(),
            status: 'in_progress',
            metadata,
          })
        );
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to record practice start');
    }
  }

  return { sessionId };
}

async function recordPracticeComplete(
  userId: string,
  sessionId: string,
  feedback?: {
    rating?: number;
    notes?: string;
    moodBefore?: string;
    moodAfter?: string;
  }
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('practice_sessions')
      .doc(sessionId)
      .update(
        cleanForFirestore({
          completedAt: new Date(),
          status: 'completed',
          feedback,
        })
      );

    // Update practice stats
    await updatePracticeStats(userId);

    return true;
  } catch (error) {
    log.warn({ error: String(error), userId, sessionId }, 'Failed to record practice completion');
    return false;
  }
}

async function updatePracticeStats(userId: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    const statsRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('sanctuary_stats')
      .doc('current');
    const statsDoc = await statsRef.get();

    const existing = statsDoc.exists ? statsDoc.data() : {};
    const totalPractices = (existing?.totalPractices || 0) + 1;

    // Calculate streak
    let currentStreak = existing?.currentStreak || 0;
    const lastPracticeDate = existing?.lastPracticeDate?.toDate?.();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (lastPracticeDate) {
      const lastDate = new Date(lastPracticeDate);
      lastDate.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysDiff === 0) {
        // Same day, no streak change
      } else if (daysDiff === 1) {
        currentStreak++;
      } else {
        currentStreak = 1;
      }
    } else {
      currentStreak = 1;
    }

    await statsRef.set(
      cleanForFirestore({
        totalPractices,
        currentStreak,
        longestStreak: Math.max(existing?.longestStreak || 0, currentStreak),
        lastPracticeDate: new Date(),
        updatedAt: new Date(),
      }),
      { merge: true }
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to update practice stats');
  }
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleSanctuaryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const method = req.method?.toUpperCase();

  // Only handle /api/sanctuary/* routes
  if (!pathname.startsWith('/api/sanctuary')) {
    return false;
  }

  try {
    // GET /api/sanctuary - Get full Sanctuary data
    if (method === 'GET' && pathname === '/api/sanctuary') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const userId = getUserId(req, url); // the verified caller first, then ?userId=

      if (!userId) {
        sendJson(res, 400, { error: 'Missing userId parameter' });
        return true;
      }

      const locale = await localeForRequest(req.headers['accept-language']);
      const now = wallClock(url.searchParams.get('tz'));
      const timeContext = timeOfDay(now);

      // Build data in parallel
      const [insights, superhumanCtx] = await Promise.all([
        generateSanctuaryInsights(locale, userId, now),
        buildSuperhumanContext(userId).catch((err) => {
          log.warn(
            { userId, error: String(err) },
            'Failed to build superhuman context - using empty'
          );
          return {};
        }),
      ]);

      const practices = getRecommendedPractices(locale, timeContext, superhumanCtx, now);

      const data: SanctuaryData = {
        greeting: getGreeting(locale, timeContext, now),
        timeContext,
        insights,
        practices,
        inspiration: getInspiration(locale, timeContext),
      };

      sendJson(res, 200, data);
      return true;
    }

    // GET /api/sanctuary/insights - Get insights only
    if (method === 'GET' && pathname === '/api/sanctuary/insights') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const userId = getUserId(req, url); // the verified caller first, then ?userId=

      if (!userId) {
        sendJson(res, 400, { error: 'Missing userId parameter' });
        return true;
      }

      const locale = await localeForRequest(req.headers['accept-language']);
      const insights = await generateSanctuaryInsights(locale, userId, wallClock(url.searchParams.get('tz')));
      sendJson(res, 200, { insights });
      return true;
    }

    // GET /api/sanctuary/practices - Get practices only
    if (method === 'GET' && pathname === '/api/sanctuary/practices') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const userId = getUserId(req, url); // the verified caller first, then ?userId=

      const locale = await localeForRequest(req.headers['accept-language']);
      const now = wallClock(url.searchParams.get('tz'));
      const timeContext = timeOfDay(now);
      let superhumanCtx = {};

      if (userId) {
        superhumanCtx = await buildSuperhumanContext(userId).catch((err) => {
          log.warn(
            { userId, error: String(err) },
            'Failed to build superhuman context for practices - using empty'
          );
          return {};
        });
      }

      const practices = getRecommendedPractices(locale, timeContext, superhumanCtx, now);
      sendJson(res, 200, { practices });
      return true;
    }

    // POST /api/sanctuary/practice/start - Start a practice
    if (method === 'POST' && pathname === '/api/sanctuary/practice/start') {
      const auth = await requireAuth(req, res);
      if (!auth) return true;
      const { userId } = auth;

      const body = await parseBody<{
        practiceId: string;
        metadata?: Record<string, unknown>;
      }>(req);

      if (!body.practiceId) {
        sendJson(res, 400, { error: 'practiceId is required' });
        return true;
      }

      const result = await recordPracticeStart(userId, body.practiceId, body.metadata);

      log.info(
        { userId, practiceId: body.practiceId, sessionId: result.sessionId },
        'Practice started'
      );
      sendJson(res, 201, { success: true, ...result });
      return true;
    }

    // POST /api/sanctuary/practice/complete - Complete a practice
    if (method === 'POST' && pathname === '/api/sanctuary/practice/complete') {
      const auth = await requireAuth(req, res);
      if (!auth) return true;
      const { userId } = auth;

      const body = await parseBody<{
        sessionId: string;
        feedback?: {
          rating?: number;
          notes?: string;
          moodBefore?: string;
          moodAfter?: string;
        };
      }>(req);

      if (!body.sessionId) {
        sendJson(res, 400, { error: 'sessionId is required' });
        return true;
      }

      const success = await recordPracticeComplete(userId, body.sessionId, body.feedback);

      if (success) {
        log.info({ userId, sessionId: body.sessionId }, 'Practice completed');
        sendJson(res, 200, { success: true });
      } else {
        sendJson(res, 500, { error: 'Failed to record completion' });
      }
      return true;
    }

    // Not handled
    return false;
  } catch (error) {
    log.error({ error: String(error), pathname }, 'Sanctuary route error');
    sendJson(res, 500, { error: 'Internal server error' });
    return true;
  }
}

export default {
  handleSanctuaryRoutes,
};
