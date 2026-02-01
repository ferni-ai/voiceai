/**
 * Human Turn Intelligence
 *
 * Makes voice conversations feel natural by understanding HOW humans speak,
 * not just WHAT they say. This is the "Better than Human" edge.
 *
 * Capabilities:
 * 1. TURN BOUNDARY DETECTION - Know when user is really done (not just pausing to think)
 * 2. BACK-CHANNEL RESPONSES - "mmhmm", "yeah" to show presence during pauses
 * 3. EMOTIONAL PACING - Adapt response timing to user's emotional state
 * 4. INTERRUPTION GRACE - Yield gracefully when user wants to interject
 * 5. HESITATION AWARENESS - Recognize thinking sounds vs completion sounds
 * 6. SPEECH RHYTHM MATCHING - Mirror user's natural pace
 *
 * Philosophy: A good listener doesn't just wait for silence - they READ the room.
 *
 * @module voice-agent/human-turn-intelligence
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  analyzeTurnBoundary,
  hasDisfluencies,
  countWordsRust,
  isTurnAnalysisAvailable,
  isFluencyAnalysisAvailable,
  isTokenCountingAvailable,
} from '../../memory/rust-accelerator.js';

const log = createLogger({ module: 'HumanTurnIntelligence' });

// Check Rust availability at module load - will be used for fast path
const RUST_TURN_AVAILABLE = isTurnAnalysisAvailable();
const RUST_FLUENCY_AVAILABLE = isFluencyAnalysisAvailable();
const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();

if (RUST_TURN_AVAILABLE) {
  log.info('🦀 Rust turn analysis enabled (Aho-Corasick O(n) matching)');
}
if (RUST_FLUENCY_AVAILABLE) {
  log.info('🦀 Rust fluency analysis enabled (disfluency detection)');
}
if (RUST_COUNTING_AVAILABLE) {
  log.info('🦀 Rust token counting enabled (byte-level counting)');
}

// ============================================================================
// TYPES
// ============================================================================

export interface TurnSignals {
  /** Is the user likely done speaking? */
  isComplete: boolean;
  /** Confidence that user is done (0-1) */
  completionConfidence: number;
  /** Should we give a back-channel response? ("mmhmm", "yeah") */
  shouldBackchannel: boolean;
  /** Suggested back-channel if any */
  backchannelSuggestion?: string;
  /** Is user showing signs of wanting to continue? */
  wantsToContinue: boolean;
  /** Is user showing urgency/excitement? */
  isUrgent: boolean;
  /** Is user hesitating/thinking? */
  isHesitating: boolean;
  /** Recommended response delay (ms) - adapt to their pace */
  recommendedDelay: number;
  /** Should we yield floor if we're speaking? */
  shouldYieldFloor: boolean;
}

export interface TurnContext {
  /** Current transcript text */
  transcript: string;
  /** Is this a final transcript? */
  isFinal: boolean;
  /** Duration of current utterance (ms) */
  utteranceDurationMs?: number;
  /** Time since last word (ms) - if available */
  silenceDurationMs?: number;
  /** User's detected emotion */
  emotion?: 'neutral' | 'happy' | 'sad' | 'angry' | 'anxious' | 'excited';
  /** Emotional intensity (0-1) */
  emotionalIntensity?: number;
  /** Average words per minute (if tracked) */
  userSpeechRate?: number;
  /** Is agent currently speaking? */
  isAgentSpeaking: boolean;
  /** Number of turns in this conversation */
  turnCount: number;
  /** Previous user message (for context) */
  previousMessage?: string;
}

