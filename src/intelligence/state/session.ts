/**
 * Centralized Session State Manager
 *
 * Consolidates all session-level state that was previously scattered
 * across multiple Map instances in various modules.
 *
 * Benefits:
 * - Single source of truth for session state
 * - Proper cleanup on session end
 * - Easier debugging and observability
 * - Prevents memory leaks from orphaned Map entries
 *
 * @module intelligence/session-state
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'session-state' });

// ============================================================================
// SESSION STATE TYPES
// ============================================================================

/**
 * Voice emotion state for a session
 */
export interface VoiceEmotionState {
  /** Recent emotion history */
  emotionHistory: string[];
  /** Current emotion */
  currentEmotion?: string;
  /** Emotional arc tracking */
  arc: {
    startEmotion: string;
    currentEmotion: string;
    trend: 'improving' | 'declining' | 'stable';
    significantShifts: Array<{
      from: string;
      to: string;
      turnNumber: number;
    }>;
  } | null;
  /** Total voice samples */
  totalSamples: number;
  /** Average stress level */
  avgStressLevel: number;
  /** Last voice analysis timestamp */
  lastAnalysis?: Date;
}

/**
 * Emotional trajectory tracking
 */
export interface EmotionalTrajectory {
  /** Emotion at session start */
  startEmotion: string;
  /** Current emotion */
  currentEmotion: string;
  /** Overall trend */
  trend: 'improving' | 'stable' | 'declining';
  /** Average distress level */
  avgDistressLevel: number;
  /** Peak distress level */
  peakDistressLevel: number;
  /** Distress history */
  distressHistory: number[];
}

/**
 * Pattern detection state
 */
export interface PatternState {
  /** Tracked patterns */
  patterns: Map<string, PatternData>;
  /** Last turn a pattern was surfaced */
  lastSurfacedTurn: number;
  /** Topic mention counts */
  topicMentions: Map<string, number>;
  /** Emotion by topic */
  emotionByTopic: Map<string, string[]>;
  /** Timing patterns */
  timingPatterns: Map<string, Date[]>;
  /** Topics user avoids */
  avoidedTopics: Map<string, number>;
  /** Stated intentions */
  statedIntentions: Map<string, IntentionData>;
  /** Reported actions */
  reportedActions: Map<string, ActionData>;
}

export interface PatternData {
  type: string;
  occurrences: number;
  lastSeen: Date;
  confidence: number;
}

export interface IntentionData {
  intention: string;
  statedAt: Date;
  turnNumber: number;
}

export interface ActionData {
  action: string;
  reportedAt: Date;
  turnNumber: number;
}

/**
 * Cognitive load state
 */
export interface CognitiveLoadState {
  /** Current load level */
  currentLevel: 'low' | 'moderate' | 'high' | 'overloaded';
  /** Load score (0-1) */
  loadScore: number;
  /** Recent observations */
  observations: Array<{
    indicator: string;
    timestamp: Date;
  }>;
  /** Simplification needed */
  needsSimplification: boolean;
}

/**
 * Conversation flow state
 */
export interface ConversationFlowState {
  /** Current phase */
  phase: string;
  /** Turn count */
  turnCount: number;
  /** Topics discussed */
  topicsDiscussed: string[];
  /** Current topic */
  currentTopic: string | null;
  /** Topics to circle back to */
  topicsToCircleBack: string[];
  /** Key moments */
  keyMoments: Array<{
    summary: string;
    timestamp: Date;
    turnNumber: number;
  }>;
  /** Stories shared */
  storiesShared: string[];
  /** Last user name usage */
  lastNameUsed: number;
  /** Referenced memories (to prevent repetition) */
  referencedMemories: Set<string>;
}

/**
 * Complete session state
 */
