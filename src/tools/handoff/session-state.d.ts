/**
 * Session-Scoped Handoff State Management
 *
 * This module provides session-isolated state for handoffs, addressing the
 * global state issue where multiple concurrent sessions could interfere.
 *
 * ARCHITECTURE:
 * - Each session gets its own HandoffSessionState instance
 * - State is isolated per sessionId to prevent cross-session interference
 * - Backward-compatible: can fall back to global state for legacy code
 *
 * MIGRATION GUIDE:
 * Old (global): import { getCurrentAgent } from './state.js';
 * New (session): import { getSessionState } from './session-state.js';
 *                const state = getSessionState(sessionId);
 *                const agent = state.getCurrentAgent();
 *
 * @see docs/audits/AGENT-TRANSFER-BUGS-GAPS.md for context
 */
import { EventEmitter } from 'events';
import type { AgentId } from '../../services/agent-bus.js';
import type { HandoffContext, HandoffRecord } from './types.js';
/**
 * Recent tool execution record for handoff context transfer.
 *
 * PROBLEM: When user says "Transfer me to Maya", tool execution context is lost:
 * - Previous tool results not passed
 * - Semantic routing history not transferred
 * - User has to re-explain context
 *
 * SOLUTION: Store recent tool executions and routing history, transfer on handoff.
 */
export interface ToolExecutionRecord {
    /** Tool ID that was executed */
    toolId: string;
    /** Tool arguments */
    args: Record<string, unknown>;
    /** Tool result summary (truncated for context) */
    resultSummary: string;
    /** Whether execution was successful */
    success: boolean;
    /** Timestamp of execution */
    timestamp: number;
    /** Semantic routing confidence (if from router) */
    routingConfidence?: number;
}
/**
 * Tool execution context that persists across handoffs.
 */
export interface ToolExecutionContext {
    /** Recent tool executions (last 10) */
    recentTools: ToolExecutionRecord[];
    /** Semantic routing history (last 5 queries with matches) */
    routingHistory: Array<{
        query: string;
        matches: Array<{
            toolId: string;
            confidence: number;
        }>;
        timestamp: number;
    }>;
    /** Active tool sessions (e.g., music playing, timer running) */
    activeToolSessions: Map<string, {
        toolId: string;
        state: Record<string, unknown>;
        startedAt: number;
    }>;
    /** User's frequent tools (for personalization) */
    frequentTools: string[];
}
export interface HandoffSessionState {
    /** Session identifier */
    readonly sessionId: string;
    /** Current active agent (canonical ID) */
    currentAgent: AgentId;
    /** Handoff history for this session */
    handoffHistory: HandoffRecord[];
    /** Current handoff context */
    handoffContext: HandoffContext | null;
    /** Last handoff timestamp (for rate limiting) */
    lastHandoffTimestamp: number;
    /** Met personas in this session */
    metPersonas: Set<string>;
    /** Last user message (for mood detection) */
    lastUserMessage: string;
    /** Last emotion analysis (for mood detection) */
    lastEmotionAnalysis: {
        primary: string;
        intensity: number;
        distressLevel?: number;
    } | undefined;
    /** Per-persona meeting counts */
    perPersonaMeetingCount: Map<string, number>;
    /** Per-persona last topics */
    perPersonaLastTopic: Map<string, string>;
    /** Cached agent context */
    cachedAgentContext: {
        agentId: string;
        context: string;
    } | null;
    /** Session event emitter */
    events: EventEmitter;
    /**
     * Tool execution context (P0 FIX: Preserved across handoffs)
     * This allows the new persona to understand what tools were used
     * and continue from where the previous persona left off.
     */
    toolExecutionContext: ToolExecutionContext;
}
export declare const HANDOFF_TIMEOUT_MS: 15000;
export declare const MAX_HANDOFF_QUEUE_SIZE = 10;
export declare const PROGRESS_HEARTBEAT_INTERVAL_MS = 2000;
interface HandoffHandlerState {
    isHandoffInProgress: boolean;
    handoffStartTime: number | null;
    timeoutTimer: ReturnType<typeof setTimeout> | null;
    pendingHandoffs: unknown[];
    progressHeartbeat: ReturnType<typeof setInterval> | null;
    messageSeq: number;
}
/**
 * Get handoff handler state for a session (for queuing/timeout tracking)
 */
export declare function getHandoffSessionState(sessionId: string): HandoffHandlerState;
/**
 * Get next message sequence number for a session
 */
export declare function getNextMessageSeq(sessionId: string): number;
/**
 * Start progress heartbeat for handoff UI feedback
 */
export declare function startProgressHeartbeat(sessionId: string, callback: (info: {
    elapsedMs: number;
    timeoutMs: number;
}) => void): () => void;
/**
 * Stop progress heartbeat for a session
 */
export declare function stopProgressHeartbeat(sessionId: string): void;
/**
 * Clear handoff session state (call on session end)
 */
export declare function clearHandoffSessionState(sessionId: string): void;
/**
 * Get or create session state for a given session ID.
 * This is the main entry point for session-scoped state.
 * FIX BUG #7: Now uses TTL-based eviction instead of FIFO
 */
