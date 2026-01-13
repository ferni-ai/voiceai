/**
 * Routine Awareness Context Builder
 *
 * Injects context about user's automated routines ("What I Do For You")
 * into conversations so Ferni can proactively mention and manage them.
 *
 * Provides awareness of:
 * - Active routines and their triggers
 * - Recently run routines
 * - Routine suggestions based on context
 * - Failed routines needing attention
 *
 * @module intelligence/context-builders/awareness/routine-awareness
 */
import { type ContextBuilder, type ContextBuilderInput } from '../index.js';
export interface RoutineAwarenessContext {
    activeRoutineCount: number;
    routines: RoutineSummary[];
    recentlyRun: RoutineSummary[];
    needsAttention: RoutineSummary[];
    contextInjection: string | null;
}
export interface RoutineSummary {
    id: string;
    name: string;
    triggerType: string;
    triggerDescription: string;
    lastRunAt?: string;
    runCount: number;
    status: 'active' | 'paused' | 'error';
}
/**
 * Build routine awareness context
 */
declare function buildRoutineAwareness(input: ContextBuilderInput): Promise<RoutineAwarenessContext | null>;
declare const routineAwarenessBuilder: ContextBuilder;
export { buildRoutineAwareness, routineAwarenessBuilder };
export default routineAwarenessBuilder;
//# sourceMappingURL=routine-awareness.d.ts.map