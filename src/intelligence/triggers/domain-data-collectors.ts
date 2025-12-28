/**
 * Domain Data Collectors
 *
 * Phase 6: Cross-Domain Synthesis
 *
 * Collectors for each persona's domain that gather relevant data
 * for life context synthesis.
 *
 * Each collector:
 * - Pulls data from the appropriate service (when available)
 * - Computes stress/wellness indicators
 * - Returns domain-specific snapshot data
 * - Gracefully returns null if data unavailable
 *
 * NOTE: These collectors are designed to be resilient. If a service
 * doesn't exist yet, they will return null rather than failing.
 *
 * @module domain-data-collectors
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  SleepDomainData,
  CalendarDomainData,
  FinanceDomainData,
  GoalsDomainData,
  RelationshipDomainData,
  HabitsDomainData,
  DomainDataCollector,
} from './life-context-snapshot.js';

const log = createLogger({ module: 'domain-data-collectors' });

// ============================================================================
// CACHING CONFIGURATION
// ============================================================================

/**
 * Cache TTL configuration by domain
 * Different domains have different update frequencies
 */
const CACHE_TTL_MS = {
  // Sleep data changes slowly, cache for 5 minutes
  sleep: 5 * 60 * 1000,
  // Calendar data is more dynamic, cache for 2 minutes
  calendar: 2 * 60 * 1000,
  // Finance signals from conversation, cache for 5 minutes
  finance: 5 * 60 * 1000,
  // Goals data changes infrequently, cache for 5 minutes
  goals: 5 * 60 * 1000,
  // Relationship signals, cache for 5 minutes
  relationships: 5 * 60 * 1000,
  // Habits data changes daily, cache for 3 minutes
  habits: 3 * 60 * 1000,
} as const;

type DomainType = keyof typeof CACHE_TTL_MS;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  windowDays: number;
}

// In-memory cache keyed by `${userId}:${domain}`
const domainCache = new Map<string, CacheEntry<unknown>>();

/**
 * Get cached data if valid
 */
function getCachedData<T>(userId: string, domain: DomainType, windowDays: number): T | null {
  const cacheKey = `${userId}:${domain}`;
  const entry = domainCache.get(cacheKey) as CacheEntry<T> | undefined;

  if (!entry) return null;

  // Check if cache is expired
  const now = Date.now();
  const ttl = CACHE_TTL_MS[domain];
  if (now - entry.timestamp > ttl) {
    domainCache.delete(cacheKey);
    return null;
  }

  // Check if windowDays matches (different analysis windows shouldn't share cache)
  if (entry.windowDays !== windowDays) {
    return null;
  }

  return entry.data;
}

/**
 * Store data in cache
 */
function setCachedData<T>(userId: string, domain: DomainType, windowDays: number, data: T): void {
  const cacheKey = `${userId}:${domain}`;
  domainCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
    windowDays,
  });
}

/**
 * Clear cache for a specific user and domain
 */
export function clearDomainCache(userId: string, domain?: DomainType): void {
  if (domain) {
    domainCache.delete(`${userId}:${domain}`);
  } else {
    // Clear all domains for user
    for (const d of Object.keys(CACHE_TTL_MS) as DomainType[]) {
      domainCache.delete(`${userId}:${d}`);
    }
  }
  log.debug({ userId, domain }, 'Domain cache cleared');
}

/**
 * Clear entire cache (useful for tests)
 */
export function clearAllDomainCaches(): void {
  domainCache.clear();
  log.debug('All domain caches cleared');
}

/**
 * Get cache statistics
 */
export function getDomainCacheStats(): {
  totalEntries: number;
  entriesByDomain: Record<string, number>;
  oldestEntryAge: number | null;
} {
  const entriesByDomain: Record<string, number> = {};
  let oldestTimestamp = Date.now();

  for (const [key, entry] of domainCache.entries()) {
    const domain = key.split(':')[1];
    entriesByDomain[domain] = (entriesByDomain[domain] || 0) + 1;
    if ((entry as CacheEntry<unknown>).timestamp < oldestTimestamp) {
      oldestTimestamp = (entry as CacheEntry<unknown>).timestamp;
    }
  }

  return {
    totalEntries: domainCache.size,
    entriesByDomain,
    oldestEntryAge: domainCache.size > 0 ? Date.now() - oldestTimestamp : null,
  };
}

