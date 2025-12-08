/**
 * Voice Humanization Service
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Orchestrates all voice humanization capabilities to make Ferni feel truly human:
 *
 * 1. **Prosody-Aware Turn Prediction**: Uses pitch intonation (rising/falling)
 *    to better detect when user has finished speaking
 *
 * 2. **Micro-Interruption Handling**: Immediately stops agent speech when
 *    user says "wait", "hold on", "actually" - even as a single word
 *
 * 3. **Emotional Arc → TTS**: Adjusts SSML pauses/pacing based on
 *    conversation emotional trajectory
 *
 * 4. **Laughter Detection**: Detects user laughter for natural response
 *
 * 5. **Rhythm Mirroring**: Matches user's speech rhythm patterns
 *
 * @module VoiceHumanization
 * @see docs/features/VOICE-PRESENCE-ROADMAP.md
 */

import { getLogger } from '../utils/safe-logger.js';
import type { VoiceEmotionResult, ProsodyFeatures } from './audio-prosody.js';
import type { EmotionalArc } from '../conversation/emotional-arc.js';
import {
  predictTurnWithVoice,
  voiceSuggestsTurnComplete,
  type EnhancedTurnPrediction,
  type Intonation,
} from './prosody-turn-bridge.js';
import { getTurnPredictionService } from '../conversation/turn-prediction.js';

