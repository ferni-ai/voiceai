/**
 * Awareness Facts System
 *
 * This module provides FACTUAL awareness to the model - things it should
 * genuinely know about, NOT behavioral guidance.
 *
 * PHILOSOPHY:
 * - Behavioral signals = HOW to behave (don't leak)
 * - Awareness facts = WHAT to know (model should use these)
 * - Tools = DEEP knowledge model can query
 *
 * The key difference from the old context system:
 * - OLD: "[TIME AWARENESS: It's 2am. Be gentle.]" (mixes fact + behavior)
 * - NEW:
 *   - Awareness: "Time: 2:17 AM" (just the fact)
 *   - Behavioral: { tone: 'gentle', pace: 'slow' } (just the behavior)
 *
 * The model should READ and USE awareness facts. They're not "stage directions"
 * to be invisible - they're genuine knowledge the model needs.
 *
 * @module intelligence/context-builders/behavioral/awareness
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { ContextBuilderInput } from '../core/types.js';

const log = createLogger({ module: 'behavioral:awareness' });

// ============================================================================
// AWARENESS TYPES
// ============================================================================

/**
 * Core awareness facts that the model should know
 */
export interface AwarenessFacts {
  // ============================================
  // TEMPORAL AWARENESS
  // ============================================

  /** Current time in user's timezone */
  currentTime?: string;

  /** Current date (e.g., "December 23, 2024") */
  currentDate?: string;

  /** Time of day category */
  timeOfDay?: 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'night' | 'late_night';

  /** Day of week */
  dayOfWeek?: string;

  /** Is it a weekend? */
  isWeekend?: boolean;

  /** Current season */
  season?: 'spring' | 'summer' | 'fall' | 'winter';

  // ============================================
  // USER IDENTITY
  // ============================================

  /** User's name */
  userName?: string;

  /** How long they've been talking (this session) */
  sessionDuration?: string;

  /** Turn count in this conversation */
  turnCount?: number;

  /** Whether they're a returning user */
  isReturningUser?: boolean;

  /** Days since last conversation */
  daysSinceLastChat?: number;

  // ============================================
  // CONVERSATION STATE
  // ============================================

  /** Current topic being discussed */
  currentTopic?: string;

  /** Topics from earlier in conversation */
  earlierTopics?: string[];

  /** What persona they're talking to */
  currentPersona?: string;

  // ============================================
  // RECENT CONTEXT (from RAG/memory)
  // ============================================

  /** One-line summary of recent relevant context */
  recentContext?: string;

  /** Goals they're working on */
  activeGoals?: string[];

  /** Open threads from previous conversations */
  openThreads?: string[];
}

// ============================================================================
// AWARENESS BUILDER
// ============================================================================

/**
 * Build awareness facts from the context input
 */