// ============================================================================
// HELPER: Get conversation context from semantic RAG
// ============================================================================

/**
 * Get recent conversation context for keyword analysis
 * Uses semantic RAG when available, returns null otherwise
 */
async function getRecentConversationContext(
  userId: string,
  _windowDays: number
): Promise<string | null> {
  try {
    // Try to get recent memories from semantic RAG
    const semanticRag = await import('../../memory/semantic-rag.js');

    // Use semanticSearch which is the available function
    if (typeof semanticRag.semanticSearch === 'function') {
      const results = await semanticRag.semanticSearch(
        'recent conversations mood feelings concerns',
        { topK: 10, minScore: 0.3 }
      );

      if (results && results.length > 0) {
        return results
          .map((r: { content?: string; text?: string }) => r.content || r.text || '')
          .join(' ');
      }
    }
    return null;
  } catch {
    // Semantic RAG not available
    return null;
  }
}

// ============================================================================
// SLEEP DATA COLLECTOR (Maya's Domain)
// ============================================================================

/**
 * Collect sleep-related data from conversation history and habits
 * NOTE: Full implementation pending habit tracking service
 */
export const sleepDataCollector: DomainDataCollector<SleepDomainData> = {
  domain: 'sleep',
  sourcePersona: 'maya',

  async collect(userId: string, windowDays: number): Promise<SleepDomainData | null> {
    try {
      // Get recent conversation context for fatigue detection
      const recentContext = await getRecentConversationContext(userId, windowDays);

      // Check for fatigue mentions
      let mentionedFatigue = false;
      if (recentContext) {
        const fatigueKeywords = ['tired', 'exhausted', 'fatigue', 'sleepy', 'drained', 'burnt out'];
        mentionedFatigue = fatigueKeywords.some((keyword) =>
          recentContext.toLowerCase().includes(keyword)
        );
      }

      // TODO: When habit tracking service is available, get actual sleep data
      // For now, return partial data based on conversation signals

      if (!recentContext && !mentionedFatigue) {
        // No data available
        return null;
      }

      // Estimate based on fatigue mentions (low confidence without actual data)
      return {
        averageSleepHours: mentionedFatigue ? 5.5 : 7, // Conservative estimate
        poorSleepNights: mentionedFatigue ? 2 : 0,
        trend: 'stable', // Can't determine without data
        nightsAnalyzed: 0, // No actual tracking data
        mentionedFatigue,
        lastUpdated: new Date(),
        confidence: mentionedFatigue ? 0.4 : 0.2, // Low confidence without real data
      };
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Sleep data collection failed');
      return null;
    }
  },
};

// ============================================================================
// CALENDAR DATA COLLECTOR (Alex's Domain)
// ============================================================================

/**
 * Collect calendar-related data from the calendar service
 */
