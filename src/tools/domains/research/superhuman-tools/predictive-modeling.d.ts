/**
 * Predictive Personal Modeling Tools
 *
 * These tools predict YOUR future based on YOUR patterns - not generic
 * advice. Goal success probability, behavioral trajectory, habit survival,
 * counterfactual analysis, and life event impact prediction.
 *
 * "Better than Human" because: No human can objectively predict your
 * future based on systematic analysis of your patterns.
 *
 * @module tools/domains/research/superhuman-tools/predictive-modeling
 */
import { llm } from '@livekit/agents';
export declare const recordGoalProgress: llm.FunctionTool<{
    goalName: string;
    currentProgress: number;
    notes?: string | undefined;
}, unknown, string>;
export declare const predictGoalSuccess: llm.FunctionTool<{
    goalName: string;
}, unknown, string>;
export declare const projectBehavioralTrajectory: llm.FunctionTool<{
    domain: "habits" | "productivity" | "relationships" | "spending" | "energy" | "goals";
}, unknown, string>;
export declare const recordHabit: llm.FunctionTool<{
    habitName: string;
    completed: boolean;
    notes?: string | undefined;
}, unknown, string>;
export declare const analyzeHabitSurvival: llm.FunctionTool<{
    habitName: string;
}, unknown, string>;
export declare const analyzeCounterfactual: llm.FunctionTool<{
    decision: string;
    alternative: string;
    domain: "health" | "relationship" | "habit" | "financial" | "career";
    timeframe: string;
}, unknown, string>;
export declare const predictLifeEventImpact: llm.FunctionTool<{
    event: string;
    eventType: "retirement" | "child" | "relationship_start" | "relationship_end" | "job_change" | "move" | "health_change" | "financial_windfall" | "financial_loss" | "education_start";
    magnitude: "moderate" | "minor" | "major";
}, unknown, string>;
export declare const predictiveModelingTools: {
    recordGoalProgress: llm.FunctionTool<{
        goalName: string;
        currentProgress: number;
        notes?: string | undefined;
    }, unknown, string>;
    predictGoalSuccess: llm.FunctionTool<{
        goalName: string;
    }, unknown, string>;
    projectBehavioralTrajectory: llm.FunctionTool<{
        domain: "habits" | "productivity" | "relationships" | "spending" | "energy" | "goals";
    }, unknown, string>;
    recordHabit: llm.FunctionTool<{
        habitName: string;
        completed: boolean;
        notes?: string | undefined;
    }, unknown, string>;
    analyzeHabitSurvival: llm.FunctionTool<{
        habitName: string;
    }, unknown, string>;
    analyzeCounterfactual: llm.FunctionTool<{
        decision: string;
        alternative: string;
        domain: "health" | "relationship" | "habit" | "financial" | "career";
        timeframe: string;
    }, unknown, string>;
    predictLifeEventImpact: llm.FunctionTool<{
        event: string;
        eventType: "retirement" | "child" | "relationship_start" | "relationship_end" | "job_change" | "move" | "health_change" | "financial_windfall" | "financial_loss" | "education_start";
        magnitude: "moderate" | "minor" | "major";
    }, unknown, string>;
};
export default predictiveModelingTools;
//# sourceMappingURL=predictive-modeling.d.ts.map