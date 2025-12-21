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
import { HANDOFF_TIMING } from '../../config/handoff-timing.js';
import { normalizeAgentIdSync } from '../../personas/agent-directory.js';
import type { AgentId } from '../../services/agent-bus.js';
import { resilienceMetrics } from '../../services/observability/resilience-metrics.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { HandoffContext, HandoffRecord } from './types.js';

// ============================================================================
// SESSION STATE TYPE
// ============================================================================

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
  lastEmotionAnalysis: { primary: string; intensity: number; distressLevel?: number } | undefined;

  /** Per-persona meeting counts */
  perPersonaMeetingCount: Map<string, number>;

  /** Per-persona last topics */
  perPersonaLastTopic: Map<string, string>;

  /** Cached agent context */
  cachedAgentContext: { agentId: string; context: string } | null;

  /** Session event emitter */
  events: EventEmitter;
}

// ============================================================================
// SESSION STATE STORE
// ============================================================================

// FIX BUG #7: Add last activity tracking for TTL-based eviction
interface SessionStateWithMeta {
  state: HandoffSessionState;
  lastActivity: number;
  createdAt: number;
}

const sessionStates = new Map<string, SessionStateWithMeta>();
const MAX_SESSIONS = 100; // Prevent unbounded growth

// FIX BUG #7: TTL-based eviction constants
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes of inactivity
const EVICTION_CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

// FIX BUG #10: Handoff handler constants (extracted from magic numbers)
export const HANDOFF_TIMEOUT_MS = HANDOFF_TIMING.HANDOFF_TIMEOUT_MS;
export const MAX_HANDOFF_QUEUE_SIZE = 10;
export const PROGRESS_HEARTBEAT_INTERVAL_MS = 2000;

// Handoff handler session state (for queuing/timeout tracking)
interface HandoffHandlerState {
  isHandoffInProgress: boolean;
  handoffStartTime: number | null;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  pendingHandoffs: unknown[];
  progressHeartbeat: ReturnType<typeof setInterval> | null;
  messageSeq: number;
}

const handoffHandlerStates = new Map<string, HandoffHandlerState>();

/**
 * Get handoff handler state for a session (for queuing/timeout tracking)
 */
