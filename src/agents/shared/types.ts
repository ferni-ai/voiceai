/**
 * Shared Types for Voice Agents
 *
 * UserData: Session-scoped user state that persists across turns
 */

import type { EnglishAccent, VoicePreference } from '../../config/voice-accents.js';
import type { MoodState, PersonaMood } from '../../intelligence/context-builders/persona-mood.js';
import type { BundleRuntimeState, UserBundleState } from '../../personas/bundles/index.js';
import type { ConversationStateManager } from '../../services/conversation-state.js';
import type { SessionServices } from '../../services/index.js';
import type { VoiceEmotionResult } from '../../speech/audio-prosody.js';
import type { VoiceEmotionModulation } from '../../speech/emotion-matching.js';
import type { LaughterDetectionResult } from '../../speech/voice-humanization.js';

export type { EnglishAccent, VoicePreference };

export type { MoodState, PersonaMood };

// ============================================================================
// HANDOFF TOOL TYPES
// ============================================================================

/**
 * FIX BUG #39: Proper type for handoff tool results
 * This provides type safety instead of `as unknown as` casts
 */
export interface HandoffToolResult {
  /** Instructions for the new persona */
  instructions?: string;
  /** ID of the new agent after handoff */
  newAgent?: string;
  /** Greeting phrase for the new agent */
  newAgentGreeting?: string;
  /** Error message if handoff failed */
  error?: string;
  /** Whether the handoff was rate limited */
  rateLimited?: boolean;
}

/**
 * FIX BUG #39: Proper type for handoff tool execute function
 * The execute function from llm.tool() takes (params, options) - we only care about params here
 */
export interface HandoffTool {
  execute?: (params: { reason: string }, options?: unknown) => Promise<HandoffToolResult>;
}

// ============================================================================
// BUNDLE RUNTIME STATE
// Re-exported from canonical source in personas/bundles
// ============================================================================

export type { BundleRuntimeState, UserBundleState };

// ============================================================================
// USER DATA
// ============================================================================

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

  // Voice preferences (international accent support)
  voicePreference?: VoicePreference;
  /** Shorthand for voicePreference.accent */
  preferredAccent?: EnglishAccent;

  // Timing
  userSpeakingStartTime?: number;
  userWentSilent?: boolean;

  // Voice emotion tracking
  voiceEmotion?: VoiceEmotionResult;
  emotionModulation?: VoiceEmotionModulation;

  // Voice humanization - laughter detection
  detectedLaughter?: LaughterDetectionResult;

  // Voice humanization - ambient awareness
  // Maps to EnvironmentType from ambient-awareness.ts
  ambientEnvironment?:
    | 'quiet_room'
    | 'office'
    | 'coffee_shop'
    | 'outdoors'
    | 'car'
    | 'public_transit'
    | 'noisy'
    | 'unknown';
  ambientNoiseLevel?: number; // 0-1 scale

  // Conversation context for humanization
  lastUserMessage?: string;
  lastAgentResponse?: string; // For response quality tracking
  lastAgentResponseTime?: number; // For engagement scoring
  lastEmotionAnalysis?: {
    primary: string;
    intensity: number;
    distressLevel?: number;
  };

  // Human-level feature tracking
  lastResponseHadHumor?: boolean; // For humor calibration feedback
  lastResponseHadStory?: boolean; // For story preference feedback

  // Bundle runtime state (persona behaviors)
  // Uses UserBundleState which is a subset of BundleRuntimeState
  bundleRuntimeState?: UserBundleState;

  // Story tracking
  storiesShared?: string[];
  lastStoryTurn?: number;

  // Key moments captured this session
  keyMoments?: string[];

  // ============================================================
  // HUMANIZING STATE
  // Tracks mood, spontaneous shares, and relationship depth
  // ============================================================

  /** Tags from spontaneous shares (to avoid repetition) */
  usedShareTags?: string[];

  /** Number of spontaneous shares this session */
  spontaneousShareCount?: number;

  /** Last persona mood state */
  lastMood?: MoodState;

  /** Previous relationship stage (for transition detection) */
  previousRelationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

  /** Current relationship stage */
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

  /** Session memory data for deep humanization (running jokes, patterns, etc.) */
  sessionData?: {
    previousTopics?: string[];
    pendingItems?: Array<{ type: string; content: string; timestamp: Date }>;
    patterns?: Array<{ trait: string; count: number }>;
    memorableQuotes?: string[];
    goals?: string[];
    peopleMentioned?: string[];
    sessionCount?: number;
  };

  // ============================================================
  // CONVERSATION STATE (Orchestration Integration)
  // Shared context across all tools for human-level conversation
  // ============================================================

  /** Conversation state manager for this session */
  conversationState?: ConversationStateManager;

  // ============================================================
  // MEMORY REPETITION PREVENTION
  // Tracks what has been referenced to avoid repeating
  // ============================================================

  /** Memory references already made this session (prevents repetition) */
  referencedMemories?: string[];

  /** Whether we've already referenced the last conversation topic in this session */
  hasReferencedLastConversation?: boolean;

  /** Personal themes already mentioned this session (prevents "always talks about Wyoming") */
  mentionedPersonalThemes?: Set<string>;

  // ============================================================
  // FIRST TASTE TRIAL STATE
  // "Better than Human" free trial experience tracking
  // ============================================================

  /** Whether this is a trial user */
  isTrialUser?: boolean;

  /** Whether this is their first conversation (trial welcome) */
  isFirstConversation?: boolean;

  /** Trial status check result (updated periodically) */
  trialStatus?: {
    inTrial: boolean;
    timeRemainingMs: number | null;
    approachingEnd: boolean;
    trialEnded: boolean;
  };

  /** Whether we've already spoken the trial end prompt this session */
  hasSpokenTrialEndPrompt?: boolean;

  // ============================================================
  // ADVANCED HUMANIZATION: Voice State Insights
  // Tracks pending voice-based observations ("you sound tired")
  // ============================================================

  /** Pending voice state insight to deliver at appropriate moment */
  pendingVoiceInsight?: {
    text: string;
    ssml: string;
    emotion: string;
    confidence: number;
  };

  /** Whether voice insight was delivered this session */
  deliveredVoiceInsight?: boolean;
}

// ============================================================================
// DAY CONTEXT (for time-aware responses)
// ============================================================================

export interface DayContext {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number;
  isWeekend: boolean;
  season: 'spring' | 'summer' | 'fall' | 'winter';
}

/**
 * Get current day context
 */
export function getDayContext(): DayContext {
  const now = new Date();
  const hour = now.getHours();
  const month = now.getMonth();
  const dayOfWeek = now.getDay();

  let timeOfDay: DayContext['timeOfDay'];
  if (hour >= 5 && hour < 12) {
    timeOfDay = 'morning';
  } else if (hour >= 12 && hour < 17) {
    timeOfDay = 'afternoon';
  } else if (hour >= 17 && hour < 21) {
    timeOfDay = 'evening';
  } else {
    timeOfDay = 'night';
  }

  let season: DayContext['season'];
  if (month >= 2 && month <= 4) {
    season = 'spring';
  } else if (month >= 5 && month <= 7) {
    season = 'summer';
  } else if (month >= 8 && month <= 10) {
    season = 'fall';
  } else {
    season = 'winter';
  }

  return {
    timeOfDay,
    dayOfWeek,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    season,
  };
}
