/**
 * Anticipatory Trigger Engine
 *
 * Phase 5: Anticipatory Triggers
 *
 * This is the core engine that fires triggers BEFORE full expression, enabling
 * "Better than Human" anticipation. It:
 *
 * 1. Monitors partial input in real-time
 * 2. Detects anticipatory signals (text + voice prosody)
 * 3. Decides whether to fire early based on confidence
 * 4. Generates appropriate "space-creating" responses
 *
 * Key insight: Responding supportively before someone finishes expressing
 * vulnerability creates a feeling of being truly understood.
 *
 * @module AnticipatoryTriggerEngine
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  AnticipatoryIntelligence,
  AnticipatedOutcomeType,
  VoiceProsodyCue,
  AnticipationEvent,
  UserTriggerProfile,
} from './user-trigger-profile.types.js';
import {
  detectAnticipatorySignals,
  recordAnticipationEvent,
  type SignalDetectionResult,
  type SignalLearnerConfig,
  DEFAULT_SIGNAL_LEARNER_CONFIG,
} from './anticipatory-signal-learner.js';

const log = createLogger({ module: 'anticipatory-trigger-engine' });

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface AnticipatoryEngineConfig {
  /** Minimum confidence to fire an anticipatory response */
  minFiringConfidence: number;
  /** How long to wait after last word before considering anticipation (ms) */
  pauseThresholdMs: number;
  /** Cooldown after firing before checking again (ms) */
  postFiringCooldownMs: number;
  /** Maximum input length to consider for anticipation (chars) */
  maxInputLengthForAnticipation: number;
  /** Minimum input length to consider for anticipation (chars) */
  minInputLengthForAnticipation: number;
  /** Signal learner config */
  signalConfig: SignalLearnerConfig;
}

export const DEFAULT_ENGINE_CONFIG: AnticipatoryEngineConfig = {
  minFiringConfidence: 0.7,
  pauseThresholdMs: 500,
  postFiringCooldownMs: 5000,
  maxInputLengthForAnticipation: 150,
  minInputLengthForAnticipation: 15,
  signalConfig: DEFAULT_SIGNAL_LEARNER_CONFIG,
};

// ============================================================================
// ANTICIPATORY RESPONSE TEMPLATES
// ============================================================================

/**
 * Space-creating responses for each anticipated outcome type.
 * These are gentle responses that create room for the user to continue.
 */
export interface AnticipatoryResponseTemplate {
  /** Short verbal response */
  verbal: string[];
  /** Non-verbal cue for avatar (e.g., micro-nod, softened expression) */
  nonVerbal: AvatarCue;
  /** Whether to lower voice volume slightly */
  softenVoice: boolean;
  /** Whether to add a pause after the response */
  pauseAfter: boolean;
  /** Pause duration in ms */
  pauseDurationMs: number;
}

export interface AvatarCue {
  expression: 'soften' | 'concern' | 'warmth' | 'excitement' | 'attentive' | 'neutral';
  gesture: 'micro-nod' | 'lean-in' | 'open-hands' | 'gentle-smile' | 'none';
  eyeContact: 'maintain' | 'soften' | 'give-space';
}

/**
 * Default response templates by anticipated outcome.
 * Personas can override these with their own voice.
 */
