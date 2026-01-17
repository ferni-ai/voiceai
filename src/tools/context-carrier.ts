/**
 * Context Carrier
 *
 * Maintains state across tool calls within a session.
 * This enables tools to be aware of what's happened before
 * in the conversation and coordinate their behavior.
 *
 * Key capabilities:
 * - Track surfaced memories (don't repeat)
 * - Track tools used (personalize suggestions)
 * - Track topics discussed (maintain coherence)
 * - Track emotional journey (adapt tone)
 * - Track pending follow-ups (remember to circle back)
 *
 * @module tools/context-carrier
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'ContextCarrier' });

// ============================================================================
// TYPES
// ============================================================================

export interface ToolUsage {
  toolId: string;
  timestamp: Date;
  result: 'success' | 'failure' | 'partial';
  input?: Record<string, unknown>;
  output?: unknown;
  duration?: number;
}

export interface EmotionalPoint {
  emotion: string;
  intensity: number; // 0-1
  timestamp: Date;
  trigger?: string; // What caused this emotion
}

export interface PendingFollowUp {
  id: string;
  topic: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
  suggestedTool?: string;
}

export interface ContextCarrierState {
  sessionId: string;
  userId: string;
  startedAt: Date;

  // What we've surfaced (don't repeat)
  surfacedMemoryIds: Set<string>;
  surfacedTopics: Set<string>;

  // Tools used this session
  toolsUsed: ToolUsage[];

  // Topics discussed (for coherence)
  topicsDiscussed: string[];

  // Emotional journey (for tone)
  emotionalJourney: EmotionalPoint[];

  // Things to follow up on
  pendingFollowUps: PendingFollowUp[];

  // Personas engaged with
  personasEngaged: Set<string>;

  // Custom data from tools
  toolData: Map<string, unknown>;
}

export interface ContextSnapshot {
  surfacedMemoryCount: number;
  toolsUsedCount: number;
  topTopics: string[];
  currentEmotion: EmotionalPoint | null;
  emotionalTrend: 'improving' | 'stable' | 'declining' | 'volatile';
  pendingFollowUpCount: number;
  sessionDuration: number; // seconds
}

// ============================================================================
// CONTEXT CARRIER
// ============================================================================

class ContextCarrier {
  private sessions = new Map<string, ContextCarrierState>();

  // ==========================================================================
  // SESSION MANAGEMENT
  // ==========================================================================

  /**
   * Start a new session context
   */
  startSession(sessionId: string, userId: string): ContextCarrierState {
    const state: ContextCarrierState = {
      sessionId,
      userId,
      startedAt: new Date(),
      surfacedMemoryIds: new Set(),
      surfacedTopics: new Set(),
      toolsUsed: [],
      topicsDiscussed: [],
      emotionalJourney: [],
      pendingFollowUps: [],
      personasEngaged: new Set(),
      toolData: new Map(),
    };

    this.sessions.set(sessionId, state);
    log.debug({ sessionId, userId }, 'Context carrier session started');

    return state;
  }

  /**
   * Get session state (creates if not exists)
   */
  getSession(sessionId: string, userId?: string): ContextCarrierState {
    let state = this.sessions.get(sessionId);
    if (!state && userId) {
      state = this.startSession(sessionId, userId);
    }
    if (!state) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return state;
  }

  /**
   * End a session
   */
  endSession(sessionId: string): ContextSnapshot | null {
    const state = this.sessions.get(sessionId);
    if (!state) return null;

    const snapshot = this.getSnapshot(sessionId);
    this.sessions.delete(sessionId);

    log.debug({ sessionId, duration: snapshot?.sessionDuration }, 'Context carrier session ended');

    return snapshot;
  }

  // ==========================================================================
  // MEMORY TRACKING
  // ==========================================================================

  /**
   * Record that a memory was surfaced
   */
  recordMemorySurfaced(sessionId: string, memoryId: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.surfacedMemoryIds.add(memoryId);
    }
  }

  /**
   * Check if a memory was already surfaced
   */
  wasMemorySurfaced(sessionId: string, memoryId: string): boolean {
    const state = this.sessions.get(sessionId);
    return state?.surfacedMemoryIds.has(memoryId) ?? false;
  }

  /**
   * Record a topic was discussed
   */
  recordTopicDiscussed(sessionId: string, topic: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.topicsDiscussed.push(topic);
      state.surfacedTopics.add(topic);
    }
  }

  /**
   * Get recent topics (for continuity)
   */
  getRecentTopics(sessionId: string, count = 5): string[] {
    const state = this.sessions.get(sessionId);
    if (!state) return [];
    return state.topicsDiscussed.slice(-count);
  }

  // ==========================================================================
  // TOOL TRACKING
  // ==========================================================================

  /**
   * Record tool usage
   */
  recordToolUsage(
    sessionId: string,
    toolId: string,
    result: 'success' | 'failure' | 'partial',
    options?: { input?: Record<string, unknown>; output?: unknown; duration?: number }
  ): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.toolsUsed.push({
        toolId,
        timestamp: new Date(),
        result,
        ...options,
      });
    }
  }

  /**
   * Get tools used this session
   */
  getToolsUsed(sessionId: string): ToolUsage[] {
    const state = this.sessions.get(sessionId);
    return state?.toolsUsed ?? [];
  }

  /**
   * Check if a tool was used recently
   */
  wasToolUsedRecently(sessionId: string, toolId: string, withinMinutes = 5): boolean {
    const state = this.sessions.get(sessionId);
    if (!state) return false;

    const cutoff = Date.now() - withinMinutes * 60 * 1000;
    return state.toolsUsed.some((t) => t.toolId === toolId && t.timestamp.getTime() > cutoff);
  }

  /**
   * Get tool success rate for this session
   */
  getToolSuccessRate(sessionId: string, toolId?: string): number {
    const state = this.sessions.get(sessionId);
    if (!state) return 0;

    const tools = toolId ? state.toolsUsed.filter((t) => t.toolId === toolId) : state.toolsUsed;

    if (tools.length === 0) return 0;

    const successful = tools.filter((t) => t.result === 'success').length;
    return successful / tools.length;
  }

  // ==========================================================================
  // EMOTIONAL TRACKING
  // ==========================================================================

  /**
   * Record emotional state
   */
  recordEmotion(sessionId: string, emotion: string, intensity: number, trigger?: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.emotionalJourney.push({
        emotion,
        intensity,
        timestamp: new Date(),
        trigger,
      });
    }
  }

  /**
   * Get current emotional state
   */
  getCurrentEmotion(sessionId: string): EmotionalPoint | null {
    const state = this.sessions.get(sessionId);
    if (!state || state.emotionalJourney.length === 0) return null;
    return state.emotionalJourney[state.emotionalJourney.length - 1];
  }

  /**
   * Get emotional trend
   */
  getEmotionalTrend(sessionId: string): 'improving' | 'stable' | 'declining' | 'volatile' {
    const state = this.sessions.get(sessionId);
    if (!state || state.emotionalJourney.length < 2) return 'stable';

    const recent = state.emotionalJourney.slice(-5);
    const positiveEmotions = ['happy', 'excited', 'calm', 'grateful', 'hopeful'];
    const negativeEmotions = ['sad', 'anxious', 'frustrated', 'angry', 'overwhelmed'];

    let positiveCount = 0;
    let negativeCount = 0;
    let changes = 0;

    for (let i = 0; i < recent.length; i++) {
      const emotion = recent[i].emotion.toLowerCase();
      if (positiveEmotions.some((p) => emotion.includes(p))) positiveCount++;
      if (negativeEmotions.some((n) => emotion.includes(n))) negativeCount++;
      if (i > 0 && recent[i].emotion !== recent[i - 1].emotion) changes++;
    }

    // Volatile if many changes
    if (changes >= recent.length - 1) return 'volatile';

    // Trending positive
    if (positiveCount > negativeCount) return 'improving';

    // Trending negative
    if (negativeCount > positiveCount) return 'declining';

    return 'stable';
  }

  // ==========================================================================
  // FOLLOW-UPS
  // ==========================================================================

  /**
   * Add a pending follow-up
   */
  addFollowUp(
    sessionId: string,
    topic: string,
    reason: string,
    priority: 'high' | 'medium' | 'low' = 'medium',
    suggestedTool?: string
  ): string {
    const state = this.sessions.get(sessionId);
    if (!state) return '';

    const followUp: PendingFollowUp = {
      id: `followup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      topic,
      reason,
      priority,
      createdAt: new Date(),
      suggestedTool,
    };

    state.pendingFollowUps.push(followUp);
    return followUp.id;
  }

  /**
   * Get pending follow-ups
   */
  getFollowUps(sessionId: string): PendingFollowUp[] {
    const state = this.sessions.get(sessionId);
    return state?.pendingFollowUps ?? [];
  }

  /**
   * Complete a follow-up
   */
  completeFollowUp(sessionId: string, followUpId: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.pendingFollowUps = state.pendingFollowUps.filter((f) => f.id !== followUpId);
    }
  }

  /**
   * Get highest priority follow-up
   */
  getNextFollowUp(sessionId: string): PendingFollowUp | null {
    const followUps = this.getFollowUps(sessionId);
    if (followUps.length === 0) return null;

    // Sort by priority then age
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    followUps.sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    return followUps[0];
  }

  // ==========================================================================
  // PERSONA TRACKING
  // ==========================================================================

  /**
   * Record persona engagement
   */
  recordPersonaEngaged(sessionId: string, personaId: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.personasEngaged.add(personaId);
    }
  }

  /**
   * Get personas engaged this session
   */
  getPersonasEngaged(sessionId: string): string[] {
    const state = this.sessions.get(sessionId);
    return state ? Array.from(state.personasEngaged) : [];
  }

  // ==========================================================================
  // CUSTOM TOOL DATA
  // ==========================================================================

  /**
   * Store custom data from a tool
   */
  setToolData(sessionId: string, key: string, data: unknown): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.toolData.set(key, data);
    }
  }

  /**
   * Get custom data
   */
  getToolData<T>(sessionId: string, key: string): T | undefined {
    const state = this.sessions.get(sessionId);
    return state?.toolData.get(key) as T | undefined;
  }

  // ==========================================================================
  // SNAPSHOT
  // ==========================================================================

  /**
   * Get a snapshot of the current context
   */
  getSnapshot(sessionId: string): ContextSnapshot | null {
    const state = this.sessions.get(sessionId);
    if (!state) return null;

    // Count topic frequency
    const topicCounts = new Map<string, number>();
    for (const topic of state.topicsDiscussed) {
      topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
    }
    const topTopics = Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([topic]) => topic);

    return {
      surfacedMemoryCount: state.surfacedMemoryIds.size,
      toolsUsedCount: state.toolsUsed.length,
      topTopics,
      currentEmotion: this.getCurrentEmotion(sessionId),
      emotionalTrend: this.getEmotionalTrend(sessionId),
      pendingFollowUpCount: state.pendingFollowUps.length,
      sessionDuration: Math.floor((Date.now() - state.startedAt.getTime()) / 1000),
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let contextCarrierInstance: ContextCarrier | null = null;

export function getContextCarrier(): ContextCarrier {
  if (!contextCarrierInstance) {
    contextCarrierInstance = new ContextCarrier();
  }
  return contextCarrierInstance;
}

export function resetContextCarrier(): void {
  contextCarrierInstance = null;
}

export default {
  ContextCarrier,
  getContextCarrier,
  resetContextCarrier,
};
