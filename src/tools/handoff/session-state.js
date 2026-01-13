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
import { registerInterval } from '../../utils/interval-manager.js';
import { EventEmitter } from 'events';
import { HANDOFF_TIMING } from '../../config/handoff-timing.js';
import { normalizeAgentIdSync } from '../../personas/agent-directory.js';
import { resilienceMetrics } from '../../services/observability/resilience-metrics.js';
import { getLogger } from '../../utils/safe-logger.js';
const sessionStates = new Map();
const MAX_SESSIONS = 100; // Prevent unbounded growth
// FIX BUG #7: TTL-based eviction constants
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes of inactivity
const EVICTION_CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
// FIX BUG #10: Handoff handler constants (extracted from magic numbers)
export const HANDOFF_TIMEOUT_MS = HANDOFF_TIMING.HANDOFF_TIMEOUT_MS;
export const MAX_HANDOFF_QUEUE_SIZE = 10;
export const PROGRESS_HEARTBEAT_INTERVAL_MS = 2000;
const handoffHandlerStates = new Map();
/**
 * Get handoff handler state for a session (for queuing/timeout tracking)
 */
export function getHandoffSessionState(sessionId) {
    let state = handoffHandlerStates.get(sessionId);
    if (!state) {
        state = {
            isHandoffInProgress: false,
            handoffStartTime: null,
            timeoutTimer: null,
            pendingHandoffs: [],
            progressHeartbeat: null,
            messageSeq: 0,
        };
        handoffHandlerStates.set(sessionId, state);
    }
    return state;
}
/**
 * Get next message sequence number for a session
 */
export function getNextMessageSeq(sessionId) {
    const state = getHandoffSessionState(sessionId);
    return ++state.messageSeq;
}
/**
 * Start progress heartbeat for handoff UI feedback
 */
export function startProgressHeartbeat(sessionId, callback) {
    const state = getHandoffSessionState(sessionId);
    const startTime = Date.now();
    state.progressHeartbeat = setInterval(() => {
        callback({
            elapsedMs: Date.now() - startTime,
            timeoutMs: HANDOFF_TIMEOUT_MS,
        });
    }, PROGRESS_HEARTBEAT_INTERVAL_MS);
    return () => stopProgressHeartbeat(sessionId);
}
/**
 * Stop progress heartbeat for a session
 */
export function stopProgressHeartbeat(sessionId) {
    const state = handoffHandlerStates.get(sessionId);
    if (state?.progressHeartbeat) {
        clearInterval(state.progressHeartbeat);
        state.progressHeartbeat = null;
    }
}
/**
 * Clear handoff session state (call on session end)
 */
export function clearHandoffSessionState(sessionId) {
    const state = handoffHandlerStates.get(sessionId);
    if (state) {
        if (state.timeoutTimer)
            clearTimeout(state.timeoutTimer);
        if (state.progressHeartbeat)
            clearInterval(state.progressHeartbeat);
        handoffHandlerStates.delete(sessionId);
    }
}
/**
 * FIX BUG #7: Evict sessions based on TTL (inactivity)
 * This runs periodically to clean up stale sessions
 */
function evictStaleSessions() {
    const now = Date.now();
    let evictedCount = 0;
    let oldestSessionAge = 0;
    for (const [sessionId, meta] of sessionStates.entries()) {
        const sessionAge = now - meta.lastActivity;
        if (sessionAge > SESSION_TTL_MS) {
            // Track oldest session age for metrics
            if (sessionAge > oldestSessionAge) {
                oldestSessionAge = sessionAge;
            }
            // Clean up event listeners
            meta.state.events.removeAllListeners();
            sessionStates.delete(sessionId);
            // Also clean up handoff handler state
            clearHandoffSessionState(sessionId);
            evictedCount++;
        }
    }
    if (evictedCount > 0) {
        getLogger().info({ evictedCount, remainingSessions: sessionStates.size }, 'Evicted stale sessions based on TTL');
        // Record eviction metrics
        resilienceMetrics.recordSessionEviction(evictedCount, sessionStates.size, 'ttl', oldestSessionAge);
    }
}
// Start periodic eviction check (managed interval for proper shutdown)
registerInterval('handoff-session-eviction', evictStaleSessions, EVICTION_CHECK_INTERVAL_MS);
/**
 * Create a new session state with default values
 */
