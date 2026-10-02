/**
 * Calendar view - API, view-model and callback types. Extracted from calendar-view.ui.ts.
 */

export interface PracticeViewAPIResponse {
  success: boolean;
  orchestratingPersona: string;
  week: PracticeViewDayData[];
  todayEvents: PracticeEventData[];
  intentions: PracticeIntentionData[];
  mayaNotices: {
    message: string;
    type: 'observation' | 'suggestion' | 'celebration' | 'concern';
    confidence: number;
    relatedDays?: string[];
  } | null;
  crossPersonaInsights: {
    persona: string;
    type: string;
    message: string;
    context?: string;
  }[];
  stats: {
    followThroughPercent: number;
    habitsCompletedThisWeek: number;
    momentumTrend: 'rising' | 'steady' | 'building' | 'declining';
    streak: number;
  };
  lastUpdated: string;
}

export interface PracticeViewDayData {
  date: string;
  dayName: string;
  shortName: string;
  dayNum: number;
  isToday: boolean;
  isWeekend: boolean;
  events: PracticeEventData[];
  tasks: PracticeIntentionData[];
  reminders: { id: string; text: string; time: string; type: string }[];
  habits: { id: string; name: string; completedToday: boolean; streak: number; insight?: string }[];
  insight: string;
  insightPersona?: string;
}

export interface PracticeEventData {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  emotionalContext?: {
    persona: string;
    insight: string;
  };
  source: string;
  isAllDay?: boolean;
  status?: 'confirmed' | 'tentative' | 'cancelled';
}

export interface PracticeIntentionData {
  id: string;
  text: string;
  completed: boolean;
  priority?: 'high' | 'medium' | 'low';
  dueDate?: string;
  insight?: string;
  insightPersona?: string;
}

// ============================================================================
// ANALYTICS TYPES (consolidated from calendar-analytics.ui.ts)
// ============================================================================

export interface CalendarLoadFactors {
  weeklyMeetingHours: number;
  weeklyFocusTimeRatio: number;
  weeklyBackToBackPercentage: number;
  consecutiveOverloadedDays: number;
  consecutiveMeetingStreak: number;
  heaviestDayThisWeek: string | null;
  lightestDayThisWeek: string | null;
}

export interface DailyLoadTrend {
  date: string;
  dayName: string;
  meetingHours: number;
  focusHours: number;
  meetingCount: number;
  isOverloaded: boolean;
}

export interface RecoveryInsight {
  urgency: 'low' | 'moderate' | 'high' | 'immediate';
  message: string;
  suggestedAction?: string;
}

export interface CalendarPattern {
  type: 'peak-hours' | 'busiest-day' | 'focus-deficit' | 'back-to-back' | 'meeting-marathon';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface CalendarAnalyticsData {
  // Current load summary
  loadFactors: CalendarLoadFactors;

  // Weekly trends (last 7 days)
  dailyTrends: DailyLoadTrend[];

  // Insights
  recoveryInsight: RecoveryInsight | null;
  patterns: CalendarPattern[];

  // Comparisons
  weekOverWeekChange: {
    meetingHoursChange: number; // percentage
    focusTimeChange: number; // percentage
  };

  // Best practices
  healthScore: number; // 0-100
  recommendations: string[];
}

// ============================================================================
// TYPES
// ============================================================================

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  isAllDay: boolean;
  status: 'confirmed' | 'tentative' | 'cancelled';
}

export interface DayOverview {
  date: string;
  events: CalendarEvent[];
  totalMeetings: number;
  totalMeetingMinutes: number;
  freeTimeMinutes: number;
  isOverloaded: boolean;
  hasBackToBack: boolean;
  /** Tasks for this day */
  tasks?: unknown[];
  /** Reminders for this day */
  reminders?: unknown[];
  /** Habits for this day */
  habits?: unknown[];
}

export interface WeekOverview {
  days: DayOverview[];
  totalMeetings: number;
  busiestDay: { day: string; meetings: number } | null;
  lightestDay: { day: string; meetings: number } | null;
}

export interface CalendarViewCallbacks {
  onClose?: () => void;
  onEventClick?: (eventId: string) => void;
  onAddEvent?: () => void;
  onConnectCalendar?: () => void;
}

export type ViewMode = 'today' | 'week' | 'month' | 'insights' | 'practice';
