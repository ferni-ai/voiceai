/**
 * Handoff State Management
 *
 * Per-session handoff state to prevent cross-session contamination.
 * This replaces the previous module-level global variables that caused
 * state to bleed between different user sessions.
 *
 * ARCHITECTURE:
 * - HandoffState is created per session via createHandoffState()
 * - State is stored in SessionServices.handoffState
 * - All handoff operations access state through the current session
 *
 * FIXES:
 * - BUG #1: Global state (currentAgent, handoffHistory) is per-module not per-session
 * - BUG #2: metPersonas set is global - persists incorrectly across users
 * - BUG #3: perPersonaMeetingCount/LastTopic maps are global not per-session
 * - BUG #4: conversationContext is global - overwritten by concurrent sessions
 */
import type { AgentId } from '../agent-bus.js';
export type { HandoffRecord, HandoffContext, HandoffState } from '../../types/handoff.js';
import type { HandoffRecord, HandoffContext, HandoffState } from '../../types/handoff.js';
/**
 * Create a fresh handoff state for a new session
 */
export declare function createHandoffState(initialAgent?: AgentId): HandoffState;
/**
 * Record a handoff in the session state
 */
export declare function recordHandoff(state: HandoffState, from: AgentId, to: AgentId, reason: string): void;
/**
 * Get the last handoff from session state
 */
export declare function getLastHandoff(state: HandoffState): HandoffRecord | undefined;
/**
 * Set the current agent in session state
 */
export declare function setCurrentAgent(state: HandoffState, agent: AgentId): void;
/**
 * Check if a persona has been met in this session
 */
export declare function hasMetPersona(state: HandoffState, personaId: string): boolean;
/**
 * Mark a persona as met
 */
export declare function markPersonaMet(state: HandoffState, personaId: string): void;
/**
 * Increment meeting count for a persona
 */
export declare function incrementMeetingCount(state: HandoffState, personaId: string): number;
/**
 * Set the last topic for a persona
 */
export declare function setLastTopicForPersona(state: HandoffState, personaId: string, topic: string): void;
/**
 * Update user context for mood detection in handoffs
 */
export declare function updateUserContextForHandoff(state: HandoffState, context: {
    lastUserMessage?: string;
    emotionAnalysis?: {
        primary: string;
        intensity: number;
        distressLevel?: number;
    };
}): void;
/**
 * Capture handoff context for continuity
 */
export declare function captureHandoffContext(state: HandoffState, context: Partial<HandoffContext>): void;
/**
 * Get the captured handoff context
 */
export declare function getHandoffContext(state: HandoffState): HandoffContext | null;
/**
 * Format handoff context for the new agent
 */
export declare function formatHandoffContextForAgent(state: HandoffState): string;
/**
 * Get meeting counts (for persistence)
 */
export declare function getMeetingCounts(state: HandoffState): Record<string, number>;
/**
 * Get last topics per persona (for persistence)
 */
export declare function getLastTopicsPerPersona(state: HandoffState): Record<string, string>;
/**
 * Initialize from persisted data (e.g., user profile)
 */
export declare function initializeFromPersistedData(state: HandoffState, data: {
    meetingCounts?: Record<string, number>;
    lastTopics?: Record<string, string>;
}): void;
/**
 * Check if a handoff is allowed (rate limiting)
 */
export declare function isHandoffAllowed(state: HandoffState): boolean;
/**
 * Analytics summary for handoff patterns
 */
export interface HandoffAnalytics {
    totalHandoffs: number;
    handoffsByAgent: Record<string, number>;
    averageTimeByAgent: Record<string, number>;
    commonRoutes: Array<{
        from: string;
        to: string;
        count: number;
    }>;
    pingPongCount: number;
}
/**
 * Get analytics for handoff patterns in this session
 */
export declare function getHandoffAnalytics(state: HandoffState): HandoffAnalytics;
//# sourceMappingURL=handoff-state.d.ts.map