export const DEFAULT_RESPONSE_TEMPLATES: Record<AnticipatedOutcomeType, AnticipatoryResponseTemplate> = {
  vulnerability: {
    verbal: [
      "I'm here.",
      "Take your time.",
      "I'm listening.",
      "It's okay.",
      "I've got you.",
    ],
    nonVerbal: {
      expression: 'soften',
      gesture: 'lean-in',
      eyeContact: 'maintain',
    },
    softenVoice: true,
    pauseAfter: true,
    pauseDurationMs: 800,
  },
  distress: {
    verbal: [
      "I hear you.",
      "That sounds hard.",
      "I'm with you.",
      "Tell me more.",
      "I'm right here.",
    ],
    nonVerbal: {
      expression: 'concern',
      gesture: 'lean-in',
      eyeContact: 'maintain',
    },
    softenVoice: true,
    pauseAfter: true,
    pauseDurationMs: 1000,
  },
  celebration: {
    verbal: [
      "Oh!",
      "Really?!",
      "Tell me!",
      "Yes!",
      "Ooh!",
    ],
    nonVerbal: {
      expression: 'excitement',
      gesture: 'open-hands',
      eyeContact: 'maintain',
    },
    softenVoice: false,
    pauseAfter: false,
    pauseDurationMs: 200,
  },
  processing: {
    verbal: [
      "Mm-hmm.",
      "I see.",
      "Go on.",
      "And?",
      "Okay.",
    ],
    nonVerbal: {
      expression: 'attentive',
      gesture: 'micro-nod',
      eyeContact: 'maintain',
    },
    softenVoice: false,
    pauseAfter: true,
    pauseDurationMs: 500,
  },
  avoidance: {
    verbal: [
      "It's okay to talk about it.",
      "No rush.",
      "Only if you want to.",
      "We can sit with it.",
      "I notice that.",
    ],
    nonVerbal: {
      expression: 'warmth',
      gesture: 'none',
      eyeContact: 'give-space',
    },
    softenVoice: true,
    pauseAfter: true,
    pauseDurationMs: 1200,
  },
  request: {
    verbal: [
      "Of course.",
      "Sure.",
      "What do you need?",
      "How can I help?",
      "I'm on it.",
    ],
    nonVerbal: {
      expression: 'attentive',
      gesture: 'open-hands',
      eyeContact: 'maintain',
    },
    softenVoice: false,
    pauseAfter: false,
    pauseDurationMs: 300,
  },
  unknown: {
    verbal: [
      "Mm-hmm.",
      "Okay.",
      "I see.",
    ],
    nonVerbal: {
      expression: 'neutral',
      gesture: 'micro-nod',
      eyeContact: 'maintain',
    },
    softenVoice: false,
    pauseAfter: false,
    pauseDurationMs: 300,
  },
};

// ============================================================================
// SESSION STATE
// ============================================================================

interface AnticipatorySessionState {
  sessionId: string;
  anticipationsThisSession: number;
  lastAnticipationTime?: Date;
  lastPartialInput: string;
  lastDetectionResult?: SignalDetectionResult;
  pendingAnticipation?: PendingAnticipation;
}

interface PendingAnticipation {
  detectionResult: SignalDetectionResult;
  detectedAt: Date;
  partialInput: string;
  voiceProsody?: { cues: VoiceProsodyCue[]; overallScore: number };
}

// In-memory session states
const sessionStates = new Map<string, AnticipatorySessionState>();

// ============================================================================
// MAIN ENGINE
// ============================================================================

/**
 * Result from the anticipatory engine
 */
export interface AnticipatoryEngineResult {
  /** Whether to fire an anticipatory response */
  shouldFire: boolean;
  /** The anticipated outcome type */
  anticipatedOutcome: AnticipatedOutcomeType | null;
  /** Confidence in the anticipation */
  confidence: number;
  /** Recommended response template */
  responseTemplate: AnticipatoryResponseTemplate | null;
  /** Selected verbal response */
  verbalResponse: string | null;
  /** Why we decided (not) to fire */
  reason: string;
  /** Signal detection details */
  detection: SignalDetectionResult | null;
}

/**
 * Process partial input and determine if we should fire anticipatory response.
 *
 * Call this on each partial transcript update during user speech.
 */
