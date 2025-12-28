/**
 * Session State Manager
 *
 * Unified session state management that consolidates:
 * - UserData (session-scoped user info)
 * - Conversation tracking
 * - Emotional state
 * - Handoff state
 * - Bundle runtime state
 *
 * Benefits:
 * - Single source of truth for session state
 * - Immutable updates (returns new state)
 * - Type-safe state access
 * - Easy to serialize/restore
 * - Testable in isolation
 */

import type { SessionServices } from '../../services/index.js';
import type { VoiceEmotionResult } from '../../speech/audio-prosody.js';
import type { VoiceEmotionModulation } from '../../speech/emotion-matching.js';
import type { ConversationStateManager } from '../../services/conversation-state.js';
import type { MoodState } from '../../intelligence/context-builders/personas/persona-mood.js';

// ============================================================================
// STATE TYPES
// ============================================================================

/**
 * User identity and profile state
 */
export interface UserIdentityState {
  userId?: string;
  name?: string;
  isReturningUser: boolean;
  identificationSource: 'metadata' | 'profile' | 'anonymous';
}

/**
 * Conversation tracking state
 */
export interface ConversationTrackingState {
  turnCount: number;
  lastTopic?: string;
  recentTopics: string[];
  lastUserMessage?: string;
  lastAgentResponse?: string;
  keyMoments: string[];
  storiesShared: string[];
  lastStoryTurn?: number;
  /** Memory references already made this session (prevents repetition) */
  referencedMemories: Set<string>;
  /** Whether we've already referenced the last conversation topic */
  hasReferencedLastConversation: boolean;
  /** Personal themes already mentioned this session (wyoming, japan, book, etc.) */
  mentionedPersonalThemes: Set<string>;
}

/**
 * Emotional state for the session
 */
export interface EmotionalSessionState {
  lastEmotionAnalysis?: {
    primary: string;
    intensity: number;
    distressLevel?: number;
  };
  voiceEmotion?: VoiceEmotionResult;
  emotionModulation?: VoiceEmotionModulation;
  lastMood?: MoodState;
  previousRelationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
}

/**
 * Response tracking for calibration
 */
export interface ResponseTrackingState {
  lastResponseHadHumor: boolean;
  lastResponseHadStory: boolean;
  usedShareTags: string[];
  spontaneousShareCount: number;
}

/**
 * Bundle runtime state (persona behaviors)
 */
export interface BundleState {
  relationshipTurns: number;
  currentMode: string;
  storiesToldThisSession: string[];
  lastModeTransition?: string;
}

/**
 * Timing state
 */
export interface TimingState {
  sessionStartTime: number;
  userSpeakingStartTime?: number;
  userWentSilent: boolean;
}

/**
 * Complete session state
 */
export interface SessionState {
  readonly sessionId: string;
  readonly personaId: string;
  readonly user: UserIdentityState;
  readonly conversation: ConversationTrackingState;
  readonly emotional: EmotionalSessionState;
  readonly responseTracking: ResponseTrackingState;
  readonly bundle: BundleState;
  readonly timing: TimingState;
}

// ============================================================================
// STATE BUILDER
// ============================================================================

/**
 * Create initial session state
 */
export function createInitialSessionState(
  sessionId: string,
  personaId: string,
  options: {
    userId?: string;
    userName?: string;
    isReturningUser?: boolean;
    identificationSource?: 'metadata' | 'profile' | 'anonymous';
  } = {}
): SessionState {
  return {
    sessionId,
    personaId,
    user: {
      userId: options.userId,
      name: options.userName,
      isReturningUser: options.isReturningUser ?? false,
      identificationSource: options.identificationSource ?? 'anonymous',
    },
    conversation: {
      turnCount: 0,
      recentTopics: [],
      keyMoments: [],
      storiesShared: [],
      referencedMemories: new Set<string>(),
      hasReferencedLastConversation: false,
      mentionedPersonalThemes: new Set<string>(),
    },
    emotional: {},
    responseTracking: {
      lastResponseHadHumor: false,
      lastResponseHadStory: false,
      usedShareTags: [],
      spontaneousShareCount: 0,
    },
    bundle: {
      relationshipTurns: 0,
      currentMode: 'discovery',
      storiesToldThisSession: [],
    },
    timing: {
      sessionStartTime: Date.now(),
      userWentSilent: false,
    },
  };
}

