/**
 * UserData Proxy
 *
 * Creates a Proxy around SessionStateManager that provides backward-compatible
 * UserData interface while making SessionStateManager the single source of truth.
 *
 * This eliminates the "legacy" nature of UserData by:
 * 1. All reads go through SessionStateManager
 * 2. All writes update SessionStateManager (immutably)
 * 3. Existing code works unchanged (userData.X = Y still works)
 *
 * @module session/user-data-proxy
 */

import type { ConversationStateManager } from '../../services/conversation-state.js';
import type { SessionServices } from '../../services/index.js';
import type { SilenceAnalysis } from '../../intelligence/deep-understanding/silence.js';
import type { LaughterDetectionResult } from '../../speech/voice-humanization.js';
import type { EnglishAccent, VoicePreference } from '../../config/voice-accents.js';
import type { VoiceEmotionResult } from '../../speech/audio-prosody.js';
import type { VoiceEmotionModulation } from '../../speech/emotion-matching.js';
import type { MoodState } from '../../intelligence/context-builders/personas/persona-mood.js';
import type { UserBundleState } from '../../personas/bundles/index.js';
import type { SessionStateManager } from './session-state.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Fields stored directly on the proxy (not in SessionStateManager)
 * These are either:
 * - Rapid-changing voice state (too fast for immutable updates)
 * - Service references
 * - External manager references
 */
interface DirectFields {
  // Service references
  services?: SessionServices;
  conversationState?: ConversationStateManager;

  // Voice preferences
  voicePreference?: VoicePreference;
  preferredAccent?: EnglishAccent;
  /** Preferred language for speech recognition validation (e.g., 'ja', 'es', 'en') */
  preferredLanguage?: string;

  // Voice humanization - rapid changing state
  detectedLaughter?: LaughterDetectionResult;
  isInBreathPause?: boolean;
  currentSpeechDurationMs?: number;
  lastLiveBackchannelAt?: number;

  // Ambient awareness
  ambientEnvironment?:
    | 'quiet_room'
    | 'office'
    | 'coffee_shop'
    | 'outdoors'
    | 'car'
    | 'public_transit'
    | 'noisy'
    | 'unknown';
  ambientNoiseLevel?: number;
  hasOfferedToPause?: boolean;
  pendingAmbientAcknowledgment?: string | null;

  // Voice state insights
  pendingVoiceInsight?: {
    text: string;
    ssml: string;
    emotion: string;
    confidence: number;
  };
  deliveredVoiceInsight?: boolean;

  // Silence intelligence
  lastSilenceAnalysis?: SilenceAnalysis;

  // Trial state
  isTrialUser?: boolean;
  isFirstConversation?: boolean;
  trialStatus?: {
    inTrial: boolean;
    timeRemainingMs: number | null;
    approachingEnd: boolean;
    trialEnded: boolean;
  };
  hasSpokenTrialEndPrompt?: boolean;

  // Response timing
  lastAgentResponseTime?: number;

  // Session data for deep humanization
  sessionData?: {
    previousTopics?: string[];
    pendingItems?: Array<{ type: string; content: string; timestamp: Date }>;
    patterns?: Array<{ trait: string; count: number }>;
    memorableQuotes?: string[];
    goals?: string[];
    peopleMentioned?: string[];
    sessionCount?: number;
  };

  // Phase 5: Anticipatory Triggers
  anticipatoryIntelligence?: import('../../intelligence/triggers/index.js').AnticipatoryIntelligence;
  triggerProfile?: import('../../intelligence/triggers/index.js').UserTriggerProfile;
  pendingAnticipatoryResult?: {
    detection: import('../../intelligence/triggers/index.js').SignalDetectionResult;
    firedAt: number;
    verbalResponse: string;
    anticipatedOutcome: string;
  } | null;
  anticipatoryFiringsThisSession?: number;
  lastAnticipatoryFiringAt?: number;

  // Phase 6: Life Context Synthesis
  lifeContextSnapshot?: import('../../intelligence/triggers/index.js').LifeContextSnapshot;
}

/**
 * UserData interface (preserved for backward compatibility)
 * This is the type that existing code expects
 */
export interface UserData {
  // Identity
  name?: string;
  userId?: string;
  userName?: string;

  // Session state
  isReturningUser?: boolean;
  turnCount?: number;
  lastTopic?: string;
  recentTopics?: string[];

