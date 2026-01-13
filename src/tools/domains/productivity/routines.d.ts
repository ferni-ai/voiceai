/**
 * Daily Routines Tool
 *
 * Support for morning and evening routines, daily rituals,
 * and structured self-care practices.
 *
 * Features:
 * - Customizable morning/evening routines
 * - Step-by-step guidance
 * - Routine tracking and streaks
 * - Flexible timing
 */
import { llm } from '@livekit/agents';
export type RoutineType = 'morning' | 'evening' | 'workout' | 'wind_down' | 'focus' | 'custom';
export interface RoutineStep {
    id: string;
    title: string;
    duration: number;
    description?: string;
    isOptional: boolean;
    order: number;
}
export interface Routine {
    id: string;
    userId: string;
    name: string;
    type: RoutineType;
    steps: RoutineStep[];
    totalDuration: number;
    targetTime?: string;
    reminderEnabled: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface RoutineCompletion {
    id: string;
    routineId: string;
    userId: string;
    date: Date;
    completedSteps: string[];
    totalSteps: number;
    completionPercent: number;
    duration: number;
    notes?: string;
}
export declare function createRoutine(params: {
    userId: string;
    name: string;
    type: RoutineType;
    customSteps?: Array<Omit<RoutineStep, 'id'>>;
    targetTime?: string;
    reminderEnabled?: boolean;
}): Routine;
export declare function startRoutine(routineId: string): {
    routine: Routine;
    currentStep: RoutineStep;
    stepsRemaining: number;
} | null;
export declare function completeRoutineStep(routineId: string, stepId: string, userId: string): {
    completed: boolean;
    nextStep?: RoutineStep;
    routineComplete: boolean;
    completion?: RoutineCompletion;
} | null;
export declare function skipRoutineStep(routineId: string, stepId: string): RoutineStep | null;
export declare function createRoutineTools(): {
    createRoutine: llm.FunctionTool<{
        name: string;
        type: "custom" | "morning" | "evening" | "workout" | "focus" | "wind_down";
        reminderEnabled: boolean;
        targetTime?: string | undefined;
    }, unknown, string>;
    startRoutine: llm.FunctionTool<{
        routineType?: "morning" | "evening" | "workout" | "focus" | "wind_down" | undefined;
        routineName?: string | undefined;
    }, unknown, string>;
    routineStepDone: llm.FunctionTool<{
        routineName?: string | undefined;
        stepTitle?: string | undefined;
    }, unknown, string>;
    skipRoutineStep: llm.FunctionTool<{
        routineName?: string | undefined;
    }, unknown, string>;
    getRoutineProgress: llm.FunctionTool<{
        routineName?: string | undefined;
    }, unknown, string>;
    listRoutines: llm.FunctionTool<Record<string, never>, unknown, string>;
};
export default createRoutineTools;
//# sourceMappingURL=routines.d.ts.map