// ============================================================================
// IMMUTABLE UPDATE HELPERS
// ============================================================================

/**
 * Update user identity
 */
export function updateUserIdentity(
  state: SessionState,
  updates: Partial<UserIdentityState>
): SessionState {
  return {
    ...state,
    user: { ...state.user, ...updates },
  };
}

/**
 * Update conversation tracking
 */
export function updateConversation(
  state: SessionState,
  updates: Partial<ConversationTrackingState>
): SessionState {
  return {
    ...state,
    conversation: { ...state.conversation, ...updates },
  };
}

/**
 * Increment turn count
 */
export function incrementTurn(state: SessionState): SessionState {
  return {
    ...state,
    conversation: {
      ...state.conversation,
      turnCount: state.conversation.turnCount + 1,
    },
  };
}

/**
 * Add a key moment
 */
export function addKeyMoment(state: SessionState, moment: string): SessionState {
  return {
    ...state,
    conversation: {
      ...state.conversation,
      keyMoments: [...state.conversation.keyMoments, moment],
    },
  };
}

/**
 * Update topic
 */
export function updateTopic(state: SessionState, topic: string): SessionState {
  const recentTopics = [topic, ...state.conversation.recentTopics].slice(0, 5);
  return {
    ...state,
    conversation: {
      ...state.conversation,
      lastTopic: topic,
      recentTopics,
    },
  };
}

/**
 * Update emotional state
 */
export function updateEmotional(
  state: SessionState,
  updates: Partial<EmotionalSessionState>
): SessionState {
  return {
    ...state,
    emotional: { ...state.emotional, ...updates },
  };
}

/**
 * Update response tracking
 */
export function updateResponseTracking(
  state: SessionState,
  updates: Partial<ResponseTrackingState>
): SessionState {
  return {
    ...state,
    responseTracking: { ...state.responseTracking, ...updates },
  };
}

/**
 * Update bundle state
 */
export function updateBundle(state: SessionState, updates: Partial<BundleState>): SessionState {
  return {
    ...state,
    bundle: { ...state.bundle, ...updates },
  };
}

/**
 * Update timing state
 */
export function updateTiming(state: SessionState, updates: Partial<TimingState>): SessionState {
  return {
    ...state,
    timing: { ...state.timing, ...updates },
  };
}

/**
 * Record a story being shared
 */
export function recordStoryShared(state: SessionState, storyId: string): SessionState {
  return {
    ...state,
    conversation: {
      ...state.conversation,
      storiesShared: [...state.conversation.storiesShared, storyId],
      lastStoryTurn: state.conversation.turnCount,
    },
  };
}

/**
 * Record that a memory was referenced (to prevent repetition)
 */
export function recordMemoryReferenced(state: SessionState, memoryKey: string): SessionState {
  const newReferencedMemories = new Set(state.conversation.referencedMemories);
  newReferencedMemories.add(memoryKey);
  return {
    ...state,
    conversation: {
      ...state.conversation,
      referencedMemories: newReferencedMemories,
    },
  };
}

/**
 * Check if a memory has already been referenced this session
 */
export function hasReferencedMemory(state: SessionState, memoryKey: string): boolean {
  return state.conversation.referencedMemories.has(memoryKey);
}

/**
 * Mark that we've referenced the last conversation
 */
export function markLastConversationReferenced(state: SessionState): SessionState {
  return {
    ...state,
    conversation: {
      ...state.conversation,
      hasReferencedLastConversation: true,
    },
  };
}

// ============================================================================
// PERSONAL THEME TRACKING (prevents "always talks about Wyoming/book/Japan")
// ============================================================================

// Import for local use
import {
  PERSONAL_THEMES as THEMES,
  type PersonalTheme,
  extractPersonalThemes,
} from '../../types/personal-themes.js';

// Re-export from shared types module
export { THEMES as PERSONAL_THEMES, type PersonalTheme, extractPersonalThemes };

