/**
 * Unified Handoff State Manager
 *
 * Single source of truth for all handoff state across the application.
 * Consolidates 4 previously separate state systems into one.
 *
 * ## Design Principles
 *
 * 1. **Session-scoped** - Each session gets isolated state
 * 2. **Event-driven** - State changes emit events for observers
 * 3. **Immutable snapshots** - Reads return consistent snapshots
 * 4. **Auto-cleanup** - Expired sessions are automatically evicted
 *
 * @module handoff/unified-state
 */
import { EventEmitter } from 'events';
import type { AgentId } from '../services/agent-bus.js';
import type { HandoffStateSnapshot, HandoffRecord, HandoffContext, HandoffQueueState, ToolExecutionContext, ToolExecutionRecord, StateChangeListener, PendingHandoff } from './types.js';
/**
 * Internal state structure for a session.
 * This combines all the state from the 4 previous systems.
 */
interface InternalSessionState {
    sessionId: string;
    currentAgent: AgentId;
    previousAgent: AgentId | null;
    isInProgress: boolean;
    targetAgent: AgentId | null;
    handoffStartTime: number | null;
    lastHandoffTime: number;
    handoffCount: number;
    pendingHandoffs: PendingHandoff[];
    timeoutTimer: ReturnType<typeof setTimeout> | null;
    progressInterval: ReturnType<typeof setInterval> | null;
    messageSeq: number;
    handoffHistory: HandoffRecord[];
    handoffContext: HandoffContext | null;
    metPersonas: Set<string>;
    perPersonaMeetingCount: Map<string, number>;
    perPersonaLastTopic: Map<string, string>;
    toolExecutionContext: ToolExecutionContext;
    createdAt: number;
    lastActivity: number;
    events: EventEmitter;
}
/**
 * Get or create state for a session.
 */
export declare function getHandoffState(sessionId: string): InternalSessionState;
/**
 * Get immutable snapshot of session state.
 */
export declare function getHandoffSnapshot(sessionId: string): HandoffStateSnapshot;
/**
 * Check if a session exists.
 */
export declare function hasSession(sessionId: string): boolean;
/**
 * Get the current active agent for a session.
 */
export declare function getCurrentAgent(sessionId: string): AgentId;
/**
 * Set the current active agent for a session.
 * Emits 'agent_changed' event.
 */
export declare function setCurrentAgent(sessionId: string, agentId: string): void;
/**
 * Get queue state for handoff handler.
 * This provides backward compatibility with the old session-state.ts interface.
 */
export declare function getHandoffQueueState(sessionId: string): HandoffQueueState;
/**
 * Check if a handoff is in progress.
 */
export declare function isHandoffInProgress(sessionId: string): boolean;
/**
 * Check if session is in a draining state after handoff.
 * This is separate from isHandoffInProgress because:
 * - isInProgress: handoff tool is actively executing
 * - isDraining: handoff just completed, old session is winding down
 *
 * The draining window prevents "Cannot call waitForPlayout from inside function tool" errors.
 */
export declare function isSessionDraining(sessionId: string): boolean;
/**
 * Check if session should skip generateReply calls.
 * Returns true if handoff is in progress OR session is draining.
 */
export declare function shouldSkipGenerateReply(sessionId: string): boolean;
/**
 * Get the next message sequence number (atomically increments).
 */
export declare function getNextMessageSeq(sessionId: string): number;
/**
 * Synchronous version of getNextMessageSeq (no lock needed now that state is unified).
 */
export declare function getNextMessageSeqSync(sessionId: string): number;
/**
 * Mark a handoff as started.
 */
export declare function markHandoffStarted(sessionId: string, targetAgentId: string, context?: HandoffContext): void;
/**
 * Mark a handoff as completed.
 */
export declare function markHandoffCompleted(sessionId: string, success: boolean, record?: Partial<HandoffRecord>): void;
/**
 * Check if handoff is allowed (rate limiting).
 */
export declare function isHandoffAllowed(sessionId: string): boolean;
/**
 * Add a handoff to the pending queue.
 */
export declare function queueHandoff(sessionId: string, pending: PendingHandoff): boolean;
/**
 * Get the next pending handoff from queue.
 */
export declare function dequeueHandoff(sessionId: string): PendingHandoff | undefined;
/**
 * Set the timeout timer for a handoff.
 */
export declare function setHandoffTimeout(sessionId: string, timer: ReturnType<typeof setTimeout>): void;
/**
 * Set the progress heartbeat interval.
 */
export declare function setProgressInterval(sessionId: string, interval: ReturnType<typeof setInterval>): void;
/**
 * Record a tool execution for handoff context transfer.
 */
export declare function recordToolExecution(sessionId: string, record: ToolExecutionRecord): void;
/**
 * Record a routing query for handoff context transfer.
 */
export declare function recordRoutingHistory(sessionId: string, query: string, matches: Array<{
    toolId: string;
    confidence: number;
}>): void;
/**
 * Get tool execution context for handoff.
 */
export declare function getToolContext(sessionId: string): ToolExecutionContext;
/**
 * Get handoff history for a session.
 */
export declare function getHandoffHistory(sessionId: string): readonly HandoffRecord[];
/**
 * Check if user has met a persona.
 */
export declare function hasMetPersona(sessionId: string, personaId: string): boolean;
/**
 * Get all met personas.
 */
export declare function getMetPersonas(sessionId: string): ReadonlySet<string>;
/**
 * Mark a persona as met.
 */
export declare function markPersonaMet(sessionId: string, personaId: string, topic?: string): void;
/**
 * Get per-persona meeting count.
 */
export declare function getPersonaMeetingCount(sessionId: string, personaId: string): number;
/**
 * Subscribe to state changes for a session.
 */
export declare function onStateChange(sessionId: string, listener: StateChangeListener): () => void;
/**
 * Subscribe to global state changes (all sessions).
 */
export declare function onGlobalStateChange(listener: StateChangeListener): () => void;
/**
 * Clear state for a session.
 */
export declare function clearSession(sessionId: string): void;
/**
 * Clear all sessions.
 */
export declare function clearAllSessions(): void;
/**
 * @deprecated Use getHandoffQueueState instead
 */
export declare const getHandoffSessionState: typeof getHandoffQueueState;
/**
 * @deprecated Use clearSession instead
 */
export declare const clearHandoffSessionState: typeof clearSession;
/**
 * @deprecated Use markHandoffStarted instead
 */
export declare function startHandoffInProgress(sessionId: string, targetPersonaId: string): void;
/**
 * @deprecated Use markHandoffCompleted instead
 */
export declare function endHandoffInProgress(sessionId: string): void;
export {};
//# sourceMappingURL=unified-state.d.ts.map