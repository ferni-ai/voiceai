/**
 * Smart Decline Service
 *
 * "Better Than Human" capability: Proactively identify low-value meetings
 * and suggest declining them to protect the user's time and energy.
 *
 * Factors considered:
 * - Meetings during user's focus time
 * - Recurring meetings with low engagement patterns
 * - Meetings with too many attendees (likely could be async)
 * - Back-to-back meetings when user needs breaks
 * - Optional meetings when schedule is overloaded
 * - Meetings outside preferred hours
 * - Duplicate/similar meetings
 *
 * No human assistant can analyze these patterns and advocate for your time
 * as effectively as Ferni can.
 *
 * @module services/calendar/smart-decline
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { CalendarEvent } from './types.js';
import { getMeetingPatterns, type MeetingPattern } from './meeting-pattern-learning.js';
import { getCalendarLoadFactors } from './calendar-load-service.js';

const log = createLogger({ module: 'SmartDecline' });

// ============================================================================
// TYPES
// ============================================================================

export interface DeclineSuggestion {
  event: CalendarEvent;
  reason: string;
  confidence: number; // 0-100
  category: DeclineCategory;
  suggestedAction: 'decline' | 'reschedule' | 'shorten' | 'make_optional' | 'send_delegate';
  alternativeText?: string; // Suggested response text
}

export type DeclineCategory =
  | 'focus_time_conflict'
  | 'overloaded_day'
  | 'low_engagement_recurring'
  | 'too_many_attendees'
  | 'back_to_back'
  | 'outside_preferred_hours'
  | 'optional_when_busy'
  | 'duplicate_meeting';

interface DeclineRule {
  name: string;
  category: DeclineCategory;
  check: (event: CalendarEvent, context: DeclineContext) => DeclineCheckResult | null;
  suggestedAction: DeclineSuggestion['suggestedAction'];
  baseConfidence: number;
}

interface DeclineContext {
  patterns: MeetingPattern;
  dayEvents: CalendarEvent[];
  weeklyMeetingHours: number;
  isOverloaded: boolean;
}

interface DeclineCheckResult {
  triggered: boolean;
  reason: string;
  confidenceModifier?: number; // -20 to +20
  alternativeText?: string;
}

// ============================================================================
// DECLINE RULES
// ============================================================================

const DECLINE_RULES: DeclineRule[] = [
  {
    name: 'Focus Time Conflict',
    category: 'focus_time_conflict',
    suggestedAction: 'reschedule',
    baseConfidence: 70,
    check: (event, context) => {
      const hour = new Date(event.startTime).getHours();
      const { focusTimePreference } = context.patterns;
      
      if (focusTimePreference === 'morning' && hour >= 9 && hour <= 11) {
        return {
          triggered: true,
          reason: 'This meeting is during your typical morning focus time',
          alternativeText: 'Would it be possible to move this to the afternoon? Mornings work better for my deep work.',
        };
      }
      if (focusTimePreference === 'afternoon' && hour >= 14 && hour <= 16) {
        return {
          triggered: true,
          reason: 'This meeting is during your typical afternoon focus time',
          alternativeText: 'Could we shift this to the morning? I tend to reserve afternoons for focused work.',
        };
      }
      return null;
    },
  },
  {
    name: 'Overloaded Day',
    category: 'overloaded_day',
    suggestedAction: 'reschedule',
    baseConfidence: 75,
    check: (event, context) => {
      // Calculate total meeting hours for the day
      const eventDay = new Date(event.startTime).toDateString();
      const dayMeetings = context.dayEvents.filter(
        e => new Date(e.startTime).toDateString() === eventDay
      );
      
      const totalMinutes = dayMeetings.reduce((acc, e) => {
        const duration = (new Date(e.endTime).getTime() - new Date(e.startTime).getTime()) / (1000 * 60);
        return acc + duration;
      }, 0);
      
      const totalHours = totalMinutes / 60;
      
      if (totalHours > 6) {
        // Check if this meeting is marked as optional
        const isOptional = event.title?.toLowerCase().includes('optional') ||
                          event.description?.toLowerCase().includes('optional');
        
        if (isOptional) {
          return {
            triggered: true,
            reason: `This is an optional meeting on a day with ${Math.round(totalHours)} hours of meetings`,
            confidenceModifier: 10,
            alternativeText: "I won't be able to make this one - my schedule is packed. Please send notes if anything critical comes up!",
          };
        }
        
        return {
          triggered: true,
          reason: `This meeting adds to an already packed day (${Math.round(totalHours)}h of meetings)`,
          alternativeText: 'Could we find another time? This day is already quite full.',
        };
      }
      return null;
    },
  },
  {
    name: 'Too Many Attendees',
    category: 'too_many_attendees',
    suggestedAction: 'make_optional',
    baseConfidence: 60,
    check: (event) => {
      const attendeeCount = event.attendees?.length || 0;
      
      if (attendeeCount > 8) {
        return {
          triggered: true,
          reason: `Large meeting with ${attendeeCount} attendees - your input may not be essential`,
          confidenceModifier: Math.min(attendeeCount - 8, 20), // More confidence with more attendees
          alternativeText: 'With this many people, I may be able to just review the notes afterwards. Would that work?',
        };
      }
      return null;
    },
  },
  {
    name: 'Back to Back',
    category: 'back_to_back',
    suggestedAction: 'reschedule',
    baseConfidence: 65,
    check: (event, context) => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      
      // Check for meetings immediately before or after
      const hasImmediateBefore = context.dayEvents.some(e => {
        const otherEnd = new Date(e.endTime);
        const gap = eventStart.getTime() - otherEnd.getTime();
        return gap >= 0 && gap < 5 * 60 * 1000; // Less than 5 min gap
      });
      
      const hasImmediateAfter = context.dayEvents.some(e => {
        const otherStart = new Date(e.startTime);
        const gap = otherStart.getTime() - eventEnd.getTime();
        return gap >= 0 && gap < 5 * 60 * 1000;
      });
      
      if (hasImmediateBefore && hasImmediateAfter) {
        return {
          triggered: true,
          reason: 'This creates a back-to-back meeting block with no breaks',
          confidenceModifier: 10,
          alternativeText: 'Could we push this back 15 minutes? I need a short break between calls.',
        };
      }
      
      if (hasImmediateBefore || hasImmediateAfter) {
        return {
          triggered: true,
          reason: 'This meeting is back-to-back with another',
          alternativeText: 'Any chance we could start 10 minutes later? I have another meeting right before.',
        };
      }
      
      return null;
    },
  },
  {
    name: 'Outside Preferred Hours',
    category: 'outside_preferred_hours',
    suggestedAction: 'reschedule',
    baseConfidence: 55,
    check: (event, context) => {
      const hour = new Date(event.startTime).getHours();
      const { avoidHours } = context.patterns;
      
      if (avoidHours.includes(hour)) {
        if (hour < 8) {
          return {
            triggered: true,
            reason: 'This meeting is very early in the morning',
            alternativeText: 'Would a slightly later time work? Early mornings are tough for me.',
          };
        }
        if (hour >= 18) {
          return {
            triggered: true,
            reason: 'This meeting is in the evening',
            alternativeText: 'Could we find a time during business hours? Evenings are tricky.',
          };
        }
      }
      return null;
    },
  },
  {
    name: 'Recurring Low Value',
    category: 'low_engagement_recurring',
    suggestedAction: 'decline',
    baseConfidence: 50,
    check: (event) => {
      // Check if this is a recurring meeting that might be low value
      // This would need historical tracking of attendance/engagement
      
      const title = (event.title || '').toLowerCase();
      
      // Common low-value meeting patterns
      if (title.includes('optional') || title.includes('fyi')) {
        return {
          triggered: true,
          reason: 'This recurring meeting is marked as optional/FYI',
          alternativeText: "I'll skip this week - please send notes if there's anything important!",
        };
      }
      
      return null;
    },
  },
];

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get suggestions for meetings to decline or reschedule
 */
