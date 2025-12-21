/**
 * Proactive Calendar-based Outreach
 *
 * This service integrates calendar awareness into Ferni's proactive outreach
 * system, enabling "Better Than Human" calendar-driven check-ins.
 *
 * Features:
 * - Pre-meeting check-ins (offer prep help before important meetings)
 * - Post-meeting follow-ups (check how it went)
 * - Recovery reminders (when calendar shows overload)
 * - Free time suggestions (when calendar opens up)
 * - Weekly rhythm analysis (best times for outreach)
 *
 * @module calendar/proactive-calendar-outreach
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getAmbientCalendarContext } from './ambient-calendar-awareness.js';
import { getCalendarLoadFactors } from './calendar-load-service.js';
import { detectRecoveryNeeds } from './recovery-protection.js';
import type { CalendarEvent as CalendarEventType } from './types.js';
import type { CalendarEvent as ServiceCalendarEvent } from './calendar-service.js';

const log = createLogger({ module: 'proactive-calendar-outreach' });

// ============================================================================
// TYPES
// ============================================================================

export interface CalendarOutreachTrigger {
  type: 'pre-meeting' | 'post-meeting' | 'recovery-needed' | 'free-time' | 'weekly-digest';
  urgency: 'low' | 'medium' | 'high';
  title: string;
  message: string;
  suggestedAction?: string;
  relatedEvent?: ServiceCalendarEvent;
  bestTimeToReach?: Date;
}

export interface WeeklyRhythmAnalysis {
  busiestDay: string;
  lightestDay: string;
  peakMeetingHours: number[];
  quietHours: number[];
  bestOutreachTimes: Date[];
}

export interface OutreachWindow {
  start: Date;
  end: Date;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  reason: string;
}

// ============================================================================
// OUTREACH TRIGGER DETECTION
// ============================================================================

/**
 * Analyze calendar and detect outreach opportunities.
 */
export async function detectCalendarOutreachTriggers(
  userId: string
): Promise<CalendarOutreachTrigger[]> {
  const triggers: CalendarOutreachTrigger[] = [];

  try {
    const [ambient, loadFactors, recoveryNeeds] = await Promise.all([
      getAmbientCalendarContext(userId),
      getCalendarLoadFactors(userId),
      detectRecoveryNeeds(userId),
    ]);

    // Pre-meeting check-in
    if (ambient.nextMeeting.event && ambient.nextMeeting.minutesUntil) {
      const event = ambient.nextMeeting.event;
      const minutesUntil = ambient.nextMeeting.minutesUntil;

      // High-priority meetings get earlier check-in
      if (isHighPriorityMeeting(event) && minutesUntil <= 60 && minutesUntil > 30) {
        triggers.push({
          type: 'pre-meeting',
          urgency: 'high',
          title: 'Important meeting prep',
          message: `Your ${event.title} starts in ${minutesUntil} minutes. Want a quick prep?`,
          suggestedAction: 'Get briefing',
          relatedEvent: event,
        });
      } else if (minutesUntil <= 30 && minutesUntil > 10) {
        triggers.push({
          type: 'pre-meeting',
          urgency: 'medium',
          title: 'Meeting starting soon',
          message: `${event.title} in ${minutesUntil} minutes. Need anything before you go?`,
          relatedEvent: event,
        });
      }
    }

    // Post-meeting check-in
    if (ambient.justEndedMeeting.event && ambient.justEndedMeeting.minutesSince) {
      const event = ambient.justEndedMeeting.event;
      const minutesSince = ambient.justEndedMeeting.minutesSince;

      // Check in shortly after important meetings
      if (isHighPriorityMeeting(event) && minutesSince >= 5 && minutesSince <= 20) {
        triggers.push({
          type: 'post-meeting',
          urgency: 'medium',
          title: 'How did it go?',
          message: `Just finished ${event.title}. How did it go? Any follow-ups I can help with?`,
          suggestedAction: 'Record outcomes',
          relatedEvent: event,
        });
      }
    }

    // Recovery reminder
    if (recoveryNeeds.length > 0) {
      const topNeed = recoveryNeeds[0];
      // Map urgency: 'immediate' -> 'high', 'today' -> 'medium', 'this_week' -> 'low'
      const urgencyMap: Record<string, 'high' | 'medium' | 'low'> = {
        immediate: 'high',
        today: 'medium',
        this_week: 'low',
      };
      const mappedUrgency = urgencyMap[topNeed.urgency] || 'medium';
      if (mappedUrgency !== 'low') {
        triggers.push({
          type: 'recovery-needed',
          urgency: mappedUrgency,
          title: 'Time for a break?',
          message: topNeed.reason,
          suggestedAction: topNeed.suggestedAction?.description,
        });
      }
    }

    // Free time opportunity
    if (!ambient.currentlyInMeeting && ambient.remainingMeetingsToday === 0) {
      // User's calendar is clear for the day
      const now = new Date();
      const hour = now.getHours();

      if (hour >= 14 && hour <= 17) {
        // Afternoon with no more meetings
        triggers.push({
          type: 'free-time',
          urgency: 'low',
          title: 'Open afternoon',
          message: `Your calendar is clear for the rest of the day. Good time for that thing you've been putting off?`,
        });
      }
    } else if (ambient.nextBreakDuration && ambient.nextBreakDuration >= 90) {
      // Long break coming up
      triggers.push({
        type: 'free-time',
        urgency: 'low',
        title: 'Focus time ahead',
        message: `You have a ${ambient.nextBreakDuration}-minute break coming up. Want to plan how to use it?`,
      });
    }

    log.debug({ userId, triggerCount: triggers.length }, 'Detected calendar outreach triggers');
    return triggers;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to detect outreach triggers');
    return [];
  }
}