function createSessionState(sessionId) {
    const events = new EventEmitter();
    events.setMaxListeners(20);
    return {
        sessionId,
        currentAgent: 'ferni',
        handoffHistory: [],
        handoffContext: null,
        lastHandoffTimestamp: 0,
        metPersonas: new Set(),
        lastUserMessage: '',
        lastEmotionAnalysis: undefined,
        perPersonaMeetingCount: new Map(),
        perPersonaLastTopic: new Map(),
        cachedAgentContext: null,
        events,
        // P0 FIX: Initialize tool execution context
        toolExecutionContext: {
            recentTools: [],
            routingHistory: [],
            activeToolSessions: new Map(),
            frequentTools: [],
        },
    };
}
/**
 * Get or create session state for a given session ID.
 * This is the main entry point for session-scoped state.
 * FIX BUG #7: Now uses TTL-based eviction instead of FIFO
 */
export function getSessionState(sessionId) {
    const now = Date.now();
    let meta = sessionStates.get(sessionId);
    if (!meta) {
        // FIX BUG #7: Evict stale sessions first (before checking capacity)
        evictStaleSessions();
        // Then evict oldest if still at capacity (fallback for high-traffic scenarios)
        if (sessionStates.size >= MAX_SESSIONS) {
            let oldestKey = null;
            let oldestActivity = Infinity;
            for (const [key, m] of sessionStates.entries()) {
                if (m.lastActivity < oldestActivity) {
                    oldestActivity = m.lastActivity;
                    oldestKey = key;
                }
            }
            if (oldestKey) {
                const oldestSessionAgeMs = now - oldestActivity;
                const oldMeta = sessionStates.get(oldestKey);
                if (oldMeta) {
                    oldMeta.state.events.removeAllListeners();
                }
                sessionStates.delete(oldestKey);
                clearHandoffSessionState(oldestKey);
                getLogger().debug({ evictedSession: oldestKey, reason: 'capacity' }, 'Evicted oldest session state');
                // Record capacity-based eviction metrics
                resilienceMetrics.recordSessionEviction(1, sessionStates.size, 'capacity', oldestSessionAgeMs);
            }
        }
        const state = createSessionState(sessionId);
        meta = {
            state,
            lastActivity: now,
            createdAt: now,
        };
        sessionStates.set(sessionId, meta);
        getLogger().debug({ sessionId, totalSessions: sessionStates.size }, 'Created new session state');
    }
    else {
        // FIX BUG #7: Update activity timestamp on access
        meta.lastActivity = now;
    }
    return meta.state;
}
/**
 * Check if a session state exists
 */
export function hasSessionState(sessionId) {
    return sessionStates.has(sessionId);
}
/**
 * Remove a session state (call on session end)
 * FIX BUG: Access state.state.events (not state.events) since sessionStates stores SessionStateWithMeta
 */
export function removeSessionState(sessionId) {
    const meta = sessionStates.get(sessionId);
    if (meta) {
        meta.state.events.removeAllListeners();
        sessionStates.delete(sessionId);
        // Also clean up handoff handler state
        clearHandoffSessionState(sessionId);
        getLogger().debug({ sessionId }, 'Removed session state');
    }
}
/**
 * Get all active session IDs (for debugging/monitoring)
 */
export function getActiveSessionIds() {
    return Array.from(sessionStates.keys());
}
// ============================================================================
// SESSION-SCOPED OPERATIONS
// ============================================================================
/**
 * Normalize agent ID to canonical form
 */
export function toCanonicalId(agentId) {
    return normalizeAgentIdSync(agentId);
}
/**
 * Check if two agent IDs refer to the same persona
 */
export function isSameAgent(id1, id2) {
    return toCanonicalId(id1) === toCanonicalId(id2);
}
/**
 * Check if a handoff is allowed based on rate limiting (session-scoped)
 */
export function isHandoffAllowed(state) {
    const now = Date.now();
    const timeSinceLastHandoff = now - state.lastHandoffTimestamp;
    if (timeSinceLastHandoff < HANDOFF_TIMING.DEBOUNCE_MS) {
        getLogger().warn({
            sessionId: state.sessionId,
            timeSinceLastHandoff,
            minInterval: HANDOFF_TIMING.DEBOUNCE_MS,
        }, '⏸️ Handoff rate-limited (too soon after last handoff)');
        return false;
    }
    state.lastHandoffTimestamp = now;
    return true;
}
/**
 * Get current agent for a session
 */
export function getCurrentAgent(state) {
    return state.currentAgent;
}
/**
 * Set current agent for a session
 */
export function setCurrentAgent(state, agent) {
    const canonical = toCanonicalId(agent);
    const previousAgent = state.currentAgent;
    state.currentAgent = canonical;
    // Clear stale context cache
    if (state.cachedAgentContext && state.cachedAgentContext.agentId !== canonical) {
        getLogger().debug({
            sessionId: state.sessionId,
            previousAgent,
            newAgent: canonical,
            cachedAgent: state.cachedAgentContext.agentId,
        }, 'Clearing stale agent context cache on handoff');
        state.cachedAgentContext = null;
    }
    getLogger().info({ sessionId: state.sessionId, agent, canonical, previousAgent }, 'Active agent changed');
    state.events.emit('agentChanged', { from: previousAgent, to: canonical });
}
/**
 * Record a handoff in session history
 */
