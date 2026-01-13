/**
 * N=1 Personal Analytics Tools
 *
 * These tools track and analyze personal data that no human could
 * consistently track about themselves. The ultimate self-quantification.
 *
 * "Better than Human" because: Humans can't objectively track 50+ variables
 * across years and find the correlations that matter.
 *
 * @module tools/domains/research/superhuman-tools/n1-analytics
 */
import { llm } from '@livekit/agents';
export declare const recordDecision: llm.FunctionTool<{
    decision: string;
    domain: "health" | "relationship" | "habit" | "other" | "financial" | "career" | "purchase";
    sleepHours?: number | undefined;
    stressLevel?: number | undefined;
    energyLevel?: number | undefined;
    tags?: string[] | undefined;
}, unknown, string>;
export declare const recordDecisionOutcome: llm.FunctionTool<{
    decisionKeywords: string;
    wasReversed: boolean;
    satisfaction: number;
}, unknown, string>;
export declare const analyzeDecisionQuality: llm.FunctionTool<{
    domain: "health" | "relationship" | "habit" | "all" | "financial" | "career" | "purchase";
}, unknown, string>;
export declare const recordSleepData: llm.FunctionTool<{
    hoursSlept: number;
    quality?: number | undefined;
}, unknown, string>;
export declare const analyzeSleepCorrelations: llm.FunctionTool<Record<string, never>, unknown, string>;
export declare const recordEnergyLevel: llm.FunctionTool<{
    level: number;
    notes?: string | undefined;
}, unknown, string>;
export declare const predictEnergy: llm.FunctionTool<{
    sleepLastNight?: number | undefined;
    calendarLoad?: "moderate" | "light" | "heavy" | "overloaded" | undefined;
}, unknown, string>;
export declare const analyzePeakPerformance: llm.FunctionTool<Record<string, never>, unknown, string>;
export declare const calculateLifestyleImpact: llm.FunctionTool<{
    change: string;
    type: "habit_add" | "habit_remove" | "schedule_change" | "diet_change" | "exercise_change" | "sleep_change" | "work_change" | "relationship_change";
    magnitude: "medium" | "small" | "large";
}, unknown, string>;
export declare const n1AnalyticsTools: {
    recordDecision: llm.FunctionTool<{
        decision: string;
        domain: "health" | "relationship" | "habit" | "other" | "financial" | "career" | "purchase";
        sleepHours?: number | undefined;
        stressLevel?: number | undefined;
        energyLevel?: number | undefined;
        tags?: string[] | undefined;
    }, unknown, string>;
    recordDecisionOutcome: llm.FunctionTool<{
        decisionKeywords: string;
        wasReversed: boolean;
        satisfaction: number;
    }, unknown, string>;
    analyzeDecisionQuality: llm.FunctionTool<{
        domain: "health" | "relationship" | "habit" | "all" | "financial" | "career" | "purchase";
    }, unknown, string>;
    recordSleepData: llm.FunctionTool<{
        hoursSlept: number;
        quality?: number | undefined;
    }, unknown, string>;
    analyzeSleepCorrelations: llm.FunctionTool<Record<string, never>, unknown, string>;
    recordEnergyLevel: llm.FunctionTool<{
        level: number;
        notes?: string | undefined;
    }, unknown, string>;
    predictEnergy: llm.FunctionTool<{
        sleepLastNight?: number | undefined;
        calendarLoad?: "moderate" | "light" | "heavy" | "overloaded" | undefined;
    }, unknown, string>;
    analyzePeakPerformance: llm.FunctionTool<Record<string, never>, unknown, string>;
    calculateLifestyleImpact: llm.FunctionTool<{
        change: string;
        type: "habit_add" | "habit_remove" | "schedule_change" | "diet_change" | "exercise_change" | "sleep_change" | "work_change" | "relationship_change";
        magnitude: "medium" | "small" | "large";
    }, unknown, string>;
};
export default n1AnalyticsTools;
//# sourceMappingURL=n1-analytics.d.ts.map