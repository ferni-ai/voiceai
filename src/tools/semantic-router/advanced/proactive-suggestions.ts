/**
 * Proactive Tool Suggestions Engine
 *
 * Predicts what tools a user might need based on:
 * 1. Time of day patterns (e.g., morning = weather, calendar)
 * 2. User history (e.g., usually checks habits on Monday morning)
 * 3. Conversation context (e.g., discussing work → calendar)
 * 4. Calendar events (e.g., meeting in 10 min → meeting notes tool)
 * 5. Recurring patterns (e.g., always plays music at 5pm)
 *
 * This is "Better Than Human" - anticipating needs before asked.
 *
 * @module tools/semantic-router/advanced/proactive-suggestions
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getPersonalizationEngine, type UserProfile } from './personalization.js';

const log = createLogger({ module: 'semantic-router:proactive' });

// ============================================================================
// TYPES
// ============================================================================

export interface ProactiveSuggestion {
  toolId: string;
  reason: string;
  confidence: number;
  category: 'time' | 'pattern' | 'context' | 'calendar' | 'recurring';
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface UserContext {
  userId: string;
  personaId?: string;
  currentTime: Date;
  conversationTopics?: string[];
  recentTools?: string[];
  upcomingEvents?: Array<{
    title: string;
    startsIn: number; // minutes
  }>;
  dayOfWeek?: string;
  isWeekend?: boolean;
}

interface TimePattern {
  hour: number;
  dayOfWeek?: number; // 0-6
  tool: string;
  frequency: number;
  confidence: number;
}

interface SuggestionConfig {
  maxSuggestions: number;
  minConfidence: number;
  timeWindowMinutes: number;
  enableCalendarAwareness: boolean;
  enablePatternLearning: boolean;
}

// ============================================================================
// DEFAULT TIME-BASED SUGGESTIONS
// ============================================================================

const DEFAULT_TIME_PATTERNS: Array<{
  hour: number[];
  tool: string;
  reason: string;
  confidence: number;
}> = [
  // Morning routines (6-9 AM)
  {
    hour: [6, 7, 8, 9],
    tool: 'weather_check',
    reason: 'Morning weather check',
    confidence: 0.6,
  },
  {
    hour: [6, 7, 8],
    tool: 'habits_morning',
    reason: 'Morning habit check-in',
    confidence: 0.5,
  },
  {
    hour: [7, 8, 9],
    tool: 'calendar_today',
    reason: "See today's schedule",
    confidence: 0.7,
  },

  // Work hours (9 AM - 5 PM weekdays)
  {
    hour: [9, 10, 11, 12, 13, 14, 15, 16, 17],
    tool: 'calendar_events',
    reason: 'Check upcoming meetings',
    confidence: 0.5,
  },

  // Lunch (12-1 PM)
  {
    hour: [12, 13],
    tool: 'timer_set',
    reason: 'Set lunch break timer',
    confidence: 0.4,
  },

  // Evening (5-9 PM)
  {
    hour: [17, 18, 19, 20, 21],
    tool: 'music_play',
    reason: 'Wind down with music',
    confidence: 0.4,
  },
  {
    hour: [20, 21],
    tool: 'habits_evening',
    reason: 'Evening routine check',
    confidence: 0.5,
  },

  // Bedtime (9-11 PM)
  {
    hour: [21, 22, 23],
    tool: 'calendar_tomorrow',
    reason: 'Preview tomorrow',
    confidence: 0.5,
  },
];

// ============================================================================
// PROACTIVE SUGGESTIONS ENGINE
// ============================================================================

export class ProactiveSuggestionsEngine {
  private config: SuggestionConfig = {
    maxSuggestions: 3,
    minConfidence: 0.4,
    timeWindowMinutes: 60,
    enableCalendarAwareness: true,
    enablePatternLearning: true,
  };

  // Track which suggestions were accepted/rejected for learning
  private suggestionHistory = new Map<
    string,
    Array<{
      suggestion: ProactiveSuggestion;
      accepted: boolean;
      timestamp: Date;
    }>
  >();

  // Stats for monitoring
  private stats = {
    totalSuggestions: 0,
    acceptedSuggestions: 0,
    rejectedSuggestions: 0,
  };

  constructor(customConfig?: Partial<SuggestionConfig>) {
    if (customConfig) {
      Object.assign(this.config, customConfig);
    }
  }

  /**
   * Generate proactive suggestions for a user
   */
  async getSuggestions(context: UserContext): Promise<ProactiveSuggestion[]> {
    const suggestions: ProactiveSuggestion[] = [];

    // 1. Time-based default suggestions
    const timeSuggestions = this.getTimeSuggestions(context);
    suggestions.push(...timeSuggestions);

    // 2. User-specific pattern suggestions
    if (this.config.enablePatternLearning) {
      const patternSuggestions = await this.getPatternSuggestions(context);
      suggestions.push(...patternSuggestions);
    }

    // 3. Calendar-aware suggestions
    if (this.config.enableCalendarAwareness && context.upcomingEvents?.length) {
      const calendarSuggestions = this.getCalendarSuggestions(context);
      suggestions.push(...calendarSuggestions);
    }

    // 4. Conversation context suggestions
    if (context.conversationTopics?.length) {
      const contextSuggestions = this.getContextSuggestions(context);
      suggestions.push(...contextSuggestions);
    }

    // Deduplicate and sort by confidence
    const uniqueSuggestions = this.deduplicateSuggestions(suggestions);
    const sortedSuggestions = uniqueSuggestions
      .filter((s) => s.confidence >= this.config.minConfidence)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.config.maxSuggestions);

    this.stats.totalSuggestions += sortedSuggestions.length;

    log.debug(
      {
        userId: context.userId,
        suggestionCount: sortedSuggestions.length,
        topTool: sortedSuggestions[0]?.toolId,
      },
      'Generated proactive suggestions'
    );

    return sortedSuggestions;
  }

  /**
   * Record whether a suggestion was accepted or rejected
   */
  recordFeedback(userId: string, toolId: string, accepted: boolean, suggestionId?: string): void {
    const userHistory = this.suggestionHistory.get(userId) || [];

    // Find the suggestion
    const suggestion = userHistory.find((h) => h.suggestion.toolId === toolId && !h.accepted);

    if (suggestion) {
      suggestion.accepted = accepted;
    }

    if (accepted) {
      this.stats.acceptedSuggestions++;
    } else {
      this.stats.rejectedSuggestions++;
    }

    log.debug({ userId, toolId, accepted }, 'Recorded proactive suggestion feedback');
  }

  /**
   * Get acceptance rate for monitoring
   */
  getAcceptanceRate(): number {
    const total = this.stats.acceptedSuggestions + this.stats.rejectedSuggestions;
    if (total === 0) return 0;
    return this.stats.acceptedSuggestions / total;
  }

  /**
   * Get stats for monitoring
   */
  getStats(): {
    totalSuggestions: number;
    acceptedSuggestions: number;
    rejectedSuggestions: number;
    acceptanceRate: number;
  } {
    return {
      ...this.stats,
      acceptanceRate: this.getAcceptanceRate(),
    };
  }

  /**
   * Reset stats (for testing)
   */
  resetStats(): void {
    this.stats = {
      totalSuggestions: 0,
      acceptedSuggestions: 0,
      rejectedSuggestions: 0,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private getTimeSuggestions(context: UserContext): ProactiveSuggestion[] {
    const suggestions: ProactiveSuggestion[] = [];
    const hour = context.currentTime.getHours();
    const dayOfWeek = context.currentTime.getDay();
    const isWeekend = context.isWeekend ?? (dayOfWeek === 0 || dayOfWeek === 6);

    for (const pattern of DEFAULT_TIME_PATTERNS) {
      if (pattern.hour.includes(hour)) {
        // Reduce confidence on weekends for work-related tools
        let confidence = pattern.confidence;
        if (isWeekend && pattern.tool.includes('calendar')) {
          confidence *= 0.5;
        }

        // Skip if already used recently
        if (context.recentTools?.includes(pattern.tool)) {
          confidence *= 0.3;
        }

        suggestions.push({
          toolId: pattern.tool,
          reason: pattern.reason,
          confidence,
          category: 'time',
          expiresAt: new Date(context.currentTime.getTime() + 60 * 60 * 1000), // 1 hour
        });
      }
    }

    return suggestions;
  }

  private async getPatternSuggestions(context: UserContext): Promise<ProactiveSuggestion[]> {
    const suggestions: ProactiveSuggestion[] = [];

    try {
      const personalization = getPersonalizationEngine();
      const profile = personalization.exportProfile(context.userId);

      if (!profile || profile.totalInteractions < 10) {
        return suggestions;
      }

      // Analyze time patterns from user history
      const hour = context.currentTime.getHours().toString();
      const timePatterns = profile.timePatterns.get(hour);

      if (timePatterns) {
        const total = Array.from(timePatterns.values()).reduce((sum, v) => sum + v, 0);

        const patternEntries = Array.from(timePatterns.entries());
        for (const [toolId, frequency] of patternEntries) {
          if (frequency >= 3 && total >= 5) {
            const relativeFreq = frequency / total;
            if (relativeFreq > 0.3) {
              // Only suggest if tool used >30% of the time at this hour
              suggestions.push({
                toolId,
                reason: `You often use this around ${hour}:00`,
                confidence: Math.min(0.8, 0.3 + relativeFreq * 0.5),
                category: 'pattern',
                metadata: { frequency, total },
              });
            }
          }
        }
      }

      // Day-of-week patterns would go here (if stored)
    } catch (error) {
      log.debug({ error: String(error) }, 'Pattern suggestion failed');
    }

    return suggestions;
  }

  private getCalendarSuggestions(context: UserContext): ProactiveSuggestion[] {
    const suggestions: ProactiveSuggestion[] = [];

    if (!context.upcomingEvents) return suggestions;

    for (const event of context.upcomingEvents) {
      // Meeting starting soon
      if (event.startsIn <= 15 && event.startsIn > 0) {
        suggestions.push({
          toolId: 'calendar_event_details',
          reason: `"${event.title}" starts in ${event.startsIn} minutes`,
          confidence: 0.8,
          category: 'calendar',
          metadata: { eventTitle: event.title, startsIn: event.startsIn },
        });
      }

      // Meeting starting now
      if (event.startsIn <= 5 && event.startsIn >= 0) {
        // Check if it's a video call
        const title = event.title.toLowerCase();
        if (title.includes('zoom') || title.includes('meet') || title.includes('teams')) {
          suggestions.push({
            toolId: 'calendar_join_meeting',
            reason: `Join "${event.title}"`,
            confidence: 0.9,
            category: 'calendar',
            metadata: { eventTitle: event.title },
          });
        }
      }
    }

    return suggestions;
  }

  private getContextSuggestions(context: UserContext): ProactiveSuggestion[] {
    const suggestions: ProactiveSuggestion[] = [];

    if (!context.conversationTopics) return suggestions;

    // Map topics to likely tools
    const topicToolMap: Record<string, { tool: string; reason: string }> = {
      work: { tool: 'calendar_today', reason: 'Check your work schedule' },
      meeting: {
        tool: 'calendar_events',
        reason: 'View upcoming meetings',
      },
      exercise: { tool: 'habits_fitness', reason: 'Track your workout' },
      sleep: { tool: 'habits_sleep', reason: 'Log your sleep' },
      weather: { tool: 'weather_check', reason: 'Get weather update' },
      music: { tool: 'music_play', reason: 'Play some music' },
      meditation: { tool: 'timer_set', reason: 'Set meditation timer' },
      focus: { tool: 'timer_pomodoro', reason: 'Start focus session' },
      stress: { tool: 'breathing_exercise', reason: 'Try a breathing exercise' },
      planning: { tool: 'calendar_week', reason: 'Plan your week' },
    };

    for (const topic of context.conversationTopics) {
      const normalizedTopic = topic.toLowerCase();
      const mapping = topicToolMap[normalizedTopic];

      if (mapping && !context.recentTools?.includes(mapping.tool)) {
        suggestions.push({
          toolId: mapping.tool,
          reason: mapping.reason,
          confidence: 0.5,
          category: 'context',
          metadata: { topic },
        });
      }
    }

    return suggestions;
  }

  private deduplicateSuggestions(suggestions: ProactiveSuggestion[]): ProactiveSuggestion[] {
    const seen = new Map<string, ProactiveSuggestion>();

    for (const suggestion of suggestions) {
      const existing = seen.get(suggestion.toolId);
      if (!existing || suggestion.confidence > existing.confidence) {
        seen.set(suggestion.toolId, suggestion);
      }
    }

    return Array.from(seen.values());
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let engineInstance: ProactiveSuggestionsEngine | null = null;

export function getProactiveSuggestionsEngine(): ProactiveSuggestionsEngine {
  if (!engineInstance) {
    engineInstance = new ProactiveSuggestionsEngine();
  }
  return engineInstance;
}

/**
 * Quick access to get suggestions
 */
export async function getProactiveSuggestions(
  context: UserContext
): Promise<ProactiveSuggestion[]> {
  const engine = getProactiveSuggestionsEngine();
  return engine.getSuggestions(context);
}

/**
 * Record suggestion feedback
 */
export function recordProactiveFeedback(userId: string, toolId: string, accepted: boolean): void {
  const engine = getProactiveSuggestionsEngine();
  engine.recordFeedback(userId, toolId, accepted);
}

/**
 * Get proactive suggestions stats
 */
export function getProactiveStats(): ReturnType<ProactiveSuggestionsEngine['getStats']> {
  const engine = getProactiveSuggestionsEngine();
  return engine.getStats();
}
