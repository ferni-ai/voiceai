/**
 * Proactive Calendar Intelligence
 *
 * Provides proactive insights and assistance:
 * 1. Pre-meeting briefings (prep before important meetings)
 * 2. Post-meeting follow-ups (capture action items)
 * 3. Conflict detection with suggestions
 * 4. Smart recurring event suggestions
 *
 * Designed to make Alex "superhuman" at calendar management.
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getDayOverview,
  getWeekOverview,
  getEventsForDay,
  findFreeTimeSlots,
  type CalendarEvent,
  type DayOverview,
} from './calendar-service.js';
import { detectCalendarAlerts, analyzeCalendarPatterns } from './calendar-intelligence.js';

const log = createLogger({ module: 'ProactiveCalendar' });

// ============================================================================
// TYPES
// ============================================================================

export interface PreMeetingBriefing {
  eventId: string;
  eventTitle: string;
  startsAt: Date;
  minutesUntil: number;
  briefing: {
    summary: string;
    prepTips: string[];
    relevantContext?: string;
    attendeeInfo?: string;
  };
  priority: 'high' | 'medium' | 'low';
}

export interface PostMeetingFollowUp {
  eventId: string;
  eventTitle: string;
  endedAt: Date;
  prompts: string[];
  suggestedActions: string[];
}

export interface ConflictAnalysis {
  hasConflict: boolean;
  conflictingEvents: CalendarEvent[];
  severity: 'hard' | 'soft' | 'warning';
  description: string;
  suggestions: {
    alternativeTime: Date;
    description: string;
  }[];
}

export interface RecurringSuggestion {
  title: string;
  suggestedPattern: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  confidence: number;
  reasoning: string;
  suggestedTime?: { hour: number; minute: number; dayOfWeek?: number };
}

// ============================================================================
// PRE-MEETING BRIEFINGS
// ============================================================================

/**
 * Get pre-meeting briefings for upcoming events
 *
 * Returns briefings for events starting within the specified window.
 * Prioritizes high-importance meetings (interviews, presentations, etc.)
 */
export async function getUpcomingBriefings(
  userId: string,
  windowMinutes = 60
): Promise<PreMeetingBriefing[]> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000);

  try {
    const dayEvents = await getEventsForDay(userId, now);
    const briefings: PreMeetingBriefing[] = [];

    for (const event of dayEvents) {
      const startTime =
        event.startTime instanceof Date ? event.startTime : new Date(event.startTime);

      // Only events starting within the window
      if (startTime < now || startTime > windowEnd) continue;

      const minutesUntil = Math.round((startTime.getTime() - now.getTime()) / 60000);
      const priority = calculateMeetingPriority(event);

      // Only generate briefings for medium+ priority or very soon meetings
      if (priority === 'low' && minutesUntil > 15) continue;

      briefings.push({
        eventId: event.id,
        eventTitle: event.title || 'Untitled',
        startsAt: startTime,
        minutesUntil,
        briefing: generateBriefing(event, minutesUntil),
        priority,
      });
    }

    // Sort by start time
    briefings.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    log.debug({ userId, briefingCount: briefings.length }, 'Generated pre-meeting briefings');
    return briefings;
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to get upcoming briefings');
    return [];
  }
}

/**
 * Calculate meeting priority
 */
function calculateMeetingPriority(event: CalendarEvent): 'high' | 'medium' | 'low' {
  const title = (event.title || '').toLowerCase();
  const description = (event.description || '').toLowerCase();

  // High priority
  if (
    title.includes('interview') ||
    title.includes('presentation') ||
    title.includes('board') ||
    title.includes('client') ||
    title.includes('investor') ||
    title.includes('final') ||
    description.includes('important')
  ) {
    return 'high';
  }

  // Medium priority
  if (
    title.includes('meeting') ||
    title.includes('call') ||
    title.includes('review') ||
    title.includes('sync') ||
    title.includes('standup') ||
    title.includes('1:1') ||
    title.includes('one-on-one')
  ) {
    return 'medium';
  }

  return 'low';
}

