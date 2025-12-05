/**
 * Voice Emotion → Cognitive State Integration
 *
 * Maps detected voice emotions to cognitive state adjustments.
 * When we hear stress in someone's voice, we should shift to
 * a more empathetic cognitive mode, regardless of the persona's default.
 *
 * This creates emotionally intelligent voice AI that responds to
 * HOW something is said, not just WHAT is said.
 */

import { getLogger } from '../utils/safe-logger.js';
import type { ReasoningStyle, CognitiveContext } from '../personas/cognitive-types.js';
import type { EmotionResult } from './emotion-detector.js';

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceEmotionSignals {
  /** Primary detected emotion */
  emotion: string;
  /** Confidence in detection (0-1) */
  confidence: number;
  /** Speech rate (words per minute) */
  speechRate?: number;
  /** Pitch variance (normalized) */
  pitchVariance?: number;
  /** Volume level (normalized) */
  volume?: number;
  /** Detected tremor in voice */
  hasTremor?: boolean;
  /** Detected sighing */
  hasSighing?: boolean;
  /** Speaking faster than normal */
  isRushed?: boolean;
  /** Long pauses between words */
  hasHesitation?: boolean;
}

export interface CognitiveStateAdjustment {
  /** Suggested shift in reasoning style */
  suggestedStyle?: ReasoningStyle;
  /** Strength of suggestion (0-1) */
  suggestionStrength: number;
  /** Whether to prioritize empathy */
  prioritizeEmpathy: boolean;
  /** Whether to slow down pace */
  slowDown: boolean;
  /** Whether to add more pauses */
  addPauses: boolean;
  /** Whether to soften tone */
  softenTone: boolean;
  /** Whether to check understanding more */
  increaseComprehensionChecks: boolean;
  /** Emotional weight adjustment */
  emotionalWeightBoost: number;
  /** Reason for adjustment */
  reason: string;
}

// ============================================================================
// EMOTION → COGNITIVE MAPPINGS
// ============================================================================

const EMOTION_TO_COGNITIVE_MAP: Record<string, Partial<CognitiveStateAdjustment>> = {
  // Negative emotions that need empathetic response
  sad: {
    suggestedStyle: 'empathetic',
    suggestionStrength: 0.8,
    prioritizeEmpathy: true,
    slowDown: true,
    addPauses: true,
    softenTone: true,
    emotionalWeightBoost: 0.3,
  },
  anxious: {
    suggestedStyle: 'empathetic',
    suggestionStrength: 0.7,
    prioritizeEmpathy: true,
    slowDown: true,
    addPauses: true,
    softenTone: true,
    emotionalWeightBoost: 0.25,
  },
  stressed: {
    suggestedStyle: 'empathetic',
    suggestionStrength: 0.75,
    prioritizeEmpathy: true,
    slowDown: true,
    addPauses: true,
    softenTone: true,
    emotionalWeightBoost: 0.25,
  },
  frustrated: {
    suggestedStyle: 'empathetic',
    suggestionStrength: 0.6,
    prioritizeEmpathy: true,
    slowDown: false,
    addPauses: true,
    softenTone: true,
    increaseComprehensionChecks: true,
    emotionalWeightBoost: 0.2,
  },
  angry: {
    suggestedStyle: 'empathetic',
    suggestionStrength: 0.5,
    prioritizeEmpathy: true,
    slowDown: true,
    addPauses: true,
    softenTone: true,
    emotionalWeightBoost: 0.3,
  },
  grief: {
    suggestedStyle: 'empathetic',
    suggestionStrength: 0.9,
    prioritizeEmpathy: true,
    slowDown: true,
    addPauses: true,
    softenTone: true,
    emotionalWeightBoost: 0.4,
  },

  // Confused states that need systematic/patient response
  confused: {
    suggestedStyle: 'systematic',
    suggestionStrength: 0.6,
    prioritizeEmpathy: false,
    slowDown: true,
    addPauses: true,
    softenTone: false,
    increaseComprehensionChecks: true,
    emotionalWeightBoost: 0.1,
  },
  uncertain: {
    suggestedStyle: 'systematic',
    suggestionStrength: 0.5,
    prioritizeEmpathy: false,
    slowDown: true,
    addPauses: true,
    increaseComprehensionChecks: true,
    emotionalWeightBoost: 0.1,
  },
  overwhelmed: {
    suggestedStyle: 'empathetic',
    suggestionStrength: 0.75,
    prioritizeEmpathy: true,
    slowDown: true,
    addPauses: true,
    softenTone: true,
    increaseComprehensionChecks: true,
    emotionalWeightBoost: 0.3,
  },

  // Positive emotions - match energy
  excited: {
    suggestedStyle: 'pragmatic',
    suggestionStrength: 0.4,
    prioritizeEmpathy: false,
    slowDown: false,
    addPauses: false,
    softenTone: false,
    emotionalWeightBoost: -0.1,
  },
  happy: {
    suggestionStrength: 0.3,
    prioritizeEmpathy: false,
    slowDown: false,
    addPauses: false,
    softenTone: false,
    emotionalWeightBoost: -0.1,
  },
  enthusiastic: {
    suggestedStyle: 'pragmatic',
    suggestionStrength: 0.4,
    prioritizeEmpathy: false,
    slowDown: false,
    addPauses: false,
    softenTone: false,
    emotionalWeightBoost: -0.1,
  },

  // Reflective states - match contemplation
  thoughtful: {
    suggestedStyle: 'intuitive',
    suggestionStrength: 0.5,
    prioritizeEmpathy: false,
    slowDown: true,
    addPauses: true,
    softenTone: false,
    emotionalWeightBoost: 0.05,
  },
  reflective: {
    suggestedStyle: 'narrative',
    suggestionStrength: 0.5,
    prioritizeEmpathy: false,
    slowDown: true,
    addPauses: true,
    softenTone: false,
    emotionalWeightBoost: 0.05,
  },
};

