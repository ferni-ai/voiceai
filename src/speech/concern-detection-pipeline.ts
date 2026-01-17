/**
 * Concern Detection Pipeline
 *
 * "Better Than Human" - Detects distress signals that humans often miss.
 *
 * This pipeline combines:
 * 1. Audio prosody analysis (pitch, energy, speech rate)
 * 2. Voice tremor detection (strain, cracks, quiver)
 * 3. Text analysis (negative self-talk, hopelessness words)
 *
 * Output feeds into:
 * - Emotion Event Dispatcher → Frontend Avatar EQ
 * - Context injections for LLM empathy
 *
 * Philosophy: Real humans notice when someone's voice wavers or cracks.
 * But even the best human friends miss subtle signs - they're distracted,
 * tired, or simply not trained to detect them. Ferni catches everything.
 *
 * @module concern-detection-pipeline
 */

import { createLogger } from '../utils/safe-logger.js';
import { getVoiceTremorDetector, type VoiceTremorResult } from './voice-tremor.js';
import type { VoiceEmotionResult, ProsodyFeatures } from './audio-prosody/types.js';

const log = createLogger({ module: 'ConcernDetection' });

/**
 * Minimal emotional state interface for concern detection.
 * This avoids importing from agents layer (architecture violation).
 * Only includes fields actually used by concern detection.
 */
export interface ConcernEmotionalState {
  /** Distress level 0-1 */
  distressLevel?: number;
}

// ============================================================================
// TYPES
// ============================================================================

export type ConcernLevel = 'none' | 'mild' | 'moderate' | 'elevated' | 'crisis';

export interface ConcernSignal {
  /** Concern level */
  level: ConcernLevel;
  /** Primary source of concern */
  source: 'voice' | 'text' | 'combined';
  /** Specific concern type */
  type: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Suggested approach for LLM */
  approach: string;
}

export interface ConcernDetectionResult {
  /** Was any concern detected? */
  detected: boolean;
  /** Primary concern signal */
  primary: ConcernSignal | null;
  /** All detected signals */
  signals: ConcernSignal[];
  /** Voice-specific indicators */
  voice: {
    tremor: VoiceTremorResult | null;
    strain: boolean;
    possibleTears: boolean;
    possibleAnxiety: boolean;
  };
  /** Text-specific indicators */
  text: {
    negativeSelftalk: boolean;
    hopelessness: boolean;
    isolation: boolean;
  };
  /** Combined distress level (0-1) */
  distressLevel: number;
  /** Humanization signal to dispatch */
  humanizationSignal: HumanizationSignalPayload | null;
}

export interface HumanizationSignalPayload {
  signalType: 'concern_detected' | 'voice_state_detected';
  concernLevel: ConcernLevel;
  concernType?: string;
  intensity: number;
  voiceState?: string;
  timestamp: number;
}

export interface ConcernDetectionInput {
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** User's spoken text */
  transcript: string;
  /** Audio samples (optional - enables voice analysis) */
  audioSamples?: Float32Array;
  /** Sample rate (required if audioSamples provided) */
  sampleRate?: number;
  /** Pre-analyzed prosody features (optional) */
  prosodyFeatures?: ProsodyFeatures;
  /** Pre-analyzed voice emotion (optional) */
  voiceEmotion?: VoiceEmotionResult;
  /** Current emotional state from turn processor */
  emotionalState?: ConcernEmotionalState;
}

// ============================================================================
// TEXT ANALYSIS PATTERNS
// ============================================================================