export declare function getSessionState(sessionId: string): HandoffSessionState;
/**
 * Check if a session state exists
 */
export declare function hasSessionState(sessionId: string): boolean;
/**
 * Remove a session state (call on session end)
 * FIX BUG: Access state.state.events (not state.events) since sessionStates stores SessionStateWithMeta
 */
export declare function removeSessionState(sessionId: string): void;
/**
 * Get all active session IDs (for debugging/monitoring)
 */
export declare function getActiveSessionIds(): string[];
/**
 * Normalize agent ID to canonical form
 */
export declare function toCanonicalId(agentId: string): AgentId;
/**
 * Check if two agent IDs refer to the same persona
 */
export declare function isSameAgent(id1: string, id2: string): boolean;
/**
 * Check if a handoff is allowed based on rate limiting (session-scoped)
 */
export declare function isHandoffAllowed(state: HandoffSessionState): boolean;
/**
 * Get current agent for a session
 */
export declare function getCurrentAgent(state: HandoffSessionState): AgentId;
/**
 * Set current agent for a session
 */
export declare function setCurrentAgent(state: HandoffSessionState, agent: AgentId): void;
/**
 * Record a handoff in session history
 */
export declare function recordHandoff(state: HandoffSessionState, record: HandoffRecord): void;
/**
 * Capture context for a handoff
 */
export declare function captureHandoffContext(state: HandoffSessionState, context: Partial<HandoffContext>): void;
/**
 * Check if user has met a persona in this session
 */
export declare function hasMetPersona(state: HandoffSessionState, personaId: string): boolean;
/**
 * Mark a persona as met in this session
 */
export declare function markPersonaAsMet(state: HandoffSessionState, personaId: string): void;
/**
 * Update user context for mood detection
 */
export declare function updateUserContext(state: HandoffSessionState, context: {
    lastUserMessage?: string;
    emotionAnalysis?: {
        primary: string;
        intensity: number;
        distressLevel?: number;
    };
}): void;
/**
 * Increment meeting count for a persona
 */
export declare function incrementMeetingCount(state: HandoffSessionState, personaId: string): number;
/**
 * Get meeting count for a persona
 */
export declare function getMeetingCount(state: HandoffSessionState, personaId: string): number;
/**
 * Set last topic for a persona
 */
export declare function setLastTopic(state: HandoffSessionState, personaId: string, topic: string): void;
/**
 * Get last topic for a persona
 */
export declare function getLastTopic(state: HandoffSessionState, personaId: string): string | undefined;
/**
 * Reset session state (for new conversation within same session)
 */
export declare function resetSessionState(state: HandoffSessionState): void;
/**
 * Initialize session state from persistent data (user profile)
 */
export declare function initializeFromPersistent(state: HandoffSessionState, data: {
    meetingCounts?: Record<string, number>;
    lastTopics?: Record<string, string>;
    metPersonas?: string[];
}): void;
/**
 * Export session state for persistence
 */
export declare function exportForPersistence(state: HandoffSessionState): {
    meetingCounts: Record<string, number>;
    lastTopics: Record<string, string>;
    metPersonas: string[];
};
/**
 * Get handoff analytics for a session
 */
export declare function getSessionAnalytics(state: HandoffSessionState): {
    totalHandoffs: number;
    bySource: Record<string, number>;
    byTarget: Record<string, number>;
    avgDuration: number;
};
/**
 * Record a tool execution in the session context.
 *
 * Call this after each tool execution to maintain context for handoffs.
 *
 * @example
 * ```typescript
 * recordToolExecution(state, {
 *   toolId: 'playMusic',
 *   args: { query: 'jazz' },
 *   resultSummary: 'Playing jazz playlist',
 *   success: true,
 *   routingConfidence: 0.92,
 * });
 * ```
 */
export declare function recordToolExecution(state: HandoffSessionState, execution: Omit<ToolExecutionRecord, 'timestamp'>): void;
/**
 * Record a routing decision for handoff context.
 */
export declare function recordRoutingDecision(state: HandoffSessionState, query: string, matches: Array<{
    toolId: string;
    confidence: number;
}>): void;
/**
 * Register an active tool session (e.g., music playing, timer running).
 */
export declare function registerActiveToolSession(state: HandoffSessionState, sessionKey: string, toolId: string, sessionState: Record<string, unknown>): void;
/**
 * Remove an active tool session.
 */
export declare function removeActiveToolSession(state: HandoffSessionState, sessionKey: string): void;
/**
 * Get tool execution context for handoff.
 *
 * Returns a summary of recent tool activity that the new persona can use
 * to understand context and continue seamlessly.
 */
export declare function getToolContextForHandoff(state: HandoffSessionState): {
    recentTools: ToolExecutionRecord[];
    activeToolSessions: Array<{
        key: string;
        toolId: string;
        state: Record<string, unknown>;
    }>;
    frequentTools: string[];
    lastRoutingQuery: string | null;
    summary: string;
};
/**
 * Clear tool execution context (for testing or session reset).
 */
export declare function clearToolExecutionContext(state: HandoffSessionState): void;
export {};
//# sourceMappingURL=session-state.d.ts.map