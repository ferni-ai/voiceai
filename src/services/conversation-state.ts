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

import { createSessionId, createUserId, type SessionId, type UserId } from '../types/branded.js';
import { getLogger } from '../utils/safe-logger.js';
import { cleanForFirestore, removeUndefined } from '../utils/firestore-utils.js';
import { getDb } from '../utils/safe-firestore.js';

// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================

const USERS_COLLECTION = 'bogle_users';
const CONVERSATION_STATE_DOC = 'conversation_state';

/**
 * Get Firestore instance using shared utility
 * Uses centralized getDb() which handles initialization safely
 */
async function getFirestoreDb(): Promise<FirebaseFirestore.Firestore | null> {
  const db = getDb();
  if (!db) {
    getLogger().debug({}, 'getFirestoreDb: Firestore not available from shared utility');
  }
  return db;
}

/**
 * Debounce helper to avoid too many Firestore writes
 */
const pendingPersists = new Map<string, NodeJS.Timeout>();
const PERSIST_DEBOUNCE_MS = 2000; // Debounce writes by 2 seconds

function debouncedPersist(userId: string, state: ConversationStateManager): void {
  const existing = pendingPersists.get(userId);
  if (existing) {
    clearTimeout(existing);
  }

  const timeout = setTimeout(() => {
    pendingPersists.delete(userId);
    void persistConversationStateToFirestore(state);
  }, PERSIST_DEBOUNCE_MS);

  pendingPersists.set(userId, timeout);
}

/**
 * Persist conversation state to Firestore
 */
async function persistConversationStateToFirestore(
  manager: ConversationStateManager
): Promise<boolean> {
  const log = getLogger();
  try {
    const db = await getFirestoreDb();
    if (!db) {
      log.warn(
        { userId: manager.userId, sessionId: manager.sessionId },
        '💾 PERSIST FAIL: Firestore not available'
      );
      return false;
    }

    const { userId } = manager;
    const path = `${USERS_COLLECTION}/${userId}/${CONVERSATION_STATE_DOC}/latest`;
    const { FieldValue } = await import('firebase-admin/firestore');

    const data = manager.toJSON();

    // Convert dates to ISO strings for Firestore
    const firestoreData = removeUndefined({
      ...data,
      startedAt: data.startedAt instanceof Date ? data.startedAt.toISOString() : data.startedAt,
      lastActivityAt:
        data.lastActivityAt instanceof Date
          ? data.lastActivityAt.toISOString()
          : data.lastActivityAt,
      emotional: {
        ...(data.emotional as Record<string, unknown>),
        updatedAt:
          (data.emotional as Record<string, unknown>).updatedAt instanceof Date
            ? ((data.emotional as Record<string, unknown>).updatedAt as Date).toISOString()
            : (data.emotional as Record<string, unknown>).updatedAt,
      },
      persistedAt: FieldValue.serverTimestamp(),
    });

    await db.doc(path).set(firestoreData);
    log.info(
      { userId, sessionId: manager.sessionId, path },
      '💾 Conversation state persisted to Firestore'
    );
    return true;
  } catch (error) {
    log.warn(
      { error: String(error), userId: manager.userId, sessionId: manager.sessionId },
      'Failed to persist conversation state'
    );
    return false;
  }
}

/**
 * Load conversation state from Firestore
 */
export async function loadConversationStateFromFirestore(
  userId: string
): Promise<Record<string, unknown> | null> {
  try {
    const db = await getFirestoreDb();
    if (!db) return null;

    const path = `${USERS_COLLECTION}/${userId}/${CONVERSATION_STATE_DOC}/latest`;
    const doc = await db.doc(path).get();

    if (!doc.exists) return null;

    const data = doc.data();
    const log = getLogger();
    log.debug({ userId }, '📖 Conversation state loaded from Firestore');
    return data as Record<string, unknown>;
  } catch (error) {
    const log = getLogger();
    log.warn({ userId, error: String(error) }, 'Failed to load conversation state');
    return null;
  }
}

/**
 * Archive conversation state when session ends
 */