export interface SessionState {
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId?: string;
  /** Session start time */
  startTime: Date;
  /** Voice emotion state */
  voiceEmotion: VoiceEmotionState;
  /** Emotional trajectory */
  emotionalTrajectory: EmotionalTrajectory;
  /** Pattern detection state */
  patterns: PatternState;
  /** Cognitive load state */
  cognitiveLoad: CognitiveLoadState;
  /** Conversation flow state */
  conversationFlow: ConversationFlowState;
  /** Custom state (for builders that need session-specific data) */
  custom: Map<string, unknown>;
  /** Last updated */
  lastUpdated: Date;
}

// ============================================================================
// SESSION STATE MANAGER
// ============================================================================

class SessionStateManagerImpl {
  private sessions = new Map<string, SessionState>();

  /**
   * Get or create session state
   */
  get(sessionId: string): SessionState {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, this.createInitialState(sessionId));
      log.debug({ sessionId }, 'Created new session state');
    }
    return this.sessions.get(sessionId)!;
  }

  /**
   * Check if session exists
   */
  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Update session state
   */
  update(sessionId: string, updates: Partial<SessionState>): SessionState {
    const state = this.get(sessionId);
    Object.assign(state, updates, { lastUpdated: new Date() });
    return state;
  }

  /**
   * Set user ID for session
   */
  setUserId(sessionId: string, userId: string): void {
    const state = this.get(sessionId);
    state.userId = userId;
    state.lastUpdated = new Date();
  }

  /**
   * Clear session state
   */
  clear(sessionId: string): void {
    if (this.sessions.has(sessionId)) {
      log.debug({ sessionId }, 'Clearing session state');
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Clear all sessions (for testing)
   */
  clearAll(): void {
    log.debug({ count: this.sessions.size }, 'Clearing all session states');
    this.sessions.clear();
  }

  /**
   * Get all active session IDs
   */
  getActiveSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Cleanup stale sessions (older than maxAge)
   */
  cleanupStaleSessions(maxAgeMs = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    const sessionsToDelete: string[] = [];
    this.sessions.forEach((state, sessionId) => {
      if (now - state.lastUpdated.getTime() > maxAgeMs) {
        sessionsToDelete.push(sessionId);
      }
    });

    for (const sessionId of sessionsToDelete) {
      this.sessions.delete(sessionId);
      cleaned++;
    }

    if (cleaned > 0) {
      log.info({ cleaned, remaining: this.sessions.size }, 'Cleaned up stale sessions');
    }

    return cleaned;
  }

  /**
   * Create initial session state
   */
  private createInitialState(sessionId: string): SessionState {
    return {
      sessionId,
      startTime: new Date(),
      voiceEmotion: {
        emotionHistory: [],
        arc: null,
        totalSamples: 0,
        avgStressLevel: 0,
      },
      emotionalTrajectory: {
        startEmotion: 'neutral',
        currentEmotion: 'neutral',
        trend: 'stable',
        avgDistressLevel: 0,
        peakDistressLevel: 0,
        distressHistory: [],
      },
      patterns: {
        patterns: new Map(),
        lastSurfacedTurn: 0,
        topicMentions: new Map(),
        emotionByTopic: new Map(),
        timingPatterns: new Map(),
        avoidedTopics: new Map(),
        statedIntentions: new Map(),
        reportedActions: new Map(),
      },
      cognitiveLoad: {
        currentLevel: 'low',
        loadScore: 0,
        observations: [],
        needsSimplification: false,
      },
      conversationFlow: {
        phase: 'greeting',
        turnCount: 0,
        topicsDiscussed: [],
        currentTopic: null,
        topicsToCircleBack: [],
        keyMoments: [],
        storiesShared: [],
        lastNameUsed: 0,
        referencedMemories: new Set(),
      },
      custom: new Map(),
      lastUpdated: new Date(),
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const SessionStateManager = new SessionStateManagerImpl();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Get session state (shorthand)
 */
export function getSessionState(sessionId: string): SessionState {
  return SessionStateManager.get(sessionId);
}

/**
 * Update voice emotion for session
 */
export function updateVoiceEmotion(
  sessionId: string,
  emotion: string,
  stressLevel: number
): VoiceEmotionState {
  const state = SessionStateManager.get(sessionId);
  const voiceState = state.voiceEmotion;

  // Update history
  voiceState.emotionHistory.push(emotion);
  if (voiceState.emotionHistory.length > 10) {
    voiceState.emotionHistory.shift();
  }

  // Update stats
  voiceState.totalSamples++;
  voiceState.avgStressLevel =
    (voiceState.avgStressLevel * (voiceState.totalSamples - 1) + stressLevel) /
    voiceState.totalSamples;
  voiceState.lastAnalysis = new Date();

  // Update current emotion
  voiceState.currentEmotion = emotion;

  state.lastUpdated = new Date();
  return voiceState;
}

/**
 * Update emotional trajectory
 */
export function updateEmotionalTrajectory(
  sessionId: string,
  emotion: string,
  distressLevel: number
): EmotionalTrajectory {
  const state = SessionStateManager.get(sessionId);
  const trajectory = state.emotionalTrajectory;

  // Set start emotion on first update
  if (trajectory.distressHistory.length === 0) {
    trajectory.startEmotion = emotion;
  }

  // Update current
  trajectory.currentEmotion = emotion;
  trajectory.distressHistory.push(distressLevel);
  trajectory.peakDistressLevel = Math.max(trajectory.peakDistressLevel, distressLevel);

  // Calculate average
  trajectory.avgDistressLevel =
    trajectory.distressHistory.reduce((a, b) => a + b, 0) / trajectory.distressHistory.length;

  // Calculate trend (compare first half to second half)
  if (trajectory.distressHistory.length >= 4) {
    const mid = Math.floor(trajectory.distressHistory.length / 2);
    const firstHalf = trajectory.distressHistory.slice(0, mid);
    const secondHalf = trajectory.distressHistory.slice(mid);

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const diff = secondAvg - firstAvg;
    if (diff < -0.1) {
      trajectory.trend = 'improving';
    } else if (diff > 0.1) {
      trajectory.trend = 'declining';
    } else {
      trajectory.trend = 'stable';
    }
  }

  state.lastUpdated = new Date();
  return trajectory;
}

/**
 * Update cognitive load
 */
export function updateCognitiveLoad(
  sessionId: string,
  indicator: string,
  loadScore: number
): CognitiveLoadState {
  const state = SessionStateManager.get(sessionId);
  const cogLoad = state.cognitiveLoad;

  // Add observation
  cogLoad.observations.push({
    indicator,
    timestamp: new Date(),
  });

  // Keep last 10 observations
  if (cogLoad.observations.length > 10) {
    cogLoad.observations.shift();
  }

  // Update load score (weighted average)
  cogLoad.loadScore = cogLoad.loadScore * 0.7 + loadScore * 0.3;

  // Determine level
  if (cogLoad.loadScore >= 0.8) {
    cogLoad.currentLevel = 'overloaded';
    cogLoad.needsSimplification = true;
  } else if (cogLoad.loadScore >= 0.6) {
    cogLoad.currentLevel = 'high';
    cogLoad.needsSimplification = true;
  } else if (cogLoad.loadScore >= 0.4) {
    cogLoad.currentLevel = 'moderate';
    cogLoad.needsSimplification = false;
  } else {
    cogLoad.currentLevel = 'low';
    cogLoad.needsSimplification = false;
  }

  state.lastUpdated = new Date();
  return cogLoad;
}

/**
 * Record a key moment in the conversation
 */
export function recordKeyMoment(sessionId: string, summary: string): void {
  const state = SessionStateManager.get(sessionId);
  state.conversationFlow.keyMoments.push({
    summary,
    timestamp: new Date(),
    turnNumber: state.conversationFlow.turnCount,
  });
  state.lastUpdated = new Date();
}

/**
 * Increment turn count
 */
export function incrementTurnCount(sessionId: string): number {
  const state = SessionStateManager.get(sessionId);
  state.conversationFlow.turnCount++;
  state.lastUpdated = new Date();
  return state.conversationFlow.turnCount;
}

/**
 * Set custom state for a builder
 */
export function setCustomState<T>(sessionId: string, key: string, value: T): void {
  const state = SessionStateManager.get(sessionId);
  state.custom.set(key, value);
  state.lastUpdated = new Date();
}

/**
 * Get custom state for a builder
 */
export function getCustomState<T>(sessionId: string, key: string): T | undefined {
  const state = SessionStateManager.get(sessionId);
  return state.custom.get(key) as T | undefined;
}

/**
 * Mark a memory as referenced (to prevent repetition)
 */
export function markMemoryReferenced(sessionId: string, memoryId: string): void {
  const state = SessionStateManager.get(sessionId);
  state.conversationFlow.referencedMemories.add(memoryId);
  state.lastUpdated = new Date();
}

/**
 * Check if memory was already referenced
 */
export function wasMemoryReferenced(sessionId: string, memoryId: string): boolean {
  const state = SessionStateManager.get(sessionId);
  return state.conversationFlow.referencedMemories.has(memoryId);
}

// ============================================================================
// COGNITIVE STATE HELPERS
// ============================================================================

/**
 * Cognitive reasoning state for session
 */
export interface CognitiveReasoningState {
  /** Previous reasoning approaches used */
  reasoningHistory: string[];
  /** User messages for style detection */
  userMessages: string[];
  /** Active reasoning chain */
  activeChain: unknown | null;
  /** Detected user cognitive style */
  userStyle: string;
  /** Style confidence */
  styleConfidence: number;
  /** Quirks used this session (to prevent repetition) */
  quirksUsed: Set<string>;
  /** Mental habits used this session */
  habitsUsed: Set<string>;
  /** Shared insights (to prevent repetition) */
  sharedInsights: Set<string>;
  /** Insight cooldowns */
  insightCooldowns: Map<string, number>;
}

const COGNITIVE_STATE_KEY = 'cognitive-reasoning';

/**
 * Get cognitive reasoning state for session
 */
export function getCognitiveState(sessionId: string): CognitiveReasoningState {
  let state = getCustomState<CognitiveReasoningState>(sessionId, COGNITIVE_STATE_KEY);
  if (!state) {
    state = {
      reasoningHistory: [],
      userMessages: [],
      activeChain: null,
      userStyle: 'unknown',
      styleConfidence: 0,
      quirksUsed: new Set(),
      habitsUsed: new Set(),
      sharedInsights: new Set(),
      insightCooldowns: new Map(),
    };
    setCustomState(sessionId, COGNITIVE_STATE_KEY, state);
  }
  return state;
}

/**
 * Update cognitive reasoning history
 */
export function addReasoningApproach(sessionId: string, approach: string): void {
  const state = getCognitiveState(sessionId);
  state.reasoningHistory.push(approach);
  // Keep last 10
  if (state.reasoningHistory.length > 10) {
    state.reasoningHistory.shift();
  }
}

/**
 * Add user message for cognitive style detection
 */
export function addUserMessageForStyleDetection(sessionId: string, message: string): string[] {
  const state = getCognitiveState(sessionId);
  state.userMessages.push(message);
  // Keep last 20
  if (state.userMessages.length > 20) {
    state.userMessages.shift();
  }
  return state.userMessages;
}

/**
 * Update detected user cognitive style
 */
export function updateUserCognitiveStyle(
  sessionId: string,
  style: string,
  confidence: number
): void {
  const state = getCognitiveState(sessionId);
  state.userStyle = style;
  state.styleConfidence = confidence;
}

/**
 * Set active reasoning chain
 */
export function setActiveReasoningChain(sessionId: string, chain: unknown): void {
  const state = getCognitiveState(sessionId);
  state.activeChain = chain;
}

/**
 * Get active reasoning chain
 */
export function getActiveReasoningChain(sessionId: string): unknown | null {
  const state = getCognitiveState(sessionId);
  return state.activeChain;
}

/**
 * Mark a quirk as used
 */
export function markQuirkUsed(sessionId: string, quirkId: string): void {
  const state = getCognitiveState(sessionId);
  state.quirksUsed.add(quirkId);
}

/**
 * Check if quirk was used
 */
export function wasQuirkUsed(sessionId: string, quirkId: string): boolean {
  const state = getCognitiveState(sessionId);
  return state.quirksUsed.has(quirkId);
}

/**
 * Mark a mental habit as used
 */
export function markHabitUsed(sessionId: string, habitId: string): void {
  const state = getCognitiveState(sessionId);
  state.habitsUsed.add(habitId);
}

/**
 * Check if habit was used
 */
export function wasHabitUsed(sessionId: string, habitId: string): boolean {
  const state = getCognitiveState(sessionId);
  return state.habitsUsed.has(habitId);
}

/**
 * Mark an insight as shared
 */
export function markInsightShared(sessionId: string, insightKey: string, turnCount: number): void {
  const state = getCognitiveState(sessionId);
  state.sharedInsights.add(insightKey);
  state.insightCooldowns.set(insightKey, turnCount);
}

/**
 * Check if insight was shared
 */
export function wasInsightShared(sessionId: string, insightKey: string): boolean {
  const state = getCognitiveState(sessionId);
  return state.sharedInsights.has(insightKey);
}

/**
 * Check if insight is on cooldown
 */
export function isInsightOnCooldown(
  sessionId: string,
  insightKey: string,
  currentTurn: number,
  cooldownTurns: number
): boolean {
  const state = getCognitiveState(sessionId);
  const lastUsed = state.insightCooldowns.get(insightKey);
  if (lastUsed === undefined) return false;
  return currentTurn - lastUsed < cooldownTurns;
}

// ============================================================================
// LOVABLE PRESENCE STATE HELPERS
// ============================================================================

/**
 * Lovable presence state for session
 */
export interface LovablePresenceState {
  lastTangent?: number;
  lastSelfDeprecation?: number;
  lastSpecificDetail?: number;
  lastPlayfulMoment?: number;
  lastGenuineReaction?: number;
  tangentsThisSession: number;
  surprisesThisSession: number;
  userSmileSignals: number;
}

const LOVABLE_STATE_KEY = 'lovable-presence';

/**
 * Get lovable presence state for session
 */
export function getLovableState(sessionId: string): LovablePresenceState {
  let state = getCustomState<LovablePresenceState>(sessionId, LOVABLE_STATE_KEY);
  if (!state) {
    state = {
      tangentsThisSession: 0,
      surprisesThisSession: 0,
      userSmileSignals: 0,
    };
    setCustomState(sessionId, LOVABLE_STATE_KEY, state);
  }
  return state;
}

/**
 * Update lovable presence state
 */
export function updateLovableState(
  sessionId: string,
  updates: Partial<LovablePresenceState>
): LovablePresenceState {
  const state = getLovableState(sessionId);
  Object.assign(state, updates);
  return state;
}

// ============================================================================
// SESSION FLOW STATE HELPERS
// ============================================================================

/**
 * Session flow tracking state
 */
export interface SessionFlowTrackingState {
  lastTrackedEmotion: string | null;
  emotionShiftCount: number;
  lastSignificantMoment: number;
  topicChanges: number;
  questionAsked: number;
  storiesShared: number;
}

const SESSION_FLOW_KEY = 'session-flow-tracking';

/**
 * Get session flow tracking state
 */
export function getSessionFlowState(sessionId: string): SessionFlowTrackingState {
  let state = getCustomState<SessionFlowTrackingState>(sessionId, SESSION_FLOW_KEY);
  if (!state) {
    state = {
      lastTrackedEmotion: null,
      emotionShiftCount: 0,
      lastSignificantMoment: 0,
      topicChanges: 0,
      questionAsked: 0,
      storiesShared: 0,
    };
    setCustomState(sessionId, SESSION_FLOW_KEY, state);
  }
  return state;
}

/**
 * Update session flow tracking state
 */
export function updateSessionFlowState(
  sessionId: string,
  updates: Partial<SessionFlowTrackingState>
): SessionFlowTrackingState {
  const state = getSessionFlowState(sessionId);
  Object.assign(state, updates);
  return state;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default SessionStateManager;
