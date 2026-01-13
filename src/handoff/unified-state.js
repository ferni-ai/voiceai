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
import { normalizeAgentIdSync } from '../personas/agent-directory.js';
import { getLogger } from '../utils/safe-logger.js';
import { registerInterval } from '../utils/interval-manager.js';
import { HANDOFF_DEBOUNCE_MS, MAX_SESSIONS, SESSION_TTL_MS, EVICTION_CHECK_INTERVAL_MS, MAX_HISTORY_LENGTH, MAX_RECENT_TOOLS, MAX_ROUTING_HISTORY, MAX_PENDING_HANDOFFS, } from './constants.js';
const log = getLogger();
/**
 * Store of all session states.
 */
const sessionStates = new Map();
/**
 * Global event emitter for cross-session events.
 */
const globalEvents = new EventEmitter();
globalEvents.setMaxListeners(50);
// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================
/**
 * Create empty tool execution context.
 */
function createEmptyToolContext() {
    return {
        recentTools: [],
        routingHistory: [],
        activeToolSessions: new Map(),
        frequentTools: [],
    };
}
/**
 * Create initial state for a session.
 */
function createInitialState(sessionId) {
    const now = Date.now();
    return {
        // Core
        sessionId,
        currentAgent: 'ferni',
        previousAgent: null,
        // Handoff tracking
        isInProgress: false,
        targetAgent: null,
        handoffStartTime: null,
        lastHandoffTime: 0,
        handoffCount: 0,
        // Queue
        pendingHandoffs: [],
        timeoutTimer: null,
        progressInterval: null,
        messageSeq: 0,
        // History
        handoffHistory: [],
        handoffContext: null,
        metPersonas: new Set(['ferni']),
        perPersonaMeetingCount: new Map([['ferni', 1]]),
        perPersonaLastTopic: new Map(),
        // Tool context
        toolExecutionContext: createEmptyToolContext(),
        // Metadata
        createdAt: now,
        lastActivity: now,
        // Events
        events: new EventEmitter(),
    };
}
/**
 * Create immutable snapshot of state.
 */
function createSnapshot(state) {
    return Object.freeze({
        sessionId: state.sessionId,
        currentAgent: state.currentAgent,
        previousAgent: state.previousAgent,
        isInProgress: state.isInProgress,
        targetAgent: state.targetAgent,
        handoffStartTime: state.handoffStartTime,
        lastHandoffTime: state.lastHandoffTime,
        metPersonas: new Set(state.metPersonas),
        handoffCount: state.handoffCount,
    });
}
// ============================================================================
// STATE ACCESS
// ============================================================================
/**
 * Get or create state for a session.
 */
export function getHandoffState(sessionId) {
    let state = sessionStates.get(sessionId);
    if (!state) {
        state = createInitialState(sessionId);
        sessionStates.set(sessionId, state);
        log.debug({ sessionId }, '🆕 [HANDOFF] Created new session state');
        // Enforce max sessions
        if (sessionStates.size > MAX_SESSIONS) {
            evictOldestSession();
        }
    }
    state.lastActivity = Date.now();
    return state;
}
/**
 * Get immutable snapshot of session state.
 */
export function getHandoffSnapshot(sessionId) {
    const state = getHandoffState(sessionId);
    return createSnapshot(state);
}
/**
 * Check if a session exists.
 */
export function hasSession(sessionId) {
    return sessionStates.has(sessionId);
}
// ============================================================================
// CURRENT AGENT (backward compatible exports)
// ============================================================================
/**
 * Get the current active agent for a session.
 */
export function getCurrentAgent(sessionId) {
    const state = getHandoffState(sessionId);
    return state.currentAgent;
}
/**
 * Set the current active agent for a session.
 * Emits 'agent_changed' event.
 */
export function setCurrentAgent(sessionId, agentId) {
    const state = getHandoffState(sessionId);
    const previousState = createSnapshot(state);
    const normalizedId = normalizeAgentIdSync(agentId);
    state.previousAgent = state.currentAgent;
    state.currentAgent = normalizedId;
    // Track met personas
    if (!state.metPersonas.has(normalizedId)) {
        state.metPersonas.add(normalizedId);
        const count = state.perPersonaMeetingCount.get(normalizedId) || 0;
        state.perPersonaMeetingCount.set(normalizedId, count + 1);
    }
    emitStateChange(state, previousState, 'agent_changed', { agentId: normalizedId });
    log.debug({ sessionId, from: state.previousAgent, to: normalizedId }, '🔄 [HANDOFF] Current agent changed');
}
// ============================================================================
// QUEUE STATE (backward compatible with agents/shared/handoff/session-state.ts)
// ============================================================================
/**
 * Get queue state for handoff handler.
 * This provides backward compatibility with the old session-state.ts interface.
 */
