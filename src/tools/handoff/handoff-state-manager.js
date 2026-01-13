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
import { EventEmitter } from 'events';
import { normalizeAgentIdSync } from '../../personas/agent-directory.js';
import { getLogger } from '../../utils/safe-logger.js';
import { HANDOFF_TIMING } from '../../config/handoff-timing.js';
const log = getLogger();
// ============================================================================
// STATE MANAGER CLASS
// ============================================================================
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
export class HandoffStateManager {
    // ========================================================================
    // STATIC INSTANCE MANAGEMENT
    // ========================================================================
    static instances = new Map();
    static MAX_INSTANCES = 100;
    static CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
    static SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
    static cleanupTimer = null;
    /**
     * Get or create state manager for a session.
     */
    static getForSession(sessionId) {
        let manager = this.instances.get(sessionId);
        if (!manager) {
            // Cleanup old instances if at capacity
            if (this.instances.size >= this.MAX_INSTANCES) {
                this.evictOldestInstance();
            }
            manager = new HandoffStateManager(sessionId);
            this.instances.set(sessionId, manager);
            // Start cleanup timer if not running
            if (!this.cleanupTimer) {
                this.cleanupTimer = setInterval(() => this.cleanupStale(), this.CLEANUP_INTERVAL_MS);
            }
            log.debug({ sessionId, totalInstances: this.instances.size }, '📋 Created new HandoffStateManager');
        }
        manager.touch();
        return manager;
    }
    /**
     * Check if manager exists for session.
     */
    static hasSession(sessionId) {
        return this.instances.has(sessionId);
    }
    /**
     * Remove manager for a session.
     */
    static removeSession(sessionId) {
        const manager = this.instances.get(sessionId);
        if (manager) {
            manager.dispose();
            this.instances.delete(sessionId);
            log.debug({ sessionId }, '🗑️ Removed HandoffStateManager');
        }
    }
    /**
     * Get all active session IDs.
     */
    static getActiveSessions() {
        return Array.from(this.instances.keys());
    }
    /**
     * Evict the oldest instance.
     */
    static evictOldestInstance() {
        let oldestSessionId = null;
        let oldestTime = Infinity;
        for (const [sessionId, manager] of this.instances) {
            if (manager.lastActivity < oldestTime) {
                oldestTime = manager.lastActivity;
                oldestSessionId = sessionId;
            }
        }
        if (oldestSessionId) {
            this.removeSession(oldestSessionId);
            log.debug({ sessionId: oldestSessionId }, '⏰ Evicted oldest session');
        }
    }
    /**
     * Cleanup stale sessions.
     */
    static cleanupStale() {
        const now = Date.now();
        const stale = [];
        for (const [sessionId, manager] of this.instances) {
            if (now - manager.lastActivity > this.SESSION_TTL_MS) {
                stale.push(sessionId);
            }
        }
        for (const sessionId of stale) {
            this.removeSession(sessionId);
        }
        if (stale.length > 0) {
            log.info({ count: stale.length }, '🧹 Cleaned up stale sessions');
        }
    }
    // ========================================================================
    // INSTANCE STATE
    // ========================================================================
    sessionId;
    events = new EventEmitter();
    lastActivity = Date.now();
    // Core state
    currentAgent = 'ferni';
    previousAgent = null;
    isInProgress = false;
    targetAgent = null;
    handoffStartTime = null;
    lastHandoffTime = 0;
    metPersonas = new Set(['ferni']);
    handoffHistory = [];
    // Rate limiting
    debounceMs = HANDOFF_TIMING.DEBOUNCE_MS;
    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================
    constructor(sessionId) {
        this.sessionId = sessionId;
        this.events.setMaxListeners(20);
    }
    // ========================================================================
    // STATE ACCESS
    // ========================================================================
    /**
     * Get immutable state snapshot.
     */
    getSnapshot() {
        return {
            sessionId: this.sessionId,
            currentAgent: this.currentAgent,
            previousAgent: this.previousAgent,
            isInProgress: this.isInProgress,
            targetAgent: this.targetAgent,
            handoffStartTime: this.handoffStartTime,
            lastHandoffTime: this.lastHandoffTime,
            metPersonas: new Set(this.metPersonas),
            handoffCount: this.handoffHistory.length,
        };
    }
    /**
     * Get current agent.
     */
    getCurrentAgent() {
        return this.currentAgent;
    }
    /**
     * Check if handoff is in progress.
     */
    isHandoffInProgress() {
        return this.isInProgress;
    }
    /**
     * Get target agent (if handoff in progress).
     */
    getTargetAgent() {
        return this.targetAgent;
    }
    /**
     * Check if persona has been met this session.
     */
    hasMetPersona(personaId) {
        const canonical = normalizeAgentIdSync(personaId);
        return this.metPersonas.has(canonical);
    }
    /**
     * Get handoff history.
     */
    getHistory() {
        return this.handoffHistory;
    }
    // ========================================================================
    // STATE MUTATIONS
    // ========================================================================
    /**
     * Start a handoff.
     */
    startHandoff(targetAgent, reason) {
        this.touch();
        const canonical = normalizeAgentIdSync(targetAgent);
        const previousState = this.getSnapshot();
        // Check if already with this agent
        if (this.currentAgent === canonical) {
            return { allowed: false, error: `Already with ${canonical}` };
        }
        // Check rate limiting
        const now = Date.now();
        if (now - this.lastHandoffTime < this.debounceMs) {
            return { allowed: false, error: 'Rate limited' };
        }
        // Check if already in progress
        if (this.isInProgress) {
            return { allowed: false, error: `Handoff already in progress to ${this.targetAgent}` };
        }
        // Update state
        this.previousAgent = this.currentAgent;
        this.targetAgent = canonical;
        this.isInProgress = true;
        this.handoffStartTime = now;
        // Emit event
        this.emitChange('handoff_started', previousState, { targetAgent: canonical, reason });
        log.info({ sessionId: this.sessionId, from: this.previousAgent, to: canonical, reason }, '🔄 Handoff started');
        return { allowed: true };
    }
    /**
     * Complete a handoff successfully.
     */
    completeHandoff(targetAgent, traceId) {
        this.touch();
        const canonical = normalizeAgentIdSync(targetAgent);
        const previousState = this.getSnapshot();
        const now = Date.now();
        // Verify this is the expected target
        if (this.targetAgent !== canonical) {
            log.warn({ expected: this.targetAgent, received: canonical }, '⚠️ Completing handoff with unexpected target');
        }
        // Record in history
        const record = {
            timestamp: now,
            from: this.previousAgent || this.currentAgent,
            to: canonical,
            reason: 'completed',
            duration: this.handoffStartTime ? now - this.handoffStartTime : undefined,
            success: true,
            traceId,
        };
        this.handoffHistory.push(record);
        // Update state
        this.currentAgent = canonical;
        this.isInProgress = false;
        this.targetAgent = null;
        this.handoffStartTime = null;
        this.lastHandoffTime = now;
        this.metPersonas.add(canonical);
        // Emit event
        this.emitChange('handoff_completed', previousState, { record });
        log.info({ sessionId: this.sessionId, to: canonical, durationMs: record.duration }, '✅ Handoff completed');
    }
    /**
     * Fail a handoff.
     */
    failHandoff(error, traceId) {
        this.touch();
        const previousState = this.getSnapshot();
        const now = Date.now();
        // Record in history
        const record = {
            timestamp: now,
            from: this.previousAgent || this.currentAgent,
            to: this.targetAgent || 'unknown',
            reason: error,
            duration: this.handoffStartTime ? now - this.handoffStartTime : undefined,
            success: false,
            traceId,
        };
        this.handoffHistory.push(record);
        // Reset state (stay with current agent)
        this.isInProgress = false;
        this.targetAgent = null;
        this.handoffStartTime = null;
        // Emit event
        this.emitChange('handoff_failed', previousState, { error, record });
        log.error({ sessionId: this.sessionId, error, from: this.currentAgent }, '❌ Handoff failed');
    }
    /**
     * Set current agent directly (for recovery/sync).
     */
    setCurrentAgent(agent) {
        this.touch();
        const canonical = normalizeAgentIdSync(agent);
        const previousState = this.getSnapshot();
        if (this.currentAgent !== canonical) {
            this.previousAgent = this.currentAgent;
            this.currentAgent = canonical;
            this.metPersonas.add(canonical);
            this.emitChange('agent_changed', previousState, { agent: canonical });
            log.debug({ sessionId: this.sessionId, agent: canonical }, '📋 Current agent set directly');
        }
    }
    /**
     * Mark a persona as met.
     */
    markPersonaAsMet(personaId) {
        this.touch();
        const canonical = normalizeAgentIdSync(personaId);
        const previousState = this.getSnapshot();
        if (!this.metPersonas.has(canonical)) {
            this.metPersonas.add(canonical);
            this.emitChange('persona_met', previousState, { personaId: canonical });
        }
    }
    /**
     * Reset state for new conversation.
     */
    reset(startingAgent = 'ferni') {
        this.touch();
        const previousState = this.getSnapshot();
        this.currentAgent = startingAgent;
        this.previousAgent = null;
        this.isInProgress = false;
        this.targetAgent = null;
        this.handoffStartTime = null;
        this.lastHandoffTime = 0;
        this.metPersonas = new Set([startingAgent]);
        this.handoffHistory = [];
        this.emitChange('state_reset', previousState, { startingAgent });
        log.info({ sessionId: this.sessionId, startingAgent }, '🔄 State reset');
    }
    // ========================================================================
    // EVENT SUBSCRIPTION
    // ========================================================================
    /**
     * Subscribe to state changes.
     */
    onChange(callback) {
        this.events.on('change', callback);
        return () => this.events.off('change', callback);
    }
    /**
     * Subscribe to specific state change type.
     */
    on(type, callback) {
        const handler = (event) => {
            if (event.type === type) {
                callback(event);
            }
        };
        this.events.on('change', handler);
        return () => this.events.off('change', handler);
    }
    // ========================================================================
    // INTERNAL HELPERS
    // ========================================================================
    /**
     * Update last activity time.
     */
    touch() {
        this.lastActivity = Date.now();
    }
    /**
     * Emit a state change event.
     */
    emitChange(type, previousState, data) {
        const event = {
            type,
            sessionId: this.sessionId,
            timestamp: Date.now(),
            previousState,
            newState: this.getSnapshot(),
            data,
        };
        this.events.emit('change', event);
    }
    /**
     * Dispose manager and clean up resources.
     */
    dispose() {
        this.events.removeAllListeners();
        this.handoffHistory = [];
        this.metPersonas.clear();
    }
}
// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================
/**
 * Get state manager for session (alias for getForSession).
 */
export function getHandoffManager(sessionId) {
    return HandoffStateManager.getForSession(sessionId);
}
/**
 * Check if session has state manager.
 */
export function hasHandoffManager(sessionId) {
    return HandoffStateManager.hasSession(sessionId);
}
/**
 * Remove state manager for session.
 */
export function removeHandoffManager(sessionId) {
    HandoffStateManager.removeSession(sessionId);
}
// ============================================================================
// EXPORTS
// ============================================================================
export default HandoffStateManager;
//# sourceMappingURL=handoff-state-manager.js.map