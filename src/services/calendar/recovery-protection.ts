/**
 * Recovery Protection Service
 *
 * Proactively protects user time and suggests recovery blocks.
 * This is "better than human" because no assistant consistently:
 * - Notices 3+ hours of back-to-back meetings
 * - Auto-suggests blocking recovery time
 * - Tracks patterns that lead to burnout
 *
 * @module calendar/recovery-protection
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getDayOverview,
  getWeekOverview,
  findFreeTimeSlots,
  createEvent,
  type CalendarEvent,
  type TimeSlot,
  type CreateEventInput,
} from './calendar-service.js';
import { getCalendarLoadFactors } from './calendar-load-service.js';

const log = createLogger({ module: 'recovery-protection' });

// ============================================================================
// TYPES
// ============================================================================

export type RecoveryType =
  | 'block_time'
  | 'decline_meeting'
  | 'delegate'
  | 'reschedule'
  | 'shorten'
  | 'add_break';

export interface RecoveryRecommendation {
  type: RecoveryType;
  reason: string;
  urgency: 'immediate' | 'today' | 'this_week';
  suggestedAction: {
    description: string;
    eventToCreate?: Partial<CreateEventInput>;
    eventToModify?: string; // event ID
    suggestedDuration?: number; // minutes
  };
  confidence: number; // 0-100
}

export interface RecoverySettings {
  enabled: boolean;
  autoBlockAfterMinutes: number; // Auto-suggest after X minutes of back-to-back
  minRecoveryMinutes: number; // Minimum recovery block length
  preferredRecoveryTimes: string[]; // e.g., ["after-lunch", "end-of-day"]
  maxMeetingHoursPerDay: number;
}

// ============================================================================
// DEFAULT SETTINGS
// ============================================================================

const DEFAULT_SETTINGS: RecoverySettings = {
  enabled: true,
  autoBlockAfterMinutes: 180, // 3 hours
  minRecoveryMinutes: 15,
  preferredRecoveryTimes: ['after-lunch', 'end-of-day'],
  maxMeetingHoursPerDay: 6,
};

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Detect recovery needs and generate recommendations
 */
export async function detectRecoveryNeeds(
  userId: string,
  settings: Partial<RecoverySettings> = {}
): Promise<RecoveryRecommendation[]> {
  const config = { ...DEFAULT_SETTINGS, ...settings };
  const recommendations: RecoveryRecommendation[] = [];

  if (!config.enabled) {
    return recommendations;
  }

  try {
    const loadFactors = await getCalendarLoadFactors(userId);
    const todayOverview = await getDayOverview(userId, new Date());

    // Check 1: Currently in a long meeting streak
    if (loadFactors.consecutiveMeetingStreak >= config.autoBlockAfterMinutes) {
      const streakHours = Math.round((loadFactors.consecutiveMeetingStreak / 60) * 10) / 10;

      recommendations.push({
        type: 'block_time',
        reason: `You've been in meetings for ${streakHours} hours straight`,
        urgency: 'immediate',
        suggestedAction: {
          description: `Block ${config.minRecoveryMinutes}+ minutes to decompress`,
          suggestedDuration: Math.max(config.minRecoveryMinutes, 30),
        },
        confidence: 95,
      });
    }

    // Check 2: Today is overloaded
    if (todayOverview.isOverloaded) {
      const meetingHours = Math.round((todayOverview.totalMeetingMinutes / 60) * 10) / 10;

      recommendations.push({
        type: 'decline_meeting',
        reason: `Today has ${meetingHours}h of meetings (over your ${config.maxMeetingHoursPerDay}h limit)`,
        urgency: 'today',
        suggestedAction: {
          description: 'Consider declining or rescheduling a non-essential meeting',
        },
        confidence: 80,
      });
    }

    // Check 3: Back-to-back all day
    if (todayOverview.hasBackToBack && todayOverview.freeTimeMinutes < 30) {
      recommendations.push({
        type: 'add_break',
        reason: 'No breaks between meetings today',
        urgency: 'today',
        suggestedAction: {
          description: 'End one meeting 10 minutes early to create a buffer',
        },
        confidence: 85,
      });
    }

    // Check 4: Heavy week ahead
    if (loadFactors.weeklyMeetingHours >= 30) {
      recommendations.push({
        type: 'block_time',
        reason: `${loadFactors.weeklyMeetingHours}h of meetings this week`,
        urgency: 'this_week',
        suggestedAction: {
          description: 'Block focus time on lighter days',
          suggestedDuration: 120,
        },
        confidence: 75,
      });
    }

    // Check 5: No recovery days this week
    if (loadFactors.noRecoveryDays >= 3) {
      recommendations.push({
        type: 'reschedule',
        reason: `${loadFactors.noRecoveryDays} days with less than 1h of free time`,
        urgency: 'this_week',
        suggestedAction: {
          description: 'Move some meetings to create recovery time',
        },
        confidence: 70,
      });
    }

    // Check 6: Consecutive heavy days
    if (loadFactors.consecutiveOverloadedDays >= 2) {
      recommendations.push({
        type: 'block_time',
        reason: `${loadFactors.consecutiveOverloadedDays} consecutive overloaded days`,
        urgency: 'immediate',
        suggestedAction: {
          description: 'Protect tomorrow morning for recovery',
          suggestedDuration: 120,
        },
        confidence: 90,
      });
    }

    // Sort by urgency and confidence
    const urgencyOrder = { immediate: 0, today: 1, this_week: 2 };
    recommendations.sort((a, b) => {
      const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      if (urgencyDiff !== 0) return urgencyDiff;
      return b.confidence - a.confidence;
    });

    return recommendations;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to detect recovery needs');
    return [];
  }
}

/**
 * Auto-block recovery time after a meeting streak
 *
 * This is the proactive "better than human" feature.
 */