export function getHandoffSessionState(sessionId: string): HandoffHandlerState {
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
export function getNextMessageSeq(sessionId: string): number {
  const state = getHandoffSessionState(sessionId);
  return ++state.messageSeq;
}

/**
 * Start progress heartbeat for handoff UI feedback
 */
export function startProgressHeartbeat(
  sessionId: string,
  callback: (info: { elapsedMs: number; timeoutMs: number }) => void
): () => void {
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
export function stopProgressHeartbeat(sessionId: string): void {
  const state = handoffHandlerStates.get(sessionId);
  if (state?.progressHeartbeat) {
    clearInterval(state.progressHeartbeat);
    state.progressHeartbeat = null;
  }
}

/**
 * Clear handoff session state (call on session end)
 */
export function clearHandoffSessionState(sessionId: string): void {
  const state = handoffHandlerStates.get(sessionId);
  if (state) {
    if (state.timeoutTimer) clearTimeout(state.timeoutTimer);
    if (state.progressHeartbeat) clearInterval(state.progressHeartbeat);
    handoffHandlerStates.delete(sessionId);
  }
}

/**
 * FIX BUG #7: Evict sessions based on TTL (inactivity)
 * This runs periodically to clean up stale sessions
 */
function evictStaleSessions(): void {
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
    getLogger().info(
      { evictedCount, remainingSessions: sessionStates.size },
      'Evicted stale sessions based on TTL'
    );

    // Record eviction metrics
    resilienceMetrics.recordSessionEviction(
      evictedCount,
      sessionStates.size,
      'ttl',
      oldestSessionAge
    );
  }
}

// Start periodic eviction check
setInterval(evictStaleSessions, EVICTION_CHECK_INTERVAL_MS);

/**
 * Create a new session state with default values
 */
function createSessionState(sessionId: string): HandoffSessionState {
  const events = new EventEmitter();
  events.setMaxListeners(20);

  return {
    sessionId,
    currentAgent: 'ferni' as AgentId,
    handoffHistory: [],
    handoffContext: null,
    lastHandoffTimestamp: 0,
    metPersonas: new Set<string>(),
    lastUserMessage: '',
    lastEmotionAnalysis: undefined,
    perPersonaMeetingCount: new Map<string, number>(),
    perPersonaLastTopic: new Map<string, string>(),
    cachedAgentContext: null,
    events,
  };
}

/**
 * Get or create session state for a given session ID.
 * This is the main entry point for session-scoped state.
 * FIX BUG #7: Now uses TTL-based eviction instead of FIFO
 */
export function getSessionState(sessionId: string): HandoffSessionState {
  const now = Date.now();
  let meta = sessionStates.get(sessionId);

  if (!meta) {
    // FIX BUG #7: Evict stale sessions first (before checking capacity)
    evictStaleSessions();

    // Then evict oldest if still at capacity (fallback for high-traffic scenarios)
    if (sessionStates.size >= MAX_SESSIONS) {
      let oldestKey: string | null = null;
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
        getLogger().debug(
          { evictedSession: oldestKey, reason: 'capacity' },
          'Evicted oldest session state'
        );

        // Record capacity-based eviction metrics
        resilienceMetrics.recordSessionEviction(
          1,
          sessionStates.size,
          'capacity',
          oldestSessionAgeMs
        );
      }
    }

    const state = createSessionState(sessionId);
    meta = {
      state,
      lastActivity: now,
      createdAt: now,
    };
    sessionStates.set(sessionId, meta);
    getLogger().debug(
      { sessionId, totalSessions: sessionStates.size },
      'Created new session state'
    );
  } else {
    // FIX BUG #7: Update activity timestamp on access
    meta.lastActivity = now;
  }

  return meta.state;
}

/**
 * Check if a session state exists
 */
export function hasSessionState(sessionId: string): boolean {
  return sessionStates.has(sessionId);
}

/**
 * Remove a session state (call on session end)
 * FIX BUG: Access state.state.events (not state.events) since sessionStates stores SessionStateWithMeta
 */
