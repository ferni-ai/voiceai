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
import { parseBody, sendJSON } from './helpers.js';
import { requireAuth } from './auth-middleware.js';
import { buildSuperhumanContext, type SuperhumanContext } from '../services/superhuman/index.js';
import { loadUserPatterns } from '../services/superhuman/predictive-coaching.js';
import { getInsightsToSurface } from '../services/superhuman/semantic-intelligence/insight-broker.js';
import { getFirestoreDb, cleanForFirestore } from '../services/superhuman/firestore-utils.js';

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

function getTimeContext(): SanctuaryData['timeContext'] {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function getGreeting(timeContext: SanctuaryData['timeContext']): string {
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();

  const greetings = {
    morning: `${day} MORNING`,
    afternoon: `${day} AFTERNOON`,
    evening: `${day} EVENING`,
    night: `LATE ${day}`,
  };

  return greetings[timeContext];
}

function getInspiration(timeContext: SanctuaryData['timeContext']): {
  quote: string;
  source: string;
} {
  const inspirations = {
    morning: [
      {
        quote: 'The way to get started is to quit talking and begin doing.',
        source: 'Walt Disney',
      },
      { quote: 'Every morning brings new potential.', source: 'Unknown' },
      {
        quote: 'This is a wonderful day. I have never seen this one before.',
        source: 'Maya Angelou',
      },
    ],
    afternoon: [
      { quote: 'The only way to do great work is to love what you do.', source: 'Steve Jobs' },
      { quote: 'Small steps every day lead to big changes.', source: 'Unknown' },
      { quote: 'You are never too old to set another goal.', source: 'C.S. Lewis' },
    ],
    evening: [
      { quote: 'Rest is not idleness.', source: 'John Lubbock' },
      {
        quote: 'In the evening of life, we will be judged on love alone.',
        source: 'St. John of the Cross',
      },
      { quote: 'Each day provides its own gifts.', source: 'Marcus Aurelius' },
    ],
    night: [
      { quote: "Tomorrow's a new day with no mistakes in it yet.", source: 'L.M. Montgomery' },
      { quote: 'Sleep is the best meditation.', source: 'Dalai Lama' },
      { quote: 'Night is the other half of life, and the better half.', source: 'Goethe' },
    ],
  };

  const options = inspirations[timeContext];
  return options[Math.floor(Math.random() * options.length)];
}

// ============================================================================
// INSIGHT GENERATION
// ============================================================================

async function generateSanctuaryInsights(userId: string): Promise<SanctuaryInsight[]> {
  const insights: SanctuaryInsight[] = [];

  try {
    // Get superhuman context for rich insights
    const superhumanCtx = await buildSuperhumanContext(userId);

    // Get proactive insights from semantic intelligence
    const proactiveInsights = await getInsightsToSurface(userId, {
      hourOfDay: new Date().getHours(),
      isSessionStart: true,
    });

    // Convert proactive insights to Sanctuary format
    for (const insight of proactiveInsights.slice(0, 2)) {
      // Map priority (ProactiveInsight uses 'critical' | 'high' | 'medium' | 'low')
      const mappedPriority = insight.priority === 'critical' ? 'high' : insight.priority;

      insights.push({
        id: insight.id,
        type: 'superhuman',
        title: insight.source, // Use source as title
        description: insight.insight, // Use insight content as description
        icon: getInsightIcon(insight.source),
        priority: mappedPriority as 'high' | 'medium' | 'low',
        actionLabel: 'Explore',
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
          title: 'Commitments in Flight',
          description: `You have ${commitmentLines.length} active commitment${commitmentLines.length > 1 ? 's' : ''} being tracked.`,
          icon: 'clipboard-check',
          priority: 'medium',
          actionLabel: 'Review',
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
        title: 'Pattern Detected',
        description: `When ${topPattern.trigger}, ${topPattern.outcome}`,
        icon: 'eye',
        priority: 'medium',
      });
    }

    // Add growth insights if available
    if (superhumanCtx.narrative) {
      insights.push({
        id: 'growth_narrative',
        type: 'growth',
        title: 'Your Story Unfolds',
        description: 'Your journey has chapters worth celebrating.',
        icon: 'book-open',
        priority: 'low',
        actionLabel: 'View Journey',
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
      title: 'A Moment for You',
      description: 'This is your sanctuary. Take a breath and be present.',
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
  timeContext: SanctuaryData['timeContext'],
  superhumanCtx?: Partial<SuperhumanContext>
): SanctuaryPractice[] {
  // All available practices
  const allPractices: SanctuaryPractice[] = [
    {
      id: 'brainstorm',
      name: 'Brainstorm Session',
      description: 'Think through a challenge together',
      category: 'grow',
      icon: 'lightbulb',
      duration: '10-15 min',
      prompt: "Let's brainstorm. What challenge or decision is on your mind?",
      tags: ['creativity', 'problem-solving', 'clarity'],
      recommended: false,
    },
    {
      id: 'daily-checkin',
      name: 'Daily Check-in',
      description: 'Start your day with a gentle reflection',
      category: 'reflect',
      icon: 'sun',
      duration: '5-10 min',
      prompt: 'Good to see you. How are you feeling right now, really?',
      tags: ['morning', 'reflection', 'awareness'],
      recommended: false,
    },
    {
      id: 'gratitude',
      name: 'Gratitude Practice',
      description: 'A moment of appreciation',
      category: 'ground',
      icon: 'heart',
      duration: '5 min',
      prompt: "Let's pause and appreciate. What's one thing you're grateful for right now?",
      tags: ['gratitude', 'positivity', 'grounding'],
      recommended: false,
    },
    {
      id: 'wind-down',
      name: 'Wind Down',
      description: 'Gentle end-of-day reflection',
      category: 'ground',
      icon: 'moon',
      duration: '5-10 min',
      prompt: "Let's wind down together. What's one thing you're proud of from today?",
      tags: ['evening', 'rest', 'closure'],
      recommended: false,
    },
    {
      id: 'weekly-review',
      name: 'Weekly Review',
      description: 'Reflect on your week and celebrate progress',
      category: 'reflect',
      icon: 'calendar',
      duration: '15-20 min',
      prompt: "Let's look back at your week. What stands out to you?",
      tags: ['weekly', 'progress', 'planning'],
      recommended: false,
    },
    {
      id: 'breath-focus',
      name: 'Breath Focus',
      description: 'Simple breathing exercise to center yourself',
      category: 'ground',
      icon: 'wind',
      duration: '3-5 min',
      prompt: "Let's breathe together. Find a comfortable position and let your eyes soften.",
      tags: ['breathing', 'calm', 'present'],
      recommended: false,
    },
    {
      id: 'future-letter',
      name: 'Letter to Future Self',
      description: 'Write wisdom for your future self',
      category: 'grow',
      icon: 'mail',
      duration: '10-15 min',
      prompt: 'What would you want to tell yourself 6 months from now?',
      tags: ['growth', 'reflection', 'intention'],
      recommended: false,
    },
    {
      id: 'values-check',
      name: 'Values Check-in',
      description: 'Reconnect with what matters most',
      category: 'reflect',
      icon: 'compass',
      duration: '10 min',
      prompt: "Let's explore your values. What feels most important to you right now?",
      tags: ['values', 'meaning', 'alignment'],
      recommended: false,
    },
  ];

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
  const dayOfWeek = new Date().getDay();
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

  // Mark recommended practices
  return allPractices.map((practice) => ({
    ...practice,
    recommended: recommendations.includes(practice.id),
    reasonRecommended: recommendations.includes(practice.id)
      ? getRecommendationReason(practice.id, timeContext)
      : undefined,
  }));
}

function getRecommendationReason(practiceId: string, timeContext: string): string {
  const reasons: Record<string, string> = {
    'daily-checkin': 'Perfect for starting your day with intention',
    gratitude: 'A moment of appreciation grounds you',
    'wind-down': 'Time to release the day',
    'breath-focus': 'A few breaths can shift everything',
    'weekly-review': 'End the week with reflection',
    brainstorm: 'Clear thinking awaits',
    'future-letter': 'Plant seeds for future you',
    'values-check': 'Reconnect with your compass',
  };
  return reasons[practiceId] || `Great for ${timeContext}`;
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
      const userId = url.searchParams.get('userId');

      if (!userId) {
        sendJson(res, 400, { error: 'Missing userId parameter' });
        return true;
      }

      const timeContext = getTimeContext();

      // Build data in parallel
      const [insights, superhumanCtx] = await Promise.all([
        generateSanctuaryInsights(userId),
        buildSuperhumanContext(userId).catch((err) => {
          log.warn({ userId, error: String(err) }, 'Failed to build superhuman context - using empty');
          return {};
        }),
      ]);

      const practices = getRecommendedPractices(timeContext, superhumanCtx);

      const data: SanctuaryData = {
        greeting: getGreeting(timeContext),
        timeContext,
        insights,
        practices,
        inspiration: getInspiration(timeContext),
      };

      sendJson(res, 200, data);
      return true;
    }

    // GET /api/sanctuary/insights - Get insights only
    if (method === 'GET' && pathname === '/api/sanctuary/insights') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const userId = url.searchParams.get('userId');

      if (!userId) {
        sendJson(res, 400, { error: 'Missing userId parameter' });
        return true;
      }

      const insights = await generateSanctuaryInsights(userId);
      sendJson(res, 200, { insights });
      return true;
    }

    // GET /api/sanctuary/practices - Get practices only
    if (method === 'GET' && pathname === '/api/sanctuary/practices') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const userId = url.searchParams.get('userId');

      const timeContext = getTimeContext();
      let superhumanCtx = {};

      if (userId) {
        superhumanCtx = await buildSuperhumanContext(userId).catch((err) => {
          log.warn({ userId, error: String(err) }, 'Failed to build superhuman context for practices - using empty');
          return {};
        });
      }

      const practices = getRecommendedPractices(timeContext, superhumanCtx);
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