/**
 * Check if any personal theme from content was already mentioned this session
 */
export function hasThemeBeenMentioned(state: SessionState, content: string): boolean {
  const themes = extractPersonalThemes(content);
  return themes.some((theme) => state.conversation.mentionedPersonalThemes.has(theme));
}

/**
 * Record that personal themes from content were mentioned
 */
export function recordThemesMentioned(state: SessionState, content: string): SessionState {
  const themes = extractPersonalThemes(content);
  if (themes.length === 0) return state;

  const newMentionedThemes = new Set(state.conversation.mentionedPersonalThemes);
  themes.forEach((theme) => newMentionedThemes.add(theme));

  return {
    ...state,
    conversation: {
      ...state.conversation,
      mentionedPersonalThemes: newMentionedThemes,
    },
  };
}

/**
 * Get all mentioned themes this session
 */
export function getMentionedThemes(state: SessionState): PersonalTheme[] {
  return Array.from(state.conversation.mentionedPersonalThemes) as PersonalTheme[];
}

/**
 * Check if a specific theme was mentioned
 */
export function wasThemeMentioned(state: SessionState, theme: PersonalTheme): boolean {
  return state.conversation.mentionedPersonalThemes.has(theme);
}

// ============================================================================
// SESSION STATE MANAGER CLASS
// ============================================================================

/**
 * SessionStateManager - Manages session state with immutable updates
 *
 * This class wraps the immutable state functions for convenience
 * while maintaining a single source of truth.
 */
export class SessionStateManager {
  private state: SessionState;
  private services?: SessionServices;
  private conversationState?: ConversationStateManager;

  constructor(
    sessionId: string,
    personaId: string,
    options: {
      userId?: string;
      userName?: string;
      isReturningUser?: boolean;
      identificationSource?: 'metadata' | 'profile' | 'anonymous';
      services?: SessionServices;
      conversationState?: ConversationStateManager;
    } = {}
  ) {
    this.state = createInitialSessionState(sessionId, personaId, options);
    this.services = options.services;
    this.conversationState = options.conversationState;
  }

  /**
   * Get current state (readonly)
   */
  getState(): Readonly<SessionState> {
    return this.state;
  }

  /**
   * Get services reference
   */
  getServices(): SessionServices | undefined {
    return this.services;
  }

  /**
   * Set services reference
   */
  setServices(services: SessionServices): void {
    this.services = services;
  }

  /**
   * Get conversation state manager
   */
  getConversationState(): ConversationStateManager | undefined {
    return this.conversationState;
  }

  /**
   * Set conversation state manager
   */
  setConversationState(conversationState: ConversationStateManager): void {
    this.conversationState = conversationState;
  }

  // ============================================================================
  // USER IDENTITY
  // ============================================================================

  /**
   * Update user identity
   */
  updateUser(updates: Partial<UserIdentityState>): void {
    this.state = updateUserIdentity(this.state, updates);
  }

  /**
   * Get user ID
   */
  getUserId(): string | undefined {
    return this.state.user.userId;
  }

  /**
   * Get user name
   */
  getUserName(): string | undefined {
    return this.state.user.name;
  }

  /**
   * Check if returning user
   */
  isReturningUser(): boolean {
    return this.state.user.isReturningUser;
  }

  // ============================================================================
  // CONVERSATION TRACKING
  // ============================================================================

  /**
   * Increment turn count
   */
  incrementTurn(): void {
    this.state = incrementTurn(this.state);
    // Sync with conversation state manager if available
    this.conversationState?.incrementTurn();
  }

  /**
   * Get turn count
   */
  getTurnCount(): number {
    return this.state.conversation.turnCount;
  }

  /**
   * Update last user message
   */
  setLastUserMessage(message: string): void {
    this.state = updateConversation(this.state, { lastUserMessage: message });
  }

  /**
   * Update last agent response
   * Also tracks advice for counterfactual memory (Better Than Human V3)
   */
  setLastAgentResponse(response: string): void {
    this.state = updateConversation(this.state, { lastAgentResponse: response });

    // Track advice for counterfactual memory (fire-and-forget, non-blocking)
    const userId = this.state.user.userId;
    if (userId && userId !== 'anonymous') {
      void this.trackAdviceIfPresent(response, userId);
    }
  }