export const calendarDataCollector: DomainDataCollector<CalendarDomainData> = {
  domain: 'calendar',
  sourcePersona: 'alex',

  async collect(userId: string, windowDays: number): Promise<CalendarDomainData | null> {
    try {
      // Try to get real calendar data from calendar intelligence service
      let calendarPatterns: {
        busiestDayOfWeek: string | null;
        averageMeetingsPerDay: number;
        totalMeetingHoursThisWeek: number;
        focusTimeRatio: number;
        backToBackFrequency: number;
      } | null = null;

      let calendarAlerts: {
        type: string;
        severity: string;
        message: string;
      }[] = [];

      try {
        const calendarIntelligence =
          await import('../../services/calendar/calendar-intelligence.js');

        // Get calendar patterns (uses real calendar data when available)
        if (typeof calendarIntelligence.analyzeCalendarPatterns === 'function') {
          calendarPatterns = await calendarIntelligence.analyzeCalendarPatterns(userId, windowDays);
        }

        // Get calendar alerts
        if (typeof calendarIntelligence.detectCalendarAlerts === 'function') {
          const endDate = new Date();
          endDate.setDate(endDate.getDate() + windowDays);
          calendarAlerts = await calendarIntelligence.detectCalendarAlerts(userId, {
            start: new Date(),
            end: endDate,
          });
        }
      } catch {
        // Calendar intelligence not available, fall back to conversation analysis
        log.debug({ userId }, 'Calendar intelligence not available, using conversation fallback');
      }

      // Get conversation context for calendar signals as fallback
      const recentContext = await getRecentConversationContext(userId, windowDays);
      const contextLower = recentContext?.toLowerCase() || '';

      // Detect busy signals from conversation
      const busyKeywords = ['busy', 'packed', 'back to back', 'no time', 'overwhelmed', 'meetings'];
      const isBusy = busyKeywords.some((kw) => contextLower.includes(kw));

      // Detect deadline mentions
      const deadlineKeywords = ['deadline', 'due', 'submit', 'finish by', 'need to complete'];
      const hasDeadline = deadlineKeywords.some((kw) => contextLower.includes(kw));

      // Determine overload from real data or conversation
      const hasOverloadAlerts = calendarAlerts.some(
        (a) => a.type === 'overload' || a.type === 'back_to_back'
      );
      const isOverloaded = hasOverloadAlerts || isBusy;

      // Calculate schedule density (0-100)
      let scheduleDensity = 30; // Default low
      if (calendarPatterns) {
        // Use focus time ratio inversely (low focus = high density)
        scheduleDensity = Math.round((1 - calendarPatterns.focusTimeRatio) * 100);
      } else if (isBusy) {
        scheduleDensity = 70;
      }

      // Calculate free time hours
      let freeTimeHours = 4;
      if (calendarPatterns) {
        // Estimate based on meeting hours (assuming 8-hour work day)
        const avgDailyMeetings = calendarPatterns.averageMeetingsPerDay;
        freeTimeHours = Math.max(0, 8 - avgDailyMeetings);
      } else if (isBusy) {
        freeTimeHours = 1;
      }

      // If we have neither real data nor conversation signals, return null
      if (!calendarPatterns && !recentContext) {
        return null;
      }

      return {
        totalEvents: calendarPatterns
          ? Math.round(calendarPatterns.averageMeetingsPerDay * windowDays)
          : 0,
        backToBackChains: calendarPatterns
          ? Math.round(calendarPatterns.backToBackFrequency * 10)
          : 0,
        scheduleDensity,
        upcomingDeadline: { exists: hasDeadline },
        isOverloaded,
        freeTimeHours,
        lastUpdated: new Date(),
        confidence: calendarPatterns ? 0.85 : recentContext ? 0.4 : 0.2,
      };
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Calendar data collection failed');
      return null;
    }
  },
};

// ============================================================================
// FINANCE DATA COLLECTOR (Peter's Domain)
// ============================================================================

/**
 * Collect finance-related signals from conversation history
 * Note: We don't access actual financial data, only conversation signals
 */
export const financeDataCollector: DomainDataCollector<FinanceDomainData> = {
  domain: 'finance',
  sourcePersona: 'peter',

  async collect(userId: string, windowDays: number): Promise<FinanceDomainData | null> {
    try {
      // Check conversation context for finance-related concerns
      const recentContext = await getRecentConversationContext(userId, windowDays);

      if (!recentContext) {
        return null;
      }

      const contextLower = recentContext.toLowerCase();

      // Count finance-related mentions
      const financeKeywords = [
        'market',
        'stock',
        'invest',
        'money',
        'portfolio',
        'savings',
        'budget',
      ];
      let checkFrequency = 0;
      for (const keyword of financeKeywords) {
        const matches = contextLower.match(new RegExp(keyword, 'g'));
        checkFrequency += matches ? matches.length : 0;
      }

      // Detect anxiety signals
      const anxietyPatterns = [
        'worried about money',
        'worried about market',
        'worried about invest',
        'concerned about money',
        'anxious about financ',
        'nervous about market',
      ];
      const expressedAnxiety = anxietyPatterns.some((pattern) => contextLower.includes(pattern));

      // Determine stress level
      let stressLevel: 'low' | 'moderate' | 'high' = 'low';
      if (expressedAnxiety || checkFrequency > 10) {
        stressLevel = 'high';
      } else if (checkFrequency > 5) {
        stressLevel = 'moderate';
      }

      // Detect pending decisions
      const decisionKeywords = [
        'should i',
        'deciding',
        'thinking about buying',
        'thinking about selling',
      ];
      const hasPendingDecision = decisionKeywords.some((kw) => contextLower.includes(kw));

      // Extract concern topics
      const concernTopics: string[] = [];
      if (contextLower.includes('market')) concernTopics.push('market volatility');
      if (contextLower.includes('bill')) concernTopics.push('bills');
      if (contextLower.includes('debt')) concernTopics.push('debt');
      if (contextLower.includes('retire')) concernTopics.push('retirement');

      return {
        checkFrequency,
        expressedAnxiety,
        stressLevel,
        pendingDecision: hasPendingDecision
          ? { exists: true, urgency: 'medium' }
          : { exists: false },
        concernTopics,
        lastUpdated: new Date(),
        confidence: recentContext.length > 100 ? 0.6 : 0.3,
      };
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Finance data collection failed');
      return null;
    }
  },
};