export function getHandoffQueueState(sessionId) {
    const state = getHandoffState(sessionId);
    return {
        isHandoffInProgress: state.isInProgress,
        pendingHandoffs: state.pendingHandoffs,
        timeoutTimer: state.timeoutTimer,
        handoffStartTime: state.handoffStartTime,
        progressInterval: state.progressInterval,
        targetPersonaId: state.targetAgent,
        previousPersonaId: state.previousAgent,
        messageSeq: state.messageSeq,
    };
}
/**
 * Check if a handoff is in progress.
 */
export function isHandoffInProgress(sessionId) {
    return getHandoffState(sessionId).isInProgress;
}
/**
 * Duration (ms) to consider session "draining" after handoff completes.
 * During this window, the LiveKit SDK may still think we're inside the handoff tool call,
 * causing "circular wait" errors if we try to call generateReply.
 */
const SESSION_DRAINING_WINDOW_MS = 3000;
/**
 * Check if session is in a draining state after handoff.
 * This is separate from isHandoffInProgress because:
 * - isInProgress: handoff tool is actively executing
 * - isDraining: handoff just completed, old session is winding down
 *
 * The draining window prevents "Cannot call waitForPlayout from inside function tool" errors.
 */
export function isSessionDraining(sessionId) {
    const state = getHandoffState(sessionId);
    // If handoff is actively in progress, we're not "draining" yet
    if (state.isInProgress) {
        return false;
    }
    // Check if handoff recently completed (within draining window)
    if (state.lastHandoffTime > 0) {
        const timeSinceHandoff = Date.now() - state.lastHandoffTime;
        return timeSinceHandoff < SESSION_DRAINING_WINDOW_MS;
    }
    return false;
}
/**
 * Check if session should skip generateReply calls.
 * Returns true if handoff is in progress OR session is draining.
 */
export function shouldSkipGenerateReply(sessionId) {
    return isHandoffInProgress(sessionId) || isSessionDraining(sessionId);
}
/**
 * Get the next message sequence number (atomically increments).
 */
export function getNextMessageSeq(sessionId) {
    const state = getHandoffState(sessionId);
    return ++state.messageSeq;
}
/**
 * Synchronous version of getNextMessageSeq (no lock needed now that state is unified).
 */
export function getNextMessageSeqSync(sessionId) {
    return getNextMessageSeq(sessionId);
}
// ============================================================================
// HANDOFF LIFECYCLE
// ============================================================================
/**
 * Mark a handoff as started.
 */
export function markHandoffStarted(sessionId, targetAgentId, context) {
    const state = getHandoffState(sessionId);
    const previousState = createSnapshot(state);
    const normalizedTarget = normalizeAgentIdSync(targetAgentId);
    state.isInProgress = true;
    state.targetAgent = normalizedTarget;
    state.handoffStartTime = Date.now();
    state.handoffContext = context || null;
    emitStateChange(state, previousState, 'handoff_started', {
        target: normalizedTarget,
        reason: context?.reason,
    });
    log.info({ sessionId, target: normalizedTarget, reason: context?.reason }, '🚀 [HANDOFF] Handoff started');
}
/**
 * Mark a handoff as completed.
 */
export function markHandoffCompleted(sessionId, success, record) {
    const state = getHandoffState(sessionId);
    const previousState = createSnapshot(state);
    const duration = state.handoffStartTime ? Date.now() - state.handoffStartTime : 0;
    // Add to history
    if (state.targetAgent) {
        const historyRecord = {
            timestamp: Date.now(),
            from: state.previousAgent || 'ferni',
            to: state.targetAgent,
            reason: state.handoffContext?.reason || 'unknown',
            duration,
            success,
            ...record,
        };
        state.handoffHistory.push(historyRecord);
        // Trim history
        if (state.handoffHistory.length > MAX_HISTORY_LENGTH) {
            state.handoffHistory = state.handoffHistory.slice(-MAX_HISTORY_LENGTH);
        }
    }
    // Clear timeout if set
    if (state.timeoutTimer) {
        clearTimeout(state.timeoutTimer);
        state.timeoutTimer = null;
    }
    if (state.progressInterval) {
        clearInterval(state.progressInterval);
        state.progressInterval = null;
    }
    // Update state
    if (success && state.targetAgent) {
        state.currentAgent = state.targetAgent;
    }
    state.isInProgress = false;
    state.lastHandoffTime = Date.now();
    state.handoffCount++;
    state.targetAgent = null;
    state.handoffStartTime = null;
    emitStateChange(state, previousState, success ? 'handoff_completed' : 'handoff_failed', {
        duration,
        success,
    });
    log.info({ sessionId, success, duration }, '✅ [HANDOFF] Handoff completed');
}
/**
 * Check if handoff is allowed (rate limiting).
 */
