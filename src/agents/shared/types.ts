/**
 * Shared Types for Voice Agents
 *
 * UserData: Session-scoped user state that persists across turns
 */

import type { SessionServices } from '../../services/index.js';
import type { VoiceEmotionResult } from '../../speech/audio-prosody.js';
import type { VoiceEmotionModulation } from '../../speech/emotion-matching.js';
import type { MoodState, PersonaMood } from '../../intelligence/context-builders/persona-mood.js';
import type { ConversationStateManager } from '../../services/conversation-state.js';

export type { PersonaMood, MoodState };

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
// USER DATA
// ============================================================================

export interface BundleRuntimeState {
  relationshipTurns: number;
  currentMode: string;
  storiesToldThisSession: string[];
  lastModeTransition?: string;
}

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

  // Timing
  userSpeakingStartTime?: number;
  userWentSilent?: boolean;

  // Voice emotion tracking
  voiceEmotion?: VoiceEmotionResult;
  emotionModulation?: VoiceEmotionModulation;

  // Conversation context for humanization
  lastUserMessage?: string;
  lastAgentResponse?: string; // For response quality tracking
  lastEmotionAnalysis?: {
    primary: string;
    intensity: number;
    distressLevel?: number;
  };

  // Human-level feature tracking
  lastResponseHadHumor?: boolean; // For humor calibration feedback
  lastResponseHadStory?: boolean; // For story preference feedback

  // Bundle runtime state (persona behaviors)
  bundleRuntimeState?: BundleRuntimeState;

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
    pendingItems?: { type: string; content: string; timestamp: Date }[];
    patterns?: { trait: string; count: number }[];
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