const log = getLogger().child({ service: 'VoiceHumanization' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Micro-interruption detection result
 */
export interface MicroInterruptionResult {
  /** Did we detect an interruption signal? */
  detected: boolean;
  /** The word/phrase that triggered it */
  trigger: string | null;
  /** How urgent is the interruption? */
  urgency: 'immediate' | 'soon' | 'none';
  /** Should agent stop speaking? */
  shouldStopAgent: boolean;
  /** Reason for the detection */
  reason: string;
}

/**
 * Laughter detection result
 */
export interface LaughterDetectionResult {
  /** Is the user laughing? */
  isLaughing: boolean;
  /** Confidence (0-1) */
  confidence: number;
  /** Type of laugh detected */
  laughType: 'chuckle' | 'laugh' | 'giggle' | 'hearty' | 'unknown';
  /** How should agent respond? */
  suggestedResponse: 'join_in' | 'acknowledge' | 'smile' | 'none';
}

/**
 * Emotional arc TTS adjustments
 */
export interface EmotionalTtsAdjustments {
  /** Opening pause before speaking (ms) */
  openingPauseMs: number;
  /** Speed adjustment (-0.3 to 0.3) */
  speedAdjust: number;
  /** Volume adjustment (0.8 to 1.2) */
  volumeAdjust: number;
  /** SSML emotion tag to use */
  ssmlEmotion: string;
  /** Should add extra breaths/pauses? */
  addBreaths: boolean;
  /** Warmth level for tone */
  warmth: 'high' | 'medium' | 'low';
  /** Reason for these adjustments */
  reason: string;
}

/**
 * Speech rhythm profile
 */
export interface SpeechRhythmProfile {
  /** Average phrase length (words) */
  avgPhraseLength: number;
  /** Typical pause between phrases (ms) */
  pauseBetweenPhrases: number;
  /** Speech pattern type */
  pattern: 'flowing' | 'staccato' | 'burst' | 'measured' | 'varied';
  /** Confidence in the pattern detection */
  confidence: number;
}

/**
 * Voice humanization context (accumulated state)
 */
export interface VoiceHumanizationState {
  /** Session ID */
  sessionId: string;
  /** Recent voice emotion results */
  recentVoiceEmotions: VoiceEmotionResult[];
  /** User's speech rhythm profile */
  userRhythmProfile: SpeechRhythmProfile | null;
  /** Laughter events this session */
  laughterEvents: Array<{ timestamp: number; type: string }>;
  /** Interruption patterns */
  interruptionPatterns: Array<{ timestamp: number; trigger: string }>;
  /** Current emotional arc state */
  currentEmotionalArc: EmotionalArc | null;
  /** Turn count */
  turnCount: number;
}

// ============================================================================
// MICRO-INTERRUPTION WORDS
// ============================================================================

/**
 * Words that should immediately stop agent speech when detected
 * These are common human interruption patterns
 */
const IMMEDIATE_STOP_WORDS = new Set([
  'wait',
  'hold on',
  'stop',
  'actually',
  'hang on',
  'one sec',
  'one second',
  'pause',
  'wait wait',
  'hold up',
]);

/**
 * Words that suggest user wants to interject soon (but not immediately)
 */
const SOFT_INTERRUPTION_WORDS = new Set([
  'but',
  'no',
  'um',
  'uh',
  'well',
  'hmm',
  "i don't",
  "that's not",
  'sorry',
]);

/**
 * Quick acknowledgment phrases that often precede interruptions
 */
const PRE_INTERRUPTION_PATTERNS = [
  /^(yeah|yes|right|okay|ok|sure|uh huh|mm hmm|mhm)\s+(but|actually|wait|no)/i,
  /^(no|nope|nah)\s*(,|that's|i|but|wait)/i,
];

// ============================================================================
// LAUGHTER DETECTION PATTERNS (Audio-based heuristics)
// ============================================================================

/**
 * Audio characteristics that suggest laughter
 * Based on energy bursts, pitch variation, and timing patterns
 */
const LAUGHTER_THRESHOLDS = {
  /** Minimum energy peaks per second to suggest laughter */
  MIN_ENERGY_PEAKS_PER_SEC: 3,
  /** Maximum utterance duration for laughter (ms) */
  MAX_LAUGHTER_DURATION_MS: 3000,
  /** Minimum pitch variance for laughter */
  MIN_PITCH_VARIANCE: 30,
  /** High energy with short duration = likely laughter */
  ENERGY_DURATION_RATIO: 0.5,
};

// ============================================================================
// VOICE HUMANIZATION SERVICE
// ============================================================================

export class VoiceHumanizationService {
  private state: VoiceHumanizationState;
  private readonly maxHistorySize = 10;

  constructor(sessionId: string) {
    this.state = {
      sessionId,
      recentVoiceEmotions: [],
      userRhythmProfile: null,
      laughterEvents: [],
      interruptionPatterns: [],
      currentEmotionalArc: null,
      turnCount: 0,
    };
    log.info({ sessionId }, '🎤 Voice humanization service initialized');
  }

  // ==========================================================================
  // 1. PROSODY-AWARE TURN PREDICTION
  // ==========================================================================

  /**
   * Get enhanced turn prediction using voice prosody signals
   * Wires the prosody analyzer output to turn prediction
   */
  predictTurnWithVoice(
    transcript: string,
    voiceEmotion: VoiceEmotionResult | null,
    options: {
      speakingDurationMs?: number;
      silenceDurationMs?: number;
      topicWeight?: 'light' | 'medium' | 'heavy';
    } = {}
  ): EnhancedTurnPrediction {
    // Store voice emotion for history
    if (voiceEmotion && voiceEmotion.confidence > 0.3) {
      this.state.recentVoiceEmotions.push(voiceEmotion);
      if (this.state.recentVoiceEmotions.length > this.maxHistorySize) {
        this.state.recentVoiceEmotions.shift();
      }
    }

    // Use the prosody-turn bridge
    const prediction = predictTurnWithVoice(this.state.sessionId, transcript, voiceEmotion, {
      ...options,
      turnCount: this.state.turnCount,
    });

    // Also check if voice strongly suggests completion
    const voiceSuggestion = voiceSuggestsTurnComplete(voiceEmotion);
    if (voiceSuggestion.suggests && voiceSuggestion.confidence > 0.7) {
      log.debug(
        {
          transcript: transcript.slice(0, 40),
          voiceConfidence: voiceSuggestion.confidence,
          reason: voiceSuggestion.reason,
        },
        '🎤 Voice strongly suggests turn complete'
      );
    }

    return prediction;
  }

  /**
   * Extract intonation from prosody features
   * Used when we have raw prosody but not full emotion result
   */
  extractIntonation(prosody: ProsodyFeatures): Intonation {
    switch (prosody.pitchContour) {
      case 'rising':
        return 'rising';
      case 'falling':
        return 'falling';
      default:
        return 'neutral';
    }
  }

  // ==========================================================================
  // 2. MICRO-INTERRUPTION DETECTION
  // ==========================================================================

  /**
   * Check if transcribed text contains a micro-interruption signal
   * Should be called on EACH word as it's transcribed (streaming STT)
   */
  detectMicroInterruption(text: string, isAgentSpeaking: boolean): MicroInterruptionResult {
    if (!isAgentSpeaking) {
      return {
        detected: false,
        trigger: null,
        urgency: 'none',
        shouldStopAgent: false,
        reason: 'Agent not speaking',
      };
    }

    const normalized = text.toLowerCase().trim();

    // Check immediate stop words
    for (const word of IMMEDIATE_STOP_WORDS) {
      if (normalized === word || normalized.startsWith(`${word} `)) {
        log.info(
          { trigger: word, text: normalized.slice(0, 30) },
          '🛑 Micro-interruption detected'
        );

        this.state.interruptionPatterns.push({
          timestamp: Date.now(),
          trigger: word,
        });

        return {
          detected: true,
          trigger: word,
          urgency: 'immediate',
          shouldStopAgent: true,
          reason: `Immediate stop word: "${word}"`,
        };
      }
    }

    // Check pre-interruption patterns (e.g., "yeah but", "no, that's not")
    for (const pattern of PRE_INTERRUPTION_PATTERNS) {
      if (pattern.test(normalized)) {
        log.info({ text: normalized.slice(0, 30) }, '🛑 Pre-interruption pattern detected');
        return {
          detected: true,
          trigger: normalized.split(/\s+/)[0],
          urgency: 'immediate',
          shouldStopAgent: true,
          reason: 'Pre-interruption pattern detected',
        };
      }
    }

    // Check soft interruption words (less urgent)
    for (const word of SOFT_INTERRUPTION_WORDS) {
      if (normalized === word || normalized.startsWith(`${word} `)) {
        return {
          detected: true,
          trigger: word,
          urgency: 'soon',
          shouldStopAgent: false, // Don't stop immediately, but prepare
          reason: `Soft interruption signal: "${word}"`,
        };
      }
    }

    return {
      detected: false,
      trigger: null,
      urgency: 'none',
      shouldStopAgent: false,
      reason: 'No interruption signal detected',
    };
  }

  /**
   * Get interruption patterns for learning
   */
  getInterruptionPatterns(): Array<{ timestamp: number; trigger: string }> {
    return [...this.state.interruptionPatterns];
  }

  // ==========================================================================
  // 3. EMOTIONAL ARC → TTS ADJUSTMENTS
  // ==========================================================================

  /**
   * Calculate TTS adjustments based on emotional arc
   * Call this before generating each TTS response
   */
  getEmotionalTtsAdjustments(emotionalArc: EmotionalArc | null): EmotionalTtsAdjustments {
    this.state.currentEmotionalArc = emotionalArc;

    // Default adjustments (neutral conversation)
    const defaults: EmotionalTtsAdjustments = {
      openingPauseMs: 100,
      speedAdjust: 0,
      volumeAdjust: 1.0,
      ssmlEmotion: 'neutral',
      addBreaths: false,
      warmth: 'medium',
      reason: 'Default neutral state',
    };

    if (!emotionalArc) {
      return defaults;
    }

    // Build adjustments based on arc
    const adjustments = { ...defaults };
    const reasons: string[] = [];

    // High intensity emotions need more space
    if (emotionalArc.conversationTemperature > 0.7) {
      adjustments.openingPauseMs = 400;
      adjustments.speedAdjust = -0.15;
      adjustments.addBreaths = true;
      adjustments.warmth = 'high';
      reasons.push('high emotional temperature');
    }

    // User needs emotional support
    if (emotionalArc.needsEmotionalSupport) {
      adjustments.openingPauseMs = Math.max(adjustments.openingPauseMs, 300);
      adjustments.speedAdjust = Math.min(adjustments.speedAdjust, -0.1);
      adjustments.volumeAdjust = 0.95; // Slightly softer
      adjustments.warmth = 'high';
      adjustments.addBreaths = true;
      adjustments.ssmlEmotion = 'empathetic';
      reasons.push('user needs support');
    }

    // Declining emotional trajectory - be calming
    if (emotionalArc.trajectory === 'declining') {
      adjustments.speedAdjust = Math.min(adjustments.speedAdjust, -0.1);
      adjustments.openingPauseMs = Math.max(adjustments.openingPauseMs, 250);
      adjustments.ssmlEmotion = 'calm';
      reasons.push('declining emotional trajectory');
    }

    // Improving trajectory - can be more energetic
    if (emotionalArc.trajectory === 'improving' && emotionalArc.currentValence > 0.3) {
      adjustments.speedAdjust = Math.max(adjustments.speedAdjust, 0.05);
      adjustments.volumeAdjust = 1.05;
      adjustments.ssmlEmotion = 'warm';
      reasons.push('improving trajectory');
    }

    // Sudden shift detected - acknowledge with pause
    if (emotionalArc.suddenShiftDetected) {
      adjustments.openingPauseMs = Math.max(adjustments.openingPauseMs, 350);
      adjustments.addBreaths = true;
      reasons.push('sudden emotional shift');
    }

    // Recent distress - maintain warmth even if stabilizing
    if (emotionalArc.turnsSinceDistress < 3) {
      adjustments.warmth = 'high';
      adjustments.addBreaths = true;
      reasons.push('recent distress');
    }

    // Volatile emotions - be steady and grounding
    if (emotionalArc.trajectory === 'volatile') {
      adjustments.speedAdjust = -0.1;
      adjustments.openingPauseMs = 300;
      adjustments.ssmlEmotion = 'grounded';
      reasons.push('volatile emotions - being steady');
    }

    adjustments.reason = reasons.length > 0 ? reasons.join(', ') : 'Normal conversational flow';

    // Clamp values to safe ranges
    adjustments.speedAdjust = Math.max(-0.3, Math.min(0.3, adjustments.speedAdjust));
    adjustments.volumeAdjust = Math.max(0.8, Math.min(1.2, adjustments.volumeAdjust));
    adjustments.openingPauseMs = Math.max(0, Math.min(600, adjustments.openingPauseMs));

    if (adjustments.openingPauseMs > 200 || adjustments.speedAdjust !== 0) {
      log.debug(
        {
          openingPauseMs: adjustments.openingPauseMs,
          speedAdjust: adjustments.speedAdjust.toFixed(2),
          warmth: adjustments.warmth,
          reason: adjustments.reason,
        },
        '🎭 Emotional TTS adjustments applied'
      );
    }

    return adjustments;
  }

  /**
   * Apply emotional adjustments to SSML text
   */
  applyEmotionalSsml(text: string, adjustments: EmotionalTtsAdjustments): string {
    let result = text;

    // Add opening pause if significant
    if (adjustments.openingPauseMs >= 150) {
      result = `<break time="${adjustments.openingPauseMs}ms"/>${result}`;
    }

    // Add breaths if needed
    if (adjustments.addBreaths) {
      // Add breath pauses at natural break points
      result = result.replace(/([.!?])\s+/g, `$1<break time="200ms"/> `);
      result = result.replace(/,\s+/g, `,<break time="100ms"/> `);
    }

    return result;
  }

  // ==========================================================================
  // 4. LAUGHTER DETECTION
  // ==========================================================================

  /**
   * Detect if audio features indicate laughter
   * Uses heuristics based on energy bursts and timing
   */
  detectLaughter(prosody: ProsodyFeatures, durationMs: number): LaughterDetectionResult {
    const result: LaughterDetectionResult = {
      isLaughing: false,
      confidence: 0,
      laughType: 'unknown',
      suggestedResponse: 'none',
    };

    // Laughter has specific audio characteristics:
    // 1. Short bursts of high energy
    // 2. High pitch variance
    // 3. Typically under 3 seconds
    // 4. Multiple energy peaks

    if (durationMs > LAUGHTER_THRESHOLDS.MAX_LAUGHTER_DURATION_MS) {
      return result; // Too long to be laughter
    }

    const energyPeaksPerSec = prosody.energyPeaks / (durationMs / 1000);
    const hasHighEnergyBursts = energyPeaksPerSec >= LAUGHTER_THRESHOLDS.MIN_ENERGY_PEAKS_PER_SEC;
    const hasHighPitchVariance = prosody.pitchVariance >= LAUGHTER_THRESHOLDS.MIN_PITCH_VARIANCE;
    const hasHighEnergy = prosody.energyMean > -15; // dB, relatively loud

    // Calculate confidence based on matching criteria
    let confidence = 0;
    if (hasHighEnergyBursts) confidence += 0.35;
    if (hasHighPitchVariance) confidence += 0.3;
    if (hasHighEnergy) confidence += 0.2;
    if (durationMs < 1500) confidence += 0.15; // Short bursts are more likely laughter

    if (confidence >= 0.6) {
      result.isLaughing = true;
      result.confidence = Math.min(confidence, 0.95);

      // Classify laugh type
      if (durationMs < 500 && prosody.energyMean < -20) {
        result.laughType = 'chuckle';
        result.suggestedResponse = 'smile';
      } else if (durationMs < 1000) {
        result.laughType = 'giggle';
        result.suggestedResponse = 'acknowledge';
      } else if (prosody.energyMean > -10) {
        result.laughType = 'hearty';
        result.suggestedResponse = 'join_in';
      } else {
        result.laughType = 'laugh';
        result.suggestedResponse = 'acknowledge';
      }

      // Record laughter event
      this.state.laughterEvents.push({
        timestamp: Date.now(),
        type: result.laughType,
      });

      log.debug(
        {
          laughType: result.laughType,
          confidence: result.confidence.toFixed(2),
          suggestedResponse: result.suggestedResponse,
        },
        '😄 Laughter detected'
      );
    }

    return result;
  }

  /**
   * Get response suggestion for detected laughter
   */
  getLaughterResponse(detection: LaughterDetectionResult, personaId: string): string | null {
    if (!detection.isLaughing) return null;

    // Persona-specific laughter responses
    const responses: Record<string, Record<string, string[]>> = {
      ferni: {
        join_in: ['<break time="100ms"/>Ha! <break time="50ms"/>'],
        acknowledge: ['<break time="150ms"/>Heh, yeah.<break time="100ms"/>'],
        smile: ['<break time="100ms"/>'],
      },
      'peter-john': {
        join_in: ['Ha! <break time="50ms"/>'],
        acknowledge: ['Yeah, exactly! <break time="50ms"/>'],
        smile: [''],
      },
      'maya-santos': {
        join_in: ['<break time="100ms"/>Haha! <break time="50ms"/>'],
        acknowledge: ['<break time="150ms"/>I know, right? <break time="50ms"/>'],
        smile: ['<break time="100ms"/>'],
      },
      default: {
        join_in: ['<break time="100ms"/>Ha! <break time="50ms"/>'],
        acknowledge: ['<break time="150ms"/>'],
        smile: [''],
      },
    };

    const personaResponses = responses[personaId] || responses.default;
    const responseOptions = personaResponses[detection.suggestedResponse] || [''];
    return responseOptions[Math.floor(Math.random() * responseOptions.length)];
  }

  // ==========================================================================
  // 5. SPEECH RHYTHM ANALYSIS & MIRRORING
  // ==========================================================================

  /**
   * Update user's speech rhythm profile based on their utterance
   */
  updateRhythmProfile(
    text: string,
    durationMs: number,
    pausePatterns?: number[]
  ): SpeechRhythmProfile {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const wordCount = words.length;

    // Calculate metrics
    const avgPhraseLength = this.estimateAvgPhraseLength(text);
    const pauseBetweenPhrases =
      pausePatterns && pausePatterns.length > 0
        ? pausePatterns.reduce((a, b) => a + b, 0) / pausePatterns.length
        : durationMs / Math.max(1, avgPhraseLength); // Estimate from duration

    // Determine pattern type
    let pattern: SpeechRhythmProfile['pattern'] = 'varied';

    if (avgPhraseLength < 4 && pauseBetweenPhrases > 300) {
      pattern = 'staccato'; // Short bursts with pauses
    } else if (avgPhraseLength > 10 && pauseBetweenPhrases < 200) {
      pattern = 'flowing'; // Long continuous speech
    } else if (avgPhraseLength < 5 && pauseBetweenPhrases < 150) {
      pattern = 'burst'; // Quick bursts, short pauses
    } else if (pauseBetweenPhrases > 400) {
      pattern = 'measured'; // Deliberate, thoughtful
    }

    const profile: SpeechRhythmProfile = {
      avgPhraseLength,
      pauseBetweenPhrases,
      pattern,
      confidence: this.state.turnCount > 3 ? 0.8 : 0.5,
    };

    // Update state (blend with existing)
    if (this.state.userRhythmProfile) {
      profile.avgPhraseLength =
        0.7 * profile.avgPhraseLength + 0.3 * this.state.userRhythmProfile.avgPhraseLength;
      profile.pauseBetweenPhrases =
        0.7 * profile.pauseBetweenPhrases + 0.3 * this.state.userRhythmProfile.pauseBetweenPhrases;
    }

    this.state.userRhythmProfile = profile;
    return profile;
  }

  /**
   * Estimate average phrase length from text
   */
  private estimateAvgPhraseLength(text: string): number {
    // Split by natural phrase boundaries
    const phrases = text.split(/[,;.!?\-—]/).filter((p) => p.trim().length > 0);
    if (phrases.length === 0) return text.split(/\s+/).length;

    const totalWords = phrases.reduce((sum, p) => sum + p.trim().split(/\s+/).length, 0);
    return totalWords / phrases.length;
  }

  /**
   * Get SSML pause adjustments to mirror user's rhythm
   */
  getRhythmMirroringAdjustments(): { pauseMultiplier: number; phraseBreakMs: number } {
    const profile = this.state.userRhythmProfile;

    if (!profile || profile.confidence < 0.5) {
      return { pauseMultiplier: 1.0, phraseBreakMs: 200 };
    }

    // Mirror user's pause patterns
    let pauseMultiplier = 1.0;
    let phraseBreakMs = 200;

    switch (profile.pattern) {
      case 'staccato':
        pauseMultiplier = 1.2; // More pauses
        phraseBreakMs = 300;
        break;
      case 'flowing':
        pauseMultiplier = 0.8; // Fewer pauses
        phraseBreakMs = 150;
        break;
      case 'burst':
        pauseMultiplier = 0.9;
        phraseBreakMs = 120;
        break;
      case 'measured':
        pauseMultiplier = 1.3;
        phraseBreakMs = 400;
        break;
      default:
      // Keep defaults
    }

    return { pauseMultiplier, phraseBreakMs };
  }

  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================

  /**
   * Record a new turn
   */
  recordTurn(): void {
    this.state.turnCount++;
  }

  /**
   * Get current state
   */
  getState(): VoiceHumanizationState {
    return { ...this.state };
  }

  /**
   * Reset service state
   */
  reset(): void {
    this.state = {
      sessionId: this.state.sessionId,
      recentVoiceEmotions: [],
      userRhythmProfile: null,
      laughterEvents: [],
      interruptionPatterns: [],
      currentEmotionalArc: null,
      turnCount: 0,
    };
    log.info({ sessionId: this.state.sessionId }, '🔄 Voice humanization service reset');
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const sessionInstances = new Map<string, VoiceHumanizationService>();

/**
 * Get or create voice humanization service for a session
 */
export function getVoiceHumanizationService(sessionId: string): VoiceHumanizationService {
  if (!sessionInstances.has(sessionId)) {
    sessionInstances.set(sessionId, new VoiceHumanizationService(sessionId));
  }
  return sessionInstances.get(sessionId)!;
}

/**
 * Reset voice humanization service for a session
 */
export function resetVoiceHumanization(sessionId: string): void {
  const instance = sessionInstances.get(sessionId);
  if (instance) {
    instance.reset();
    sessionInstances.delete(sessionId);
  }
}

/**
 * Reset all instances
 */
export function resetAllVoiceHumanization(): void {
  sessionInstances.clear();
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export { type Intonation, type EnhancedTurnPrediction } from './prosody-turn-bridge.js';