/**
 * Generate briefing content for an event
 */
function generateBriefing(
  event: CalendarEvent,
  minutesUntil: number
): PreMeetingBriefing['briefing'] {
  const title = (event.title || 'Meeting').toLowerCase();
  const prepTips: string[] = [];

  // Time-based tips
  if (minutesUntil <= 5) {
    prepTips.push('Take a deep breath and center yourself');
  } else if (minutesUntil <= 15) {
    prepTips.push('Review your key talking points');
    prepTips.push('Close unnecessary tabs and apps');
  } else {
    prepTips.push('Review relevant materials');
    prepTips.push('Prepare questions you want to ask');
  }

  // Meeting type specific tips
  if (title.includes('interview')) {
    prepTips.push('Remember your key achievements and examples');
    prepTips.push('Have questions ready for your interviewer');
    prepTips.push("You've prepared for this - trust yourself");
  } else if (title.includes('presentation')) {
    prepTips.push('Test your screen share');
    prepTips.push('Have backup slides ready');
    prepTips.push('Speak slowly and pause for questions');
  } else if (title.includes('1:1') || title.includes('one-on-one')) {
    prepTips.push('Think about wins and challenges to share');
    prepTips.push('Come with specific asks or updates');
  } else if (title.includes('client') || title.includes('customer')) {
    prepTips.push('Review their recent interactions');
    prepTips.push('Have account details ready');
  }

  // Location tips
  if (event.location) {
    if (
      event.location.includes('http') ||
      event.location.includes('zoom') ||
      event.location.includes('meet')
    ) {
      prepTips.push('Test your audio and video');
    } else {
      prepTips.push(`Remember: This is at ${event.location}`);
    }
  }

  // Build summary
  const time = new Date(event.startTime).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  let summary = `"${event.title || 'Meeting'}" starts at ${time} (in ${minutesUntil} minutes)`;

  if (event.attendees && event.attendees.length > 0) {
    summary += ` with ${event.attendees.length} attendee${event.attendees.length > 1 ? 's' : ''}`;
  }

  return {
    summary,
    prepTips: prepTips.slice(0, 3), // Max 3 tips
    attendeeInfo: event.attendees?.join(', '),
  };
}

// ============================================================================
// POST-MEETING FOLLOW-UPS
// ============================================================================

/**
 * Get post-meeting follow-up prompts for recently ended events
 *
 * Returns follow-ups for events that ended within the specified window.
 */
export async function getPostMeetingFollowUps(
  userId: string,
  windowMinutes = 30
): Promise<PostMeetingFollowUp[]> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);

  try {
    const dayEvents = await getEventsForDay(userId, now);
    const followUps: PostMeetingFollowUp[] = [];

    for (const event of dayEvents) {
      const endTime = event.endTime instanceof Date ? event.endTime : new Date(event.endTime);

      // Only events that ended within the window
      if (endTime < windowStart || endTime > now) continue;

      const priority = calculateMeetingPriority(event);

      // Only follow up on medium+ priority meetings
      if (priority === 'low') continue;

      followUps.push({
        eventId: event.id,
        eventTitle: event.title || 'Untitled',
        endedAt: endTime,
        prompts: generateFollowUpPrompts(event),
        suggestedActions: generateSuggestedActions(event),
      });
    }

    log.debug({ userId, followUpCount: followUps.length }, 'Generated post-meeting follow-ups');
    return followUps;
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to get post-meeting follow-ups');
    return [];
  }
}

/**
 * Generate follow-up prompts for an event
 */
function generateFollowUpPrompts(event: CalendarEvent): string[] {
  const title = (event.title || '').toLowerCase();
  const prompts: string[] = [];

  prompts.push('How did it go?');

  if (title.includes('interview')) {
    prompts.push('What questions came up?');
    prompts.push('Any follow-up items?');
  } else if (title.includes('meeting') || title.includes('sync')) {
    prompts.push('Any action items to capture?');
    prompts.push('Who needs to do what by when?');
  } else if (title.includes('1:1')) {
    prompts.push('Any commitments you made?');
    prompts.push('Anything to follow up on?');
  }

  return prompts.slice(0, 3);
}