async function archiveConversationState(manager: ConversationStateManager): Promise<boolean> {
  const log = getLogger();
  try {
    const db = await getFirestoreDb();
    if (!db) {
      log.warn(
        { userId: manager.userId, sessionId: manager.sessionId },
        '📦 ARCHIVE FAIL: Firestore not available'
      );
      return false;
    }

    const { userId } = manager;
    const { sessionId } = manager;
    const archivePath = `${USERS_COLLECTION}/${userId}/${CONVERSATION_STATE_DOC}/archive/${sessionId}`;
    const { FieldValue } = await import('firebase-admin/firestore');

    const data = manager.toJSON();

    // Convert dates to ISO strings for Firestore
    const firestoreData = removeUndefined({
      ...data,
      startedAt: data.startedAt instanceof Date ? data.startedAt.toISOString() : data.startedAt,
      lastActivityAt:
        data.lastActivityAt instanceof Date
          ? data.lastActivityAt.toISOString()
          : data.lastActivityAt,
      emotional: {
        ...(data.emotional as Record<string, unknown>),
        updatedAt:
          (data.emotional as Record<string, unknown>).updatedAt instanceof Date
            ? ((data.emotional as Record<string, unknown>).updatedAt as Date).toISOString()
            : (data.emotional as Record<string, unknown>).updatedAt,
      },
      archivedAt: FieldValue.serverTimestamp(),
    });

    await db.doc(archivePath).set(firestoreData);
    log.info({ userId, sessionId, archivePath }, '📦 Conversation state archived');
    return true;
  } catch (error) {
    log.warn(
      { error: String(error), userId: manager.userId },
      'Failed to archive conversation state'
    );
    return false;
  }
}

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

  /** User ID (branded type for type safety) */
  userId: UserId;

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
 * A single tool execution record for history tracking
 * Enables "what did you just do?" queries from users
 */
export interface ToolHistoryEntry {
  /** Tool ID that was called */
  toolId: string;
  /** Human-readable result summary */
  result: string;
  /** Whether the tool succeeded */
  success: boolean;
  /** User's original request that triggered this tool */
  userRequest?: string;
  /** Timestamp of execution */
  timestamp: number;
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

  /**
   * History of recent tool executions (last 10)
   * Enables LLM to answer "what did you just do?" and track actions
   *
   * CRITICAL: This solves the "LLM doesn't know what it just did" gap
   * by maintaining a persistent history of tool executions.
   */
  history: ToolHistoryEntry[];

  /**
   * Currently executing tool (in-flight state)
   * P0-#4 fix: LLM needs to know when a tool is running to avoid speaking over it
   */
  toolInFlight?: {
    toolId: string;
    startedAt: number;
    /** Expected completion time based on tool type */
    expectedDurationMs?: number;
  };
}

/**
 * 🎮 Game context for active games
 */
export interface GameContext {
  /** Whether a game is currently active */
  isActive: boolean;

  /** Type of game being played */
  gameType?: string;

  /** Current round number */
  currentRound?: number;

  /** Current score */
  score?: number;

  /** Whether user is in the middle of answering */
  awaitingAnswer?: boolean;

  /** Game-specific data for context */
  gameData?: Record<string, unknown>;

  /** When the game started */
  startedAt?: Date;
}

/**
 * Complete conversation state
 */
export interface ConversationState {
  // Identity (branded types for type safety)
  sessionId: SessionId;
  userId: UserId;
  agentId: string;

  // Contexts
  emotional: EmotionalContext;
  topic: TopicContext;
  flow: FlowContext;
  user: UserContext;
  toolExecution: ToolExecutionData;
  game: GameContext;

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

function createDefaultUserContext(userId: UserId): UserContext {
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
    history: [],
  };
}

