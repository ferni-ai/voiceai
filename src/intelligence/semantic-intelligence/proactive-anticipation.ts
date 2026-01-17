/**
 * Phase 4: Proactive Anticipation
 *
 * Predicts what tools a user might need based on:
 * 1. Time patterns (e.g., morning = weather, calendar)
 * 2. User history (e.g., always checks habits Monday morning)
 * 3. Conversation context (e.g., discussing work → calendar)
 * 4. Recent activity (e.g., just scheduled meeting → might need notes)
 *
 * This is "Better Than Human" - anticipating needs before asked.
 *
 * @module intelligence/semantic-intelligence/proactive-anticipation
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  recordToolTiming as persistToolTiming,
  getTimingPatterns,
  getRecentExecutions,
  type TimingPattern,
  type RecentExecution,
} from './persistence.js';

const log = createLogger({ module: 'SemanticIntelligence.ProactiveAnticipation' });

// Re-export TimingPattern for consumers
export type { TimingPattern, RecentExecution };

// ============================================================================
// TYPES
// ============================================================================

/**
 * A proactive hint about what the user might need
 */
export interface ProactiveHint {
  /** Tool that might be needed */
  toolId: string;

  /** Why we think this might be needed */
  reason: string;

  /** Confidence in this prediction (0-1) */
  confidence: number;

  /** Category of the hint */
  category: 'time' | 'pattern' | 'context' | 'sequence' | 'calendar';

  /** When this hint expires */
  expiresAt?: Date;

  /** Suggested prompt/nudge for the user */
  suggestedNudge?: string;
}

// TimingPattern is imported from persistence.ts

/**
 * Context for generating proactive hints
 */
export interface AnticipationContext {
  /** User ID */
  userId: string;

  /** Current persona */
  personaId: string;

  /** Current time */
  currentTime: Date;

  /** Tools used recently in this session */
  recentTools?: string[];

  /** Recent conversation topics */
  recentTopics?: string[];

  /** Upcoming calendar events */
  upcomingEvents?: Array<{
    title: string;
    startsInMinutes: number;
  }>;
}

// ============================================================================
// DEFAULT TIME PATTERNS
// ============================================================================

/**
 * Default time-based tool suggestions
 * These apply to all users until personalized patterns take over
 */
const DEFAULT_TIME_PATTERNS: Array<{
  hours: number[];
  toolId: string;
  reason: string;
  confidence: number;
}> = [
  // Morning routines (6-9 AM)
  {
    hours: [6, 7, 8, 9],
    toolId: 'getWeather',
    reason: 'Morning weather check',
    confidence: 0.6,
  },
  {
    hours: [7, 8, 9],
    toolId: 'getCalendarSummary',
    reason: "See today's schedule",
    confidence: 0.7,
  },
  {
    hours: [6, 7, 8],
    toolId: 'checkHabit',
    reason: 'Morning habit check-in',
    confidence: 0.5,
  },

  // End of work day (5-7 PM)
  {
    hours: [17, 18, 19],
    toolId: 'playMusic',
    reason: 'End of day relaxation',
    confidence: 0.4,
  },
  {
    hours: [17, 18],
    toolId: 'getCalendarSummary',
    reason: "Review tomorrow's schedule",
    confidence: 0.5,
  },

  // Evening (8-10 PM)
  {
    hours: [20, 21, 22],
    toolId: 'checkHabit',
    reason: 'Evening habit reflection',
    confidence: 0.5,
  },
];

/**
 * Tool sequence patterns
 * When tool A is used, tool B often follows
 */
const TOOL_SEQUENCES: Array<{
  after: string;
  suggest: string;
  reason: string;
  confidence: number;
  timeWindowMinutes: number;
}> = [
  {
    after: 'createEvent',
    suggest: 'sendEmail',
    reason: 'Send meeting invite',
    confidence: 0.4,
    timeWindowMinutes: 5,
  },
  {
    after: 'getWeather',
    suggest: 'getCalendarSummary',
    reason: 'Plan around weather',
    confidence: 0.3,
    timeWindowMinutes: 2,
  },
  {
    after: 'searchStocks',
    suggest: 'saveMemory',
    reason: 'Remember research findings',
    confidence: 0.3,
    timeWindowMinutes: 5,
  },
  {
    after: 'checkHabit',
    suggest: 'createReminder',
    reason: 'Set reminder for habit',
    confidence: 0.3,
    timeWindowMinutes: 3,
  },
];

// Storage is now handled by persistence.ts (Firestore with in-memory cache)

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get proactive hints for what the user might need
 *
 * @example
 * ```typescript
 * const hints = await getProactiveHints({
 *   userId: 'user-123',
 *   personaId: 'ferni',
 *   currentTime: new Date(),
 *   recentTools: ['getWeather'],
 * });
 *
 * // Result:
 * // [
 * //   { toolId: 'getCalendarSummary', reason: "See today's schedule", confidence: 0.7 },
 * //   { toolId: 'checkHabit', reason: 'Morning habit check-in', confidence: 0.5 },
 * // ]
 * ```
 */
export async function getProactiveHints(context: AnticipationContext): Promise<ProactiveHint[]> {
  const hints: ProactiveHint[] = [];

  // 1. Time-based hints
  const timeHints = getTimeBasedHints(context);
  hints.push(...timeHints);

  // 2. User pattern hints
  const patternHints = await getUserPatternHints(context);
  hints.push(...patternHints);

  // 3. Sequence hints (based on recent tool usage)
  const sequenceHints = getSequenceHints(context);
  hints.push(...sequenceHints);

  // 4. Calendar-based hints
  const calendarHints = getCalendarHints(context);
  hints.push(...calendarHints);

  // Sort by confidence and deduplicate
  const deduped = deduplicateHints(hints);
  const sorted = deduped.sort((a, b) => b.confidence - a.confidence);

  // Return top 3 hints
  return sorted.slice(0, 3);
}