export function processPartialInput(
  sessionId: string,
  partialInput: string,
  intelligence: AnticipatoryIntelligence,
  voiceProsody?: { cues: VoiceProsodyCue[]; overallScore: number },
  currentTopic?: string,
  config: AnticipatoryEngineConfig = DEFAULT_ENGINE_CONFIG
): AnticipatoryEngineResult {
  // Get or create session state
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = {
      sessionId,
      anticipationsThisSession: 0,
      lastPartialInput: '',
    };
    sessionStates.set(sessionId, state);
  }

  // Quick length checks
  if (partialInput.length < config.minInputLengthForAnticipation) {
    return {
      shouldFire: false,
      anticipatedOutcome: null,
      confidence: 0,
      responseTemplate: null,
      verbalResponse: null,
      reason: 'Input too short',
      detection: null,
    };
  }

  if (partialInput.length > config.maxInputLengthForAnticipation) {
    return {
      shouldFire: false,
      anticipatedOutcome: null,
      confidence: 0,
      responseTemplate: null,
      verbalResponse: null,
      reason: 'Input too long for anticipation (let them finish)',
      detection: null,
    };
  }

  // Check if input has changed significantly
  if (partialInput === state.lastPartialInput) {
    return {
      shouldFire: false,
      anticipatedOutcome: null,
      confidence: 0,
      responseTemplate: null,
      verbalResponse: null,
      reason: 'No change in input',
      detection: state.lastDetectionResult ?? null,
    };
  }

  state.lastPartialInput = partialInput;

  // Detect anticipatory signals
  const detection = detectAnticipatorySignals(
    partialInput,
    intelligence,
    voiceProsody,
    {
      sessionId,
      anticipationsThisSession: state.anticipationsThisSession,
      lastAnticipationTime: state.lastAnticipationTime,
      currentTopic,
      currentHour: new Date().getHours(),
    },
    config.signalConfig
  );

  state.lastDetectionResult = detection;

  // Check if safeguards blocked
  if (!detection.safeguardsAllowed) {
    return {
      shouldFire: false,
      anticipatedOutcome: null,
      confidence: 0,
      responseTemplate: null,
      verbalResponse: null,
      reason: detection.safeguardBlockReason ?? 'Blocked by safeguards',
      detection,
    };
  }

  // Check if we detected anything
  if (!detection.detected || !detection.anticipatedOutcome) {
    return {
      shouldFire: false,
      anticipatedOutcome: null,
      confidence: 0,
      responseTemplate: null,
      verbalResponse: null,
      reason: 'No anticipatory signals detected',
      detection,
    };
  }

  // Check confidence threshold
  if (detection.overallConfidence < config.minFiringConfidence) {
    // Store as pending - might fire if confidence increases
    state.pendingAnticipation = {
      detectionResult: detection,
      detectedAt: new Date(),
      partialInput,
      voiceProsody,
    };

    return {
      shouldFire: false,
      anticipatedOutcome: detection.anticipatedOutcome,
      confidence: detection.overallConfidence,
      responseTemplate: null,
      verbalResponse: null,
      reason: `Confidence ${(detection.overallConfidence * 100).toFixed(0)}% below threshold ${(config.minFiringConfidence * 100).toFixed(0)}%`,
      detection,
    };
  }

  // We're going to fire!
  const template = DEFAULT_RESPONSE_TEMPLATES[detection.anticipatedOutcome];
  const verbalResponse = selectVerbalResponse(template, detection.anticipatedOutcome);

  // Update session state
  state.anticipationsThisSession++;
  state.lastAnticipationTime = new Date();
  state.pendingAnticipation = undefined;

  log.info(
    {
      sessionId,
      anticipatedOutcome: detection.anticipatedOutcome,
      confidence: detection.overallConfidence.toFixed(2),
      verbalResponse,
      inputPreview: partialInput.slice(0, 50),
    },
    '⚡ Firing anticipatory response'
  );

  return {
    shouldFire: true,
    anticipatedOutcome: detection.anticipatedOutcome,
    confidence: detection.overallConfidence,
    responseTemplate: template,
    verbalResponse,
    reason: 'High confidence anticipatory signal detected',
    detection,
  };
}

/**
 * Check if there's a pending anticipation that should fire now.
 * Call this when detecting a pause in user speech.
 */
export function checkPendingAnticipation(
  sessionId: string,
  pauseDurationMs: number,
  config: AnticipatoryEngineConfig = DEFAULT_ENGINE_CONFIG
): AnticipatoryEngineResult | null {
  const state = sessionStates.get(sessionId);
  if (!state?.pendingAnticipation) {
    return null;
  }

  // Check if pause is long enough
  if (pauseDurationMs < config.pauseThresholdMs) {
    return null;
  }

  const pending = state.pendingAnticipation;
  const detection = pending.detectionResult;

  // Boost confidence due to pause (user is hesitating)
  const boostedConfidence = Math.min(detection.overallConfidence * 1.2, 1.0);

  if (boostedConfidence >= config.minFiringConfidence && detection.anticipatedOutcome) {
    const template = DEFAULT_RESPONSE_TEMPLATES[detection.anticipatedOutcome];
    const verbalResponse = selectVerbalResponse(template, detection.anticipatedOutcome);

    // Update session state
    state.anticipationsThisSession++;
    state.lastAnticipationTime = new Date();
    state.pendingAnticipation = undefined;

    log.info(
      {
        sessionId,
        anticipatedOutcome: detection.anticipatedOutcome,
        originalConfidence: detection.overallConfidence.toFixed(2),
        boostedConfidence: boostedConfidence.toFixed(2),
        pauseDurationMs,
      },
      '⚡ Firing anticipatory response on pause'
    );

    return {
      shouldFire: true,
      anticipatedOutcome: detection.anticipatedOutcome,
      confidence: boostedConfidence,
      responseTemplate: template,
      verbalResponse,
      reason: 'User pause boosted confidence above threshold',
      detection,
    };
  }

  return null;
}

