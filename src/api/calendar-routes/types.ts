/**
 * Calendar Routes Types
 *
 * Shared types for calendar API routes.
 */

import type { IncomingMessage, ServerResponse } from 'http';

export type CalendarRouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  ...args: unknown[]
) => Promise<void>;

export interface CalendarAnalyticsResponse {
  loadFactors: {
    weeklyMeetingHours: number;
    weeklyFocusTimeRatio: number;
    weeklyBackToBackPercentage: number;
    consecutiveOverloadedDays: number;
  };
  dailyTrends: Array<{
    date: string;
    dayName: string;
    meetingHours: number;
    focusHours: number;
    meetingCount: number;
    isOverloaded: boolean;
  }>;
  recoveryInsight: {
    urgency: 'immediate' | 'today' | 'this_week';
    message: string;
    suggestedAction?: string;
  } | null;
  patterns: {
    busiestDayOfWeek: string | null;
    averageMeetingsPerDay: number;
    peakMeetingHours: { start: number; end: number };
    totalMeetingHoursThisWeek: number;
    focusTimeRatio: number;
    backToBackFrequency: number;
  };
  weekOverWeekChange: {
    meetingHoursChange: number;
    focusTimeChange: number;
  };
  healthScore: number;
  recommendations: string[];
}