export function isHandoffAllowed(sessionId) {
    const state = getHandoffState(sessionId);
    const timeSinceLastHandoff = Date.now() - state.lastHandoffTime;
    if (timeSinceLastHandoff < HANDOFF_DEBOUNCE_MS) {
        log.warn({ sessionId, timeSinceLastHandoff, minInterval: HANDOFF_DEBOUNCE_MS }, '⏸️ [HANDOFF] Rate limited');
        return false;
    }
    if (state.isInProgress) {
        log.warn({ sessionId }, '⏸️ [HANDOFF] Already in progress');
        return false;
    }
    return true;
}
// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================
/**
 * Add a handoff to the pending queue.
 */
export function queueHandoff(sessionId, pending) {
    const state = getHandoffState(sessionId);
    if (state.pendingHandoffs.length >= MAX_PENDING_HANDOFFS) {
        log.warn({ sessionId, queueSize: state.pendingHandoffs.length }, '🚫 [HANDOFF] Queue full');
        return false;
    }
    state.pendingHandoffs.push(pending);
    log.debug({ sessionId, target: pending.targetPersonaId }, '📥 [HANDOFF] Queued');
    return true;
}
/**
 * Get the next pending handoff from queue.
 */
export function dequeueHandoff(sessionId) {
    const state = getHandoffState(sessionId);
    return state.pendingHandoffs.shift();
}
/**
 * Set the timeout timer for a handoff.
 */
export function setHandoffTimeout(sessionId, timer) {
    const state = getHandoffState(sessionId);
    state.timeoutTimer = timer;
}
/**
 * Set the progress heartbeat interval.
 */
export function setProgressInterval(sessionId, interval) {
    const state = getHandoffState(sessionId);
    state.progressInterval = interval;
}
// ============================================================================
// TOOL CONTEXT
// ============================================================================
/**
 * Record a tool execution for handoff context transfer.
 */
export function recordToolExecution(sessionId, record) {
    const state = getHandoffState(sessionId);
    state.toolExecutionContext.recentTools.push(record);
    // Trim to max
    if (state.toolExecutionContext.recentTools.length > MAX_RECENT_TOOLS) {
        state.toolExecutionContext.recentTools =
            state.toolExecutionContext.recentTools.slice(-MAX_RECENT_TOOLS);
    }
}
/**
 * Record a routing query for handoff context transfer.
 */
export function recordRoutingHistory(sessionId, query, matches) {
    const state = getHandoffState(sessionId);
    state.toolExecutionContext.routingHistory.push({
        query,
        matches,
        timestamp: Date.now(),
    });
    // Trim to max
    if (state.toolExecutionContext.routingHistory.length > MAX_ROUTING_HISTORY) {
        state.toolExecutionContext.routingHistory =
            state.toolExecutionContext.routingHistory.slice(-MAX_ROUTING_HISTORY);
    }
}
/**
 * Get tool execution context for handoff.
 */
export function getToolContext(sessionId) {
    return getHandoffState(sessionId).toolExecutionContext;
}
// ============================================================================
// HISTORY & PERSONAS
// ============================================================================
/**
 * Get handoff history for a session.
 */
export function getHandoffHistory(sessionId) {
    return getHandoffState(sessionId).handoffHistory;
}
/**
 * Check if user has met a persona.
 */
export function hasMetPersona(sessionId, personaId) {
    const normalized = normalizeAgentIdSync(personaId);
    return getHandoffState(sessionId).metPersonas.has(normalized);
}
/**
 * Get all met personas.
 */
export function getMetPersonas(sessionId) {
    return getHandoffState(sessionId).metPersonas;
}
/**
 * Mark a persona as met.
 */