// ============================================================================
// GOALS DATA COLLECTOR (Jordan's Domain)
// ============================================================================

/**
 * Collect goal-related data from conversation and memory
 * NOTE: Full implementation pending milestones service
 */
export const goalsDataCollector: DomainDataCollector<GoalsDomainData> = {
  domain: 'goals',
  sourcePersona: 'jordan',

  async collect(userId: string, windowDays: number): Promise<GoalsDomainData | null> {
    try {
      // Try to get real goal data from the life data store
      // Note: LifeGoal from life-data-store has different status values
      let lifeGoals: Array<{
        id: string;
        title: string;
        status: string;
        progress?: number;
        targetDate?: Date;
        category: string;
      }> = [];

      let milestones: Array<{
        id: string;
        name: string;
        status: 'dreaming' | 'planning' | 'in-progress' | 'completed' | 'postponed';
        targetDate?: Date;
      }> = [];

      try {
        const lifeDataStore = await import('../../services/stores/life-data-store.js');
        if (typeof lifeDataStore.getLifeDataStore === 'function') {
          const store = lifeDataStore.getLifeDataStore();
          if (store && typeof store.getGoals === 'function') {
            lifeGoals = await store.getGoals(userId);
          }
          if (store && typeof store.getMilestones === 'function') {
            milestones = await store.getMilestones(userId);
          }
        }
      } catch {
        log.debug({ userId }, 'Life data store not available, using conversation fallback');
      }

      // Check conversation context for goal signals
      const recentContext = await getRecentConversationContext(userId, windowDays);
      const contextLower = recentContext?.toLowerCase() || '';

      // Detect motivation level from conversation
      const lowMotivationKeywords = ["can't", 'impossible', 'gave up', 'pointless', 'why bother'];
      const highMotivationKeywords = ['excited', 'motivated', 'pumped', 'ready', 'determined'];

      let motivationLevel: 'high' | 'medium' | 'low' = 'medium';
      if (lowMotivationKeywords.some((kw) => contextLower.includes(kw))) {
        motivationLevel = 'low';
      } else if (highMotivationKeywords.some((kw) => contextLower.includes(kw))) {
        motivationLevel = 'high';
      }

      // Detect setback mentions from conversation
      const setbackKeywords = ['failed', 'setback', 'fell behind', 'missed', "couldn't"];
      const recentSetbacks: string[] = [];
      for (const keyword of setbackKeywords) {
        if (contextLower.includes(keyword)) {
          recentSetbacks.push(keyword);
        }
      }

      // If we have real goal data, use it
      if (lifeGoals.length > 0 || milestones.length > 0) {
        const now = new Date();
        const weekFromNow = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

        // Count active goals (status values from life-data-store:
        // 'not-started' | 'in-progress' | 'on-track' | 'at-risk' | 'abandoned' | 'completed')
        const activeGoals = lifeGoals.filter(
          (g) =>
            g.status === 'in-progress' ||
            g.status === 'not-started' ||
            g.status === 'on-track' ||
            g.status === 'at-risk'
        ).length;

        // Count goals at risk
        const goalsAtRisk = lifeGoals.filter((g) => {
          if (g.status === 'at-risk') return true;
          if (g.targetDate && new Date(g.targetDate) < now && g.status !== 'completed') return true;
          if (g.progress !== undefined && g.progress < 30 && g.status === 'in-progress')
            return true;
          return false;
        }).length;

        // Check for upcoming milestones
        const upcomingMilestone = milestones.find(
          (m) =>
            m.targetDate &&
            new Date(m.targetDate) > now &&
            new Date(m.targetDate) <= weekFromNow &&
            m.status !== 'completed'
        );

        // Determine overall progress from real data + conversation
        let overallProgress: 'on_track' | 'behind' | 'ahead' = 'on_track';
        const avgProgress = lifeGoals
          .filter((g) => g.progress !== undefined)
          .reduce((sum, g) => sum + (g.progress || 0), 0);
        const goalsWithProgress = lifeGoals.filter((g) => g.progress !== undefined).length;

        if (goalsWithProgress > 0) {
          const avgProgressPercent = avgProgress / goalsWithProgress;
          if (avgProgressPercent < 30 || goalsAtRisk > activeGoals / 2) {
            overallProgress = 'behind';
          } else if (avgProgressPercent > 70 && goalsAtRisk === 0) {
            overallProgress = 'ahead';
          }
        } else if (recentSetbacks.length > 1 || motivationLevel === 'low') {
          overallProgress = 'behind';
        } else if (motivationLevel === 'high') {
          overallProgress = 'ahead';
        }

        return {
          activeGoals,
          goalsAtRisk,
          upcomingMilestone: upcomingMilestone
            ? {
                exists: true,
                description: upcomingMilestone.name,
                daysUntil: Math.ceil(
                  (new Date(upcomingMilestone.targetDate!).getTime() - now.getTime()) /
                    (24 * 60 * 60 * 1000)
                ),
              }
            : { exists: false },
          overallProgress,
          motivationLevel,
          recentSetbacks,
          lastUpdated: new Date(),
          confidence: 0.85, // High confidence with real data
        };
      }

      // Fall back to conversation-only analysis
      if (!recentContext) {
        return null;
      }

      // Determine overall progress from conversation tone
      let overallProgress: 'on_track' | 'behind' | 'ahead' = 'on_track';
      if (recentSetbacks.length > 1 || motivationLevel === 'low') {
        overallProgress = 'behind';
      } else if (motivationLevel === 'high') {
        overallProgress = 'ahead';
      }

      return {
        activeGoals: 0, // Unknown without milestone service
        goalsAtRisk: recentSetbacks.length,
        upcomingMilestone: { exists: false },
        overallProgress,
        motivationLevel,
        recentSetbacks,
        lastUpdated: new Date(),
        confidence: 0.4, // Low confidence without actual goal tracking
      };
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Goals data collection failed');
      return null;
    }
  },
};