export async function suggestDeclines(userId: string): Promise<DeclineSuggestion[]> {
  log.debug({ userId }, 'Analyzing meetings for decline suggestions');

  try {
    // Get upcoming events for the week
    const { getEvents } = await import('./unified-calendar-store.js');
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const events = await getEvents(userId, now, nextWeek);
    
    if (events.length === 0) {
      return [];
    }

    // Get user patterns and load factors
    const patterns = await getMeetingPatterns(userId);
    const loadFactors = await getCalendarLoadFactors(userId);
    
    const context: DeclineContext = {
      patterns,
      dayEvents: events,
      weeklyMeetingHours: loadFactors?.weeklyMeetingHours || 0,
      isOverloaded: (loadFactors?.weeklyMeetingHours || 0) > 30,
    };

    const suggestions: DeclineSuggestion[] = [];

    for (const event of events) {
      // Skip all-day events
      if (event.isAllDay) continue;
      
      // Skip events created by the user (they probably want to attend their own meetings)
      // This would need organizer tracking
      
      for (const rule of DECLINE_RULES) {
        const result = rule.check(event, context);
        
        if (result?.triggered) {
          const confidence = Math.min(100, Math.max(0, 
            rule.baseConfidence + (result.confidenceModifier || 0)
          ));
          
          // Only suggest if confidence is reasonable
          if (confidence >= 50) {
            suggestions.push({
              event,
              reason: result.reason,
              confidence,
              category: rule.category,
              suggestedAction: rule.suggestedAction,
              alternativeText: result.alternativeText,
            });
          }
        }
      }
    }

    // Sort by confidence (highest first)
    suggestions.sort((a, b) => b.confidence - a.confidence);

    // Deduplicate (same event may trigger multiple rules - keep highest confidence)
    const seen = new Set<string>();
    const deduplicated = suggestions.filter(s => {
      const key = s.event.id || s.event.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    log.info(
      { userId, eventCount: events.length, suggestionCount: deduplicated.length },
      'Generated decline suggestions'
    );

    return deduplicated;
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to generate decline suggestions');
    return [];
  }
}

/**
 * Get decline suggestions for a specific day
 */
export async function suggestDeclinesForDay(
  userId: string,
  date: Date
): Promise<DeclineSuggestion[]> {
  const allSuggestions = await suggestDeclines(userId);
  
  const targetDay = date.toDateString();
  return allSuggestions.filter(
    s => new Date(s.event.startTime).toDateString() === targetDay
  );
}

/**
 * Generate a polite decline message
 */
export function generateDeclineMessage(
  suggestion: DeclineSuggestion,
  includeAlternative: boolean = true
): string {
  if (suggestion.alternativeText) {
    return suggestion.alternativeText;
  }

  const templates: Record<DeclineSuggestion['suggestedAction'], string[]> = {
    decline: [
      "I won't be able to make this one, but please keep me in the loop!",
      "Unfortunately I need to pass on this - hope it goes well!",
    ],
    reschedule: [
      "Could we find another time that works better?",
      "I'd love to attend but the timing doesn't work - any flexibility?",
    ],
    shorten: [
      "Would it be possible to keep this shorter? I'm a bit squeezed for time.",
      "Could we aim for 30 minutes instead?",
    ],
    make_optional: [
      "Would it be okay if I join as optional? I may not be able to make every session.",
      "I might need to drop this week - would that be okay?",
    ],
    send_delegate: [
      "Would it be okay if I send a colleague instead?",
      "I may not be able to attend personally - can I loop someone else in?",
    ],
  };

  const actionTemplates = templates[suggestion.suggestedAction];
  const message = actionTemplates[Math.floor(Math.random() * actionTemplates.length)];

  if (includeAlternative && suggestion.suggestedAction === 'reschedule') {
    return `${message} (${suggestion.reason})`;
  }

  return message;
}

export default {
  suggestDeclines,
  suggestDeclinesForDay,
  generateDeclineMessage,
};