  /**
   * Fire-and-forget advice tracking for counterfactual memory
   */
  private async trackAdviceIfPresent(response: string, userId: string): Promise<void> {
    try {
      const { trackAdviceInResponse } =
        await import('../../services/superhuman/semantic-intelligence/advice-detector.js');

      await trackAdviceInResponse(response, {
        userId,
        sessionId: this.state.sessionId,
        personaId: this.state.personaId,
        topic: this.state.conversation.lastTopic,
        userSituation: this.state.conversation.lastUserMessage,
        userEmotion: this.state.emotional.lastEmotionAnalysis?.primary,
      });
    } catch {
      // Non-critical - don't disrupt main flow
    }
  }

  /**
   * Update topic
   */
  setTopic(topic: string): void {
    this.state = updateTopic(this.state, topic);
    // Sync with conversation state manager if available
    this.conversationState?.setCurrentTopic(topic);
  }

  /**
   * Add a key moment
   */
  addKeyMoment(moment: string): void {
    this.state = addKeyMoment(this.state, moment);
    // Sync with conversation state manager if available
    this.conversationState?.addKeyMoment(moment);
  }

  /**
   * Record story shared
   */
  recordStory(storyId: string): void {
    this.state = recordStoryShared(this.state, storyId);
  }

  /**
   * Record that a memory was referenced (prevents repetition)
   */
  recordMemoryReferenced(memoryKey: string): void {
    this.state = recordMemoryReferenced(this.state, memoryKey);
  }

  /**
   * Check if a memory has already been referenced this session
   */
  hasReferencedMemory(memoryKey: string): boolean {
    return hasReferencedMemory(this.state, memoryKey);
  }

  /**
   * Mark that we've referenced the last conversation topic
   */
  markLastConversationReferenced(): void {
    this.state = markLastConversationReferenced(this.state);
  }

  /**
   * Check if last conversation has been referenced
   */
  hasReferencedLastConversation(): boolean {
    return this.state.conversation.hasReferencedLastConversation;
  }

  // ============================================================================
  // PERSONAL THEME TRACKING
  // ============================================================================

  /**
   * Check if any personal themes from content were already mentioned
   * Use this BEFORE injecting personal content to prevent repetition
   */
  hasThemeBeenMentioned(content: string): boolean {
    return hasThemeBeenMentioned(this.state, content);
  }

  /**
   * Record that personal themes from content were mentioned
   * Call this AFTER agent shares personal content
   */
  recordThemesMentioned(content: string): void {
    this.state = recordThemesMentioned(this.state, content);
  }

  /**
   * Check if a specific theme was mentioned this session
   */
  wasThemeMentioned(theme: PersonalTheme): boolean {
    return wasThemeMentioned(this.state, theme);
  }

  /**
   * Get all mentioned themes this session
   */
  getMentionedThemes(): PersonalTheme[] {
    return getMentionedThemes(this.state);
  }

  // ============================================================================
  // EMOTIONAL STATE
  // ============================================================================

  /**
   * Update emotion analysis
   */
  setEmotionAnalysis(analysis: {
    primary: string;
    intensity: number;
    distressLevel?: number;
  }): void {
    this.state = updateEmotional(this.state, { lastEmotionAnalysis: analysis });
  }

  /**
   * Update voice emotion
   */
  setVoiceEmotion(emotion: VoiceEmotionResult): void {
    this.state = updateEmotional(this.state, { voiceEmotion: emotion });
  }

  /**
   * Update emotion modulation
   */
  setEmotionModulation(modulation: VoiceEmotionModulation): void {
    this.state = updateEmotional(this.state, { emotionModulation: modulation });
  }

  /**
   * Update mood
   */
  setMood(mood: MoodState): void {
    this.state = updateEmotional(this.state, { lastMood: mood });
  }

  /**
   * Update relationship stage
   */
  setRelationshipStage(stage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor'): void {
    this.state = updateEmotional(this.state, { previousRelationshipStage: stage });
  }

  // ============================================================================
  // RESPONSE TRACKING
  // ============================================================================