// ============================================================================
// MAIN INTEGRATION
// ============================================================================

/**
 * Process voice emotion signals and return cognitive adjustments
 */
export function processVoiceEmotion(signals: VoiceEmotionSignals): CognitiveStateAdjustment {
  const emotionLower = signals.emotion.toLowerCase();
  const baseAdjustment = EMOTION_TO_COGNITIVE_MAP[emotionLower] || {};

  // Start with base adjustment
  const adjustment: CognitiveStateAdjustment = {
    suggestionStrength: baseAdjustment.suggestionStrength ?? 0.3,
    prioritizeEmpathy: baseAdjustment.prioritizeEmpathy ?? false,
    slowDown: baseAdjustment.slowDown ?? false,
    addPauses: baseAdjustment.addPauses ?? false,
    softenTone: baseAdjustment.softenTone ?? false,
    increaseComprehensionChecks: baseAdjustment.increaseComprehensionChecks ?? false,
    emotionalWeightBoost: baseAdjustment.emotionalWeightBoost ?? 0,
    reason: `Detected ${emotionLower} emotion`,
    ...baseAdjustment,
  };

  // Enhance based on confidence
  if (signals.confidence > 0.8) {
    adjustment.suggestionStrength *= 1.2;
    adjustment.emotionalWeightBoost *= 1.2;
  } else if (signals.confidence < 0.5) {
    adjustment.suggestionStrength *= 0.7;
    adjustment.emotionalWeightBoost *= 0.7;
  }

  // Voice quality signals
  if (signals.hasTremor) {
    adjustment.prioritizeEmpathy = true;
    adjustment.softenTone = true;
    adjustment.slowDown = true;
    adjustment.emotionalWeightBoost += 0.15;
    adjustment.reason += ', voice tremor detected';
  }

  if (signals.hasSighing) {
    adjustment.addPauses = true;
    adjustment.emotionalWeightBoost += 0.1;
    adjustment.reason += ', sighing detected';
  }

  if (signals.hasHesitation) {
    adjustment.increaseComprehensionChecks = true;
    adjustment.slowDown = true;
    adjustment.reason += ', hesitation in speech';
  }

  if (signals.isRushed) {
    adjustment.slowDown = true; // Counter the rush with calm
    adjustment.addPauses = true;
    adjustment.reason += ', rushed speech detected';
  }

  // Speech rate adjustments
  if (signals.speechRate) {
    if (signals.speechRate < 100) {
      // Very slow speech might indicate sadness or exhaustion
      adjustment.slowDown = true;
      adjustment.softenTone = true;
      adjustment.emotionalWeightBoost += 0.1;
    } else if (signals.speechRate > 200) {
      // Very fast speech might indicate anxiety or excitement
      adjustment.slowDown = true;
      adjustment.emotionalWeightBoost += 0.1;
    }
  }

  // Clamp values
  adjustment.suggestionStrength = Math.max(0, Math.min(1, adjustment.suggestionStrength));
  adjustment.emotionalWeightBoost = Math.max(-0.2, Math.min(0.5, adjustment.emotionalWeightBoost));

  getLogger().debug(
    {
      emotion: signals.emotion,
      confidence: signals.confidence,
      adjustment: {
        suggestedStyle: adjustment.suggestedStyle,
        prioritizeEmpathy: adjustment.prioritizeEmpathy,
        emotionalWeightBoost: adjustment.emotionalWeightBoost,
      },
    },
    '🎤 Voice emotion processed'
  );

  return adjustment;
}

/**
 * Apply voice emotion adjustments to cognitive context
 */
export function applyVoiceEmotionToContext(
  context: CognitiveContext,
  signals: VoiceEmotionSignals
): CognitiveContext {
  const adjustment = processVoiceEmotion(signals);

  return {
    ...context,
    emotionalWeight: Math.min(1, context.emotionalWeight + adjustment.emotionalWeightBoost),
    // Store the suggested style shift for the cognitive engine to consider
  };
}

/**
 * Should cognitive engine override its default style based on voice emotion?
 */
