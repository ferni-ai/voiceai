/**
 * Shared Types for Voice Agents
 *
 * UserData: Session-scoped user state that persists across turns
 */

import type { EnglishAccent, VoicePreference } from '../../config/voice-accents.js';
import type {
  MoodState,
  PersonaMood,
} from '../../intelligence/context-builders/personas/persona-mood.js';
import type { SilenceAnalysis } from '../../intelligence/silence-intelligence.js';
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
  /** Active persona ID (e.g., 'ferni', 'peter-john') - used for TTS persona-specific traits */
  personaId?: string;

  // Session state
  isReturningUser?: boolean;
  turnCount?: number;
  lastTopic?: string;
  recentTopics?: string[];
  /** Recent user transcripts for multi-turn analysis (e.g., daily check-in) */
  recentTranscripts?: string[];

  // Services reference
  services?: SessionServices;

  // Voice preferences (international accent support)
  voicePreference?: VoicePreference;
  /** Shorthand for voicePreference.accent */
  preferredAccent?: EnglishAccent;
  /** Preferred language for speech recognition validation (default: 'en') */
  preferredLanguage?: string;

  /** User's IP-detected location (for weather, local info personalization) */
  userLocation?: {
    city?: string;
    regionCode?: string;
    countryCode?: string;
  };

  // Timing
  userSpeakingStartTime?: number;
  userWentSilent?: boolean;
  /** Whether the user was interrupted (for response recovery) */
  wasInterrupted?: boolean;
  /** Type of interrupt: 'hard' (wait/stop) or 'soft' (just started talking) */
  interruptType?: 'hard' | 'soft';
  /** Pending trailing SSML to inject before cut (graceful interrupt) */
  pendingTrailingSsml?: string;

  // Voice emotion tracking
  voiceEmotion?: VoiceEmotionResult;
  emotionModulation?: VoiceEmotionModulation;

  // Voice humanization - laughter detection
  detectedLaughter?: LaughterDetectionResult;

  // Voice biomarkers - sub-lexical voice features for emotion enrichment
  /** Real-time voice biomarkers from Rust DSP pipeline */
  voiceBiomarkers?: {
    /** Fundamental frequency in Hz */
    pitch: number;
    /** RMS energy 0-1 */
    energy: number;
    /** Pitch variation - anxiety indicator (0-1) */
    jitter: number;
    /** Amplitude variation - suppressed emotion indicator (0-1) */
    shimmer: number;
    /** Harmonic-to-noise ratio (0-1, higher = more breathy) */
    breathiness: number;
    /** Estimated syllables per second */
    speechRate: number;
    /** Currently in a breath pause */
    isBreathPause: boolean;
  };

  // Voice humanization - live backchanneling (breath pause detection)
  /** Whether user is currently in a breath pause (100-400ms silence mid-speech) */
  isInBreathPause?: boolean;
  /** How long user has been speaking this utterance (ms) */
  currentSpeechDurationMs?: number;
  /** Timestamp of last live backchannel */
  lastLiveBackchannelAt?: number;
  /** Duration of the last completed speech (ms) - used for noise filtering */
  lastSpeechDurationMs?: number;

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
  /** Whether we've already offered to pause for noisy environment this session */
  hasOfferedToPause?: boolean;
  /** Ambient acknowledgment phrase to inject into next response */
  pendingAmbientAcknowledgment?: string | null;
  /** Data capture acknowledgment to inject (e.g., "I saved Mom's number") */
  dataCaptureAcknowledgment?: string;

  // Greeting context (so LLM knows what it said)
  /** The greeting text that was spoken at session start */
  greetingText?: string;
  /** Whether the greeting has been injected into LLM context */
  greetingInjected?: boolean;

  // Conversation context for humanization
  lastUserMessage?: string;
  lastAgentResponse?: string; // For response quality tracking + echo detection
  lastAgentResponseTime?: number; // For engagement scoring
  /** Timestamp when agent finished speaking (for echo prevention cooldown) */
  lastAgentSpeechEndTime?: number;
  /** Duration of last agent utterance in ms (for adaptive echo prevention) */
  lastAgentUtteranceDurationMs?: number;
  /** Timestamp when agent started speaking (for duration calculation) */
  lastAgentSpeechStartTime?: number;
  /** Recommended delay before responding (from human turn intelligence) */
  recommendedResponseDelay?: number;
  /** How long user paused before speaking (ms) - for voice signal analysis */
  pauseBeforeSpeakingMs?: number;
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
  // BETTER THAN HUMAN - Prosody & Emotional Intelligence
  // Voice prosody signals and proactive interventions
  // ============================================================

  /** Voice prosody tool boost (from Better Than Human analysis) */
  prosodyBoost?: {
    boostedTools: string[];
    suppressedTools: string[];
    reason: string;
    confidence?: number;
  };

  /** Proactive intervention suggestion (from emotional arc tracking) */
  suggestedIntervention?: {
    type: string;
    message: string;
    tool: string;
    urgency: string;
  };

  /** Emotional arc tracking status */
  emotionalArc?: {
    dominantEmotion: string;
    trend: 'improving' | 'declining' | 'stable';
    needsAttention: boolean;
  };

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

  // ============================================================
  // TRIGGER EFFECTIVENESS TRACKING (Phase 4)
  // Tracks fired triggers for outcome recording on next turn
  // ============================================================

  /** Triggers fired in the previous turn (for outcome recording) */
  lastFiredTriggers?: Array<{
    name: string;
    category: string;
    timestamp: number;
  }>;

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

  // ============================================================
  // DEEP UNDERSTANDING: Silence Intelligence
  // Tracks the last analyzed silence for context building
  // ============================================================

  /** Last silence analysis from the silence intelligence system */
  lastSilenceAnalysis?: SilenceAnalysis;

  // ============================================================
  // EXTENSIBILITY: Plugin/Hook System
  // FIX AUDIT ISSUE: Added typed property to avoid `any` cast
  // ============================================================

  /** Session prompt from extensibility hooks (injected into context) */
  extensibilitySessionPrompt?: string | null;

  // ============================================================
  // PRE-SESSION BRIEFING: World/Time Awareness
  // Gives Ferni context about date, time, events BEFORE first turn
  // ============================================================

  /** Pre-session briefing with temporal/cultural context */
  preSessionBriefing?: string;

  /** When user's last conversation was (for briefing calculation) */
  lastConversationDate?: string;

  // ============================================================
  // BETTER THAN HUMAN: Calendar Awareness
  // Loaded asynchronously at session start - provides meeting context
  // ============================================================

  /** Calendar awareness context loaded at session start */
  calendarAwareness?: string;

  // ============================================================
  // macOS NATIVE APP CONTEXT
  // System intelligence from the macOS menubar app
  // ============================================================

  /** macOS desktop context from menubar app (sent via data channel) */
  macOS?: import('../../intelligence/context-builders/external/macos-context.js').MacOSContextPayload;

  // ============================================================
  // ANTICIPATORY TRIGGERS (Phase 5)
  // "Better than Human" early signal detection before full expression
  // ============================================================

  /** User's anticipatory intelligence profile (learned signals, patterns) */
  anticipatoryIntelligence?: import('../../intelligence/triggers/index.js').AnticipatoryIntelligence;

  /** User's full trigger profile (for saving at session end) */
  triggerProfile?: import('../../intelligence/triggers/index.js').UserTriggerProfile;

  /** Pending anticipatory detection from partial input (for outcome recording) */
  pendingAnticipatoryResult?: {
    detection: import('../../intelligence/triggers/index.js').SignalDetectionResult;
    firedAt: number;
    verbalResponse: string;
    anticipatedOutcome: string;
  } | null;

  /** Count of anticipatory firings this session (for safeguards) */
  anticipatoryFiringsThisSession?: number;

  /** Timestamp of last anticipatory firing (for cooldown) */
  lastAnticipatoryFiringAt?: number;

  // ============================================================
  // SEMANTIC INTELLIGENCE (Learning Loop Integration)
  // Tool prediction from semantic analysis for learning loop
  // ============================================================

  /** Semantic prediction from the current turn (for learning loop comparison) */
  semanticPrediction?: {
    /** Predicted tool ID */
    toolId: string;
    /** Confidence level (0-1) */
    confidence: number;
    /** Whether this was classified as a tool request */
    isToolRequest: boolean;
  };

  // ============================================================
  // BIDIRECTIONAL ENGAGEMENT: Thread Context
  // Cross-channel conversation continuity (SMS → voice, push → call)
  // ============================================================

  /** Thread context for LLM injection (when continuing a thread) */
  threadContext?: string;

  /** Active thread ID (if continuing a conversation) */
  threadId?: string;

  /** Whether this is a response to our proactive outreach */
  isOutreachResponse?: boolean;

  // ============================================================
  // UNIFIED TOOL ROUTING (UTO) STATE
  // Persists tool execution and system state across turns
  // ============================================================

  /** Last tool executed (persists across turns for LLM awareness) */
  lastToolExecuted?: {
    toolId: string;
    timestamp: Date;
    result?: string;
  };

  /** Current system state from UTO for context injection */
  systemState?: {
    music: {
      isPlaying: boolean;
      currentTrack?: { name: string; artist: string };
      volume: number;
      isDucked: boolean;
    };
    timers: { active: number; nextExpiry?: Date };
    lastToolExecuted?: { toolId: string; timestamp: Date; result?: string };
  };

  /** Tool hint from UTO for medium-confidence cases - tells LLM what tool to use */
  toolHint?: {
    toolId: string;
    guidance: string;
    confidence: number;
  };

  /** Index signature for extensibility (compatible with PersonaSessionData) */
  [key: string]: unknown;
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