/**
 * Check if a tool should be prewarmed (loaded in advance)
 *
 * Returns true if we're highly confident the user will need this tool soon.
 */
export function shouldPrewarmTool(toolId: string, context: AnticipationContext): boolean {
  const hints = getTimeBasedHints(context);
  const relevantHint = hints.find((h) => h.toolId === toolId);

  // Prewarm if confidence > 0.7
  return (relevantHint?.confidence ?? 0) > 0.7;
}

/**
 * Record a tool execution for timing pattern learning
 *
 * Call this every time a tool is executed to learn user patterns.
 * Delegates to persistence layer which handles caching and Firestore writes.
 */
export async function recordToolTiming(params: {
  userId: string;
  toolId: string;
  timestamp: Date;
}): Promise<void> {
  const { userId, toolId, timestamp } = params;

  // Delegate to persistence layer
  await persistToolTiming({ userId, toolId, timestamp });

  log.debug(
    {
      userId,
      toolId,
      hour: timestamp.getHours(),
      dayOfWeek: timestamp.getDay(),
    },
    'Recorded tool timing'
  );
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Get hints based on time of day
 */
function getTimeBasedHints(context: AnticipationContext): ProactiveHint[] {
  const hour = context.currentTime.getHours();
  const hints: ProactiveHint[] = [];

  for (const pattern of DEFAULT_TIME_PATTERNS) {
    if (pattern.hours.includes(hour)) {
      // Don't suggest if recently used
      if (context.recentTools?.includes(pattern.toolId)) {
        continue;
      }

      hints.push({
        toolId: pattern.toolId,
        reason: pattern.reason,
        confidence: pattern.confidence,
        category: 'time',
        expiresAt: getHourExpiry(context.currentTime),
      });
    }
  }

  return hints;
}

/**
 * Get hints based on user-specific patterns
 */
async function getUserPatternHints(context: AnticipationContext): Promise<ProactiveHint[]> {
  const patterns = await getTimingPatterns(context.userId);
  const hour = context.currentTime.getHours();
  const dayOfWeek = context.currentTime.getDay();
  const hints: ProactiveHint[] = [];

  for (const pattern of patterns) {
    // Match hour (required) and optionally day of week
    if (pattern.hour === hour) {
      // Boost confidence if day also matches
      let confidence = pattern.confidence;
      if (pattern.dayOfWeek === dayOfWeek) {
        confidence = Math.min(0.95, confidence + 0.15);
      }

      // Don't suggest if recently used
      if (context.recentTools?.includes(pattern.toolId)) {
        continue;
      }

      // Only suggest if confident enough
      if (confidence >= 0.4) {
        hints.push({
          toolId: pattern.toolId,
          reason: `You often use this around ${formatHour(hour)}`,
          confidence,
          category: 'pattern',
          expiresAt: getHourExpiry(context.currentTime),
        });
      }
    }
  }

  return hints;
}

/**
 * Get hints based on tool sequences
 */
function getSequenceHints(context: AnticipationContext): ProactiveHint[] {
  if (!context.recentTools || context.recentTools.length === 0) {
    return [];
  }

  const hints: ProactiveHint[] = [];
  const lastTool = context.recentTools[context.recentTools.length - 1];

  for (const sequence of TOOL_SEQUENCES) {
    if (sequence.after === lastTool) {
      // Don't suggest if already used
      if (context.recentTools.includes(sequence.suggest)) {
        continue;
      }

      hints.push({
        toolId: sequence.suggest,
        reason: sequence.reason,
        confidence: sequence.confidence,
        category: 'sequence',
        expiresAt: new Date(context.currentTime.getTime() + sequence.timeWindowMinutes * 60 * 1000),
      });
    }
  }

  return hints;
}

/**
 * Get hints based on upcoming calendar events
 */
function getCalendarHints(context: AnticipationContext): ProactiveHint[] {
  if (!context.upcomingEvents || context.upcomingEvents.length === 0) {
    return [];
  }

  const hints: ProactiveHint[] = [];

  for (const event of context.upcomingEvents) {
    // Meeting in 10-15 minutes
    if (event.startsInMinutes >= 5 && event.startsInMinutes <= 15) {
      hints.push({
        toolId: 'getCalendarSummary',
        reason: `${event.title} starts in ${event.startsInMinutes} minutes`,
        confidence: 0.6,
        category: 'calendar',
        suggestedNudge: `You have ${event.title} coming up. Want me to pull up the details?`,
      });
    }
  }

  return hints;
}

/**
 * Remove duplicate hints, keeping highest confidence
 */
function deduplicateHints(hints: ProactiveHint[]): ProactiveHint[] {
  const byToolId = new Map<string, ProactiveHint>();

  for (const hint of hints) {
    const existing = byToolId.get(hint.toolId);
    if (!existing || hint.confidence > existing.confidence) {
      byToolId.set(hint.toolId, hint);
    }
  }

  return Array.from(byToolId.values());
}

// Pruning is now handled by persistence.ts

/**
 * Get expiry time at end of current hour
 */
function getHourExpiry(currentTime: Date): Date {
  const expiry = new Date(currentTime);
  expiry.setMinutes(59, 59, 999);
  return expiry;
}

/**
 * Format hour for display
 */
function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}
