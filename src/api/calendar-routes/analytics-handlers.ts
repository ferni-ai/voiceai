/**
 * Calendar Analytics Handlers
 *
 * Handles calendar analytics and health score calculations.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../utils/safe-logger.js';
import { sendJSON, sendError } from '../helpers.js';
import { getWeekOverview } from '../../services/calendar/calendar-service.js';
import { analyzeCalendarPatterns } from '../../services/calendar/calendar-intelligence.js';
import { getCalendarLoadFactors } from '../../services/calendar/calendar-load-service.js';
import { detectRecoveryNeeds } from '../../services/calendar/recovery-protection.js';
import type { CalendarAnalyticsResponse } from './types.js';

const log = getLogger();

/**
 * GET /api/calendar/analytics - Get calendar analytics data
 */
export async function handleAnalytics(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const [loadFactors, recoveryNeeds, patterns, weekOverview] = await Promise.all([
      getCalendarLoadFactors(userId),
      detectRecoveryNeeds(userId),
      analyzeCalendarPatterns(userId),
      getWeekOverview(userId, new Date()),
    ]);

    // Build daily trends from week overview
    const dailyTrends = weekOverview.days.map((day) => ({
      date: day.date.toISOString(),
      dayName: day.date.toLocaleDateString('en-US', { weekday: 'long' }),
      meetingHours: day.totalMeetingMinutes / 60,
      focusHours: day.freeTimeMinutes / 60,
      meetingCount: day.totalMeetings,
      isOverloaded: day.isOverloaded,
    }));

    // Map recovery needs to insight
    let recoveryInsight: CalendarAnalyticsResponse['recoveryInsight'] = null;
    if (recoveryNeeds.length > 0) {
      const topNeed = recoveryNeeds[0];
      recoveryInsight = {
        urgency: topNeed.urgency,
        message: topNeed.reason,
        suggestedAction: topNeed.suggestedAction?.description,
      };
    }

    // Calculate health score (0-100)
    let healthScore = 80;

    if (loadFactors.weeklyMeetingHours > 30) healthScore -= 20;
    else if (loadFactors.weeklyMeetingHours > 25) healthScore -= 10;

    if (loadFactors.weeklyFocusTimeRatio < 0.2) healthScore -= 20;
    else if (loadFactors.weeklyFocusTimeRatio < 0.3) healthScore -= 10;

    if (loadFactors.weeklyBackToBackPercentage > 50) healthScore -= 15;
    else if (loadFactors.weeklyBackToBackPercentage > 30) healthScore -= 5;

    if (loadFactors.consecutiveOverloadedDays >= 3) healthScore -= 15;
    else if (loadFactors.consecutiveOverloadedDays >= 2) healthScore -= 5;

    healthScore = Math.max(0, Math.min(100, healthScore));

    // Generate recommendations
    const recommendations: string[] = [];
    if (loadFactors.weeklyFocusTimeRatio < 0.2) {
      recommendations.push('Your focus time is below 20%. Try blocking dedicated work time.');
    }
    if (loadFactors.weeklyBackToBackPercentage > 40) {
      recommendations.push('Many back-to-back meetings. Consider 5-minute buffers between calls.');
    }
    if (loadFactors.consecutiveOverloadedDays >= 2) {
      recommendations.push('Multiple overloaded days in a row. Recovery time is important.');
    }
    if (recoveryNeeds.length > 0 && recoveryNeeds[0].urgency === 'immediate') {
      recommendations.push(
        recoveryNeeds[0].suggestedAction?.description || 'Consider blocking recovery time.'
      );
    }
    if (recommendations.length === 0) {
      recommendations.push('Your calendar looks well-balanced. Keep it up!');
    }

    const weekOverWeekChange = { meetingHoursChange: 0, focusTimeChange: 0 };

    const response: CalendarAnalyticsResponse = {
      loadFactors,
      dailyTrends,
      recoveryInsight,
      patterns,
      weekOverWeekChange,
      healthScore,
      recommendations,
    };

    sendJSON(res, response);
    log.info({ userId, healthScore }, 'Calendar analytics served');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to generate calendar analytics');
    sendError(res, 'Failed to generate calendar analytics', 500);
  }
}
