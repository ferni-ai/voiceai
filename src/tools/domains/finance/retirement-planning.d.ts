/**
 * Retirement Planning Tools - Jordan's Retirement Coordination
 *
 * Comprehensive retirement planning that integrates with:
 * - Maya for savings goals and budget allocation
 * - Jack for investment strategy
 * - Alex for scheduling retirement planning sessions
 *
 * Jordan helps users envision, plan, and track their path to retirement.
 */
import { llm } from '@livekit/agents';
export type RetirementStyle = 'early-retirement' | 'traditional' | 'semi-retirement' | 'encore-career' | 'flexible';
export type RetirementPhase = 'dreaming' | 'planning' | 'accumulating' | 'pre-retirement' | 'transitioning' | 'retired';
export interface RetirementPlan {
    id: string;
    userId: string;
    name: string;
    style: RetirementStyle;
    phase: RetirementPhase;
    targetAge: number;
    currentAge: number;
    targetDate?: Date;
    monthlyIncomeGoal: number;
    currentSavings: number;
    monthlySavingsTarget: number;
    savingsProgress: number;
    visionItems: RetirementVisionItem[];
    checklist: RetirementChecklistItem[];
    notes: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface RetirementVisionItem {
    id: string;
    category: 'location' | 'activities' | 'travel' | 'family' | 'health' | 'legacy' | 'work';
    description: string;
    priority: 'must-have' | 'nice-to-have' | 'dream';
    estimatedCost?: number;
    notes?: string;
}
export interface RetirementChecklistItem {
    id: string;
    task: string;
    category: 'financial' | 'legal' | 'health' | 'lifestyle' | 'social';
    yearsBeforeRetirement?: number;
    completed: boolean;
    notes?: string;
}
export declare function createRetirementPlan(userId: string, currentAge: number, targetAge: number, style?: RetirementStyle, monthlyIncomeGoal?: number): RetirementPlan;
export declare function getRetirementPlan(userId: string): RetirementPlan | undefined;
export declare function updateRetirementSavings(planId: string, currentSavings: number, monthlySavingsTarget?: number): RetirementPlan | undefined;
export declare function addVisionItem(planId: string, category: RetirementVisionItem['category'], description: string, priority?: RetirementVisionItem['priority'], estimatedCost?: number): RetirementVisionItem | undefined;
export declare function createRetirementPlanningTools(): {
    createRetirementPlan: llm.FunctionTool<{
        currentAge: number;
        targetAge: number;
        style: "early-retirement" | "traditional" | "semi-retirement" | "encore-career" | "flexible";
        monthlyIncomeGoal: number;
        userId: string;
    }, unknown, string>;
    getRetirementStatus: llm.FunctionTool<{
        userId: string;
    }, unknown, string>;
    addRetirementVisionItem: llm.FunctionTool<{
        category: "health" | "family" | "legacy" | "work" | "travel" | "location" | "activities";
        description: string;
        priority: "dream" | "must-have" | "nice-to-have";
        userId: string;
        estimatedAnnualCost?: number | undefined;
    }, unknown, string>;
    updateRetirementSavings: llm.FunctionTool<{
        currentSavings: number;
        userId: string;
        monthlySavingsTarget?: number | undefined;
    }, unknown, string>;
    completeRetirementTask: llm.FunctionTool<{
        taskDescription: string;
        userId: string;
    }, unknown, string>;
    getRetirementVisionPrompts: llm.FunctionTool<{
        category?: "health" | "family" | "legacy" | "work" | "travel" | "location" | "activities" | undefined;
    }, unknown, string>;
    requestMayaRetirementHelp: llm.FunctionTool<{
        helpType: "savings-goal" | "budget-allocation" | "expense-reduction" | "investment-review";
        userId: string;
        context?: string | undefined;
    }, unknown, string>;
};
export default createRetirementPlanningTools;
//# sourceMappingURL=retirement-planning.d.ts.map