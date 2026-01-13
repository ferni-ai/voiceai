/**
 * Session Flow Context Builder
 *
 * Tracks session activity and generates "radio show" style transitions.
 * Part of the "More Than Human" music intelligence system (Phase 1.6).
 *
 * This builder:
 * - Tracks topics, emotions, and significant moments
 * - Generates "radio show" style transition announcements
 * - Creates a continuous narrative arc for the session
 * - Provides session summary context for goodbye moments
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Build session flow context injections
 */
declare function buildSessionFlowContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
/**
 * Clear session state (call when session ends)
 */
export declare function clearSessionFlowState(sessionId: string): void;
/**
 * Get session statistics
 */
export declare function getSessionFlowStats(sessionId: string): {
    topicsDiscussed: number;
    emotionalMoments: number;
    transitions: number;
} | null;
export { buildSessionFlowContext };
//# sourceMappingURL=session-flow.d.ts.map