/**
 * Record the outcome of an anticipatory response.
 * Call this after the user continues speaking following an anticipation.
 */
export function recordAnticipatoryOutcome(
  profile: UserTriggerProfile,
  sessionId: string,
  detection: SignalDetectionResult,
  userReaction: AnticipationEvent['userReaction'],
  responseType: AnticipationEvent['responseType'],
  voiceProsodyScore: number = 0,
  predictionCorrect: boolean = true
): UserTriggerProfile {
  if (!detection.signals.length) {
    return profile;
  }

  const topSignal = detection.signals[0];

  const event: AnticipationEvent = {
    signalId: topSignal.signal.id,
    timestamp: new Date(),
    partialInput: topSignal.matchedPhrase,
    voiceProsodyScore,
    responseType,
    userReaction,
    predictionCorrect,
    sessionId,
  };

  // Update session state
  const state = sessionStates.get(sessionId);
  if (state && userReaction === 'annoyed') {
    // Add extra cooldown if user was annoyed
    state.lastAnticipationTime = new Date();
  }

  log.debug(
    {
      signalId: topSignal.signal.id,
      responseType,
      reaction: userReaction,
      correct: event.predictionCorrect,
    },
    'Recorded anticipatory outcome'
  );

  return recordAnticipationEvent(profile, event);
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Select a verbal response, avoiding repetition within the session.
 */
function selectVerbalResponse(
  template: AnticipatoryResponseTemplate,
  _outcome: AnticipatedOutcomeType
): string {
  // Simple random selection for now
  // Could be enhanced to track recent responses and avoid repetition
  const index = Math.floor(Math.random() * template.verbal.length);
  return template.verbal[index];
}

/**
 * Get custom response templates for a persona.
 * Returns null if persona uses defaults.
 */
export function getPersonaResponseTemplates(
  _personaId: string
): Record<AnticipatedOutcomeType, AnticipatoryResponseTemplate> | null {
  // TODO: Load from persona bundle if custom templates exist
  // For now, return null to use defaults
  return null;
}

/**
 * Clear session state (for testing or session end).
 */
export function clearAnticipatorySession(sessionId: string): void {
  sessionStates.delete(sessionId);
}

/**
 * Clear all session states (for testing).
 */
export function clearAllAnticipatorySessions(): void {
  sessionStates.clear();
}

/**
 * Get session stats (for monitoring).
 */
export function getAnticipatorySessionStats(sessionId: string): {
  anticipationsThisSession: number;
  lastAnticipationTime: Date | null;
  hasPendingAnticipation: boolean;
} | null {
  const state = sessionStates.get(sessionId);
  if (!state) return null;

  return {
    anticipationsThisSession: state.anticipationsThisSession,
    lastAnticipationTime: state.lastAnticipationTime ?? null,
    hasPendingAnticipation: !!state.pendingAnticipation,
  };
}

// ============================================================================
// ANALYTICS
// ============================================================================

interface AnticipatoryEngineAnalytics {
  totalActiveSessions: number;
  totalAnticipationsFired: number;
  averageAnticipationsPerSession: number;
  lastFiringTime: Date | null;
}

let analyticsData = {
  totalAnticipationsFired: 0,
  lastFiringTime: null as Date | null,
};

/**
 * Record an anticipation firing for analytics.
 */
export function recordAnticipationFiring(): void {
  analyticsData.totalAnticipationsFired++;
  analyticsData.lastFiringTime = new Date();
}

/**
 * Get engine analytics.
 */
export function getAnticipatoryEngineAnalytics(): AnticipatoryEngineAnalytics {
  let totalAnticipations = 0;
  for (const state of sessionStates.values()) {
    totalAnticipations += state.anticipationsThisSession;
  }

  const sessionCount = sessionStates.size;

  return {
    totalActiveSessions: sessionCount,
    totalAnticipationsFired: analyticsData.totalAnticipationsFired,
    averageAnticipationsPerSession:
      sessionCount > 0 ? totalAnticipations / sessionCount : 0,
    lastFiringTime: analyticsData.lastFiringTime,
  };
}

/**
 * Reset analytics (for testing).
 */
export function resetAnticipatoryEngineAnalytics(): void {
  analyticsData = {
    totalAnticipationsFired: 0,
    lastFiringTime: null,
  };
}