  /**
   * Mark that last response had humor
   */
  markResponseHadHumor(): void {
    this.state = updateResponseTracking(this.state, { lastResponseHadHumor: true });
  }

  /**
   * Clear humor flag
   */
  clearHumorFlag(): void {
    this.state = updateResponseTracking(this.state, { lastResponseHadHumor: false });
  }

  /**
   * Mark that last response had story
   */
  markResponseHadStory(): void {
    this.state = updateResponseTracking(this.state, { lastResponseHadStory: true });
  }

  /**
   * Clear story flag
   */
  clearStoryFlag(): void {
    this.state = updateResponseTracking(this.state, { lastResponseHadStory: false });
  }

  /**
   * Add share tags
   */
  addShareTags(tags: string[]): void {
    const usedShareTags = [...new Set([...this.state.responseTracking.usedShareTags, ...tags])];
    this.state = updateResponseTracking(this.state, { usedShareTags });
  }

  /**
   * Increment spontaneous share count
   */
  incrementSpontaneousShares(): void {
    this.state = updateResponseTracking(this.state, {
      spontaneousShareCount: this.state.responseTracking.spontaneousShareCount + 1,
    });
  }

  // ============================================================================
  // BUNDLE STATE
  // ============================================================================

  /**
   * Update bundle state
   */
  updateBundleState(updates: Partial<BundleState>): void {
    this.state = updateBundle(this.state, updates);
  }

  /**
   * Increment relationship turns
   */
  incrementRelationshipTurns(): void {
    this.state = updateBundle(this.state, {
      relationshipTurns: this.state.bundle.relationshipTurns + 1,
    });
  }

  /**
   * Set current mode
   */
  setMode(mode: string, previousMode?: string): void {
    const updates: Partial<BundleState> = { currentMode: mode };
    if (previousMode) {
      updates.lastModeTransition = `${previousMode}_to_${mode}`;
    }
    this.state = updateBundle(this.state, updates);
  }

  // ============================================================================
  // TIMING
  // ============================================================================

  /**
   * Mark user started speaking
   */
  markUserSpeaking(): void {
    this.state = updateTiming(this.state, {
      userSpeakingStartTime: Date.now(),
      userWentSilent: false,
    });
  }

  /**
   * Mark user went silent
   */
  markUserSilent(): void {
    this.state = updateTiming(this.state, { userWentSilent: true });
  }