interface SessionState {
  /** Running average of user's pause duration before completing */
  avgCompletionPause: number;
  /** Running average of user's speech rate (WPM) */
  avgSpeechRate: number;
  /** Count of samples for averaging */
  sampleCount: number;
  /** Last few pause durations */
  recentPauses: number[];
  /** User's typical sentence length */
  avgSentenceLength: number;
  /** Emotional baseline */
  emotionalBaseline: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Words that indicate user is thinking/not done */
const HESITATION_MARKERS = [
  /\b(um+|uh+|er+|ah+|hmm+|like|you know|i mean|so+|well)\b/i,
  /\.{2,}$/, // Trailing dots
  /,\s*$/, // Trailing comma
];

/** Words that indicate user wants to continue */
const CONTINUATION_MARKERS = [
  /\b(and|but|so|because|then|also|actually|oh wait|hold on|actually)\s*$/i,
  /\b(the thing is|what i mean is|let me)\s*$/i,
];

/** Strong completion signals */
const COMPLETION_MARKERS = [
  /[.!?]\s*$/, // Ends with punctuation
  /\b(that's it|that's all|yeah|thanks|okay|alright|got it)\s*[.!?]?\s*$/i,
  /\b(right|you know\?|make sense\?)\s*$/i, // Question seeking response
];

/**
 * Action request patterns - these indicate a COMPLETE turn requesting an action
 * Even if they start with "Yeah" or "Okay", an action request is complete
 */
const ACTION_REQUEST_MARKERS = [
  // Music requests
  /\b(play|put on|start|queue)\s+(some\s+)?(more\s+)?(music|songs?|tunes?)/i,
  /\b(play|put on)\s+.+\s+(music|by\s+)/i,
  // Weather requests
  /\b(check|what('s| is)|how('s| is))\s+(the\s+)?weather/i,
  // Communication requests
  /\b(call|text|message|email)\s+/i,
  // Calendar/reminder requests
  /\b(set|create|schedule|remind)\s+(a\s+)?(reminder|meeting|appointment|event)/i,
  // Handoff requests
  /\b(talk to|speak with|switch to|transfer to|let me talk to)\s+(maya|peter|alex|jordan|nayan|ferni)/i,
  // Search/lookup requests - FIXED: Allow multi-word queries after verbs
  // "search for some flights", "look up the best restaurants", "find me a hotel"
  /\b(search|look up|find)\s+(for\s+)?(some\s+|the\s+|a\s+|me\s+)?\w+/i,
  // Generic action verbs with multi-word targets
  // "check my calendar", "get the news", "tell me about X"
  /\b(play|check|get|tell me)\s+(the\s+|my\s+|about\s+)?\w+/i,
  // Question-form requests - "Could you X?", "Can you X?", "Would you X?"
  /\b(could|can|would|will)\s+you\s+\w+/i,
];

/** Phrases that indicate urgency */
const URGENCY_MARKERS = [
  /\b(help|urgent|emergency|need to|have to|quickly|asap|right now)\b/i,
  /!{2,}/, // Multiple exclamation marks
];

/** Back-channel responses for different contexts
 * "Better Than Human" Philosophy: Presence sounds, not commands or questions
 */
const BACKCHANNELS = {
  neutral: ['Mmhmm.', 'Yeah.', 'Mm.', 'Okay.'],
  empathetic: ['I hear you.', 'Yeah.', 'Mmm.', 'Of course.'],
  encouraging: ['Yeah!', "I'm here.", "I'm with you."],
  understanding: ['I get it.', 'Makes sense.', 'Yeah.', 'Right.'],
};

/** Default timing values */
const DEFAULT_COMPLETION_PAUSE_MS = 800; // How long humans typically pause before done
const MIN_BACKCHANNEL_PAUSE_MS = 1500; // Don't backchannel if pause is too short
const MAX_BACKCHANNEL_PAUSE_MS = 4000; // After this, they're probably waiting for us
const HESITATION_MULTIPLIER = 1.5; // Extend pause tolerance when hesitating

// ============================================================================
// SESSION STATE MANAGEMENT
// ============================================================================

const sessionStates = new Map<string, SessionState>();

function getSessionState(sessionId: string): SessionState {
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = {
      avgCompletionPause: DEFAULT_COMPLETION_PAUSE_MS,
      avgSpeechRate: 150, // Average WPM
      sampleCount: 0,
      recentPauses: [],
      avgSentenceLength: 12, // Words
      emotionalBaseline: 0.3,
    };
    sessionStates.set(sessionId, state);
  }
  return state;
}

/**
 * Update session state with new data (call after each completed turn)
 */
export function updateSessionState(
  sessionId: string,
  data: {
    completionPauseMs?: number;
    speechRateWpm?: number;
    sentenceLength?: number;
    emotionalIntensity?: number;
  }
): void {
  const state = getSessionState(sessionId);

  if (data.completionPauseMs) {
    state.recentPauses.push(data.completionPauseMs);
    if (state.recentPauses.length > 10) state.recentPauses.shift();
    state.avgCompletionPause =
      state.recentPauses.reduce((a, b) => a + b, 0) / state.recentPauses.length;
  }

  if (data.speechRateWpm) {
    state.avgSpeechRate =
      (state.avgSpeechRate * state.sampleCount + data.speechRateWpm) / (state.sampleCount + 1);
  }

  if (data.sentenceLength) {
    state.avgSentenceLength =
      (state.avgSentenceLength * state.sampleCount + data.sentenceLength) / (state.sampleCount + 1);
  }

  if (data.emotionalIntensity !== undefined) {
    state.emotionalBaseline =
      (state.emotionalBaseline * state.sampleCount + data.emotionalIntensity) /
      (state.sampleCount + 1);
  }

  state.sampleCount++;
}

