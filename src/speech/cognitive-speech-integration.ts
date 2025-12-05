/**
 * Cognitive Speech Integration
 *
 * Wires cognitive intelligence into the speech pipeline.
 * Adjusts voice parameters based on:
 * - Cognitive reasoning mode (analytical vs empathetic)
 * - Confidence level (certain vs uncertain)
 * - Thinking aloud (showing work)
 * - User cognitive style matching
 */

import { getLogger } from '../utils/safe-logger.js';
import type { SpeechContext } from './speech-context.js';
import type {
  CognitiveGuidance,
  ReasoningStyle,
  CognitiveProfile,
} from '../personas/cognitive-types.js';
import {
  calculateCognitiveSpeechAdjustments,
  applyCognitiveAdjustments,
  buildPauseSSML,
  getCognitiveThinkingSound,
  type CognitiveSpeechContext,
  type SpeechAdjustments,
} from './cognitive-speech.js';
import type { SpeechCharacteristics } from '../personas/types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface CognitiveSpeechInput {
  /** Base speech context */
  speechContext: SpeechContext;
  /** Base speech characteristics from persona */
  baseCharacteristics: SpeechCharacteristics;
  /** Current cognitive guidance */
  cognitiveGuidance: CognitiveGuidance;
  /** Full cognitive profile (optional) */
  cognitiveProfile?: CognitiveProfile;
  /** Emotional weight of conversation */
  emotionalWeight: number;
  /** Whether in a multi-step reasoning chain */
  inReasoningChain?: boolean;
  /** Current step in chain */
  chainStep?: number;
  /** Total steps */
  chainTotal?: number;
}

export interface CognitiveSpeechResult {
  /** Adjusted speech characteristics */
  characteristics: SpeechCharacteristics;
  /** SSML prefix to inject before text */
  ssmlPrefix: string;
  /** SSML suffix to inject after text */
  ssmlSuffix: string;
  /** Optional thinking sound to insert */
  thinkingSound?: string;
  /** Debug info */
  debug: {
    cognitiveMode: ReasoningStyle;
    confidence: number;
    adjustments: SpeechAdjustments;
  };
}

// ============================================================================
// SESSION STATE
// ============================================================================

interface SessionCognitiveAudioState {
  lastReasoningStyle: ReasoningStyle;
  thinkingSoundsUsed: number;
  totalTurns: number;
  showReasoningTurns: number;
}

const sessionStates = new Map<string, SessionCognitiveAudioState>();

function getOrCreateSessionState(sessionId: string): SessionCognitiveAudioState {
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, {
      lastReasoningStyle: 'narrative',
      thinkingSoundsUsed: 0,
      totalTurns: 0,
      showReasoningTurns: 0,
    });
  }
  return sessionStates.get(sessionId)!;
}

// ============================================================================
// MAIN INTEGRATION
// ============================================================================

/**
 * Apply cognitive adjustments to speech
 */
export function applyCognitiveSpeechAdjustments(
  input: CognitiveSpeechInput,
  sessionId: string
): CognitiveSpeechResult {
  const sessionState = getOrCreateSessionState(sessionId);
  sessionState.totalTurns++;

  const {
    speechContext,
    baseCharacteristics,
    cognitiveGuidance,
    emotionalWeight,
    inReasoningChain = false,
    chainStep,
    chainTotal,
  } = input;

  // Build cognitive speech context
  const cognitiveSpeechContext: CognitiveSpeechContext = {
    reasoningStyle: cognitiveGuidance.recommendedApproach,
    showingReasoning: cognitiveGuidance.showReasoning,
    confidence: cognitiveGuidance.confidenceLevel,
    emotionalWeight,
    inReasoningChain,
    chainStep,
    chainTotal,
  };

  // Calculate adjustments
  const adjustments = calculateCognitiveSpeechAdjustments(
    baseCharacteristics,
    cognitiveSpeechContext
  );

  // Apply to base characteristics
  const adjustedCharacteristics = applyCognitiveAdjustments(baseCharacteristics, adjustments);

  // Build SSML prefix/suffix
  let ssmlPrefix = '';
  let ssmlSuffix = '';

  // Add pauses from adjustments
  for (const pause of adjustments.additionalPauses) {
    if (pause.position === 'start') {
      ssmlPrefix += buildPauseSSML(pause);
    } else if (pause.position === 'end') {
      ssmlSuffix += buildPauseSSML(pause);
    }
  }

  // Determine if we should use a thinking sound
  let thinkingSound: string | undefined;
  const shouldUseThinkingSound =
    cognitiveGuidance.showReasoning &&
    sessionState.thinkingSoundsUsed < sessionState.totalTurns * 0.4 && // Max 40% of turns
    Math.random() < adjustedCharacteristics.thinkingSoundFrequency + adjustments.thinkingSoundBoost;

  if (shouldUseThinkingSound) {
    thinkingSound = getCognitiveThinkingSound(
      cognitiveGuidance.recommendedApproach,
      cognitiveGuidance.confidenceLevel
    );
    sessionState.thinkingSoundsUsed++;
  }

  // Track reasoning style changes
  if (sessionState.lastReasoningStyle !== cognitiveGuidance.recommendedApproach) {
    getLogger().debug(
      {
        sessionId,
        from: sessionState.lastReasoningStyle,
        to: cognitiveGuidance.recommendedApproach,
      },
      '🧠 Cognitive reasoning style shift'
    );
    sessionState.lastReasoningStyle = cognitiveGuidance.recommendedApproach;
  }

  // Track show reasoning
  if (cognitiveGuidance.showReasoning) {
    sessionState.showReasoningTurns++;
  }

  return {
    characteristics: adjustedCharacteristics,
    ssmlPrefix,
    ssmlSuffix,
    thinkingSound,
    debug: {
      cognitiveMode: cognitiveGuidance.recommendedApproach,
      confidence: cognitiveGuidance.confidenceLevel,
      adjustments,
    },
  };
}