/**
 * Generate suggested actions after a meeting
 */
function generateSuggestedActions(event: CalendarEvent): string[] {
  const title = (event.title || '').toLowerCase();
  const actions: string[] = [];

  if (title.includes('interview')) {
    actions.push('Send thank-you note');
    actions.push('Note key takeaways');
  } else if (title.includes('client') || title.includes('customer')) {
    actions.push('Send follow-up email');
    actions.push('Update CRM notes');
  } else {
    actions.push('Document action items');
    actions.push('Schedule follow-up if needed');
  }

  return actions;
}

// ============================================================================
// CONFLICT DETECTION
// ============================================================================

/**
 * Analyze conflicts for a proposed event
 *
 * Returns detailed conflict analysis with suggestions.
 */
export async function analyzeConflicts(
  userId: string,
  proposedStart: Date,
  proposedEnd: Date,
  eventTitle?: string
): Promise<ConflictAnalysis> {
  try {
    const dayEvents = await getEventsForDay(userId, proposedStart);
    const conflicts: CalendarEvent[] = [];

    for (const event of dayEvents) {
      const eventStart =
        event.startTime instanceof Date ? event.startTime : new Date(event.startTime);
      const eventEnd = event.endTime instanceof Date ? event.endTime : new Date(event.endTime);

      // Check for overlap
      if (proposedStart < eventEnd && proposedEnd > eventStart) {
        conflicts.push(event);
      }
    }

    if (conflicts.length === 0) {
      return {
        hasConflict: false,
        conflictingEvents: [],
        severity: 'warning',
        description: 'No conflicts detected',
        suggestions: [],
      };
    }

    // Determine severity
    const severity = determineSeverity(conflicts);

    // Find alternatives
    const duration = Math.round((proposedEnd.getTime() - proposedStart.getTime()) / 60000);
    const freeSlots = await findFreeTimeSlots(userId, proposedStart, {
      minDurationMinutes: duration,
    });

    const suggestions = freeSlots.map((slot) => ({
      alternativeTime: slot.start,
      description: formatTimeSlot(slot.start, slot.end),
    }));

    // Build description
    const conflictNames = conflicts.map((c) => c.title || 'Event').slice(0, 2);
    const description =
      conflicts.length === 1
        ? `Conflicts with "${conflictNames[0]}"`
        : `Conflicts with ${conflictNames.join(' and ')}${conflicts.length > 2 ? ` and ${conflicts.length - 2} more` : ''}`;

    return {
      hasConflict: true,
      conflictingEvents: conflicts,
      severity,
      description,
      suggestions: suggestions.slice(0, 3),
    };
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to analyze conflicts');
    return {
      hasConflict: false,
      conflictingEvents: [],
      severity: 'warning',
      description: 'Could not check for conflicts',
      suggestions: [],
    };
  }
}

/**
 * Determine conflict severity
 */
function determineSeverity(conflicts: CalendarEvent[]): 'hard' | 'soft' | 'warning' {
  // Hard conflict = overlapping with confirmed, important meetings
  const hasHardConflict = conflicts.some((event) => {
    const priority = calculateMeetingPriority(event);
    return priority === 'high' && event.status === 'confirmed';
  });

  if (hasHardConflict) return 'hard';

  // Soft conflict = overlapping with less important events
  const hasSoftConflict = conflicts.some((event) => event.status === 'confirmed');

  if (hasSoftConflict) return 'soft';

  // Warning = tentative events only
  return 'warning';
}

/**
 * Format time slot for display
 */
function formatTimeSlot(start: Date, end: Date): string {
  const startTime = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const endTime = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const day = start.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return `${day} ${startTime} - ${endTime}`;
}

// ============================================================================
// RECURRING EVENT SUGGESTIONS
// ============================================================================