function createDefaultGameContext(): GameContext {
  return {
    isActive: false,
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
  private persistenceEnabled = false;

  constructor(sessionId: SessionId, userId: UserId, agentId: string) {
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
      game: createDefaultGameContext(),
      startedAt: now,
      lastActivityAt: now,
    };
  }

  /**
   * Enable Firestore persistence for this session
   * Call this after creating the manager to auto-persist changes
   */
  enablePersistence(): void {
    this.persistenceEnabled = true;
    this.logger.info(
      { userId: this.userId, sessionId: this.sessionId },
      '💾 Conversation state persistence enabled'
    );
  }

  /**
   * Check if persistence is enabled
   */
  isPersistenceEnabled(): boolean {
    return this.persistenceEnabled;
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  get sessionId(): SessionId {
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

  getGameContext(): Readonly<GameContext> {
    return this.state.game;
  }

  // ============================================================================
  // GAME CONTEXT
  // ============================================================================

  /**
   * Update game context
   */
  setGameContext(updates: Partial<GameContext>): void {
    this.state.game = {
      ...this.state.game,
      ...updates,
    };
    this.touch();
    this.logger.debug({ updates }, '🎮 Game context updated');
  }

  /**
   * Start a game
   */
  startGame(gameType: string, initialData?: Record<string, unknown>): void {
    this.state.game = {
      isActive: true,
      gameType,
      currentRound: 1,
      score: 0,
      awaitingAnswer: false,
      gameData: initialData,
      startedAt: new Date(),
    };
    this.touch();
    this.logger.info({ gameType }, '🎮 Game started');
  }

  /**
   * End the current game
   */
  endGame(): void {
    this.state.game = {
      isActive: false,
    };
    this.touch();
    this.logger.info('🎮 Game ended');
  }

  /**
   * Check if a game is active
   */
  isGameActive(): boolean {
    return this.state.game.isActive;
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

  /**
   * Record a tool call with full history tracking.
   *
   * CRITICAL: This enables the LLM to answer "what did you just do?" by
   * maintaining a history of recent tool executions with timestamps.
   *
   * @param toolName - The tool ID that was called
   * @param resultSummary - Human-readable result summary
   * @param options - Additional options for history tracking
   */
  recordToolCall(
    toolName: string,
    resultSummary?: string,
    options?: {
      success?: boolean;
      userRequest?: string;
    }
  ): void {
    this.state.toolExecution.lastToolCalled = toolName;
    this.state.toolExecution.lastToolResult = resultSummary;

    // Add to recently used (keep last 5)
    this.state.toolExecution.recentlyUsedTools.unshift(toolName);
    if (this.state.toolExecution.recentlyUsedTools.length > 5) {
      this.state.toolExecution.recentlyUsedTools.pop();
    }

    // Add to history (keep last 10 entries)
    // This is the KEY fix for "LLM doesn't know what it just did"
    const historyEntry: ToolHistoryEntry = {
      toolId: toolName,
      result: resultSummary || 'Completed',
      success: options?.success ?? true,
      userRequest: options?.userRequest,
      timestamp: Date.now(),
    };
    this.state.toolExecution.history.unshift(historyEntry);
    if (this.state.toolExecution.history.length > 10) {
      this.state.toolExecution.history.pop();
    }

    this.touch();
    this.logger.debug(
      {
        toolName,
        success: options?.success ?? true,
        historyLength: this.state.toolExecution.history.length,
      },
      '🔧 Tool call recorded with history'
    );
  }

  /**
   * Get recent tool execution history for LLM context injection.
   * Returns the last N tool executions with their results.
   */
  getToolHistory(limit = 5): ToolHistoryEntry[] {
    return this.state.toolExecution.history.slice(0, limit);
  }

  /**
   * Mark a tool as starting execution (in-flight state).
   * P0-#4 fix: Enables LLM to know a tool is running.
   *
   * @param toolId - The tool that's starting
   * @param expectedDurationMs - Expected duration based on tool type
   */
  startToolExecution(toolId: string, expectedDurationMs?: number): void {
    this.state.toolExecution.toolInFlight = {
      toolId,
      startedAt: Date.now(),
      expectedDurationMs,
    };
    this.touch();
    this.logger.debug({ toolId, expectedDurationMs }, '🔧 Tool execution started (in-flight)');
  }

  /**
   * Mark a tool as finished execution (clears in-flight state).
   * Should be called after recordToolCall() or on tool error.
   */
  endToolExecution(): void {
    if (this.state.toolExecution.toolInFlight) {
      const duration = Date.now() - this.state.toolExecution.toolInFlight.startedAt;
      this.logger.debug(
        { toolId: this.state.toolExecution.toolInFlight.toolId, durationMs: duration },
        '🔧 Tool execution ended'
      );
      this.state.toolExecution.toolInFlight = undefined;
      this.touch();
    }
  }

  /**
   * Get the currently executing tool (if any).
   * Returns null if no tool is in-flight.
   */
  getToolInFlight(): {
    toolId: string;
    startedAt: number;
    elapsedMs: number;
    expectedDurationMs?: number;
  } | null {
    const inFlight = this.state.toolExecution.toolInFlight;
    if (!inFlight) return null;

    return {
      toolId: inFlight.toolId,
      startedAt: inFlight.startedAt,
      elapsedMs: Date.now() - inFlight.startedAt,
      expectedDurationMs: inFlight.expectedDurationMs,
    };
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

    // Trigger debounced persistence if enabled
    if (this.persistenceEnabled) {
      debouncedPersist(this.state.userId, this);
    }
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
      createSessionId(data.sessionId as string),
      createUserId(data.userId as string),
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
 *
 * @param sessionId - Session identifier (string or branded SessionId)
 * @param userId - User identifier (string or branded UserId)
 * @param agentId - Agent/persona identifier
 */
export function getConversationState(
  sessionId: string | SessionId,
  userId: string | UserId = 'default',
  agentId = 'default'
): ConversationStateManager {
  // Convert to branded types if necessary
  const brandedSessionId = typeof sessionId === 'string' ? createSessionId(sessionId) : sessionId;
  const brandedUserId = typeof userId === 'string' ? createUserId(userId) : userId;

  let state = activeConversations.get(brandedSessionId as string);

  if (!state) {
    state = new ConversationStateManager(brandedSessionId, brandedUserId, agentId);
    activeConversations.set(brandedSessionId as string, state);
  }

  return state;
}

/**
 * Check if a conversation state exists
 */
export function hasConversationState(sessionId: string | SessionId): boolean {
  const id = typeof sessionId === 'string' ? sessionId : (sessionId as string);
  return activeConversations.has(id);
}

/**
 * End a conversation and clean up state
 * Archives state to Firestore if persistence was enabled
 */
export async function endConversation(
  sessionId: string | SessionId
): Promise<ConversationState | null> {
  const log = getLogger();
  const id = typeof sessionId === 'string' ? sessionId : (sessionId as string);
  const manager = activeConversations.get(id);

  log.debug({ sessionId: id, hasManager: !!manager }, 'endConversation called');

  if (manager) {
    const finalState = manager.getState();
    const persistenceEnabled = manager.isPersistenceEnabled();

    log.info(
      {
        sessionId: id,
        userId: manager.userId,
        persistenceEnabled,
        turnCount: finalState.flow.turnCount,
      },
      `📦 Ending conversation (persistence: ${persistenceEnabled ? 'enabled' : 'disabled'})`
    );

    // Archive to Firestore if persistence was enabled
    if (persistenceEnabled) {
      // Cancel any pending debounced persist
      const pending = pendingPersists.get(manager.userId);
      if (pending) {
        clearTimeout(pending);
        pendingPersists.delete(manager.userId);
        log.debug({ userId: manager.userId }, 'Cancelled pending debounced persist');
      }

      // Archive the final state
      const archived = await archiveConversationState(manager);
      log.info({ sessionId: id, userId: manager.userId, archived }, '📦 Archive result');
    } else {
      log.warn(
        { sessionId: id, userId: manager.userId },
        '📦 SKIP: Persistence was NOT enabled for this session'
      );
    }

    activeConversations.delete(id);
    return finalState as ConversationState;
  }

  log.warn({ sessionId: id }, '📦 endConversation: No manager found for session');
  return null;
}

/**
 * Initialize conversation state with Firestore persistence
 *
 * This creates or gets a conversation state manager and enables persistence.
 * Optionally restores the last emotional context from Firestore for continuity.
 *
 * @param sessionId - Session identifier
 * @param userId - User identifier
 * @param agentId - Agent/persona identifier
 * @param restoreEmotionalContext - If true, attempts to restore last emotional state
 */
export async function initConversationStateWithPersistence(
  sessionId: string | SessionId,
  userId: string | UserId,
  agentId: string,
  restoreEmotionalContext = true
): Promise<ConversationStateManager> {
  const manager = getConversationState(sessionId, userId, agentId);
  manager.enablePersistence();

  // Optionally restore emotional context from last session
  if (restoreEmotionalContext) {
    const userIdStr = typeof userId === 'string' ? userId : (userId as string);
    const lastState = await loadConversationStateFromFirestore(userIdStr);

    if (lastState?.emotional) {
      const emotional = lastState.emotional as Record<string, unknown>;
      manager.setEmotionalContext({
        sentiment: emotional.sentiment as EmotionalContext['sentiment'],
        emotions: (emotional.emotions as EmotionalContext['emotions']) || [],
        urgency: (emotional.urgency as number) || 3,
        topicFatigue: (emotional.topicFatigue as boolean) || false,
        confidence: (emotional.confidence as number) || 0.5,
        updatedAt: new Date(),
      });

      const log = getLogger();
      log.info(
        { userId: userIdStr, sentiment: emotional.sentiment },
        '📖 Restored emotional context from last session'
      );
    }
  }

  return manager;
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
  // Persistence functions
  initConversationStateWithPersistence,
  loadConversationStateFromFirestore,
};