/**
 * Build cognitive-aware SSML for a text response
 */
export function buildCognitiveSSML(text: string, cognitiveResult: CognitiveSpeechResult): string {
  let result = text;

  // Add thinking sound at start if present
  if (cognitiveResult.thinkingSound) {
    result = `${cognitiveResult.thinkingSound}... ${result}`;
  }

  // Wrap with prefix/suffix
  if (cognitiveResult.ssmlPrefix || cognitiveResult.ssmlSuffix) {
    result = `${cognitiveResult.ssmlPrefix}${result}${cognitiveResult.ssmlSuffix}`;
  }

  return result;
}

/**
 * Get cognitive speech stats for a session
 */
export function getCognitiveSpeechStats(sessionId: string): {
  totalTurns: number;
  thinkingSoundsUsed: number;
  thinkingSoundRate: number;
  showReasoningRate: number;
  lastReasoningStyle: ReasoningStyle;
} {
  const state = sessionStates.get(sessionId);
  if (!state) {
    return {
      totalTurns: 0,
      thinkingSoundsUsed: 0,
      thinkingSoundRate: 0,
      showReasoningRate: 0,
      lastReasoningStyle: 'narrative',
    };
  }

  return {
    totalTurns: state.totalTurns,
    thinkingSoundsUsed: state.thinkingSoundsUsed,
    thinkingSoundRate: state.totalTurns > 0 ? state.thinkingSoundsUsed / state.totalTurns : 0,
    showReasoningRate: state.totalTurns > 0 ? state.showReasoningTurns / state.totalTurns : 0,
    lastReasoningStyle: state.lastReasoningStyle,
  };
}

/**
 * Clear cognitive speech state for a session
 */
export function clearCognitiveSpeechState(sessionId: string): void {
  sessionStates.delete(sessionId);
}

// ============================================================================
// REASONING STYLE SPEECH PRESETS
// ============================================================================

/**
 * Get speech characteristic overrides for reasoning styles
 * These can be used to quickly adjust speech for different cognitive modes
 */
export function getReasoningStyleSpeechPreset(
  style: ReasoningStyle
): Partial<SpeechCharacteristics> {
  switch (style) {
    case 'analytical':
      return {
        baseSpeedMultiplier: 0.92,
        pauseMultiplier: 1.2,
        emphasisStyle: 'moderate',
        thinkingSoundFrequency: 0.25,
      };
    case 'empathetic':
      return {
        baseSpeedMultiplier: 0.85,
        pauseMultiplier: 1.4,
        emphasisStyle: 'subtle',
        thinkingSoundFrequency: 0.15,
      };
    case 'systematic':
      return {
        baseSpeedMultiplier: 0.9,
        pauseMultiplier: 1.3,
        emphasisStyle: 'moderate',
        thinkingSoundFrequency: 0.2,
      };
    case 'narrative':
      return {
        baseSpeedMultiplier: 0.88,
        pauseMultiplier: 1.15,
        emphasisStyle: 'pronounced',
        thinkingSoundFrequency: 0.3,
      };
    case 'pragmatic':
      return {
        baseSpeedMultiplier: 0.95,
        pauseMultiplier: 0.9,
        emphasisStyle: 'moderate',
        thinkingSoundFrequency: 0.1,
      };
    case 'intuitive':
      return {
        baseSpeedMultiplier: 0.82,
        pauseMultiplier: 1.5,
        emphasisStyle: 'subtle',
        thinkingSoundFrequency: 0.35,
      };
    default:
      return {};
  }
}

export default {
  applyCognitiveSpeechAdjustments,
  buildCognitiveSSML,
  getCognitiveSpeechStats,
  clearCognitiveSpeechState,
  getReasoningStyleSpeechPreset,
};
