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

import { getLogger } from '../utils/safe-logger.js';
import type { AgentId } from '../services/agent-bus.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Record of a single handoff for analytics/debugging
 */
export interface HandoffRecord {
  timestamp: number;
  from: AgentId;
  to: AgentId;
  reason: string;
  duration?: number;
}

/**
 * Context preserved across handoffs for conversation continuity
 */
export interface HandoffContext {
  topics: string[];
  emotionalState: string;
  summary: string;
  pendingItems: string[];
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/**
 * Per-session handoff state
 */
export interface HandoffState {
  /** Current active agent (canonical ID) */
  currentAgent: AgentId;

  /** Timestamp of last handoff (for rate limiting) */
  lastHandoffTimestamp: number;

  /** History of handoffs in this session (for analytics) */
  handoffHistory: HandoffRecord[];

  /** Set of personas user has met this session (for first-meeting detection) */
  metPersonas: Set<string>;

  /** Per-persona meeting count (for relationship-aware greetings) */
  perPersonaMeetingCount: Map<string, number>;

  /** Per-persona last topic discussed */
  perPersonaLastTopic: Map<string, string>;

  /** Conversation context for handoff continuity */
  conversationContext: HandoffContext | null;

  /** Last user message for mood detection */
  lastUserMessageForMood?: string;