export function recordHandoff(state, record) {
    state.handoffHistory.push(record);
    // Trim history if too long
    if (state.handoffHistory.length > 100) {
        state.handoffHistory.shift();
    }
    state.events.emit('handoffRecorded', record);
}
/**
 * Capture context for a handoff
 */
export function captureHandoffContext(state, context) {
    state.handoffContext = {
        reason: context.reason || 'user_request',
        conversationSummary: context.conversationSummary,
        userGoal: context.userGoal,
        userData: context.userData,
        timestamp: Date.now(),
    };
}
/**
 * Check if user has met a persona in this session
 */
export function hasMetPersona(state, personaId) {
    return state.metPersonas.has(toCanonicalId(personaId));
}
/**
 * Mark a persona as met in this session
 */
export function markPersonaAsMet(state, personaId) {
    state.metPersonas.add(toCanonicalId(personaId));
}
/**
 * Update user context for mood detection
 */
export function updateUserContext(state, context) {
    if (context.lastUserMessage) {
        state.lastUserMessage = context.lastUserMessage;
    }
    if (context.emotionAnalysis) {
        state.lastEmotionAnalysis = context.emotionAnalysis;
    }
}
/**
 * Increment meeting count for a persona
 */
export function incrementMeetingCount(state, personaId) {
    const current = state.perPersonaMeetingCount.get(personaId) || 0;
    const newCount = current + 1;
    state.perPersonaMeetingCount.set(personaId, newCount);
    return newCount;
}
/**
 * Get meeting count for a persona
 */
export function getMeetingCount(state, personaId) {
    return state.perPersonaMeetingCount.get(personaId) || 0;
}
/**
 * Set last topic for a persona
 */
export function setLastTopic(state, personaId, topic) {
    state.perPersonaLastTopic.set(personaId, topic);
}
/**
 * Get last topic for a persona
 */
export function getLastTopic(state, personaId) {
    return state.perPersonaLastTopic.get(personaId);
}
/**
 * Reset session state (for new conversation within same session)
 */
export function resetSessionState(state) {
    state.currentAgent = 'ferni';
    state.handoffHistory = [];
    state.handoffContext = null;
    state.lastHandoffTimestamp = 0;
    state.metPersonas.clear();
    state.lastUserMessage = '';
    state.lastEmotionAnalysis = undefined;
    state.cachedAgentContext = null;
    // Note: perPersonaMeetingCount and perPersonaLastTopic are preserved
    // across resets as they represent persistent user data
    getLogger().debug({ sessionId: state.sessionId }, 'Session state reset');
}
/**
 * Initialize session state from persistent data (user profile)
 */
export function initializeFromPersistent(state, data) {
    if (data.meetingCounts) {
        state.perPersonaMeetingCount = new Map(Object.entries(data.meetingCounts));
    }
    if (data.lastTopics) {
        state.perPersonaLastTopic = new Map(Object.entries(data.lastTopics));
    }
    if (data.metPersonas) {
        data.metPersonas.forEach((p) => state.metPersonas.add(p));
    }
    getLogger().debug({
        sessionId: state.sessionId,
        meetingCountsLoaded: state.perPersonaMeetingCount.size,
        lastTopicsLoaded: state.perPersonaLastTopic.size,
    }, 'Session state initialized from persistent data');
}
/**
 * Export session state for persistence
 */
export function exportForPersistence(state) {
    return {
        meetingCounts: Object.fromEntries(state.perPersonaMeetingCount),
        lastTopics: Object.fromEntries(state.perPersonaLastTopic),
        metPersonas: Array.from(state.metPersonas),
    };
}
// ============================================================================
// ANALYTICS
// ============================================================================
/**
 * Get handoff analytics for a session
 */