export function removeSessionState(sessionId: string): void {
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
export function getActiveSessionIds(): string[] {
  return Array.from(sessionStates.keys());
}

// ============================================================================
// SESSION-SCOPED OPERATIONS
// ============================================================================

/**
 * Normalize agent ID to canonical form
 */
export function toCanonicalId(agentId: string): AgentId {
  return normalizeAgentIdSync(agentId) as AgentId;
}

/**
 * Check if two agent IDs refer to the same persona
 */
export function isSameAgent(id1: string, id2: string): boolean {
  return toCanonicalId(id1) === toCanonicalId(id2);
}

/**
 * Check if a handoff is allowed based on rate limiting (session-scoped)
 */
export function isHandoffAllowed(state: HandoffSessionState): boolean {
  const now = Date.now();
  const timeSinceLastHandoff = now - state.lastHandoffTimestamp;

  if (timeSinceLastHandoff < HANDOFF_TIMING.DEBOUNCE_MS) {
    getLogger().warn(
      {
        sessionId: state.sessionId,
        timeSinceLastHandoff,
        minInterval: HANDOFF_TIMING.DEBOUNCE_MS,
      },
      '⏸️ Handoff rate-limited (too soon after last handoff)'
    );
    return false;
  }

  state.lastHandoffTimestamp = now;
  return true;
}

/**
 * Get current agent for a session
 */
export function getCurrentAgent(state: HandoffSessionState): AgentId {
  return state.currentAgent;
}

/**
 * Set current agent for a session
 */
export function setCurrentAgent(state: HandoffSessionState, agent: AgentId): void {
  const canonical = toCanonicalId(agent);
  const previousAgent = state.currentAgent;
  state.currentAgent = canonical;

  // Clear stale context cache
  if (state.cachedAgentContext && state.cachedAgentContext.agentId !== canonical) {
    getLogger().debug(
      {
        sessionId: state.sessionId,
        previousAgent,
        newAgent: canonical,
        cachedAgent: state.cachedAgentContext.agentId,
      },
      'Clearing stale agent context cache on handoff'
    );
    state.cachedAgentContext = null;
  }

  getLogger().info(
    { sessionId: state.sessionId, agent, canonical, previousAgent },
    'Active agent changed'
  );

  state.events.emit('agentChanged', { from: previousAgent, to: canonical });
}

/**
 * Record a handoff in session history
 */
export function recordHandoff(state: HandoffSessionState, record: HandoffRecord): void {
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
export function captureHandoffContext(
  state: HandoffSessionState,
  context: Partial<HandoffContext>
): void {
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
export function hasMetPersona(state: HandoffSessionState, personaId: string): boolean {
  return state.metPersonas.has(toCanonicalId(personaId));
}

/**
 * Mark a persona as met in this session
 */
export function markPersonaAsMet(state: HandoffSessionState, personaId: string): void {
  state.metPersonas.add(toCanonicalId(personaId));
}

/**
 * Update user context for mood detection
 */
export function updateUserContext(
  state: HandoffSessionState,
  context: {
    lastUserMessage?: string;
    emotionAnalysis?: { primary: string; intensity: number; distressLevel?: number };
  }
): void {
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
export function incrementMeetingCount(state: HandoffSessionState, personaId: string): number {
  const current = state.perPersonaMeetingCount.get(personaId) || 0;
  const newCount = current + 1;
  state.perPersonaMeetingCount.set(personaId, newCount);
  return newCount;
}

/**
 * Get meeting count for a persona
 */
export function getMeetingCount(state: HandoffSessionState, personaId: string): number {
  return state.perPersonaMeetingCount.get(personaId) || 0;
}

/**
 * Set last topic for a persona
 */
export function setLastTopic(state: HandoffSessionState, personaId: string, topic: string): void {
  state.perPersonaLastTopic.set(personaId, topic);
}

/**
 * Get last topic for a persona
 */
export function getLastTopic(state: HandoffSessionState, personaId: string): string | undefined {
  return state.perPersonaLastTopic.get(personaId);
}

/**
 * Reset session state (for new conversation within same session)
 */
export function resetSessionState(state: HandoffSessionState): void {
  state.currentAgent = 'ferni' as AgentId;
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
export function initializeFromPersistent(
  state: HandoffSessionState,
  data: {
    meetingCounts?: Record<string, number>;
    lastTopics?: Record<string, string>;
    metPersonas?: string[];
  }
): void {
  if (data.meetingCounts) {
    state.perPersonaMeetingCount = new Map(Object.entries(data.meetingCounts));
  }
  if (data.lastTopics) {
    state.perPersonaLastTopic = new Map(Object.entries(data.lastTopics));
  }
  if (data.metPersonas) {
    data.metPersonas.forEach((p) => state.metPersonas.add(p));
  }

  getLogger().debug(
    {
      sessionId: state.sessionId,
      meetingCountsLoaded: state.perPersonaMeetingCount.size,
      lastTopicsLoaded: state.perPersonaLastTopic.size,
    },
    'Session state initialized from persistent data'
  );
}

/**
 * Export session state for persistence
 */
export function exportForPersistence(state: HandoffSessionState): {
  meetingCounts: Record<string, number>;
  lastTopics: Record<string, string>;
  metPersonas: string[];
} {
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
export function getSessionAnalytics(state: HandoffSessionState): {
  totalHandoffs: number;
  bySource: Record<string, number>;
  byTarget: Record<string, number>;
  avgDuration: number;
} {
  const bySource: Record<string, number> = {};
  const byTarget: Record<string, number> = {};
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