/**
 * Clear session state
 */
export function clearSessionState(sessionId: string): void {
  sessionStates.delete(sessionId);
}

/**
 * Get the current average speech rate for a session
 * Used by the personality system for context-aware expression generation
 */
export function getAverageSpeechRate(sessionId: string): number | undefined {
  const state = sessionStates.get(sessionId);
  if (!state || state.sampleCount === 0) return undefined;
  return Math.round(state.avgSpeechRate);
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyze turn signals to understand user's communication state
 *
 * This is the core "human intelligence" - reading HOW someone speaks,
 * not just what they say.
 */
export function analyzeTurnSignals(sessionId: string, context: TurnContext): TurnSignals {
  const state = getSessionState(sessionId);
  const transcript = context.transcript.trim();

  // =========================================================================
  // SIGNAL DETECTION (Rust-accelerated when available)
  // =========================================================================

  let isHesitating: boolean;
  let hasContinuationMarker: boolean;
  let hasCompletionMarker: boolean;
  let wordCount: number;

  // Use Rust for O(n) multi-pattern matching vs O(n*m) JS regex loops
  if (RUST_TURN_AVAILABLE && RUST_FLUENCY_AVAILABLE && RUST_COUNTING_AVAILABLE) {
    // 🦀 FAST PATH: Single Rust call scans all patterns at once
    const turnAnalysis = analyzeTurnBoundary(transcript);

    // Map Rust results to our signal categories
    hasContinuationMarker = turnAnalysis.likelyContinuing || turnAnalysis.continuationCount > 0;
    hasCompletionMarker = turnAnalysis.likelyTurnComplete || turnAnalysis.turnFinalCount > 0;

    // Check for hesitation using fluency analysis (detects um, uh, er, etc.)
    isHesitating = hasDisfluencies(transcript);

    // Fast word count
    wordCount = countWordsRust(transcript);
  } else {
    // 🐢 SLOW PATH: JS regex fallback (10+ pattern tests)
    isHesitating = HESITATION_MARKERS.some((pattern) => pattern.test(transcript));
    hasContinuationMarker = CONTINUATION_MARKERS.some((pattern) => pattern.test(transcript));
    hasCompletionMarker = COMPLETION_MARKERS.some((pattern) => pattern.test(transcript));
    wordCount = transcript.split(/\s+/).filter((w) => w.length > 0).length;
  }

  // Check for urgency (not in Rust yet - few patterns, fast in JS)
  const isUrgent = URGENCY_MARKERS.some((pattern) => pattern.test(transcript));

  // Check for action requests - these should always be treated as complete turns
  // "Yeah, play some morning music." is a complete action request, not a partial thought
  const isActionRequest = ACTION_REQUEST_MARKERS.some((pattern) => pattern.test(transcript));

  const isSentenceLengthNormal = wordCount >= state.avgSentenceLength * 0.5;

  // Emotional state analysis
  const emotionalIntensity = context.emotionalIntensity ?? state.emotionalBaseline;
  const isEmotionallyHeightened = emotionalIntensity > state.emotionalBaseline * 1.5;

  // =========================================================================
  // COMPLETION CONFIDENCE CALCULATION
  // =========================================================================

  let completionConfidence = 0.5; // Start neutral

  // Positive signals (user is done)
  if (hasCompletionMarker) completionConfidence += 0.3;
  if (context.isFinal) completionConfidence += 0.2;
  if (isSentenceLengthNormal) completionConfidence += 0.1;

  // Action requests are ALWAYS complete - boost confidence significantly
  // This prevents the system from waiting when user says "play some music"
  if (isActionRequest) completionConfidence += 0.4;

  // Negative signals (user might continue)
  if (isHesitating) completionConfidence -= 0.25;
  // Don't penalize continuation markers for action requests
  // "Yeah, play some music" starts with "Yeah" but is still a complete request
  if (hasContinuationMarker && !isActionRequest) completionConfidence -= 0.4;
  if (!context.isFinal) completionConfidence -= 0.2;

  // Silence duration factor
  if (context.silenceDurationMs !== undefined) {
    const pauseTolerance = isHesitating
      ? state.avgCompletionPause * HESITATION_MULTIPLIER
      : state.avgCompletionPause;

    if (context.silenceDurationMs > pauseTolerance) {
      completionConfidence += 0.2;
    } else if (context.silenceDurationMs < pauseTolerance * 0.5) {
      completionConfidence -= 0.15;
    }
  }

  // Clamp to 0-1
  completionConfidence = Math.max(0, Math.min(1, completionConfidence));

  // =========================================================================
  // BACK-CHANNEL DECISION
  // =========================================================================

  let shouldBackchannel = false;
  let backchannelSuggestion: string | undefined;

  // Only backchannel during appropriate pauses
  const silenceMs = context.silenceDurationMs ?? 0;
  const inBackchannelWindow =
    silenceMs >= MIN_BACKCHANNEL_PAUSE_MS && silenceMs < MAX_BACKCHANNEL_PAUSE_MS;

  if (
    inBackchannelWindow &&
    !context.isAgentSpeaking &&
    !hasCompletionMarker &&
    (isHesitating || hasContinuationMarker)
  ) {
    shouldBackchannel = true;

    // Choose appropriate backchannel type
    const emotion = context.emotion ?? 'neutral';
    let channelType: keyof typeof BACKCHANNELS = 'neutral';

    if (emotion === 'sad' || emotion === 'anxious') {
      channelType = 'empathetic';
    } else if (emotion === 'excited' || emotion === 'happy') {
      channelType = 'encouraging';
    } else if (wordCount > 20) {
      channelType = 'understanding'; // They've shared a lot
    }

    const options = BACKCHANNELS[channelType];
    backchannelSuggestion = options[Math.floor(Math.random() * options.length)];
  }

  // =========================================================================
  // RESPONSE TIMING CALCULATION - "Better than Human"
  // Research: Human turn-taking gaps are 200-500ms. We aim for 30-150ms.
  // TTS synthesis is the real bottleneck (700-5000ms), so shaving delay here
  // directly improves perceived responsiveness.
  // =========================================================================

  // Base delay - superhuman responsiveness
  let recommendedDelay = 50; // Was 100ms - minimize gap before TTS starts

  // Emotional adjustment - brief space for sensitive moments
  if (context.emotion === 'sad' || context.emotion === 'anxious') {
    recommendedDelay += 80; // Was 150ms - presence over silence
  } else if (isUrgent || context.emotion === 'excited') {
    recommendedDelay = 20; // Was 50ms - near-instant for urgency
  }

  // Hesitation adjustment - wait briefly, not forever
  if (isHesitating && !context.isFinal) {
    recommendedDelay += 80; // Was 150ms - brief patience, not awkward silence
  }

  // Low confidence adjustment - minimal wait
  if (completionConfidence < 0.6) {
    recommendedDelay += 50; // Was 100ms - stay engaged even when uncertain
  }

  // =========================================================================
  // YIELD FLOOR DECISION
  // =========================================================================

  // Should we stop talking if we're speaking?
  const shouldYieldFloor =
    context.isAgentSpeaking &&
    (wordCount >= 3 || // They've started a real thought
      isUrgent || // They need something
      completionConfidence < 0.3); // They're clearly not done

  // =========================================================================
  // RESULT
  // =========================================================================

  // Action requests should be marked as complete even with lower confidence threshold
  // because they are explicit commands that don't need continuation
  const isComplete = context.isFinal && (completionConfidence > 0.6 || isActionRequest);

  const result: TurnSignals = {
    isComplete,
    completionConfidence,
    shouldBackchannel,
    backchannelSuggestion,
    // Action requests don't want to continue - they want the action executed
    wantsToContinue:
      !isActionRequest && (hasContinuationMarker || (isHesitating && completionConfidence < 0.5)),
    isUrgent: isUrgent || isActionRequest, // Action requests have implicit urgency
    isHesitating,
    recommendedDelay: isActionRequest ? 30 : recommendedDelay, // Near-instant for action requests
    shouldYieldFloor,
  };

  log.debug('Turn signals analyzed', {
    transcript: transcript.slice(0, 40),
    ...result,
    backchannelSuggestion: result.backchannelSuggestion || 'none',
  });

  return result;
}

// ============================================================================
// BACK-CHANNEL GENERATION
// ============================================================================

/**
 * Generate a contextually appropriate back-channel response
 *
 * Back-channels are the "mmhmm", "yeah", "I see" that humans use
 * to show they're listening without taking the floor.
 */
export function generateBackchannel(context: {
  emotion?: string;
  topic?: string;
  intensity?: number;
  turnCount: number;
}): string {
  const { emotion, intensity = 0.5, turnCount } = context;

  // Early in conversation - more formal
  if (turnCount < 3) {
    return 'Okay.';
  }

  // Match emotional tone
  if (emotion === 'sad' || emotion === 'anxious') {
    const empathetic = ['I hear you.', 'Yeah.', 'Mmm.', "That's hard."];
    return empathetic[Math.floor(Math.random() * empathetic.length)];
  }

  if (emotion === 'excited' || emotion === 'happy') {
    const encouraging = ['Yeah!', 'Nice!', 'Go on!', 'Okay!'];
    return encouraging[Math.floor(Math.random() * encouraging.length)];
  }

  // High intensity - acknowledge it
  if (intensity > 0.7) {
    const acknowledging = ['Wow.', 'Okay.', 'Yeah.', 'I see.'];
    return acknowledging[Math.floor(Math.random() * acknowledging.length)];
  }

  // Default neutral
  const neutral = ['Mmhmm.', 'Yeah.', 'Okay.', 'Right.'];
  return neutral[Math.floor(Math.random() * neutral.length)];
}

// ============================================================================
// SPEECH RHYTHM ANALYSIS
// ============================================================================

/**
 * Analyze speech rhythm to adapt agent's pacing
 *
 * Humans naturally mirror each other's speech patterns.
 * This helps us do the same.
 */
export function analyzeSpeechRhythm(
  sessionId: string,
  context: {
    wordsSpoken: number;
    durationMs: number;
    pauseCount: number;
  }
): {
  wordsPerMinute: number;
  pacingRecommendation: 'slow' | 'normal' | 'fast';
  pauseFrequency: 'frequent' | 'normal' | 'rare';
} {
  const state = getSessionState(sessionId);

  // Calculate WPM
  const minutes = context.durationMs / 60000;
  const wpm = minutes > 0 ? context.wordsSpoken / minutes : 150;

  // Update running average
  updateSessionState(sessionId, { speechRateWpm: wpm });

  // Categorize
  let pacingRecommendation: 'slow' | 'normal' | 'fast' = 'normal';
  if (wpm < 120) pacingRecommendation = 'slow';
  else if (wpm > 180) pacingRecommendation = 'fast';

  // Pause frequency
  const pausesPerMinute = minutes > 0 ? context.pauseCount / minutes : 0;
  let pauseFrequency: 'frequent' | 'normal' | 'rare' = 'normal';
  if (pausesPerMinute > 8) pauseFrequency = 'frequent';
  else if (pausesPerMinute < 3) pauseFrequency = 'rare';

  return {
    wordsPerMinute: Math.round(wpm),
    pacingRecommendation,
    pauseFrequency,
  };
}

// ============================================================================
// INTERRUPTION HANDLING
// ============================================================================

/**
 * Determine how to handle a potential interruption
 *
 * Good listeners know when to yield gracefully vs when
 * the person just made a noise.
 */
export function handleInterruption(context: {
  interruptionText: string;
  agentWasSaying: string;
  agentProgressPercent: number;
  userEmotion?: string;
}): {
  shouldYield: boolean;
  yieldStyle: 'immediate' | 'graceful' | 'acknowledge_then_continue';
  resumeText?: string;
} {
  const { interruptionText, agentProgressPercent, userEmotion } = context;
  const trimmed = interruptionText.trim().toLowerCase();

  // Strong interruption signals - yield immediately
  const immediateYieldTriggers = [
    /^(wait|stop|hold on|actually|no|hey|excuse me)/i,
    /^(i have a question|can i|let me)/i,
  ];

  for (const pattern of immediateYieldTriggers) {
    if (pattern.test(trimmed)) {
      return {
        shouldYield: true,
        yieldStyle: 'immediate',
      };
    }
  }

  // Emotional interruption - yield gracefully
  if (userEmotion === 'anxious' || userEmotion === 'sad') {
    return {
      shouldYield: true,
      yieldStyle: 'graceful',
    };
  }

  // Back-channel sound - acknowledge but continue
  const backchannelSounds = /^(yeah|okay|uh huh|mmhmm|mm|right|sure|got it)\.?$/i;
  if (backchannelSounds.test(trimmed)) {
    return {
      shouldYield: false,
      yieldStyle: 'acknowledge_then_continue',
    };
  }

  // Near the end of our turn - yield gracefully
  if (agentProgressPercent > 80) {
    return {
      shouldYield: true,
      yieldStyle: 'graceful',
    };
  }

  // Short interruption mid-thought - probably noise
  if (trimmed.length < 3 && agentProgressPercent < 50) {
    return {
      shouldYield: false,
      yieldStyle: 'acknowledge_then_continue',
    };
  }

  // Default - yield gracefully for any substantive interruption
  return {
    shouldYield: trimmed.split(/\s+/).length >= 2,
    yieldStyle: 'graceful',
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  analyzeTurnSignals,
  updateSessionState,
  clearSessionState,
  generateBackchannel,
  analyzeSpeechRhythm,
  handleInterruption,
};
