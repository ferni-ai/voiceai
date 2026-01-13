/**
 * Calendar Intelligence Service
 *
 * Smart scheduling and calendar analysis for Alex.
 * Provides proactive insights and recommendations.
 *
 * Features:
 * - Detect calendar overload
 * - Suggest optimal meeting times
 * - Identify focus time opportunities
 * - Generate daily briefings
 * - Analyze meeting patterns
 */
import { type CalendarEvent, type TimeSlot } from './calendar-service.js';
export interface CalendarAlert {
    type: 'overload' | 'back_to_back' | 'no_breaks' | 'early_meeting' | 'late_meeting' | 'conflict';
    severity: 'warning' | 'concern' | 'info';
    message: string;
    affectedDate?: Date;
    affectedEvents?: CalendarEvent[];
    suggestion?: string;
}
export interface MeetingSuggestion {
    slot: TimeSlot;
    reason: string;
    score: number;
    considerations: string[];
}
export interface DailyBriefing {
    date: Date;
    summary: string;
    totalMeetings: number;
    alerts: CalendarAlert[];
    firstMeeting?: CalendarEvent;
    focusTimeAvailable: number;
    suggestions: string[];
}
export interface CalendarPatterns {
    busiestDayOfWeek: string | null;
    averageMeetingsPerDay: number;
    peakMeetingHours: {
        start: number;
        end: number;
    };
    totalMeetingHoursThisWeek: number;
    focusTimeRatio: number;
    backToBackFrequency: number;
}
/**
 * Analyze calendar for alerts and concerns
 */
export declare function detectCalendarAlerts(userId: string, dateRange?: {
    start: Date;
    end: Date;
}): Promise<CalendarAlert[]>;
/**
 * Suggest optimal times for a new meeting
 */
export declare function suggestMeetingTimes(userId: string, options: {
    durationMinutes: number;
    withinDays?: number;
    preferMorning?: boolean;
    preferAfternoon?: boolean;
    avoidBackToBack?: boolean;
}): Promise<MeetingSuggestion[]>;
/**
 * Suggest focus time blocks
 */
export declare function suggestFocusBlocks(userId: string, options?: {
    minDurationMinutes?: number;
    withinDays?: number;
}): Promise<TimeSlot[]>;
/**
 * Generate a daily briefing
 */
export declare function generateDailyBriefing(userId: string, date?: Date): Promise<DailyBriefing>;
/**
 * Analyze calendar patterns over the past weeks
 */
export declare function analyzeCalendarPatterns(userId: string, weeksToAnalyze?: number): Promise<CalendarPatterns>;
declare const _default: {
    detectCalendarAlerts: typeof detectCalendarAlerts;
    suggestMeetingTimes: typeof suggestMeetingTimes;
    suggestFocusBlocks: typeof suggestFocusBlocks;
    generateDailyBriefing: typeof generateDailyBriefing;
    analyzeCalendarPatterns: typeof analyzeCalendarPatterns;
};
export default _default;
//# sourceMappingURL=calendar-intelligence.d.ts.map