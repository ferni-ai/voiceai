/**
 * Conversation State Service
 *
 * Central service for managing conversation context that all tools can share.
 * Enables human-level conversation by providing:
 * - Shared context across tool calls
 * - Emotional state tracking
 * - Topic management
 * - Natural conversation flow signals
 *
 * USAGE:
 *   const state = getConversationState(userId);
 *   state.setEmotionalContext({ sentiment: 'positive', urgency: 2 });
 *   const emotion = state.getEmotionalContext();
 *
 * PERSISTENCE:
 *   // Enable Firestore persistence
 *   initializeConversationStatePersistence({ firestore: firestoreInstance });
 *
 *   // State is automatically persisted on changes
 *   // and can be recovered on server restart
 */

import { getLogger } from '../utils/safe-logger.js';

import type { Firestore } from 'firebase-admin/firestore';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Emotional context for conversation
 */
export interface EmotionalContext {
  /** Overall sentiment */
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';

  /** Detected emotional states (can be multiple) */
  emotions: Array<
    'happy' | 'excited' | 'calm' | 'anxious' | 'frustrated' | 'sad' | 'confused' | 'grateful'
  >;

  /** Urgency level (1-5, where 5 is most urgent) */
  urgency: number;

  /** User appears fatigued with topic */
  topicFatigue: boolean;

  /** Confidence in this assessment (0-1) */
  confidence: number;

  /** When this was last updated */
  updatedAt: Date;
}

/**
 * Topic being discussed
 */
export interface TopicContext {
  /** Current main topic */
  current: string | null;

  /** Previous topics in this conversation */
  history: Array<{
    topic: string;
    startedAt: Date;
    endedAt?: Date;
    depth: 'shallow' | 'moderate' | 'deep';
  }>;

  /** Topics to circle back to */
  pendingCircleBack: Array<{
    topic: string;
    reason: string;
    mentionedAt: Date;
  }>;
}

/**
 * Conversation flow signals
 */
export interface FlowContext {
  /** Suggest wrapping up the conversation */
  suggestWrapUp: boolean;

  /** Reasons for wrap-up suggestion */
  wrapUpReasons: string[];

  /** Time in conversation (minutes) */
  durationMinutes: number;

  /** Turn count */
  turnCount: number;

  /** Long silence detected */
  silenceDetected: boolean;

  /** User indicated they need to go */
  userWantsToLeave: boolean;
}

/**
 * User facts known in this conversation
 */
export interface UserContext {
  /** User's name (if known) */
  name?: string;

  /** User ID */
  userId: string;

  /** Key moments from this conversation */
  keyMoments: string[];

  /** Preferences expressed */
  preferences: Map<string, string>;

  /** Facts to remember */
  factsToRemember: Array<{
    fact: string;
    category: 'personal' | 'financial' | 'emotional' | 'goal' | 'preference';
    importance: 'low' | 'medium' | 'high';
  }>;
}

/**
 * Tool execution context (passed to tools)
 */
export interface ToolExecutionData {
  /** Last tool that was called */
  lastToolCalled?: string;

  /** Last tool's result summary */
  lastToolResult?: string;

  /** Suggested next tools */
  suggestedNextTools: string[];

  /** Tools to avoid (recently used) */
  recentlyUsedTools: string[];
}

/**
 * Complete conversation state
 */
export interface ConversationState {
  // Identity
  sessionId: string;
  userId: string;
  agentId: string;

  // Contexts
  emotional: EmotionalContext;
  topic: TopicContext;
  flow: FlowContext;
  user: UserContext;
  toolExecution: ToolExecutionData;