export function shouldOverrideStyle(
  defaultStyle: ReasoningStyle,
  adjustment: CognitiveStateAdjustment
): boolean {
  // If empathy is prioritized and default isn't empathetic, suggest override
  if (adjustment.prioritizeEmpathy && defaultStyle !== 'empathetic') {
    return adjustment.suggestionStrength > 0.6;
  }

  // If a specific style is suggested with high confidence
  if (adjustment.suggestedStyle && adjustment.suggestedStyle !== defaultStyle) {
    return adjustment.suggestionStrength > 0.7;
  }

  return false;
}

/**
 * Get combined cognitive style considering voice emotion
 */
export function getCombinedCognitiveStyle(
  personaDefaultStyle: ReasoningStyle,
  voiceAdjustment: CognitiveStateAdjustment
): ReasoningStyle {
  if (shouldOverrideStyle(personaDefaultStyle, voiceAdjustment)) {
    return voiceAdjustment.suggestedStyle || 'empathetic';
  }
  return personaDefaultStyle;
}

/**
 * Generate voice-aware response guidance
 */
export function generateVoiceAwareGuidance(signals: VoiceEmotionSignals): string[] {
  const guidance: string[] = [];
  const adjustment = processVoiceEmotion(signals);

  if (adjustment.prioritizeEmpathy) {
    guidance.push('[VOICE SIGNAL] User sounds emotionally affected. Lead with empathy.');
  }

  if (adjustment.slowDown) {
    guidance.push('[VOICE SIGNAL] Slow down your pace. Give them space.');
  }

  if (adjustment.softenTone) {
    guidance.push('[VOICE SIGNAL] Use a gentler, softer tone.');
  }

  if (adjustment.increaseComprehensionChecks) {
    guidance.push('[VOICE SIGNAL] Check for understanding more frequently.');
  }

  if (adjustment.addPauses) {
    guidance.push('[VOICE SIGNAL] Add thoughtful pauses between ideas.');
  }

  if (signals.hasTremor) {
    guidance.push(
      '[VOICE SIGNAL] Voice tremor detected - this person may be struggling. Be gentle.'
    );
  }

  return guidance;
}

// ============================================================================
// SESSION TRACKING
// ============================================================================

interface SessionVoiceEmotionState {
  recentEmotions: string[];
  emotionalTrend: 'improving' | 'worsening' | 'stable';
  averageStress: number;
  totalSamples: number;
}

const sessionVoiceStates = new Map<string, SessionVoiceEmotionState>();

/**
 * Track voice emotion over session
 */
export function trackSessionVoiceEmotion(
  sessionId: string,
  signals: VoiceEmotionSignals
): SessionVoiceEmotionState {
  if (!sessionVoiceStates.has(sessionId)) {
    sessionVoiceStates.set(sessionId, {
      recentEmotions: [],
      emotionalTrend: 'stable',
      averageStress: 0.3,
      totalSamples: 0,
    });
  }

  const state = sessionVoiceStates.get(sessionId)!;

  // Track recent emotions
  state.recentEmotions.push(signals.emotion);
  if (state.recentEmotions.length > 10) {
    state.recentEmotions.shift();
  }

  // Calculate stress level from emotion
  const stressEmotions = [
    'stressed',
    'anxious',
    'frustrated',
    'angry',
    'overwhelmed',
    'sad',
    'grief',
  ];
  const calmEmotions = ['happy', 'excited', 'relaxed', 'content', 'peaceful'];

  const isStress = stressEmotions.includes(signals.emotion.toLowerCase());
  const isCalm = calmEmotions.includes(signals.emotion.toLowerCase());

  // Update average stress
  const stressScore = isStress ? 0.8 : isCalm ? 0.2 : 0.4;
  state.averageStress =
    (state.averageStress * state.totalSamples + stressScore) / (state.totalSamples + 1);
  state.totalSamples++;

  // Determine trend (last 5 vs previous)
  if (state.recentEmotions.length >= 5) {
    const recent = state.recentEmotions.slice(-3);
    const earlier = state.recentEmotions.slice(-6, -3);

    const recentStress = recent.filter((e) => stressEmotions.includes(e.toLowerCase())).length;
    const earlierStress = earlier.filter((e) => stressEmotions.includes(e.toLowerCase())).length;

    if (recentStress < earlierStress) {
      state.emotionalTrend = 'improving';
    } else if (recentStress > earlierStress) {
      state.emotionalTrend = 'worsening';
    } else {
      state.emotionalTrend = 'stable';
    }
  }

  return state;
}

/**
 * Get session voice emotion state
 */
export function getSessionVoiceState(sessionId: string): SessionVoiceEmotionState | null {
  return sessionVoiceStates.get(sessionId) || null;
}

/**
 * Clear session voice state
 */
export function clearSessionVoiceState(sessionId: string): void {
  sessionVoiceStates.delete(sessionId);
}

export default {
  processVoiceEmotion,
  applyVoiceEmotionToContext,
  shouldOverrideStyle,
  getCombinedCognitiveStyle,
  generateVoiceAwareGuidance,
  trackSessionVoiceEmotion,
  getSessionVoiceState,
  clearSessionVoiceState,
};