  // Services reference
  services?: SessionServices;

  // Voice preferences
  voicePreference?: VoicePreference;
  preferredAccent?: EnglishAccent;
  /** Preferred language for speech recognition validation (e.g., 'ja', 'es', 'en') */
  preferredLanguage?: string;

  // Timing
  userSpeakingStartTime?: number;
  userWentSilent?: boolean;

  // Voice emotion tracking
  voiceEmotion?: VoiceEmotionResult;
  emotionModulation?: VoiceEmotionModulation;

  // Voice humanization
  detectedLaughter?: LaughterDetectionResult;
  isInBreathPause?: boolean;
  currentSpeechDurationMs?: number;
  lastLiveBackchannelAt?: number;

  // Ambient awareness
  ambientEnvironment?:
    | 'quiet_room'
    | 'office'
    | 'coffee_shop'
    | 'outdoors'
    | 'car'
    | 'public_transit'
    | 'noisy'
    | 'unknown';
  ambientNoiseLevel?: number;
  hasOfferedToPause?: boolean;
  pendingAmbientAcknowledgment?: string | null;

  // Conversation context
  lastUserMessage?: string;
  lastAgentResponse?: string;
  lastAgentResponseTime?: number;
  lastEmotionAnalysis?: {
    primary: string;
    intensity: number;
    distressLevel?: number;
  };

  // Human-level feature tracking
  lastResponseHadHumor?: boolean;
  lastResponseHadStory?: boolean;

  // Bundle runtime state
  bundleRuntimeState?: UserBundleState;

  // Story tracking
  storiesShared?: string[];
  lastStoryTurn?: number;

  // Key moments
  keyMoments?: string[];

  // Humanizing state
  usedShareTags?: string[];
  spontaneousShareCount?: number;
  lastMood?: MoodState;
  previousRelationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

  // Session data
  sessionData?: {
    previousTopics?: string[];
    pendingItems?: Array<{ type: string; content: string; timestamp: Date }>;
    patterns?: Array<{ trait: string; count: number }>;
    memorableQuotes?: string[];
    goals?: string[];
    peopleMentioned?: string[];
    sessionCount?: number;
  };

  // Conversation state
  conversationState?: ConversationStateManager;

  // Memory repetition prevention
  referencedMemories?: string[];
  hasReferencedLastConversation?: boolean;
  mentionedPersonalThemes?: Set<string>;

  // Trial state
  isTrialUser?: boolean;
  isFirstConversation?: boolean;
  trialStatus?: {
    inTrial: boolean;
    timeRemainingMs: number | null;
    approachingEnd: boolean;
    trialEnded: boolean;
  };
  hasSpokenTrialEndPrompt?: boolean;

  // Voice state insights
  pendingVoiceInsight?: {
    text: string;
    ssml: string;
    emotion: string;
    confidence: number;
  };
  deliveredVoiceInsight?: boolean;

  // Silence intelligence
  lastSilenceAnalysis?: SilenceAnalysis;

  // Phase 5: Anticipatory Triggers
  anticipatoryIntelligence?: import('../../intelligence/triggers/index.js').AnticipatoryIntelligence;
  triggerProfile?: import('../../intelligence/triggers/index.js').UserTriggerProfile;
  pendingAnticipatoryResult?: {
    detection: import('../../intelligence/triggers/index.js').SignalDetectionResult;
    firedAt: number;
    verbalResponse: string;
    anticipatedOutcome: string;
  } | null;
  anticipatoryFiringsThisSession?: number;
  lastAnticipatoryFiringAt?: number;

  // Phase 6: Life Context Synthesis
  lifeContextSnapshot?: import('../../intelligence/triggers/index.js').LifeContextSnapshot;

  // Access to underlying state manager (for new code)
  readonly __stateManager?: SessionStateManager;

  /** Index signature for extensibility (compatible with PersonaSessionData) */
  [key: string]: unknown;
}

// ============================================================================
// PROXY IMPLEMENTATION
// ============================================================================

/**
 * Fields that map directly to SessionStateManager
 * Key = UserData property, Value = how to get/set it on SessionStateManager
 */
const STATE_MANAGER_MAPPINGS: Record<
  string,
  {
    get: (mgr: SessionStateManager) => unknown;
    set: (mgr: SessionStateManager, value: unknown) => void;
  }