  /** Last emotion analysis for mood detection */
  lastEmotionAnalysisForMood?: {
    primary: string;
    intensity: number;
    distressLevel?: number;
  };
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a fresh handoff state for a new session
 */
export function createHandoffState(initialAgent: AgentId = 'ferni'): HandoffState {
  return {
    currentAgent: initialAgent,
    lastHandoffTimestamp: 0,
    handoffHistory: [],
    metPersonas: new Set([initialAgent]), // User starts by meeting initial agent
    perPersonaMeetingCount: new Map([[initialAgent, 1]]),
    perPersonaLastTopic: new Map(),
    conversationContext: null,
    lastUserMessageForMood: undefined,
    lastEmotionAnalysisForMood: undefined,
  };
}

// ============================================================================
// STATE OPERATIONS
// ============================================================================

const MAX_HISTORY_LENGTH = 50;

/**
 * Record a handoff in the session state
 */
export function recordHandoff(
  state: HandoffState,
  from: AgentId,
  to: AgentId,
  reason: string
): void {
  const now = Date.now();
  const lastRecord = state.handoffHistory[state.handoffHistory.length - 1];

  const record: HandoffRecord = {
    timestamp: now,
    from,
    to,
    reason,
    duration: lastRecord ? now - lastRecord.timestamp : undefined,
  };

  state.handoffHistory.push(record);

  // Trim history if too long
  if (state.handoffHistory.length > MAX_HISTORY_LENGTH) {
    state.handoffHistory.shift();
  }

  // Update last handoff timestamp
  state.lastHandoffTimestamp = now;

  getLogger().debug(
    {
      handoff: record,
      historyLength: state.handoffHistory.length,
    },
    'Handoff recorded in session state'
  );
}

/**
 * Get the last handoff from session state
 */
export function getLastHandoff(state: HandoffState): HandoffRecord | undefined {
  return state.handoffHistory[state.handoffHistory.length - 1];
}

/**
 * Set the current agent in session state
 */
export function setCurrentAgent(state: HandoffState, agent: AgentId): void {
  state.currentAgent = agent;
  getLogger().debug({ agent }, 'Current agent updated in session state');
}

/**
 * Check if a persona has been met in this session
 */
export function hasMetPersona(state: HandoffState, personaId: string): boolean {
  return state.metPersonas.has(personaId);
}

/**
 * Mark a persona as met
 */
export function markPersonaMet(state: HandoffState, personaId: string): void {
  state.metPersonas.add(personaId);
}

/**
 * Increment meeting count for a persona
 */
export function incrementMeetingCount(state: HandoffState, personaId: string): number {
  const current = state.perPersonaMeetingCount.get(personaId) || 0;
  const newCount = current + 1;
  state.perPersonaMeetingCount.set(personaId, newCount);
  return newCount;
}

/**
 * Set the last topic for a persona
 */
export function setLastTopicForPersona(
  state: HandoffState,
  personaId: string,
  topic: string
): void {
  state.perPersonaLastTopic.set(personaId, topic);
}

/**
 * Update user context for mood detection in handoffs
 */
export function updateUserContextForHandoff(
  state: HandoffState,
  context: {
    lastUserMessage?: string;
    emotionAnalysis?: { primary: string; intensity: number; distressLevel?: number };
  }
): void {
  if (context.lastUserMessage) {
    state.lastUserMessageForMood = context.lastUserMessage;
  }
  if (context.emotionAnalysis) {
    state.lastEmotionAnalysisForMood = context.emotionAnalysis;
  }
}

/**
 * Capture handoff context for continuity
 */
export function captureHandoffContext(state: HandoffState, context: Partial<HandoffContext>): void {
  state.conversationContext = {
    topics: context.topics || [],
    emotionalState: context.emotionalState || 'neutral',
    summary: context.summary || '',
    pendingItems: context.pendingItems || [],
    recentMessages: context.recentMessages || [],
  };

  getLogger().info(
    {
      topics: state.conversationContext.topics,
      emotionalState: state.conversationContext.emotionalState,
    },
    'Captured handoff context in session state'
  );
}

/**
 * Get the captured handoff context
 */
export function getHandoffContext(state: HandoffState): HandoffContext | null {
  return state.conversationContext;
}

/**
 * Format handoff context for the new agent
 */
export function formatHandoffContextForAgent(state: HandoffState): string {
  const ctx = state.conversationContext;
  if (!ctx) return '';

  const parts: string[] = [];

  if (ctx.topics.length > 0) {
    parts.push(`Topics discussed: ${ctx.topics.join(', ')}`);
  }

  if (ctx.emotionalState && ctx.emotionalState !== 'neutral') {
    parts.push(`User's mood: ${ctx.emotionalState}`);
  }

  if (ctx.summary) {
    parts.push(`Summary: ${ctx.summary}`);
  }

  if (ctx.pendingItems.length > 0) {
    parts.push(`Pending: ${ctx.pendingItems.join(', ')}`);
  }

  return parts.length > 0 ? `[HANDOFF CONTEXT]\n${parts.join('\n')}` : '';
}

/**
 * Get meeting counts (for persistence)
 */
export function getMeetingCounts(state: HandoffState): Record<string, number> {
  return Object.fromEntries(state.perPersonaMeetingCount);
}

/**
 * Get last topics per persona (for persistence)
 */
export function getLastTopicsPerPersona(state: HandoffState): Record<string, string> {
  return Object.fromEntries(state.perPersonaLastTopic);
}

/**
 * Initialize from persisted data (e.g., user profile)
 */
export function initializeFromPersistedData(
  state: HandoffState,
  data: {
    meetingCounts?: Record<string, number>;
    lastTopics?: Record<string, string>;
  }
): void {
  if (data.meetingCounts) {
    state.perPersonaMeetingCount = new Map(Object.entries(data.meetingCounts));
    getLogger().info(
      { count: state.perPersonaMeetingCount.size },
      'Loaded per-persona meeting counts from profile'
    );
  }

  if (data.lastTopics) {
    state.perPersonaLastTopic = new Map(Object.entries(data.lastTopics));
  }
}

// ============================================================================
// RATE LIMITING
// ============================================================================

const MIN_HANDOFF_INTERVAL_MS = 1000;

/**
 * Check if a handoff is allowed (rate limiting)
 */
export function isHandoffAllowed(state: HandoffState): boolean {
  const now = Date.now();
  const timeSinceLastHandoff = now - state.lastHandoffTimestamp;

  if (timeSinceLastHandoff < MIN_HANDOFF_INTERVAL_MS) {
    getLogger().warn(
      {
        timeSinceLastHandoff,
        minInterval: MIN_HANDOFF_INTERVAL_MS,
      },
      '⏸️ Handoff rate-limited (too soon after last handoff)'
    );
    return false;
  }

  return true;
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Analytics summary for handoff patterns
 */
export interface HandoffAnalytics {
  totalHandoffs: number;
  handoffsByAgent: Record<string, number>;
  averageTimeByAgent: Record<string, number>;
  commonRoutes: Array<{ from: string; to: string; count: number }>;
  pingPongCount: number;
}

/**
 * Get analytics for handoff patterns in this session
 */
export function getHandoffAnalytics(state: HandoffState): HandoffAnalytics {
  const history = [...state.handoffHistory];

  const handoffsByAgent: Record<string, number> = {};
  const timeByAgent: Record<string, number[]> = {};
  const routes = new Map<string, number>();
  let pingPongCount = 0;

  for (let i = 0; i < history.length; i++) {
    const record = history[i];

    handoffsByAgent[record.to] = (handoffsByAgent[record.to] || 0) + 1;

    if (record.duration) {
      if (!timeByAgent[record.from]) timeByAgent[record.from] = [];
      timeByAgent[record.from].push(record.duration);
    }

    const route = `${record.from}->${record.to}`;
    routes.set(route, (routes.get(route) || 0) + 1);

    if (i >= 2) {
      const twoBack = history[i - 2];
      if (twoBack.from === record.to && twoBack.to === record.from) {
        pingPongCount++;
      }
    }
  }

  const averageTimeByAgent: Record<string, number> = {};
  for (const [agent, times] of Object.entries(timeByAgent)) {
    averageTimeByAgent[agent] = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  }

  const commonRoutes = Array.from(routes.entries())
    .map(([route, count]) => {
      const [from, to] = route.split('->');
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalHandoffs: history.length,
    handoffsByAgent,
    averageTimeByAgent,
    commonRoutes,
    pingPongCount,
  };
}