export async function buildAwarenessFacts(input: ContextBuilderInput): Promise<AwarenessFacts> {
  const { userData, userProfile, services, analysis } = input;
  const facts: AwarenessFacts = {};

  // =========================================
  // TEMPORAL AWARENESS
  // =========================================
  const now = new Date();

  // Try to get user's timezone from profile or userData
  const userTimezone =
    (userProfile as { contact?: { timezone?: string } })?.contact?.timezone ||
    (userData as { timezone?: string })?.timezone ||
    undefined;

  // Create locale options with user's timezone if available
  const localeOptions: Intl.DateTimeFormatOptions = userTimezone ? { timeZone: userTimezone } : {};

  // Get the hour in user's timezone (for time-of-day calculation)
  let hour: number;
  let dayOfWeek: number;
  try {
    if (userTimezone) {
      // Parse the time in user's timezone
      const userTimeStr = now.toLocaleString('en-US', {
        ...localeOptions,
        hour: 'numeric',
        hour12: false,
      });
      hour = parseInt(userTimeStr, 10);

      // Get day of week in user's timezone
      const userDayStr = now.toLocaleDateString('en-US', {
        ...localeOptions,
        weekday: 'short',
      });
      const dayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      };
      dayOfWeek = dayMap[userDayStr] ?? now.getDay();
    } else {
      hour = now.getHours();
      dayOfWeek = now.getDay();
    }
  } catch {
    // Fall back to server time if timezone parsing fails
    hour = now.getHours();
    dayOfWeek = now.getDay();
  }

  facts.currentTime = now.toLocaleTimeString('en-US', {
    ...localeOptions,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  facts.currentDate = now.toLocaleDateString('en-US', {
    ...localeOptions,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  facts.dayOfWeek = now.toLocaleDateString('en-US', { ...localeOptions, weekday: 'long' });
  facts.isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Time of day category
  if (hour >= 0 && hour < 5) {
    facts.timeOfDay = 'late_night';
  } else if (hour >= 5 && hour < 9) {
    facts.timeOfDay = 'early_morning';
  } else if (hour >= 9 && hour < 12) {
    facts.timeOfDay = 'morning';
  } else if (hour >= 12 && hour < 17) {
    facts.timeOfDay = 'afternoon';
  } else if (hour >= 17 && hour < 21) {
    facts.timeOfDay = 'evening';
  } else {
    facts.timeOfDay = 'night';
  }

  // Season (northern hemisphere approximation)
  // Get month in user's timezone
  let month: number;
  try {
    if (userTimezone) {
      const userMonthStr = now.toLocaleDateString('en-US', {
        ...localeOptions,
        month: 'numeric',
      });
      month = parseInt(userMonthStr, 10) - 1; // Convert to 0-indexed
    } else {
      month = now.getMonth();
    }
  } catch {
    month = now.getMonth();
  }

  if (month >= 2 && month <= 4) facts.season = 'spring';
  else if (month >= 5 && month <= 7) facts.season = 'summer';
  else if (month >= 8 && month <= 10) facts.season = 'fall';
  else facts.season = 'winter';

  // =========================================
  // USER IDENTITY
  // =========================================
  facts.userName = userData?.userName || userData?.name || userProfile?.name;
  facts.turnCount = userData?.turnCount || 0;
  facts.isReturningUser = userData?.isReturningUser || (userProfile?.totalConversations ?? 0) > 1;

  // Session duration
  if (services?.sessionStartTime) {
    const durationMs = Date.now() - services.sessionStartTime;
    const minutes = Math.floor(durationMs / 60000);
    if (minutes < 1) {
      facts.sessionDuration = 'just started';
    } else if (minutes === 1) {
      facts.sessionDuration = '1 minute';
    } else if (minutes < 60) {
      facts.sessionDuration = `${minutes} minutes`;
    } else {
      const hours = Math.floor(minutes / 60);
      facts.sessionDuration = `${hours} hour${hours > 1 ? 's' : ''}`;
    }
  }

  // Days since last chat
  if (userProfile?.lastContact) {
    const lastContact = new Date(userProfile.lastContact);
    const daysSince = Math.floor((Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince > 0) {
      facts.daysSinceLastChat = daysSince;
    }
  }

  // =========================================
  // CONVERSATION STATE
  // =========================================
  facts.currentPersona = input.persona?.identity?.id;

  if (analysis?.topics?.primary) {
    facts.currentTopic = analysis.topics.primary;
  }

  if (userData?.recentTopics && userData.recentTopics.length > 0) {
    facts.earlierTopics = userData.recentTopics.slice(0, 3);
  }

  // =========================================
  // RECENT CONTEXT (from profile)
  // =========================================
  if (userProfile?.goals && userProfile.goals.length > 0) {
    facts.activeGoals = userProfile.goals.slice(0, 3).map((g) => g.name || g.type);
  }

  if (userProfile?.openQuestions && userProfile.openQuestions.length > 0) {
    facts.openThreads = userProfile.openQuestions.slice(0, 2);
  }

  return facts;
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Format awareness facts for inclusion in the prompt.
 *
 * These are MEANT to be read by the model - they're genuine knowledge,
 * not "stage directions" to be invisible.
 */
export function formatAwarenessFacts(facts: AwarenessFacts): string {
  const lines: string[] = [];

  lines.push('## Current Awareness');
  lines.push('');

  // Date and Time
  if (facts.currentDate || facts.currentTime) {
    let dateTimeStr = '**Date/Time:** ';
    if (facts.currentDate) {
      dateTimeStr += facts.currentDate;
    }
    if (facts.dayOfWeek) {
      dateTimeStr += ` (${facts.dayOfWeek})`;
    }
    if (facts.currentTime) {
      dateTimeStr += ` at ${facts.currentTime}`;
    }
    lines.push(dateTimeStr);
  }

  // User
  if (facts.userName) {
    lines.push(`**Talking to:** ${facts.userName}`);
  }

  // Session state
  if (facts.turnCount !== undefined && facts.turnCount > 0) {
    let sessionStr = `**This conversation:** Turn ${facts.turnCount}`;
    if (facts.sessionDuration) {
      sessionStr += `, ${facts.sessionDuration}`;
    }
    lines.push(sessionStr);
  }

  // Returning user context
  if (facts.isReturningUser && facts.daysSinceLastChat) {
    if (facts.daysSinceLastChat === 1) {
      lines.push('**Last chat:** Yesterday');
    } else if (facts.daysSinceLastChat <= 7) {
      lines.push(`**Last chat:** ${facts.daysSinceLastChat} days ago`);
    } else if (facts.daysSinceLastChat <= 30) {
      lines.push('**Last chat:** A few weeks ago');
    } else {
      lines.push('**Last chat:** Over a month ago');
    }
  }

  // Current topic
  if (facts.currentTopic) {
    lines.push(`**Current topic:** ${facts.currentTopic}`);
  }

  // Active goals (if any)
  if (facts.activeGoals && facts.activeGoals.length > 0) {
    lines.push(`**Working on:** ${facts.activeGoals.join(', ')}`);
  }

  // Open threads
  if (facts.openThreads && facts.openThreads.length > 0) {
    lines.push(`**Open questions:** ${facts.openThreads.join('; ')}`);
  }

  return lines.join('\n');
}

/**
 * Compact format for system prompt
 */
export function formatAwarenessCompact(facts: AwarenessFacts): string {
  const parts: string[] = [];

  if (facts.currentDate || facts.currentTime) {
    let dateTime = '';
    if (facts.currentDate) {
      dateTime = facts.currentDate;
    }
    if (facts.dayOfWeek) {
      dateTime += dateTime ? ` (${facts.dayOfWeek})` : facts.dayOfWeek;
    }
    if (facts.currentTime) {
      dateTime += dateTime ? ` ${facts.currentTime}` : facts.currentTime;
    }
    parts.push(dateTime);
  }

  if (facts.userName) {
    parts.push(`User: ${facts.userName}`);
  }

  if (facts.currentTopic) {
    parts.push(`Topic: ${facts.currentTopic}`);
  }

  return `[AWARENESS: ${parts.join(' | ')}]`;
}

// ============================================================================
// TIME-OF-DAY BEHAVIORAL IMPLICATIONS
// ============================================================================

import type { BehavioralSignals } from './signals.js';

/**
 * Get behavioral signals implied by time of day.
 *
 * Note: These are BEHAVIORAL implications, not the facts themselves.
 * The facts go in awareness, the behavior goes in signals.
 */
export function getTimeOfDayBehavior(facts: AwarenessFacts): BehavioralSignals | null {
  if (!facts.timeOfDay) return null;

  switch (facts.timeOfDay) {
    case 'late_night':
      // 12am-5am: They're up late, be gentle and present
      return {
        source: 'time-awareness',
        tone: 'gentle',
        pace: 'slow',
        energy: 'subdued',
        style: 'supportive',
        priority: 40,
        confidence: 0.7,
      };

    case 'early_morning':
      // 5am-9am: Calm morning energy
      return {
        source: 'time-awareness',
        tone: 'warm',
        pace: 'normal',
        energy: 'calm',
        priority: 20,
        confidence: 0.5,
      };

    case 'evening':
      // 5pm-9pm: Winding down
      return {
        source: 'time-awareness',
        tone: 'warm',
        pace: 'normal',
        energy: 'calm',
        priority: 15,
        confidence: 0.4,
      };

    case 'night':
      // 9pm-12am: Getting late
      return {
        source: 'time-awareness',
        tone: 'gentle',
        pace: 'slow',
        energy: 'subdued',
        priority: 30,
        confidence: 0.6,
      };

    default:
      return null;
  }
}