> = {
  // Identity
  name: {
    get: (m) => m.getState().user.name,
    set: (m, v) => m.updateUser({ name: v as string }),
  },
  userName: {
    get: (m) => m.getState().user.name,
    set: (m, v) => m.updateUser({ name: v as string }),
  },
  userId: {
    get: (m) => m.getState().user.userId,
    set: (m, v) => m.updateUser({ userId: v as string }),
  },
  isReturningUser: {
    get: (m) => m.getState().user.isReturningUser,
    set: (m, v) => m.updateUser({ isReturningUser: v as boolean }),
  },

  // Conversation tracking
  turnCount: {
    get: (m) => m.getTurnCount(),
    set: (m, v) => {
      const current = m.getTurnCount();
      const target = v as number;
      // Increment to target (or set directly via internal state)
      if (target > current) {
        for (let i = current; i < target; i++) {
          m.incrementTurn();
        }
      }
    },
  },
  lastTopic: {
    get: (m) => m.getState().conversation.lastTopic,
    set: (m, v) => m.setTopic(v as string),
  },
  recentTopics: {
    get: (m) => m.getState().conversation.recentTopics,
    set: (m, v) => {
      // Update via setting each topic
      const topics = v as string[];
      if (topics.length > 0) {
        m.setTopic(topics[topics.length - 1]);
      }
    },
  },
  lastUserMessage: {
    get: (m) => m.getState().conversation.lastUserMessage,
    set: (m, v) => m.setLastUserMessage(v as string),
  },
  lastAgentResponse: {
    get: (m) => m.getState().conversation.lastAgentResponse,
    set: (m, v) => m.setLastAgentResponse(v as string),
  },
  keyMoments: {
    get: (m) => m.getState().conversation.keyMoments,
    set: (m, v) => {
      const moments = v as string[];
      moments.forEach((moment) => m.addKeyMoment(moment));
    },
  },
  storiesShared: {
    get: (m) => m.getState().conversation.storiesShared,
    set: (m, v) => {
      const stories = v as string[];
      stories.forEach((story) => m.recordStory(story));
    },
  },
  lastStoryTurn: {
    get: (m) => m.getState().conversation.lastStoryTurn,
    set: () => {
      /* Set via recordStory */
    },
  },

  // Memory tracking
  referencedMemories: {
    get: (m) => Array.from(m.getState().conversation.referencedMemories),
    set: (m, v) => {
      const memories = v as string[];
      memories.forEach((id) => m.recordMemoryReferenced(id));
    },
  },
  hasReferencedLastConversation: {
    get: (m) => m.getState().conversation.hasReferencedLastConversation,
    set: (m) => m.markLastConversationReferenced(),
  },
  mentionedPersonalThemes: {
    get: (m) => m.getState().conversation.mentionedPersonalThemes,
    set: (m, v) => {
      const themes = v as Set<string>;
      themes.forEach((theme) => m.recordThemesMentioned(theme));
    },
  },

  // Emotional state
  lastEmotionAnalysis: {
    get: (m) => m.getState().emotional.lastEmotionAnalysis,
    set: (m, v) =>
      m.setEmotionAnalysis(v as { primary: string; intensity: number; distressLevel?: number }),
  },
  voiceEmotion: {
    get: (m) => m.getState().emotional.voiceEmotion,
    set: (m, v) => m.setVoiceEmotion(v as VoiceEmotionResult),
  },
  emotionModulation: {
    get: (m) => m.getState().emotional.emotionModulation,
    set: (m, v) => m.setEmotionModulation(v as VoiceEmotionModulation),
  },
  lastMood: {
    get: (m) => m.getState().emotional.lastMood,
    set: (m, v) => m.setMood(v as MoodState),
  },
  previousRelationshipStage: {
    get: (m) => m.getState().emotional.previousRelationshipStage,
    set: () => {
      /* Read-only, set via setRelationshipStage */
    },
  },
  relationshipStage: {
    // Note: No getter method - read from state directly
    get: (m) => {
      const state = m.getState();
      // The relationship stage is stored in emotional state after setRelationshipStage
      // Since there's no dedicated getter, check if previousRelationshipStage was set
      // and use it as an indicator of the current stage
      return state.emotional.previousRelationshipStage;
    },
    set: (m, v) =>
      m.setRelationshipStage(v as 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor'),
  },

  // Response tracking
  lastResponseHadHumor: {
    get: (m) => m.getState().responseTracking.lastResponseHadHumor,
    set: (m, v) => {
      if (v) {
        m.markResponseHadHumor();
      } else {
        m.clearHumorFlag();
      }
    },
  },
  lastResponseHadStory: {
    get: (m) => m.getState().responseTracking.lastResponseHadStory,
    set: (m, v) => {
      if (v) {
        m.markResponseHadStory();
      } else {
        m.clearStoryFlag();
      }
    },
  },
  usedShareTags: {
    get: (m) => m.getState().responseTracking.usedShareTags,
    set: (m, v) => {
      const tags = v as string[];
      m.addShareTags(tags);
    },
  },
  spontaneousShareCount: {
    get: (m) => m.getState().responseTracking.spontaneousShareCount,
    set: (m, v) => {
      // Increment to target
      const current = m.getState().responseTracking.spontaneousShareCount;
      const target = v as number;
      for (let i = current; i < target; i++) {
        m.incrementSpontaneousShares();
      }
    },
  },

  // Bundle state
  bundleRuntimeState: {
    get: (m) => ({
      relationshipTurns: m.getState().bundle.relationshipTurns,
      currentMode: m.getState().bundle.currentMode,
      storiesToldThisSession: m.getState().bundle.storiesToldThisSession,
    }),
    set: (m, v) => {
      const bundle = v as UserBundleState;
      m.updateBundleState({
        relationshipTurns: bundle.relationshipTurns,
        currentMode: bundle.currentMode,
        storiesToldThisSession: bundle.storiesToldThisSession,
      });
    },
  },

  // Timing
  userSpeakingStartTime: {
    get: (m) => m.getState().timing.userSpeakingStartTime,
    set: (m) => m.markUserSpeaking(), // Sets the start time to now
  },
  userWentSilent: {
    get: (m) => m.getState().timing.userWentSilent,
    set: (m, v) => {
      if (v) m.markUserSilent();
    },
  },
};

/**
 * Create a UserData proxy that delegates to SessionStateManager
 *
 * @param stateManager - The SessionStateManager instance
 * @param initialDirectFields - Initial values for direct fields (services, etc.)
 * @returns A UserData object that proxies to SessionStateManager
 */
export function createUserDataProxy(
  stateManager: SessionStateManager,
  initialDirectFields: Partial<DirectFields> = {}
): UserData {
  // Storage for fields not managed by SessionStateManager
  const directStorage: DirectFields = { ...initialDirectFields };

  const handler: ProxyHandler<object> = {
    get(_target, prop: string) {
      // Special: expose the underlying state manager
      if (prop === '__stateManager') {
        return stateManager;
      }

      // Check if this is a state-manager-mapped field
      const mapping = STATE_MANAGER_MAPPINGS[prop];
      if (mapping) {
        return mapping.get(stateManager);
      }

      // Otherwise, return from direct storage
      return directStorage[prop as keyof DirectFields];
    },

    set(_target, prop: string, value) {
      // Check if this is a state-manager-mapped field
      const mapping = STATE_MANAGER_MAPPINGS[prop];
      if (mapping) {
        mapping.set(stateManager, value);
        return true;
      }

      // Otherwise, store in direct storage
      (directStorage as Record<string, unknown>)[prop] = value;
      return true;
    },

    has(_target, prop: string) {
      return prop in STATE_MANAGER_MAPPINGS || prop in directStorage;
    },

    ownKeys() {
      return [...Object.keys(STATE_MANAGER_MAPPINGS), ...Object.keys(directStorage)];
    },

    getOwnPropertyDescriptor(_target, prop: string) {
      if (prop in STATE_MANAGER_MAPPINGS || prop in directStorage) {
        return {
          enumerable: true,
          configurable: true,
          writable: true,
        };
      }
      return undefined;
    },
  };

  return new Proxy({}, handler) as UserData;
}

/**
 * Check if a UserData object is a proxy
 */
export function isUserDataProxy(userData: UserData): boolean {
  return userData.__stateManager !== undefined;
}

/**
 * Get the underlying SessionStateManager from a UserData proxy
 */
export function getStateManager(userData: UserData): SessionStateManager | undefined {
  return userData.__stateManager;
}