// ============================================================================
// RELATIONSHIP DATA COLLECTOR (Nayan's Domain)
// ============================================================================

/**
 * Collect relationship and existential data from conversation history
 */
export const relationshipDataCollector: DomainDataCollector<RelationshipDomainData> = {
  domain: 'relationships',
  sourcePersona: 'nayan',

  async collect(userId: string, windowDays: number): Promise<RelationshipDomainData | null> {
    try {
      // Get conversation context
      const recentContext = await getRecentConversationContext(userId, windowDays);

      if (!recentContext) {
        return null;
      }

      const contextLower = recentContext.toLowerCase();

      // Extract mentioned people using pattern matching
      const recentlyMentionedPeople: string[] = [];
      const relationshipWords = [
        'my wife',
        'my husband',
        'my partner',
        'my mom',
        'my dad',
        'my friend',
        'my sister',
        'my brother',
      ];
      for (const word of relationshipWords) {
        if (contextLower.includes(word)) {
          recentlyMentionedPeople.push(word.replace('my ', ''));
        }
      }

      // Detect relationship concerns
      const relationshipConcerns: string[] = [];
      const concernPatterns: Array<{ pattern: string; concern: string }> = [
        { pattern: 'fight with', concern: 'conflict' },
        { pattern: 'argument with', concern: 'conflict' },
        { pattern: 'worried about', concern: 'worry about loved one' },
        { pattern: 'miss my', concern: 'longing' },
        { pattern: 'distant from', concern: 'disconnection' },
        { pattern: 'growing apart', concern: 'relationship strain' },
      ];
      for (const { pattern, concern } of concernPatterns) {
        if (contextLower.includes(pattern)) {
          relationshipConcerns.push(concern);
        }
      }

      // Detect existential themes
      const existentialThemes: string[] = [];
      const themePatterns: Array<{ pattern: string; theme: string }> = [
        { pattern: 'meaning of', theme: 'meaning' },
        { pattern: 'purpose in life', theme: 'purpose' },
        { pattern: "what's the point", theme: 'nihilism' },
        { pattern: 'legacy', theme: 'legacy' },
        { pattern: 'mortality', theme: 'mortality' },
        { pattern: "when i'm gone", theme: 'mortality' },
      ];
      for (const { pattern, theme } of themePatterns) {
        if (contextLower.includes(pattern) && !existentialThemes.includes(theme)) {
          existentialThemes.push(theme);
        }
      }

      // Determine relationship health
      let relationshipHealth: 'thriving' | 'stable' | 'strained' = 'stable';
      if (relationshipConcerns.length > 2) {
        relationshipHealth = 'strained';
      } else if (recentlyMentionedPeople.length > 3 && relationshipConcerns.length === 0) {
        relationshipHealth = 'thriving';
      }

      // Detect isolation signals
      const isolationKeywords = ['lonely', 'alone', 'no one to talk to', 'isolated', 'no friends'];
      const isolationSignals = isolationKeywords.some((kw) => contextLower.includes(kw));

      return {
        recentlyMentionedPeople,
        relationshipConcerns,
        existentialThemes,
        relationshipHealth,
        isolationSignals,
        lastUpdated: new Date(),
        confidence: recentContext.length > 200 ? 0.7 : 0.4,
      };
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Relationship data collection failed');
      return null;
    }
  },
};