/**
 * Determine if a meeting is high priority based on various signals.
 */
function isHighPriorityMeeting(event: ServiceCalendarEvent): boolean {
  const title = event.title.toLowerCase();

  // Keywords that indicate importance
  const importantKeywords = [
    'interview',
    'review',
    'board',
    '1:1',
    'one-on-one',
    'client',
    'customer',
    'presentation',
    'demo',
    'kickoff',
    'strategy',
    'planning',
    'all-hands',
    'important',
    'urgent',
  ];

  if (importantKeywords.some((kw) => title.includes(kw))) {
    return true;
  }

  // Long meetings (>1 hour) are often important
  const duration = (event.endTime.getTime() - event.startTime.getTime()) / 60000;
  if (duration >= 60) {
    return true;
  }

  // Meetings with many attendees
  if (event.attendees.length >= 5) {
    return true;
  }

  return false;
}

// ============================================================================
// WEEKLY RHYTHM ANALYSIS
// ============================================================================

/**
 * Analyze user's weekly calendar rhythm to find best outreach times.
 */
export async function analyzeWeeklyRhythm(userId: string): Promise<WeeklyRhythmAnalysis> {
  const loadFactors = await getCalendarLoadFactors(userId);

  // Determine busy/quiet hours based on typical patterns
  // In a full implementation, this would analyze actual calendar data
  const peakMeetingHours = [10, 11, 14, 15]; // 10am-noon, 2pm-4pm typical
  const quietHours = [8, 9, 12, 17, 18]; // Early morning, lunch, end of day

  // Calculate best outreach times (quiet hours on light days)
  const bestOutreachTimes: Date[] = [];
  const now = new Date();

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });

    // Prefer lightest day
    if (dayName === loadFactors.lightestDayThisWeek) {
      for (const hour of quietHours) {
        const outreachTime = new Date(date);
        outreachTime.setHours(hour, 0, 0, 0);
        if (outreachTime > now) {
          bestOutreachTimes.push(outreachTime);
        }
      }
    }
  }

  return {
    busiestDay: loadFactors.heaviestDayThisWeek || 'Unknown',
    lightestDay: loadFactors.lightestDayThisWeek || 'Unknown',
    peakMeetingHours,
    quietHours,
    bestOutreachTimes: bestOutreachTimes.slice(0, 5), // Top 5 times
  };
}

/**
 * Find the best windows for outreach based on current calendar.
 */
export async function findOutreachWindows(
  userId: string,
  hoursAhead = 24
): Promise<OutreachWindow[]> {
  const windows: OutreachWindow[] = [];
  const ambient = await getAmbientCalendarContext(userId);
  const loadFactors = await getCalendarLoadFactors(userId);

  const now = new Date();

  // If currently free with no imminent meeting
  if (!ambient.currentlyInMeeting && (!ambient.nextMeeting.minutesUntil || ambient.nextMeeting.minutesUntil > 30)) {
    const windowEnd = ambient.nextMeeting.event
      ? new Date(ambient.nextMeeting.event.startTime.getTime() - 5 * 60 * 1000) // 5 min buffer
      : new Date(now.getTime() + 60 * 60 * 1000); // Default 1 hour

    windows.push({
      start: now,
      end: windowEnd,
      quality: ambient.nextMeeting.minutesUntil && ambient.nextMeeting.minutesUntil < 60 ? 'good' : 'excellent',
      reason: 'Currently free',
    });
  }

  // If just ended meeting, short window before processing
  if (ambient.justEndedMeeting.event && ambient.justEndedMeeting.minutesSince && ambient.justEndedMeeting.minutesSince < 10) {
    const start = new Date(now.getTime() + 5 * 60 * 1000); // Give 5 min buffer
    const end = ambient.nextMeeting.event
      ? new Date(ambient.nextMeeting.event.startTime.getTime() - 5 * 60 * 1000)
      : new Date(now.getTime() + 30 * 60 * 1000);

    windows.push({
      start,
      end,
      quality: 'good',
      reason: 'Between meetings',
    });
  }

  // Check if it's a light day overall
  const today = now.toLocaleDateString('en-US', { weekday: 'long' });
  if (today === loadFactors.lightestDayThisWeek) {
    windows.forEach((w) => {
      if (w.quality === 'good') w.quality = 'excellent';
    });
  }

  return windows;
}

// ============================================================================
// WEEKLY DIGEST
// ============================================================================