  // Timestamps
  startedAt: Date;
  lastActivityAt: Date;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

function createDefaultEmotionalContext(): EmotionalContext {
  return {
    sentiment: 'neutral',
    emotions: [],
    urgency: 3,
    topicFatigue: false,
    confidence: 0.5,
    updatedAt: new Date(),
  };
}

function createDefaultTopicContext(): TopicContext {
  return {
    current: null,
    history: [],
    pendingCircleBack: [],
  };
}

function createDefaultFlowContext(): FlowContext {
  return {
    suggestWrapUp: false,
    wrapUpReasons: [],
    durationMinutes: 0,
    turnCount: 0,
    silenceDetected: false,
    userWantsToLeave: false,
  };
}

function createDefaultUserContext(userId: string): UserContext {
  return {
    userId,
    keyMoments: [],
    preferences: new Map(),
    factsToRemember: [],
  };
}

function createDefaultToolExecutionData(): ToolExecutionData {
  return {
    suggestedNextTools: [],
    recentlyUsedTools: [],
  };
}

// ============================================================================
// CONVERSATION STATE MANAGER
// ============================================================================

/**
 * Manages conversation state for a single session
 */
export class ConversationStateManager {
  private state: ConversationState;
  private logger = getLogger();

  constructor(sessionId: string, userId: string, agentId: string) {
    const now = new Date();

    this.state = {
      sessionId,
      userId,
      agentId,
      emotional: createDefaultEmotionalContext(),
      topic: createDefaultTopicContext(),
      flow: createDefaultFlowContext(),
      user: createDefaultUserContext(userId),
      toolExecution: createDefaultToolExecutionData(),
      startedAt: now,
      lastActivityAt: now,
    };
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  get sessionId(): string {
    return this.state.sessionId;
  }

  get userId(): string {
    return this.state.userId;
  }

  get agentId(): string {
    return this.state.agentId;
  }

  getState(): Readonly<ConversationState> {
    return this.state;
  }

  getEmotionalContext(): Readonly<EmotionalContext> {
    return this.state.emotional;
  }

  getTopicContext(): Readonly<TopicContext> {
    return this.state.topic;
  }

  getFlowContext(): Readonly<FlowContext> {
    return this.state.flow;
  }

  getUserContext(): Readonly<UserContext> {
    return this.state.user;
  }

  getToolExecutionData(): Readonly<ToolExecutionData> {
    return this.state.toolExecution;
  }

  // ============================================================================
  // EMOTIONAL CONTEXT
  // ============================================================================

  setEmotionalContext(updates: Partial<EmotionalContext>): void {
    this.state.emotional = {
      ...this.state.emotional,
      ...updates,
      updatedAt: new Date(),
    };
    this.touch();
    this.logger.debug({ updates }, '💭 Emotional context updated');
  }

  detectEmotion(emotion: EmotionalContext['emotions'][0]): void {
    if (!this.state.emotional.emotions.includes(emotion)) {
      this.state.emotional.emotions.push(emotion);
      this.state.emotional.updatedAt = new Date();
      this.touch();
    }
  }

  setUrgency(level: number): void {
    this.state.emotional.urgency = Math.max(1, Math.min(5, level));
    this.state.emotional.updatedAt = new Date();
    this.touch();
  }

  // ============================================================================
  // TOPIC CONTEXT
  // ============================================================================

  setCurrentTopic(topic: string): void {
    // End previous topic if exists
    if (this.state.topic.current && this.state.topic.history.length > 0) {
      const lastTopic = this.state.topic.history[this.state.topic.history.length - 1];
      if (!lastTopic.endedAt) {
        lastTopic.endedAt = new Date();
      }
    }

    this.state.topic.current = topic;
    this.state.topic.history.push({
      topic,
      startedAt: new Date(),
      depth: 'shallow',
    });
    this.touch();
    this.logger.debug({ topic }, '📍 Topic changed');
  }

  deepenTopic(): void {
    if (this.state.topic.history.length > 0) {
      const current = this.state.topic.history[this.state.topic.history.length - 1];
      if (current.depth === 'shallow') {
        current.depth = 'moderate';
      } else if (current.depth === 'moderate') {
        current.depth = 'deep';
      }
    }
  }

  addCircleBackTopic(topic: string, reason: string): void {
    this.state.topic.pendingCircleBack.push({
      topic,
      reason,
      mentionedAt: new Date(),
    });
    this.touch();
    this.logger.debug({ topic, reason }, '🔄 Circle-back topic added');
  }

  getNextCircleBack(): { topic: string; reason: string } | null {
    if (this.state.topic.pendingCircleBack.length === 0) {
      return null;
    }
    const next = this.state.topic.pendingCircleBack.shift()!;
    return { topic: next.topic, reason: next.reason };
  }

  // ============================================================================
  // FLOW CONTEXT
  // ============================================================================

  incrementTurn(): void {
    this.state.flow.turnCount++;
    this.updateDuration();
    this.checkWrapUpSignals();
    this.touch();
  }

  private updateDuration(): void {
    const now = new Date();
    this.state.flow.durationMinutes = Math.round(
      (now.getTime() - this.state.startedAt.getTime()) / (1000 * 60)
    );
  }

  private checkWrapUpSignals(): void {
    const reasons: string[] = [];

    // Long conversation
    if (this.state.flow.durationMinutes > 30) {
      reasons.push('Long conversation (30+ minutes)');
    }

    // Many turns
    if (this.state.flow.turnCount > 50) {
      reasons.push('Many turns (50+)');
    }

    // User wants to leave
    if (this.state.flow.userWantsToLeave) {
      reasons.push('User indicated they need to go');
    }

    // Topic fatigue
    if (this.state.emotional.topicFatigue) {
      reasons.push('Topic fatigue detected');
    }

    this.state.flow.suggestWrapUp = reasons.length > 0;
    this.state.flow.wrapUpReasons = reasons;
  }

  markSilence(): void {
    this.state.flow.silenceDetected = true;
    this.touch();
  }

  clearSilence(): void {
    this.state.flow.silenceDetected = false;
    this.touch();
  }

  markUserWantsToLeave(): void {
    this.state.flow.userWantsToLeave = true;
    this.checkWrapUpSignals();
    this.touch();
    this.logger.info('👋 User indicated they want to leave');
  }

  shouldWrapUp(): { should: boolean; reasons: string[] } {
    return {
      should: this.state.flow.suggestWrapUp,
      reasons: this.state.flow.wrapUpReasons,
    };
  }

  // ============================================================================
  // USER CONTEXT
  // ============================================================================

  setUserName(name: string): void {
    this.state.user.name = name;
    this.touch();
    this.logger.info({ name }, '👤 User name set');
  }

  addKeyMoment(moment: string): void {
    this.state.user.keyMoments.push(moment);
    this.touch();
  }

  setPreference(key: string, value: string): void {
    this.state.user.preferences.set(key, value);
    this.touch();
  }

  getPreference(key: string): string | undefined {
    return this.state.user.preferences.get(key);
  }

  addFactToRemember(
    fact: string,
    category: UserContext['factsToRemember'][0]['category'],
    importance: UserContext['factsToRemember'][0]['importance']
  ): void {
    this.state.user.factsToRemember.push({ fact, category, importance });
    this.touch();
    this.logger.debug({ fact, category, importance }, '📝 Fact to remember added');
  }

  // ============================================================================
  // TOOL EXECUTION
  // ============================================================================

  recordToolCall(toolName: string, resultSummary?: string): void {
    this.state.toolExecution.lastToolCalled = toolName;
    this.state.toolExecution.lastToolResult = resultSummary;

    // Add to recently used (keep last 5)
    this.state.toolExecution.recentlyUsedTools.unshift(toolName);
    if (this.state.toolExecution.recentlyUsedTools.length > 5) {
      this.state.toolExecution.recentlyUsedTools.pop();
    }

    this.touch();
  }

  suggestNextTools(toolNames: string[]): void {
    this.state.toolExecution.suggestedNextTools = toolNames;
    this.touch();
  }

  shouldAvoidTool(toolName: string): boolean {
    return this.state.toolExecution.recentlyUsedTools.includes(toolName);
  }

  // ============================================================================
  // UTILITY
  // ============================================================================

  private touch(): void {
    this.state.lastActivityAt = new Date();
  }

  /**
   * Get a summary suitable for passing to LLM context
   */
  getSummaryForLLM(): string {
    const parts: string[] = [];

    // User info
    if (this.state.user.name) {
      parts.push(`User: ${this.state.user.name}`);
    }

    // Emotional state
    if (this.state.emotional.emotions.length > 0) {
      parts.push(`Emotions: ${this.state.emotional.emotions.join(', ')}`);
    }
    if (this.state.emotional.urgency !== 3) {
      parts.push(`Urgency: ${this.state.emotional.urgency}/5`);
    }

    // Topic
    if (this.state.topic.current) {
      parts.push(`Current topic: ${this.state.topic.current}`);
    }

    // Key moments
    if (this.state.user.keyMoments.length > 0) {
      parts.push(`Key moments: ${this.state.user.keyMoments.slice(-3).join('; ')}`);
    }

    // Flow
    parts.push(`Turn: ${this.state.flow.turnCount}, Duration: ${this.state.flow.durationMinutes}m`);

    if (this.state.flow.suggestWrapUp) {
      parts.push(`⚠️ Consider wrapping up: ${this.state.flow.wrapUpReasons.join(', ')}`);
    }

    return parts.join('\n');
  }

  /**
   * Export state for persistence
   */
  toJSON(): Record<string, unknown> {
    return {
      ...this.state,
      user: {
        ...this.state.user,
        preferences: Object.fromEntries(this.state.user.preferences),
      },
    };
  }

  /**
   * Import state from persistence
   */
  static fromJSON(data: Record<string, unknown>): ConversationStateManager {
    const manager = new ConversationStateManager(
      data.sessionId as string,
      data.userId as string,
      data.agentId as string
    );

    // Restore state
    const state = data as unknown as ConversationState;
    manager.state = {
      ...state,
      startedAt: new Date(state.startedAt),
      lastActivityAt: new Date(state.lastActivityAt),
      emotional: {
        ...state.emotional,
        updatedAt: new Date(state.emotional.updatedAt),
      },
      topic: {
        ...state.topic,
        history: state.topic.history.map((h) => ({
          ...h,
          startedAt: new Date(h.startedAt),
          endedAt: h.endedAt ? new Date(h.endedAt) : undefined,
        })),
        pendingCircleBack: state.topic.pendingCircleBack.map((p) => ({
          ...p,
          mentionedAt: new Date(p.mentionedAt),
        })),
      },
      user: {
        ...state.user,
        preferences: new Map(
          Object.entries((data.user as Record<string, unknown>).preferences || {})
        ),
      },
    };

    return manager;
  }
}

// ============================================================================
// GLOBAL STATE STORE
// ============================================================================

const activeConversations = new Map<string, ConversationStateManager>();

/**
 * Get or create conversation state for a session
 */
export function getConversationState(
  sessionId: string,
  userId = 'default',
  agentId = 'default'
): ConversationStateManager {
  let state = activeConversations.get(sessionId);

  if (!state) {
    state = new ConversationStateManager(sessionId, userId, agentId);
    activeConversations.set(sessionId, state);
  }

  return state;
}

/**
 * Check if a conversation state exists
 */
export function hasConversationState(sessionId: string): boolean {
  return activeConversations.has(sessionId);
}

/**
 * End a conversation and clean up state
 */
export function endConversation(sessionId: string): ConversationState | null {
  const state = activeConversations.get(sessionId);

  if (state) {
    const finalState = state.getState();
    activeConversations.delete(sessionId);
    return finalState as ConversationState;
  }

  return null;
}

/**
 * Get all active session IDs
 */
export function getActiveSessionIds(): string[] {
  return Array.from(activeConversations.keys());
}

/**
 * Clean up stale conversations (older than maxAgeMinutes)
 */
export function cleanupStaleConversations(maxAgeMinutes = 60): number {
  const now = new Date();
  let cleaned = 0;

  for (const [sessionId, manager] of activeConversations.entries()) {
    const state = manager.getState();
    const ageMinutes = (now.getTime() - state.lastActivityAt.getTime()) / (1000 * 60);

    if (ageMinutes > maxAgeMinutes) {
      activeConversations.delete(sessionId);
      cleaned++;
    }
  }

  return cleaned;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getConversationState,
  hasConversationState,
  endConversation,
  getActiveSessionIds,
  cleanupStaleConversations,
  ConversationStateManager,
};