// ============================================================================
// HABITS DATA COLLECTOR (Maya's Domain - Secondary)
// ============================================================================

/**
 * Collect habit tracking data for overall wellness picture
 * NOTE: Full implementation pending habit tracking service
 */
export const habitsDataCollector: DomainDataCollector<HabitsDomainData> = {
  domain: 'habits',
  sourcePersona: 'maya',

  async collect(userId: string, windowDays: number): Promise<HabitsDomainData | null> {
    try {
      // Try to get real habit data from the habit coaching storage
      let habitCoachData: {
        enhancedHabits: Array<{
          id: string;
          name: string;
          currentStreak?: number;
          streakAtRisk?: boolean;
          lastCompleted?: Date;
        }>;
        keystoneHabits: string[];
        currentFocus: {
          domain: string;
          goal: string;
          habits: string[];
        } | null;
      } | null = null;

      try {
        const habitStorage = await import('../../tools/habit-coaching/storage.js');
        if (typeof habitStorage.getUserCoachData === 'function') {
          habitCoachData = habitStorage.getUserCoachData(userId);
        }
      } catch {
        log.debug({ userId }, 'Habit coaching storage not available, using conversation fallback');
      }

      // Get conversation context as backup/supplement
      const recentContext = await getRecentConversationContext(userId, windowDays);
      const contextLower = recentContext?.toLowerCase() || '';

      // Detect slump signals from conversation
      const slumpKeywords = ['skipped', 'broke streak', 'fell off', 'stopped', 'gave up on'];
      const conversationSlump = slumpKeywords.some((kw) => contextLower.includes(kw));

      // Detect wins from conversation
      const winKeywords = ['completed', 'maintained', 'kept up', 'successful', 'streak'];
      const recentWins: string[] = [];
      for (const keyword of winKeywords) {
        if (contextLower.includes(keyword)) {
          recentWins.push(keyword);
        }
      }

      // If we have real habit data, use it
      if (habitCoachData && habitCoachData.enhancedHabits.length > 0) {
        const habits = habitCoachData.enhancedHabits;
        const now = new Date();
        const weekAgo = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

        // Count active habits (completed within window)
        const activeHabits = habits
          .filter((h) => h.lastCompleted && new Date(h.lastCompleted) > weekAgo)
          .map((h) => h.name);

        // Count streaks at risk
        const streaksAtRisk = habits.filter((h) => h.streakAtRisk).length;

        // Calculate adherence (simplified: active / total)
        const adherencePercent =
          habits.length > 0 ? Math.round((activeHabits.length / habits.length) * 100) : 50;

        // Determine if in slump
        const inSlump = conversationSlump || streaksAtRisk > 1 || adherencePercent < 40;

        return {
          activeHabits,
          streaksAtRisk,
          adherencePercent,
          inSlump,
          recentWins,
          lastUpdated: new Date(),
          confidence: 0.85, // High confidence with real data
        };
      }

      // Fall back to conversation-only analysis
      if (!recentContext) {
        return null;
      }

      // Detect habit-related mentions
      const habitKeywords = [
        'habit',
        'routine',
        'streak',
        'tracking',
        'daily',
        'exercise',
        'meditation',
      ];
      const mentionsHabits = habitKeywords.some((kw) => contextLower.includes(kw));

      if (!mentionsHabits) {
        return null;
      }

      return {
        activeHabits: [], // Unknown without service
        streaksAtRisk: conversationSlump ? 1 : 0,
        adherencePercent: conversationSlump ? 40 : 60, // Estimate
        inSlump: conversationSlump,
        recentWins,
        lastUpdated: new Date(),
        confidence: 0.35, // Low confidence without actual tracking
      };
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Habits data collection failed');
      return null;
    }
  },
};

