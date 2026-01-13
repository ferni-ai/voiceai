/**
 * Type definitions for Peter's research insights context builder.
 *
 * @module intelligence/context-builders/personas/peter-research-insights/types
 */
import type { ProactiveTrigger } from '../../../../tools/domains/proactive/coaching/index.js';
export type { ProactiveTrigger };
export interface UserInsightBriefing {
    /** Spending pattern insights */
    spendingInsights: string[];
    /** Habit correlation discoveries */
    habitCorrelations: string[];
    /** Goal trajectory analysis */
    goalInsights: string[];
    /** Cross-domain patterns */
    crossDomainPatterns: string[];
    /** Anomalies detected */
    anomalies: string[];
    /** Proactive discoveries to share */
    proactiveDiscoveries: string[];
    /** Cross-team data from Maya */
    mayaInsights: HabitInsights;
    /** Mood/energy patterns */
    moodPatterns: MoodInsights;
    /** Behavioral research metrics */
    behavioralMetrics: BehavioralMetrics;
    /** Better Than Human: Calendar context for research timing */
    calendarContext: CalendarResearchContext | null;
}
/** Calendar context relevant to Peter's research insights */
export interface CalendarResearchContext {
    /** Is there a research-heavy day coming up? */
    bestDayForDeepWork: string | null;
    /** Current meeting load level */
    loadLevel: 'light' | 'moderate' | 'heavy' | 'overloaded';
    /** Hours of focus time available this week */
    focusTimeHours: number;
    /** Timing suggestion for research delivery */
    timingSuggestion: string | null;
    /** Just finished a meeting? */
    justEndedMeeting: boolean;
    /** About to have a meeting? */
    upcomingMeetingSoon: boolean;
}
/** Computed behavioral research metrics */
export interface BehavioralMetrics {
    /** Decision Quality Index (0-100) */
    decisionQualityIndex: number;
    /** Habit Formation Velocity (days to form habits) */
    habitFormationVelocity: string;
    /** Motivation Sustainability Index */
    motivationSustainability: string;
    /** Financial Stress Index */
    financialStressLevel: string;
    /** Key behavioral patterns detected */
    patterns: string[];
}
export interface HabitInsights {
    activeHabits: number;
    keystoneHabits: string[];
    currentStreaks: Array<{
        name: string;
        streak: number;
    }>;
    atRiskHabits: string[];
    totalCompletions: number;
    averageSuccessRate: number;
    habitStacks: string[];
    weeklyReflectionSummary: string | null;
}
export interface MoodInsights {
    recentMoodTrend: 'improving' | 'declining' | 'stable' | 'unknown';
    averageEnergy: number;
    moodCorrelations: string[];
    lastMood: {
        mood: string;
        energy: string;
    } | null;
}
export interface MemoryInsights {
    behavioralPatterns: string[];
    emotionalThreads: string[];
    communicationStyle: string | null;
    memoryHealth: {
        totalMemories: number;
        recentMemories: number;
        emotionalMemories: number;
    } | null;
}
export interface HandoffBriefing {
    /** What was being discussed */
    topic: string;
    /** Insights from the previous persona */
    previousPersonaInsights: string[];
    /** Questions for Peter to explore */
    questionsForPeter: string[];
    /** Emotional context */
    emotionalWeight: number;
}
export interface ProactiveCoachingInsights {
    triggers: ProactiveTrigger[];
    priorityInsights: string[];
}
//# sourceMappingURL=types.d.ts.map