export async function autoBlockRecoveryTime(
  userId: string,
  afterMeetingStreak: number, // minutes of consecutive meetings
  settings: Partial<RecoverySettings> = {}
): Promise<CalendarEvent | null> {
  const config = { ...DEFAULT_SETTINGS, ...settings };

  if (!config.enabled || afterMeetingStreak < config.autoBlockAfterMinutes) {
    return null;
  }

  try {
    const today = new Date();
    const freeSlots = await findFreeTimeSlots(userId, today, {
      minDurationMinutes: config.minRecoveryMinutes,
      workDayOnly: true,
    });

    if (freeSlots.length === 0) {
      log.info({ userId }, 'No free slots available for recovery block');
      return null;
    }

    // Find the next available slot
    const now = new Date();
    const nextSlot = freeSlots.find((slot) => slot.start > now);

    if (!nextSlot) {
      log.info({ userId }, 'No upcoming free slots for recovery');
      return null;
    }

    // Create recovery block
    const recoveryDuration = Math.min(
      Math.max(config.minRecoveryMinutes, 30),
      nextSlot.durationMinutes
    );

    const eventInput: CreateEventInput = {
      title: '🧘 Recovery Time',
      description:
        'Auto-blocked by Ferni after a long meeting streak. ' +
        'Use this time to decompress, stretch, or take a break.',
      startTime: nextSlot.start,
      durationMinutes: recoveryDuration,
    };

    const event = await createEvent(userId, eventInput);

    if (event) {
      log.info(
        { userId, duration: recoveryDuration, startTime: nextSlot.start },
        '🧘 Auto-blocked recovery time'
      );
    }

    return event;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to auto-block recovery time');
    return null;
  }
}

/**
 * Find optimal slots for focus/recovery time this week
 */
export async function findRecoveryOpportunities(
  userId: string,
  minDurationMinutes = 60
): Promise<Array<{ slot: TimeSlot; day: string; quality: 'excellent' | 'good' | 'fair' }>> {
  const opportunities: Array<{
    slot: TimeSlot;
    day: string;
    quality: 'excellent' | 'good' | 'fair';
  }> = [];

  try {
    const weekOverview = await getWeekOverview(userId);

    for (const dayOverview of weekOverview.days) {
      const dayOfWeek = dayOverview.date.getDay();

      // Skip weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      const dayName = dayOverview.date.toLocaleDateString('en-US', { weekday: 'long' });

      const freeSlots = await findFreeTimeSlots(userId, dayOverview.date, {
        minDurationMinutes,
        workDayOnly: true,
      });

      for (const slot of freeSlots) {
        // Assess quality based on day load and slot timing
        let quality: 'excellent' | 'good' | 'fair' = 'fair';

        const hour = slot.start.getHours();
        const dayMeetings = dayOverview.totalMeetings;

        // Excellent: Light day (< 3 meetings) + morning or after lunch
        if (dayMeetings < 3 && (hour === 9 || hour === 13 || hour === 14)) {
          quality = 'excellent';
        }
        // Good: Moderate day + decent time slot
        else if (dayMeetings < 5 && hour >= 9 && hour <= 16) {
          quality = 'good';
        }

        opportunities.push({ slot, day: dayName, quality });
      }
    }

    // Sort by quality
    const qualityOrder = { excellent: 0, good: 1, fair: 2 };
    opportunities.sort((a, b) => qualityOrder[a.quality] - qualityOrder[b.quality]);

    return opportunities.slice(0, 10);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to find recovery opportunities');
    return [];
  }
}

/**
 * Generate recovery suggestions for display to user
 */
export async function getRecoverySuggestions(userId: string): Promise<string[]> {
  const recommendations = await detectRecoveryNeeds(userId);
  const suggestions: string[] = [];

  for (const rec of recommendations.slice(0, 3)) {
    if (rec.type === 'block_time' && rec.suggestedAction.suggestedDuration) {
      suggestions.push(
        `Block ${rec.suggestedAction.suggestedDuration} minutes for yourself: ${rec.reason}`
      );
    } else if (rec.type === 'decline_meeting') {
      suggestions.push(`Consider declining a meeting: ${rec.reason}`);
    } else if (rec.type === 'add_break') {
      suggestions.push(`Add buffer time: ${rec.reason}`);
    } else {
      suggestions.push(rec.suggestedAction.description);
    }
  }

  return suggestions;
}

/**
 * Build context string for LLM injection
 */
export async function buildRecoveryContext(userId: string): Promise<string> {
  const recommendations = await detectRecoveryNeeds(userId);

  if (recommendations.length === 0) {
    return '';
  }

  const immediateRecs = recommendations.filter((r) => r.urgency === 'immediate');
  const todayRecs = recommendations.filter((r) => r.urgency === 'today');

  const sections: string[] = ['[RECOVERY PROTECTION - Better Than Human Time Protection]'];

  if (immediateRecs.length > 0) {
    sections.push('\n**Immediate Attention Needed:**');
    for (const rec of immediateRecs) {
      sections.push(`• ${rec.reason}`);
      sections.push(`  → ${rec.suggestedAction.description}`);
    }
  }

  if (todayRecs.length > 0) {
    sections.push("\n**Today's Recovery Needs:**");
    for (const rec of todayRecs) {
      sections.push(`• ${rec.reason}`);
    }
  }

  sections.push('\nYou can proactively offer to protect their time or suggest recovery.');

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const recoveryProtection = {
  detectNeeds: detectRecoveryNeeds,
  autoBlock: autoBlockRecoveryTime,
  findOpportunities: findRecoveryOpportunities,
  getSuggestions: getRecoverySuggestions,
  buildContext: buildRecoveryContext,
};

export default recoveryProtection;