// ============================================================================
// COLLECTOR REGISTRY
// ============================================================================

/**
 * All available domain data collectors
 */
export const domainCollectors = {
  sleep: sleepDataCollector,
  calendar: calendarDataCollector,
  finance: financeDataCollector,
  goals: goalsDataCollector,
  relationships: relationshipDataCollector,
  habits: habitsDataCollector,
} as const;

/**
 * Collect a single domain with caching
 */
async function collectWithCache<T>(
  userId: string,
  windowDays: number,
  domain: DomainType,
  collector: DomainDataCollector<T>
): Promise<T | null> {
  // Check cache first
  const cached = getCachedData<T | null>(userId, domain, windowDays);
  if (cached !== null) {
    log.debug({ userId, domain }, 'Domain data cache hit');
    return cached;
  }

  // Collect fresh data
  const data = await collector.collect(userId, windowDays);

  // Cache the result (including null results to avoid repeated lookups)
  setCachedData(userId, domain, windowDays, data);

  return data;
}

/**
 * Collect all domain data for a user
 * Uses tiered caching to avoid repeated expensive lookups
 */
export async function collectAllDomainData(
  userId: string,
  windowDays = 7,
  options: { bypassCache?: boolean } = {}
): Promise<{
  sleep: SleepDomainData | null;
  calendar: CalendarDomainData | null;
  finance: FinanceDomainData | null;
  goals: GoalsDomainData | null;
  relationships: RelationshipDomainData | null;
  habits: HabitsDomainData | null;
  cacheStats?: { hits: number; misses: number };
}> {
  const startTime = Date.now();

  // Clear cache if bypassing
  if (options.bypassCache) {
    clearDomainCache(userId);
  }

  // Track cache stats
  const cacheStatsBefore = getDomainCacheStats();
  const entriesBefore = cacheStatsBefore.totalEntries;

  // Collect all domains in parallel with caching
  const [sleep, calendar, finance, goals, relationships, habits] = await Promise.all([
    collectWithCache(userId, windowDays, 'sleep', sleepDataCollector),
    collectWithCache(userId, windowDays, 'calendar', calendarDataCollector),
    collectWithCache(userId, windowDays, 'finance', financeDataCollector),
    collectWithCache(userId, windowDays, 'goals', goalsDataCollector),
    collectWithCache(userId, windowDays, 'relationships', relationshipDataCollector),
    collectWithCache(userId, windowDays, 'habits', habitsDataCollector),
  ]);

  const collected = [sleep, calendar, finance, goals, relationships, habits].filter(Boolean);
  const cacheStatsAfter = getDomainCacheStats();
  const entriesAfter = cacheStatsAfter.totalEntries;

  // Calculate cache hits: if entries increased, those were misses; otherwise hits
  const newEntries = entriesAfter - entriesBefore;
  const cacheHits = 6 - newEntries;
  const cacheMisses = newEntries;

  log.info(
    {
      userId,
      windowDays,
      domainsCollected: collected.length,
      cacheHits,
      cacheMisses,
      processingTimeMs: Date.now() - startTime,
    },
    'Domain data collection complete'
  );

  return {
    sleep,
    calendar,
    finance,
    goals,
    relationships,
    habits,
    cacheStats: { hits: cacheHits, misses: cacheMisses },
  };
}