export function markPersonaMet(sessionId, personaId, topic) {
    const state = getHandoffState(sessionId);
    const previousState = createSnapshot(state);
    const normalized = normalizeAgentIdSync(personaId);
    const isFirstMeeting = !state.metPersonas.has(normalized);
    state.metPersonas.add(normalized);
    const count = state.perPersonaMeetingCount.get(normalized) || 0;
    state.perPersonaMeetingCount.set(normalized, count + 1);
    if (topic) {
        state.perPersonaLastTopic.set(normalized, topic);
    }
    if (isFirstMeeting) {
        emitStateChange(state, previousState, 'persona_met', { personaId: normalized });
    }
}
/**
 * Get per-persona meeting count.
 */
export function getPersonaMeetingCount(sessionId, personaId) {
    const normalized = normalizeAgentIdSync(personaId);
    return getHandoffState(sessionId).perPersonaMeetingCount.get(normalized) || 0;
}
// ============================================================================
// EVENTS
// ============================================================================
/**
 * Emit a state change event.
 */
function emitStateChange(state, previousState, type, data) {
    const event = {
        type,
        sessionId: state.sessionId,
        timestamp: Date.now(),
        previousState,
        newState: createSnapshot(state),
        data,
    };
    // Emit on session-specific emitter
    state.events.emit('change', event);
    state.events.emit(type, event);
    // Emit on global emitter
    globalEvents.emit('change', event);
    globalEvents.emit(type, event);
}
/**
 * Subscribe to state changes for a session.
 */
export function onStateChange(sessionId, listener) {
    const state = getHandoffState(sessionId);
    state.events.on('change', listener);
    return () => state.events.off('change', listener);
}
/**
 * Subscribe to global state changes (all sessions).
 */
export function onGlobalStateChange(listener) {
    globalEvents.on('change', listener);
    return () => globalEvents.off('change', listener);
}
// ============================================================================
// CLEANUP
// ============================================================================
/**
 * Clear state for a session.
 */
export function clearSession(sessionId) {
    const state = sessionStates.get(sessionId);
    if (state) {
        // Clear timers
        if (state.timeoutTimer)
            clearTimeout(state.timeoutTimer);
        if (state.progressInterval)
            clearInterval(state.progressInterval);
        // Remove all listeners
        state.events.removeAllListeners();
        sessionStates.delete(sessionId);
        log.debug({ sessionId }, '🗑️ [HANDOFF] Session cleared');
    }
}
/**
 * Clear all sessions.
 */
export function clearAllSessions() {
    for (const sessionId of sessionStates.keys()) {
        clearSession(sessionId);
    }
    log.info('🗑️ [HANDOFF] All sessions cleared');
}
/**
 * Evict the oldest session.
 */
function evictOldestSession() {
    let oldest = null;
    for (const state of sessionStates.values()) {
        if (!oldest || state.lastActivity < oldest.lastActivity) {
            oldest = state;
        }
    }
    if (oldest) {
        clearSession(oldest.sessionId);
        log.info({ sessionId: oldest.sessionId }, '🗑️ [HANDOFF] Evicted oldest session');
    }
}
/**
 * Evict expired sessions.
 */
function evictExpiredSessions() {
    const now = Date.now();
    const expired = [];
    for (const state of sessionStates.values()) {
        if (now - state.lastActivity > SESSION_TTL_MS) {
            expired.push(state.sessionId);
        }
    }
    for (const sessionId of expired) {
        clearSession(sessionId);
    }
    if (expired.length > 0) {
        log.info({ count: expired.length }, '🗑️ [HANDOFF] Evicted expired sessions');
    }
}
// Start eviction interval
registerInterval('handoff-session-eviction', () => evictExpiredSessions(), EVICTION_CHECK_INTERVAL_MS);
// ============================================================================
// BACKWARD COMPATIBILITY ALIASES
// ============================================================================
/**
 * @deprecated Use getHandoffQueueState instead
 */
export const getHandoffSessionState = getHandoffQueueState;
/**
 * @deprecated Use clearSession instead
 */
export const clearHandoffSessionState = clearSession;
/**
 * @deprecated Use markHandoffStarted instead
 */
export function startHandoffInProgress(sessionId, targetPersonaId) {
    markHandoffStarted(sessionId, targetPersonaId);
}
/**
 * @deprecated Use markHandoffCompleted instead
 */
export function endHandoffInProgress(sessionId) {
    markHandoffCompleted(sessionId, true);
}
//# sourceMappingURL=unified-state.js.map