export function getSessionAnalytics(state) {
    const bySource = {};
    const byTarget = {};
    let totalDuration = 0;
    let durationCount = 0;
    for (const record of state.handoffHistory) {
        bySource[record.from] = (bySource[record.from] || 0) + 1;
        byTarget[record.to] = (byTarget[record.to] || 0) + 1;
        if (record.duration) {
            totalDuration += record.duration;
            durationCount++;
        }
    }
    return {
        totalHandoffs: state.handoffHistory.length,
        bySource,
        byTarget,
        avgDuration: durationCount > 0 ? totalDuration / durationCount : 0,
    };
}
// ============================================================================
// TOOL EXECUTION CONTEXT MANAGEMENT (P0 FIX)
// ============================================================================
const MAX_RECENT_TOOLS = 10;
const MAX_ROUTING_HISTORY = 5;
const RESULT_SUMMARY_MAX_LENGTH = 200;
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
export function recordToolExecution(state, execution) {
    const record = {
        ...execution,
        // Truncate result summary to prevent context bloat
        resultSummary: execution.resultSummary.slice(0, RESULT_SUMMARY_MAX_LENGTH),
        timestamp: Date.now(),
    };
    // Add to recent tools (FIFO)
    state.toolExecutionContext.recentTools.push(record);
    if (state.toolExecutionContext.recentTools.length > MAX_RECENT_TOOLS) {
        state.toolExecutionContext.recentTools.shift();
    }
    // Update frequent tools if successful
    if (execution.success) {
        const toolIndex = state.toolExecutionContext.frequentTools.indexOf(execution.toolId);
        if (toolIndex === -1) {
            // Add new tool to frequent list
            state.toolExecutionContext.frequentTools.unshift(execution.toolId);
            if (state.toolExecutionContext.frequentTools.length > 10) {
                state.toolExecutionContext.frequentTools.pop();
            }
        }
        else {
            // Move to front if already in list
            state.toolExecutionContext.frequentTools.splice(toolIndex, 1);
            state.toolExecutionContext.frequentTools.unshift(execution.toolId);
        }
    }
    getLogger().debug({
        sessionId: state.sessionId,
        toolId: execution.toolId,
        success: execution.success,
        recentToolsCount: state.toolExecutionContext.recentTools.length,
    }, 'Tool execution recorded for handoff context');
}
/**
 * Record a routing decision for handoff context.
 */
export function recordRoutingDecision(state, query, matches) {
    state.toolExecutionContext.routingHistory.push({
        query: query.slice(0, 100), // Truncate long queries
        matches: matches.slice(0, 3), // Keep top 3 matches
        timestamp: Date.now(),
    });
    // Keep only recent history
    if (state.toolExecutionContext.routingHistory.length > MAX_ROUTING_HISTORY) {
        state.toolExecutionContext.routingHistory.shift();
    }
}
/**
 * Register an active tool session (e.g., music playing, timer running).
 */
export function registerActiveToolSession(state, sessionKey, toolId, sessionState) {
    state.toolExecutionContext.activeToolSessions.set(sessionKey, {
        toolId,
        state: sessionState,
        startedAt: Date.now(),
    });
    getLogger().debug({ sessionId: state.sessionId, sessionKey, toolId }, 'Active tool session registered');
}
/**
 * Remove an active tool session.
 */
export function removeActiveToolSession(state, sessionKey) {
    state.toolExecutionContext.activeToolSessions.delete(sessionKey);
}
/**
 * Get tool execution context for handoff.
 *
 * Returns a summary of recent tool activity that the new persona can use
 * to understand context and continue seamlessly.
 */
export function getToolContextForHandoff(state) {
    const ctx = state.toolExecutionContext;
    const recentTools = ctx.recentTools.slice(-5); // Last 5 tools
    const activeSessions = Array.from(ctx.activeToolSessions.entries()).map(([key, session]) => ({
        key,
        toolId: session.toolId,
        state: session.state,
    }));
    // Generate human-readable summary for LLM context
    const summaryParts = [];
    if (recentTools.length > 0) {
        const toolList = recentTools.map((t) => t.toolId).join(', ');
        summaryParts.push(`Recent tools used: ${toolList}`);
    }
    if (activeSessions.length > 0) {
        const activeList = activeSessions.map((s) => s.toolId).join(', ');
        summaryParts.push(`Currently active: ${activeList}`);
    }
    if (ctx.routingHistory.length > 0) {
        const lastQuery = ctx.routingHistory[ctx.routingHistory.length - 1].query;
        summaryParts.push(`Last request: "${lastQuery}"`);
    }
    return {
        recentTools,
        activeToolSessions: activeSessions,
        frequentTools: ctx.frequentTools.slice(0, 5),
        lastRoutingQuery: ctx.routingHistory.length > 0
            ? ctx.routingHistory[ctx.routingHistory.length - 1].query
            : null,
        summary: summaryParts.length > 0 ? summaryParts.join('. ') : 'No recent tool activity.',
    };
}
/**
 * Clear tool execution context (for testing or session reset).
 */
export function clearToolExecutionContext(state) {
    state.toolExecutionContext = {
        recentTools: [],
        routingHistory: [],
        activeToolSessions: new Map(),
        frequentTools: [],
    };
}
//# sourceMappingURL=session-state.js.map