/**
 * Suggest recurring events based on calendar patterns
 *
 * Analyzes past events to identify patterns that could become recurring.
 * Note: This is a simplified version that uses the available CalendarPatterns.
 */
export async function suggestRecurringEvents(userId: string): Promise<RecurringSuggestion[]> {
  try {
    const patterns = await analyzeCalendarPatterns(userId);
    const suggestions: RecurringSuggestion[] = [];

    // Use pattern data to generate suggestions
    if (patterns.busiestDayOfWeek && patterns.averageMeetingsPerDay > 3) {
      suggestions.push({
        title: 'Focus Time Block',
        suggestedPattern: 'weekly',
        confidence: 0.7,
        reasoning: `${patterns.busiestDayOfWeek} tends to be busy - consider protecting focus time`,
        suggestedTime: { hour: patterns.peakMeetingHours.start - 1, minute: 0 },
      });
    }

    // Suggest standup if high meeting frequency
    if (patterns.averageMeetingsPerDay >= 2) {
      suggestions.push({
        title: 'Daily Planning',
        suggestedPattern: 'daily',
        confidence: patterns.averageMeetingsPerDay / 5,
        reasoning: 'Regular planning helps manage a busy calendar',
        suggestedTime: { hour: 9, minute: 0 },
      });
    }

    // If too many back-to-backs, suggest buffer time
    if (patterns.backToBackFrequency > 0.3) {
      suggestions.push({
        title: 'Buffer Time',
        suggestedPattern: 'weekly',
        confidence: patterns.backToBackFrequency,
        reasoning: `You have back-to-back meetings ${Math.round(patterns.backToBackFrequency * 100)}% of the time`,
      });
    }

    log.debug({ userId, suggestionCount: suggestions.length }, 'Generated recurring suggestions');
    return suggestions.slice(0, 5); // Max 5 suggestions
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to suggest recurring events');
    return [];
  }
}

// ============================================================================
// SMART SCHEDULING
// ============================================================================

/**
 * Find the best time for a new event based on preferences and patterns
 */
export async function findBestTimeFor(
  userId: string,
  duration: number,
  preferences?: {
    preferMorning?: boolean;
    preferAfternoon?: boolean;
    avoidBackToBack?: boolean;
    minGapMinutes?: number;
  }
): Promise<{ time: Date; score: number; reasoning: string }[]> {
  const {
    preferMorning = false,
    preferAfternoon = false,
    avoidBackToBack = true,
    minGapMinutes = 15,
  } = preferences || {};

  try {
    const today = new Date();
    const freeSlots = await findFreeTimeSlots(userId, today, { minDurationMinutes: duration });

    const scoredSlots = freeSlots.map((slot) => {
      let score = 0.5; // Base score
      const reasons: string[] = [];

      const hour = slot.start.getHours();

      // Time preference scoring
      if (preferMorning && hour >= 9 && hour <= 12) {
        score += 0.2;
        reasons.push('Morning slot');
      } else if (preferAfternoon && hour >= 13 && hour <= 17) {
        score += 0.2;
        reasons.push('Afternoon slot');
      }

      // Avoid very early or late
      if (hour < 8 || hour > 19) {
        score -= 0.3;
        reasons.push('Outside normal hours');
      }

      // Premium time (10am, 2pm, 3pm)
      if ([10, 14, 15].includes(hour)) {
        score += 0.1;
        reasons.push('Popular meeting time');
      }

      // Back-to-back penalty (would need to check surrounding events)
      // Simplified: prefer middle of available slot
      const slotDuration = (slot.end.getTime() - slot.start.getTime()) / 60000;
      if (slotDuration > duration * 2) {
        score += 0.1;
        reasons.push('Room for buffer');
      }

      return {
        time: slot.start,
        score: Math.max(0, Math.min(1, score)),
        reasoning: reasons.join(', ') || 'Available slot',
      };
    });

    // Sort by score descending
    scoredSlots.sort((a, b) => b.score - a.score);

    return scoredSlots.slice(0, 5);
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to find best time');
    return [];
  }
}