export interface WeeklyCalendarDigest {
  weekStartDate: Date;
  totalMeetingHours: number;
  busiestDay: { day: string; hours: number };
  lightestDay: { day: string; hours: number };
  focusTimeRatio: number;
  meetingCount: number;
  recoveryStatus: 'good' | 'needs-attention' | 'concerning';
  keyInsights: string[];
  recommendations: string[];
}

/**
 * Generate a weekly calendar digest for proactive outreach.
 */
export async function generateWeeklyDigest(userId: string): Promise<WeeklyCalendarDigest> {
  const loadFactors = await getCalendarLoadFactors(userId);
  const recoveryNeeds = await detectRecoveryNeeds(userId);

  const keyInsights: string[] = [];
  const recommendations: string[] = [];

  // Analyze meeting load
  if (loadFactors.weeklyMeetingHours > 30) {
    keyInsights.push(`Heavy meeting load: ${Math.round(loadFactors.weeklyMeetingHours)} hours`);
    recommendations.push('Consider declining or delegating some meetings');
  } else if (loadFactors.weeklyMeetingHours < 10) {
    keyInsights.push(`Light meeting week: ${Math.round(loadFactors.weeklyMeetingHours)} hours`);
    recommendations.push('Great week for deep work or catching up');
  }

  // Analyze focus time
  if (loadFactors.weeklyFocusTimeRatio < 0.2) {
    keyInsights.push('Very low focus time');
    recommendations.push('Block some focus time before the week fills up');
  } else if (loadFactors.weeklyFocusTimeRatio > 0.5) {
    keyInsights.push('Good balance of focus time');
  }

  // Analyze back-to-back
  if (loadFactors.weeklyBackToBackPercentage > 40) {
    keyInsights.push(`${Math.round(loadFactors.weeklyBackToBackPercentage)}% back-to-back meetings`);
    recommendations.push('Add 5-minute buffers between meetings');
  }

  // Recovery status
  let recoveryStatus: 'good' | 'needs-attention' | 'concerning' = 'good';
  if (recoveryNeeds.some((r) => r.urgency === 'immediate')) {
    recoveryStatus = 'concerning';
    recommendations.push('Prioritize recovery this week');
  } else if (recoveryNeeds.some((r) => r.urgency === 'today')) {
    recoveryStatus = 'needs-attention';
  }

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week

  return {
    weekStartDate: weekStart,
    totalMeetingHours: loadFactors.weeklyMeetingHours,
    busiestDay: { day: loadFactors.heaviestDayThisWeek || 'Unknown', hours: 0 },
    lightestDay: { day: loadFactors.lightestDayThisWeek || 'Unknown', hours: 0 },
    focusTimeRatio: loadFactors.weeklyFocusTimeRatio,
    meetingCount: 0, // Would need to fetch actual count
    recoveryStatus,
    keyInsights,
    recommendations,
  };
}

/**
 * Build weekly digest as a context injection for outreach.
 */
export async function buildWeeklyDigestInjection(userId: string): Promise<string | null> {
  const digest = await generateWeeklyDigest(userId);

  const sections: string[] = ['[WEEKLY CALENDAR DIGEST - Better Than Human Proactive Care]'];

  sections.push(`\n**Week Summary:**`);
  sections.push(`- Meeting Hours: ${Math.round(digest.totalMeetingHours)}h`);
  sections.push(`- Focus Time: ${Math.round(digest.focusTimeRatio * 100)}%`);
  sections.push(`- Busiest Day: ${digest.busiestDay.day}`);
  sections.push(`- Lightest Day: ${digest.lightestDay.day}`);
  sections.push(`- Recovery Status: ${digest.recoveryStatus}`);

  if (digest.keyInsights.length > 0) {
    sections.push(`\n**Key Insights:**`);
    digest.keyInsights.forEach((insight) => sections.push(`- ${insight}`));
  }

  if (digest.recommendations.length > 0) {
    sections.push(`\n**Recommendations:**`);
    digest.recommendations.forEach((rec) => sections.push(`- ${rec}`));
  }

  return sections.join('\n');
}

// ============================================================================
// PRE-MEETING NOTIFICATIONS
// ============================================================================

/**
 * Check if we should send a pre-meeting notification.
 */
export async function shouldSendPreMeetingNotification(
  userId: string
): Promise<{ should: boolean; trigger?: CalendarOutreachTrigger }> {
  const triggers = await detectCalendarOutreachTriggers(userId);
  const preMeetingTrigger = triggers.find((t) => t.type === 'pre-meeting' && t.urgency === 'high');

  return {
    should: !!preMeetingTrigger,
    trigger: preMeetingTrigger,
  };
}

/**
 * Format a pre-meeting notification for push or in-app display.
 */
export function formatPreMeetingNotification(trigger: CalendarOutreachTrigger): {
  title: string;
  body: string;
  data: Record<string, unknown>;
} {
  return {
    title: trigger.title,
    body: trigger.message,
    data: {
      type: 'pre-meeting',
      eventId: trigger.relatedEvent?.id,
      eventTitle: trigger.relatedEvent?.title,
      suggestedAction: trigger.suggestedAction,
    },
  };
}

