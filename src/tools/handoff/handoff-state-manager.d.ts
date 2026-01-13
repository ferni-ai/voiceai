/**
 * Handoff State Manager
 *
 * Unified, session-scoped state management for handoffs.
 * Replaces the problematic global state that caused cross-session contamination.
 *
 * Key improvements:
 * - Session-scoped ONLY (no global state)
 * - Event-driven state changes (observable)
 * - Immutable state snapshots for consistency
 * - Automatic cleanup on session end
 *
 * @module handoff/handoff-state-manager
 */
import type { AgentId } from '../../services/agent-bus.js';
/**
 * Handoff record for history tracking.
 */
export interface HandoffRecord {
    timestamp: number;
    from: AgentId;
    to: AgentId;
    reason: string;
    duration?: number;
    success?: boolean;
    traceId?: string;
}
/**
 * Immutable state snapshot.
 */
export interface HandoffStateSnapshot {
    readonly sessionId: string;
    readonly currentAgent: AgentId;
    readonly previousAgent: AgentId | null;
    readonly isInProgress: boolean;
    readonly targetAgent: AgentId | null;
    readonly handoffStartTime: number | null;
    readonly lastHandoffTime: number;
    readonly metPersonas: ReadonlySet<string>;
    readonly handoffCount: number;
}
/**
 * State change event types.
 */
export type StateChangeType = 'agent_changed' | 'handoff_started' | 'handoff_completed' | 'handoff_failed' | 'persona_met' | 'state_reset';
/**
 * State change event payload.
 */
export interface StateChangeEvent {
    type: StateChangeType;
    sessionId: string;
    timestamp: number;
    previousState: HandoffStateSnapshot;
    newState: HandoffStateSnapshot;
    data?: Record<string, unknown>;
}
/**
 * Session-scoped handoff state manager.
 *
 * Each session gets its own instance. No global state sharing.
 *
 * @example
 * ```typescript
 * // Get manager for session
 * const manager = HandoffStateManager.getForSession(sessionId);
 *
 * // Subscribe to state changes
 * manager.onChange((event) => {
 *   console.log(`State changed: ${event.type}`);
 * });
 *
 * // Start handoff
 * manager.startHandoff('peter-john', 'User wants research help');
 *
 * // Complete handoff
 * manager.completeHandoff('peter-john');
 *
 * // Get current state
 * const state = manager.getSnapshot();
 * ```
 */
export declare class HandoffStateManager {
    private static instances;
    private static readonly MAX_INSTANCES;
    private static readonly CLEANUP_INTERVAL_MS;
    private static readonly SESSION_TTL_MS;
    private static cleanupTimer;
    /**
     * Get or create state manager for a session.
     */
    static getForSession(sessionId: string): HandoffStateManager;
    /**
     * Check if manager exists for session.
     */
    static hasSession(sessionId: string): boolean;
    /**
     * Remove manager for a session.
     */
    static removeSession(sessionId: string): void;
    /**
     * Get all active session IDs.
     */
    static getActiveSessions(): string[];
    /**
     * Evict the oldest instance.
     */
    private static evictOldestInstance;
    /**
     * Cleanup stale sessions.
     */
    private static cleanupStale;
    private readonly sessionId;
    private events;
    private lastActivity;
    private currentAgent;
    private previousAgent;
    private isInProgress;
    private targetAgent;
    private handoffStartTime;
    private lastHandoffTime;
    private metPersonas;
    private handoffHistory;
    private readonly debounceMs;
    private constructor();
    /**
     * Get immutable state snapshot.
     */
    getSnapshot(): HandoffStateSnapshot;
    /**
     * Get current agent.
     */
    getCurrentAgent(): AgentId;
    /**
     * Check if handoff is in progress.
     */
    isHandoffInProgress(): boolean;
    /**
     * Get target agent (if handoff in progress).
     */
    getTargetAgent(): AgentId | null;
    /**
     * Check if persona has been met this session.
     */
    hasMetPersona(personaId: string): boolean;
    /**
     * Get handoff history.
     */
    getHistory(): readonly HandoffRecord[];
    /**
     * Start a handoff.
     */
    startHandoff(targetAgent: string, reason: string): {
        allowed: boolean;
        error?: string;
    };
    /**
     * Complete a handoff successfully.
     */
    completeHandoff(targetAgent: string, traceId?: string): void;
    /**
     * Fail a handoff.
     */
    failHandoff(error: string, traceId?: string): void;
    /**
     * Set current agent directly (for recovery/sync).
     */
    setCurrentAgent(agent: string): void;
    /**
     * Mark a persona as met.
     */
    markPersonaAsMet(personaId: string): void;
    /**
     * Reset state for new conversation.
     */
    reset(startingAgent?: AgentId): void;
    /**
     * Subscribe to state changes.
     */
    onChange(callback: (event: StateChangeEvent) => void): () => void;
    /**
     * Subscribe to specific state change type.
     */
    on(type: StateChangeType, callback: (event: StateChangeEvent) => void): () => void;
    /**
     * Update last activity time.
     */
    private touch;
    /**
     * Emit a state change event.
     */
    private emitChange;
    /**
     * Dispose manager and clean up resources.
     */
    private dispose;
}
/**
 * Get state manager for session (alias for getForSession).
 */
export declare function getHandoffManager(sessionId: string): HandoffStateManager;
/**
 * Check if session has state manager.
 */
export declare function hasHandoffManager(sessionId: string): boolean;
/**
 * Remove state manager for session.
 */
export declare function removeHandoffManager(sessionId: string): void;
export default HandoffStateManager;
//# sourceMappingURL=handoff-state-manager.d.ts.map