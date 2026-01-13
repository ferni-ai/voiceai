/**
 * Daily Briefing Tool
 *
 * Morning briefing and end-of-day reflection for voice-first productivity.
 *
 * Features:
 * - Morning briefing (weather, calendar, tasks, goals)
 * - End-of-day reflection
 * - Weekly review
 * - Personalized insights
 */
import { llm } from '@livekit/agents';
export interface DailyBriefing {
    date: Date;
    weather?: WeatherInfo;
    tasks: TaskSummary;
    habits: HabitSummary;
    calendar: CalendarSummary;
    bills: BillSummary;
    medications: MedicationSummary;
    quote?: string;
}
interface WeatherInfo {
    temp: number;
    condition: string;
    high: number;
    low: number;
    precipitation?: number;
}
interface TaskSummary {
    total: number;
    overdue: number;
    highPriority: number;
    topTasks: string[];
}
interface HabitSummary {
    due: number;
    longestStreak: number;
    habitNames: string[];
}
interface CalendarSummary {
    events: number;
    nextEvent?: string;
    busyHours: number;
}
interface BillSummary {
    dueThisWeek: number;
    totalDue: number;
    needsAttention: boolean;
}
interface MedicationSummary {
    dosesToday: number;
    dueNow: number;
    needsRefill: string[];
}
declare const MORNING_QUOTES: string[];
declare const EVENING_REFLECTIONS: string[];
declare function getRandomQuote(quotes: string[]): string;
declare function formatGreeting(): string;
declare function getDayOfWeek(): string;
declare function getFormattedDate(): string;
export declare function createDailyBriefingTools(): {
    getMorningBriefing: llm.FunctionTool<{
        userName?: string | undefined;
    }, unknown, string>;
    getEveningReflection: llm.FunctionTool<Record<string, never>, unknown, string>;
    getQuickStatus: llm.FunctionTool<Record<string, never>, unknown, string>;
    getWeeklyReview: llm.FunctionTool<Record<string, never>, unknown, string>;
    getMotivation: llm.FunctionTool<{
        type: "encouragement" | "reminder" | "quote";
    }, unknown, string>;
};
export default createDailyBriefingTools;
export { getFormattedDate, getDayOfWeek, formatGreeting, getRandomQuote, MORNING_QUOTES, EVENING_REFLECTIONS, };
//# sourceMappingURL=daily-briefing.d.ts.map