const NEGATIVE_SELF_TALK_PATTERNS = [
  /i('m| am) (so )?(stupid|dumb|worthless|useless|pathetic|terrible|awful)/i,
  /i (can't|cannot) do (anything|this|it)/i,
  /i('m| am) (a )?(failure|loser|mess)/i,
  /nothing i do (matters|works|is right)/i,
  /i (hate|can't stand) myself/i,
  /i('m| am) not (good|smart|strong) enough/i,
  /everyone (hates|would be better without) me/i,
];

const HOPELESSNESS_PATTERNS = [
  /what('s| is) the point/i,
  /nothing (will )?ever (change|get better)/i,
  /i (give|gave) up/i,
  /there('s| is) no (hope|point|use)/i,
  /why (even )?(bother|try)/i,
  /i (don't|do not) (see|have) (a )?way out/i,
  /it('s| is) (all )?over/i,
  /i (can't|cannot) (go on|keep going|do this anymore)/i,
];

const ISOLATION_PATTERNS = [
  /no one (cares|understands|listens)/i,
  /i('m| am) (all )?alone/i,
  /i (have|got) no one/i,
  /everyone (left|abandoned|forgot)/i,
  /i (don't|do not) belong/i,
  /nobody (wants|needs) me/i,
];

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

function analyzeText(transcript: string): {
  negativeSelftalk: boolean;
  hopelessness: boolean;
  isolation: boolean;
  textDistress: number;
} {
  const negativeSelftalk = NEGATIVE_SELF_TALK_PATTERNS.some((p) => p.test(transcript));
  const hopelessness = HOPELESSNESS_PATTERNS.some((p) => p.test(transcript));
  const isolation = ISOLATION_PATTERNS.some((p) => p.test(transcript));

  // Calculate text-based distress
  let textDistress = 0;
  if (negativeSelftalk) textDistress += 0.3;
  if (hopelessness) textDistress += 0.5;
  if (isolation) textDistress += 0.2;

  return { negativeSelftalk, hopelessness, isolation, textDistress: Math.min(1, textDistress) };
}

function analyzeVoice(
  sessionId: string,
  audioSamples?: Float32Array,
  sampleRate?: number
): VoiceTremorResult | null {
  if (!audioSamples || !sampleRate) return null;

  const detector = getVoiceTremorDetector(sessionId);
  return detector.analyzeAudio(audioSamples, sampleRate);
}

function determineConcernLevel(distressLevel: number): ConcernLevel {
  if (distressLevel >= 0.9) return 'crisis';
  if (distressLevel >= 0.7) return 'elevated';
  if (distressLevel >= 0.5) return 'moderate';
  if (distressLevel >= 0.3) return 'mild';
  return 'none';
}

function generateApproach(level: ConcernLevel, type: string): string {
  const approaches: Record<ConcernLevel, string> = {
    crisis:
      "This is serious. Be fully present, validate their pain, and gently ask if they're safe. Don't try to fix - just be there.",
    elevated:
      'User is struggling. Slow down, use shorter sentences, validate their feelings. Offer to just listen.',
    moderate:
      "User seems to be going through something. Be warm, gentle, check in on how they're really doing.",
    mild: 'User may be stressed. Be supportive, acknowledge their feelings without overreacting.',
    none: 'Continue normally.',
  };

  return approaches[level];
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

/**
 * Analyze for concern signals in voice and text.
 *
 * This is the main entry point for "Better Than Human" concern detection.
 */
export function detectConcern(input: ConcernDetectionInput): ConcernDetectionResult {
  const { sessionId, userId, transcript, audioSamples, sampleRate, emotionalState } = input;

  // Analyze text
  const textAnalysis = analyzeText(transcript);

  // Analyze voice (if audio available)
  const voiceTremor = analyzeVoice(sessionId, audioSamples, sampleRate);

  // Combine distress signals
  let voiceDistress = 0;
  if (voiceTremor?.detected) {
    if (voiceTremor.possibleTears) voiceDistress = 0.7;
    else if (voiceTremor.possibleAnxiety) voiceDistress = 0.5;
    else if (voiceTremor.primaryType === 'strain') voiceDistress = 0.4;
    else if (voiceTremor.primaryType === 'tremor') voiceDistress = 0.3;
  }

  // Factor in emotional state if available
  const emotionalDistress = emotionalState?.distressLevel ?? 0;

  // Combined distress (weighted average)
  const distressLevel = Math.min(
    1,
    textAnalysis.textDistress * 0.4 + voiceDistress * 0.35 + emotionalDistress * 0.25
  );

  // Determine primary concern
  const concernLevel = determineConcernLevel(distressLevel);

  // Build signals
  const signals: ConcernSignal[] = [];

  if (textAnalysis.hopelessness) {
    signals.push({
      level: 'elevated',
      source: 'text',
      type: 'hopelessness',
      confidence: 0.8,
      approach: generateApproach('elevated', 'hopelessness'),
    });
  }

  if (textAnalysis.negativeSelftalk) {
    signals.push({
      level: 'moderate',
      source: 'text',
      type: 'negative_self_talk',
      confidence: 0.7,
      approach: generateApproach('moderate', 'negative_self_talk'),
    });
  }

  if (textAnalysis.isolation) {
    signals.push({
      level: 'moderate',
      source: 'text',
      type: 'isolation',
      confidence: 0.7,
      approach: generateApproach('moderate', 'isolation'),
    });
  }

  if (voiceTremor?.possibleTears) {
    signals.push({
      level: 'elevated',
      source: 'voice',
      type: 'possible_tears',
      confidence: voiceTremor.confidence,
      approach: voiceTremor.suggestedResponse,
    });
  }

  if (voiceTremor?.possibleAnxiety) {
    signals.push({
      level: 'moderate',
      source: 'voice',
      type: 'anxiety',
      confidence: voiceTremor.confidence,
      approach: voiceTremor.suggestedResponse,
    });
  }

  // Sort by severity
  signals.sort((a, b) => {
    const levelOrder: Record<ConcernLevel, number> = {
      crisis: 5,
      elevated: 4,
      moderate: 3,
      mild: 2,
      none: 1,
    };
    return levelOrder[b.level] - levelOrder[a.level];
  });

  const primary = signals[0] ?? null;

  // Generate humanization signal for frontend
  let humanizationSignal: HumanizationSignalPayload | null = null;
  if (concernLevel !== 'none') {
    humanizationSignal = {
      signalType: voiceTremor?.detected ? 'voice_state_detected' : 'concern_detected',
      concernLevel,
      concernType: primary?.type,
      intensity: distressLevel,
      voiceState: voiceTremor?.primaryType !== 'none' ? voiceTremor?.primaryType : undefined,
      timestamp: Date.now(),
    };
  }

  const result: ConcernDetectionResult = {
    detected: concernLevel !== 'none',
    primary,
    signals,
    voice: {
      tremor: voiceTremor,
      strain: voiceTremor?.primaryType === 'strain',
      possibleTears: voiceTremor?.possibleTears ?? false,
      possibleAnxiety: voiceTremor?.possibleAnxiety ?? false,
    },
    text: {
      negativeSelftalk: textAnalysis.negativeSelftalk,
      hopelessness: textAnalysis.hopelessness,
      isolation: textAnalysis.isolation,
    },
    distressLevel,
    humanizationSignal,
  };

  if (result.detected) {
    log.info(
      {
        userId,
        sessionId,
        level: concernLevel,
        type: primary?.type,
        source: primary?.source,
        voiceTremor: voiceTremor?.primaryType,
        textSignals: Object.entries(textAnalysis)
          .filter(([k, v]) => v === true)
          .map(([k]) => k),
      },
      '🚨 Concern detected - Better Than Human active'
    );
  }

  return result;
}

/**
 * Convenience function to get distress level for context injection.
 */
export function getDistressLevel(input: ConcernDetectionInput): number {
  return detectConcern(input).distressLevel;
}

/**
 * Get approach guidance for LLM based on concern level.
 */
export function getApproachGuidance(input: ConcernDetectionInput): string | null {
  const result = detectConcern(input);
  return result.primary?.approach ?? null;
}