  /**
   * Get session duration in milliseconds
   */
  getSessionDuration(): number {
    return Date.now() - this.state.timing.sessionStartTime;
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Convert to legacy UserData format (for backward compatibility)
   */
  toLegacyUserData(): Record<string, unknown> {
    const s = this.state;
    return {
      userId: s.user.userId,
      name: s.user.name,
      userName: s.user.name,
      isReturningUser: s.user.isReturningUser,
      turnCount: s.conversation.turnCount,
      lastTopic: s.conversation.lastTopic,
      recentTopics: s.conversation.recentTopics,
      lastUserMessage: s.conversation.lastUserMessage,
      lastAgentResponse: s.conversation.lastAgentResponse,
      keyMoments: s.conversation.keyMoments,
      storiesShared: s.conversation.storiesShared,
      lastStoryTurn: s.conversation.lastStoryTurn,
      // Memory tracking for repetition prevention
      referencedMemories: Array.from(s.conversation.referencedMemories),
      hasReferencedLastConversation: s.conversation.hasReferencedLastConversation,
      // Personal theme tracking (prevents "always talks about Wyoming/book/Japan")
      mentionedPersonalThemes: Array.from(s.conversation.mentionedPersonalThemes),
      lastEmotionAnalysis: s.emotional.lastEmotionAnalysis,
      voiceEmotion: s.emotional.voiceEmotion,
      emotionModulation: s.emotional.emotionModulation,
      lastMood: s.emotional.lastMood,
      previousRelationshipStage: s.emotional.previousRelationshipStage,
      lastResponseHadHumor: s.responseTracking.lastResponseHadHumor,
      lastResponseHadStory: s.responseTracking.lastResponseHadStory,
      usedShareTags: s.responseTracking.usedShareTags,
      spontaneousShareCount: s.responseTracking.spontaneousShareCount,
      bundleRuntimeState: {
        relationshipTurns: s.bundle.relationshipTurns,
        currentMode: s.bundle.currentMode,
        storiesToldThisSession: s.bundle.storiesToldThisSession,
        lastModeTransition: s.bundle.lastModeTransition,
      },
      userSpeakingStartTime: s.timing.userSpeakingStartTime,
      userWentSilent: s.timing.userWentSilent,
      services: this.services,
      conversationState: this.conversationState,
    };
  }

  /**
   * Restore from legacy UserData format
   */
  static fromLegacyUserData(
    sessionId: string,
    personaId: string,
    userData: Record<string, unknown>
  ): SessionStateManager {
    const manager = new SessionStateManager(sessionId, personaId, {
      userId: userData.userId as string | undefined,
      userName: (userData.name || userData.userName) as string | undefined,
      isReturningUser: userData.isReturningUser as boolean | undefined,
    });

    // Restore conversation state
    manager.state = updateConversation(manager.state, {
      turnCount: (userData.turnCount as number) || 0,
      lastTopic: userData.lastTopic as string | undefined,
      recentTopics: (userData.recentTopics as string[]) || [],
      lastUserMessage: userData.lastUserMessage as string | undefined,
      lastAgentResponse: userData.lastAgentResponse as string | undefined,
      keyMoments: (userData.keyMoments as string[]) || [],
      storiesShared: (userData.storiesShared as string[]) || [],
      lastStoryTurn: userData.lastStoryTurn as number | undefined,
      // Restore memory tracking for repetition prevention
      referencedMemories: new Set((userData.referencedMemories as string[]) || []),
      hasReferencedLastConversation: (userData.hasReferencedLastConversation as boolean) || false,
      // Restore personal theme tracking
      mentionedPersonalThemes: new Set((userData.mentionedPersonalThemes as string[]) || []),
    });

    // Restore emotional state
    manager.state = updateEmotional(manager.state, {
      lastEmotionAnalysis:
        userData.lastEmotionAnalysis as EmotionalSessionState['lastEmotionAnalysis'],
      voiceEmotion: userData.voiceEmotion as VoiceEmotionResult | undefined,
      emotionModulation: userData.emotionModulation as VoiceEmotionModulation | undefined,
      lastMood: userData.lastMood as MoodState | undefined,
      previousRelationshipStage:
        userData.previousRelationshipStage as EmotionalSessionState['previousRelationshipStage'],
    });

    // Restore response tracking
    manager.state = updateResponseTracking(manager.state, {
      lastResponseHadHumor: (userData.lastResponseHadHumor as boolean) || false,
      lastResponseHadStory: (userData.lastResponseHadStory as boolean) || false,
      usedShareTags: (userData.usedShareTags as string[]) || [],
      spontaneousShareCount: (userData.spontaneousShareCount as number) || 0,
    });

    // Restore bundle state
    const bundleState = userData.bundleRuntimeState as BundleState | undefined;
    if (bundleState) {
      manager.state = updateBundle(manager.state, bundleState);
    }

    // Restore services if provided
    if (userData.services) {
      manager.services = userData.services as SessionServices;
    }
    if (userData.conversationState) {
      manager.conversationState = userData.conversationState as ConversationStateManager;
    }

    return manager;
  }

  /**
   * Serialize to JSON for persistence
   */
  toJSON(): string {
    return JSON.stringify(this.state);
  }

  /**
   * Restore from JSON
   */
  static fromJSON(json: string): SessionStateManager {
    const state = JSON.parse(json) as SessionState;
    const manager = new SessionStateManager(state.sessionId, state.personaId);
    manager.state = state;
    return manager;
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a session state manager for a new session
 */
export function createSessionStateManager(
  sessionId: string,
  personaId: string,
  options: {
    userId?: string;
    userName?: string;
    isReturningUser?: boolean;
    identificationSource?: 'metadata' | 'profile' | 'anonymous';
    services?: SessionServices;
    conversationState?: ConversationStateManager;
  } = {}
): SessionStateManager {
  return new SessionStateManager(sessionId, personaId, options);
}
