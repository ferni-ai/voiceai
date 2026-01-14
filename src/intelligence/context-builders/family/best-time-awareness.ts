/**
 * Best Time Awareness Context Builder
 *
 * "Better Than Human" - Learn and surface the best times to reach each contact.
 *
 * When the user wants to call someone, inject insights about:
 * - Best times to reach them (from historical data)
 * - Times to avoid (based on failed attempts)
 * - Current time assessment
 *
 * @module intelligence/context-builders/family/best-time-awareness
 */

import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'context:best-time' });

// ============================================================================
// TYPES
// ============================================================================

interface ContactBestTimes {
  contactPhone: string;
  bestTimes: Array<{
    dayOfWeek: number;
    hourOfDay: number;
    score: number;
  }>;
  successfulCallTimes: Array<{
    dayOfWeek: number;
    hourOfDay: number;
    timestamp: string;
  }>;
  failedAttemptTimes: Array<{
    dayOfWeek: number;
    hourOfDay: number;
    result: string;
    timestamp: string;
  }>;
}

// Cache
const reachabilityCache = new Map<string, { data: Map<string, ContactBestTimes>; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Get reachability data for all contacts
 */
async function getAllReachabilityData(userId: string): Promise<Map<string, ContactBestTimes>> {
  // Check cache
  const cached = reachabilityCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const results = new Map<string, ContactBestTimes>();

  try {
    const { getFirestoreDb } = await import('../../../services/superhuman/firestore-utils.js').catch(
      () => ({ getFirestoreDb: null })
    );

    const db = getFirestoreDb ? getFirestoreDb() : null;
    if (!db) return results;

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('contact_reachability')
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data() as ContactBestTimes;
      results.set(doc.id, data);
    }

    // Cache
    reachabilityCache.set(userId, { data: results, timestamp: Date.now() });
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get reachability data');
  }

  return results;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

export const bestTimeAwarenessBuilder: ContextBuilder = {
  name: 'best-time-awareness',
  description: 'Surfaces optimal times to reach contacts based on call history',
  priority: 3,
  category: BuilderCategory.EXTERNAL,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services, userText } = input;

    const userId = services?.userId;
    if (!userId) {
      return [];
    }

    // Only inject if recent conversation mentions calling someone
    const recentText = userText?.toLowerCase() || '';
    const callKeywords = ['call', 'phone', 'ring', 'reach', 'contact', 'dial'];
    const mentionsCall = callKeywords.some((k) => recentText.includes(k));

    if (!mentionsCall) {
      return [];
    }

    const reachabilityData = await getAllReachabilityData(userId);
    if (reachabilityData.size === 0) {
      return [];
    }

    // Build context about best times
    const content = buildBestTimeContext(reachabilityData);
    if (!content) {
      return [];
    }

    return [
      createStandardInjection('best_time_awareness', content, {
        category: 'external',
        confidence: 0.85,
      }),
    ];
  },
};

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

function buildBestTimeContext(reachabilityData: Map<string, ContactBestTimes>): string | null {
  const now = new Date();
  const currentDay = now.getDay();
  const currentHour = now.getHours();

  const insights: string[] = [];

  // Check if now is generally a good time to call anyone
  let goodTimeCount = 0;
  let badTimeCount = 0;

  for (const [_phone, data] of reachabilityData) {
    const isGoodTime = data.bestTimes.some(
      (t) => t.dayOfWeek === currentDay && Math.abs(t.hourOfDay - currentHour) <= 1
    );

    const isBadTime = data.failedAttemptTimes.some(
      (t) => t.dayOfWeek === currentDay && Math.abs(t.hourOfDay - currentHour) <= 1
    );

    if (isGoodTime) goodTimeCount++;
    if (isBadTime) badTimeCount++;
  }

  if (goodTimeCount === 0 && badTimeCount === 0) {
    return null; // No useful data
  }

  const lines: string[] = [
    '',
    '## 📞 BEST TIME AWARENESS',
    '',
  ];

  // Current time assessment
  if (currentHour < 9 || currentHour >= 20) {
    lines.push('⚠️ It\'s outside typical calling hours. Consider waiting until business hours.');
  } else if (goodTimeCount > badTimeCount) {
    lines.push('✅ Now is generally a good time to make calls based on past success.');
  } else if (badTimeCount > goodTimeCount) {
    lines.push('⚠️ This time slot has had some failed calls in the past. Proceed with that in mind.');
  }

  // Format day/hour info
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Find contacts with clear best times
  for (const [_phone, data] of reachabilityData) {
    if (data.bestTimes.length > 0) {
      const best = data.bestTimes[0];
      const dayName = dayNames[best.dayOfWeek];
      const timeStr = formatHour(best.hourOfDay);
      
      // Only mention if it's helpful
      if (best.score > 0.5) {
        insights.push(`Historically successful: ${dayName}s around ${timeStr}`);
      }
    }
  }

  if (insights.length > 0) {
    lines.push('');
    lines.push('**Patterns from past calls:**');
    lines.push(...insights.slice(0, 3).map((i) => `- ${i}`));
  }

  lines.push('');
  lines.push('Use this info naturally if the user asks about timing.');

  return lines.join('\n');
}

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get best times to reach a specific contact
 */
export async function getBestTimesForContact(
  userId: string,
  contactPhone: string
): Promise<{ bestTimes: string[]; worstTimes: string[]; suggestion: string } | null> {
  try {
    const { getFirestoreDb } = await import('../../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db || !contactPhone) return null;

    const phoneKey = contactPhone.replace(/\D/g, '');
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('contact_reachability')
      .doc(phoneKey)
      .get();

    if (!doc.exists) return null;

    const data = doc.data() as ContactBestTimes;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const bestTimes = data.bestTimes.slice(0, 3).map((t) => {
      return `${dayNames[t.dayOfWeek]} around ${formatHour(t.hourOfDay)}`;
    });

    // Find worst times from failed attempts
    const failedSlots = new Map<string, number>();
    for (const attempt of data.failedAttemptTimes) {
      const key = `${attempt.dayOfWeek}-${attempt.hourOfDay}`;
      failedSlots.set(key, (failedSlots.get(key) || 0) + 1);
    }

    const worstTimes: string[] = [];
    for (const [key, count] of failedSlots) {
      if (count >= 2) {
        const [day, hour] = key.split('-').map(Number);
        worstTimes.push(`${dayNames[day]} around ${formatHour(hour)}`);
      }
    }

    // Generate suggestion
    let suggestion = 'Not enough data yet to make strong recommendations.';
    if (bestTimes.length > 0) {
      suggestion = `Best bet: ${bestTimes[0]}`;
    }

    return { bestTimes, worstTimes: worstTimes.slice(0, 2), suggestion };
  } catch {
    return null;
  }
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder(bestTimeAwarenessBuilder);

export default bestTimeAwarenessBuilder;
