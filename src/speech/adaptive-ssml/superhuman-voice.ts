/**
 * Superhuman Voice Enhancements
 *
 * > "Better than human."
 *
 * This module implements voice features that make Ferni feel MORE present,
 * MORE attuned, and MORE emotionally intelligent than a human could be:
 *
 * 1. **Prosodic Mirroring** - Match user's speaking pace naturally
 * 2. **Vulnerability Voice Softening** - Drop energy when they're vulnerable
 * 3. **Silence Presence Phrases** - Comfortable silences with presence
 * 4. **Anticipatory Comfort Sounds** - Empathetic sounds before they finish
 * 5. **Memory-Informed Baseline** - Adjust warmth from what we know
 * 6. **Emotional Transition Bridges** - Smooth shifts between emotions
 *
 * These features work together to create a voice that feels impossibly present -
 * like talking to someone who TRULY gets you.
 *
 * @module speech/adaptive-ssml/superhuman-voice
 */

import type { PresenceLevel } from '../../conversation/superhuman/presence-mode.js';
import type { VulnerabilityDepth } from '../../conversation/superhuman/vulnerability-matching.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  getPersonaAnticipatoryComfortSound,
  getPersonaEmotionalTransitionBridge,
  getPersonaSilencePresencePhrase,
} from '../persona-phrases.js';

const log = createLogger({ module: 'SuperhumanVoice' });

// ============================================================================
// TYPES
// ============================================================================

export interface SuperhumanVoiceContext {
  /** Session ID for tracking */
  sessionId: string;

  /** Current persona */
  personaId?: string;

  // === Prosodic Mirroring ===
  /** User's words per minute (from WPM tracker) */
  userWPM?: number;

  /** User's energy level */
  userEnergy?: 'low' | 'medium' | 'high';

  // === Vulnerability ===
  /** Current vulnerability depth */
  vulnerabilityDepth?: VulnerabilityDepth;

  /** Presence mode level */
  presenceLevel?: PresenceLevel;

  // === Memory-Informed ===
  /** Known user context from memory (grief, stress, celebration, etc.) */
  knownUserContext?: 'grieving' | 'stressed' | 'celebrating' | 'struggling' | 'growing' | null;

  /** How long we've known this user (for trust calibration) */
  relationshipTurns?: number;

  // === Emotional Transitions ===
  /** Previous utterance's primary emotion */
  previousEmotion?: string;

  /** Current utterance's primary emotion */
  currentEmotion?: string;

  // === Content Signals ===
  /** Is the user currently sharing something heavy? */
  isHeavyContent?: boolean;

  /** Topic weight */
  topicWeight?: 'light' | 'medium' | 'heavy';

  /** Turn count in session */
  turnCount?: number;
}

export interface SuperhumanVoiceResult {
  /** Enhanced text with SSML */
  text: string;

  /** Applied enhancements */
  appliedEnhancements: string[];

  /** Speed multiplier applied */
  speedMultiplier: number;

  /** Volume multiplier applied */
  volumeMultiplier: number;

  /** Recommended pause multiplier */
  pauseMultiplier: number;

  /** Debug info */
  debug?: Record<string, unknown>;
}

// ============================================================================
// 1. PROSODIC MIRRORING
// ============================================================================

/**
 * Prosodic mirroring configuration.
 * Mirrors user's speaking pace to build rapport.
 */
const PROSODIC_MIRRORING_CONFIG = {
  /** Target WPM for "normal" speaking */
  targetWPM: 150,

  /** Minimum speed multiplier */
  minSpeed: 0.8,

  /** Maximum speed multiplier */
  maxSpeed: 1.15,

  /** How strongly to mirror (0-1) */
  mirrorStrength: 0.35,

  /** WPM thresholds */
  thresholds: {
    verySlow: 100,
    slow: 120,
    normal: 150,
    fast: 180,
    veryFast: 200,
  },
};

/**
 * Calculate prosodic mirroring speed adjustment.
 * When user speaks fast, we speed up slightly. When slow, we slow down.
 * This builds subconscious rapport.
 */
export function calculateProsodicMirroring(userWPM: number | undefined): {
  speedMultiplier: number;
  reason: string;
} {
  if (!userWPM || userWPM <= 0) {
    return { speedMultiplier: 1.0, reason: 'no WPM data' };
  }

  const { targetWPM, minSpeed, maxSpeed, mirrorStrength, thresholds } = PROSODIC_MIRRORING_CONFIG;

  // Calculate raw mirroring ratio
  const rawRatio = userWPM / targetWPM;

  // Apply mirroring strength (don't fully match, just lean toward)
  const mirroredRatio = 1 + (rawRatio - 1) * mirrorStrength;

  // Clamp to safe range
  const speedMultiplier = Math.max(minSpeed, Math.min(maxSpeed, mirroredRatio));

  // Generate reason
  let reason: string;
  if (userWPM < thresholds.verySlow) {
    reason = 'mirroring very slow pace';
  } else if (userWPM < thresholds.slow) {
    reason = 'mirroring slow pace';
  } else if (userWPM > thresholds.veryFast) {
    reason = 'mirroring energetic pace';
  } else if (userWPM > thresholds.fast) {
    reason = 'mirroring quick pace';
  } else {
    reason = 'natural pace';
  }

  return { speedMultiplier, reason };
}

// ============================================================================
// 2. VULNERABILITY VOICE SOFTENING
// ============================================================================

/**
 * Voice adjustments for vulnerability levels.
 * Deeper vulnerability = softer, slower, more space.
 */
const VULNERABILITY_VOICE_ADJUSTMENTS: Record<
  VulnerabilityDepth,
  {
    speedMultiplier: number;
    volumeMultiplier: number;
    pauseMultiplier: number;
    openingPauseMs: number;
    emotion: string;
  }
> = {
  surface: {
    speedMultiplier: 1.0,
    volumeMultiplier: 1.0,
    pauseMultiplier: 1.0,
    openingPauseMs: 0,
    emotion: 'neutral',
  },
  thoughtful: {
    speedMultiplier: 0.95,
    volumeMultiplier: 0.95,
    pauseMultiplier: 1.1,
    openingPauseMs: 100,
    emotion: 'curious',
  },
  personal: {
    speedMultiplier: 0.9,
    volumeMultiplier: 0.9,
    pauseMultiplier: 1.25,
    openingPauseMs: 150,
    emotion: 'affectionate',
  },
  vulnerable: {
    speedMultiplier: 0.85,
    volumeMultiplier: 0.85,
    pauseMultiplier: 1.4,
    openingPauseMs: 250,
    emotion: 'sympathetic',
  },
  raw: {
    speedMultiplier: 0.78,
    volumeMultiplier: 0.75,
    pauseMultiplier: 1.6,
    openingPauseMs: 400,
    emotion: 'sympathetic',
  },
};

/**
 * Get voice adjustments for vulnerability depth.
 */
export function getVulnerabilityVoiceAdjustments(
  depth: VulnerabilityDepth | undefined
): (typeof VULNERABILITY_VOICE_ADJUSTMENTS)[VulnerabilityDepth] {
  return VULNERABILITY_VOICE_ADJUSTMENTS[depth || 'surface'];
}

// ============================================================================
// 3. SILENCE PRESENCE PHRASES
// ============================================================================

/**
 * Comfortable silence phrases by presence level.
 * These are phrases that can trail off into silence while maintaining presence.
 */
const SILENCE_PRESENCE_PHRASES: Record<PresenceLevel, string[]> = {
  normal: [],
  gentle: [
    '<break time="200ms"/><speed ratio="0.9"/><volume ratio="0.9"/>I\'m here.<break time="400ms"/>',
    '<break time="150ms"/><speed ratio="0.88"/>Take your time.<break time="500ms"/>',
    '<break time="200ms"/><volume ratio="0.85"/>Mm.<break time="400ms"/>',
  ],
  holding: [
    '<break time="300ms"/><speed ratio="0.8"/><volume ratio="0.8"/>I\'m right here with you.<break time="600ms"/>',
    '<break time="400ms"/><speed ratio="0.75"/><volume ratio="0.75"/>...<break time="800ms"/>',
    '<break time="300ms"/><speed ratio="0.8"/><volume ratio="0.8"/>You don\'t have to say anything.<break time="700ms"/>',
    '<break time="350ms"/><volume ratio="0.75"/>Mm.<break time="600ms"/>',
  ],
  silent: [
    '<break time="500ms"/><speed ratio="0.7"/><volume ratio="0.65"/>...<break time="1000ms"/>',
    '<break time="600ms"/><volume ratio="0.6"/>I\'m here.<break time="1200ms"/>',
    '<break time="800ms"/>',
  ],
};

/**
 * Get a silence presence phrase for the given level.
 */
export function getSilencePresencePhrase(level: PresenceLevel | undefined): string | null {
  const phrases = SILENCE_PRESENCE_PHRASES[level || 'normal'];
  if (phrases.length === 0) return null;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ============================================================================
// 4. ANTICIPATORY COMFORT SOUNDS
// ============================================================================

/**
 * Anticipatory comfort sounds for heavy content.
 * These are soft sounds that can be interjected when we detect
 * the user is sharing something difficult.
 */
const ANTICIPATORY_COMFORT_SOUNDS = {
  /** When heavy content is detected mid-sentence */
  heavyContent: [
    '<break time="50ms"/><volume ratio="0.7"/><speed ratio="0.85"/>Mm<break time="100ms"/>',
    '<break time="80ms"/><volume ratio="0.75"/>Oh<break time="100ms"/>',
    '<break time="60ms"/><volume ratio="0.7"/>...<break time="120ms"/>',
  ],

  /** When grief/loss is mentioned */
  grief: [
    '<break time="100ms"/><speed ratio="0.75"/><volume ratio="0.7"/><emotion value="sympathetic"/>Oh...<break time="200ms"/>',
    '<break time="150ms"/><volume ratio="0.65"/><speed ratio="0.7"/>Mm...<break time="200ms"/>',
  ],

  /** When fear/anxiety is expressed */
  fear: [
    '<break time="80ms"/><volume ratio="0.8"/><speed ratio="0.85"/>I hear you.<break time="150ms"/>',
    '<break time="100ms"/><volume ratio="0.75"/>Mm.<break time="150ms"/>',
  ],

  /** When frustration is expressed */
  frustration: [
    '<break time="60ms"/><volume ratio="0.85"/>Yeah.<break time="100ms"/>',
    '<break time="80ms"/>Ugh.<break time="100ms"/>',
  ],
};

/**
 * Get an anticipatory comfort sound based on content type.
 */
export function getAnticipatoryComfortSound(
  contentType: 'heavyContent' | 'grief' | 'fear' | 'frustration'
): string {
  const sounds = ANTICIPATORY_COMFORT_SOUNDS[contentType];
  return sounds[Math.floor(Math.random() * sounds.length)];
}

/**
 * Detect if text contains heavy content signals.
 */
export function detectHeavyContentType(
  text: string
): 'grief' | 'fear' | 'frustration' | 'heavyContent' | null {
  const lowerText = text.toLowerCase();

  // Grief signals
  if (
    /\b(died|passed away|lost|gone|funeral|grieving|miss them|miss her|miss him)\b/i.test(lowerText)
  ) {
    return 'grief';
  }

  // Fear signals
  if (
    /\b(scared|terrified|afraid|anxious|panic|worried sick|can't stop thinking)\b/i.test(lowerText)
  ) {
    return 'fear';
  }

  // Frustration signals
  if (
    /\b(so frustrated|can't believe|fed up|sick of|tired of|keeps happening)\b/i.test(lowerText)
  ) {
    return 'frustration';
  }

  // General heavy content
  if (
    /\b(struggling|hard to|difficult|tough|breaking down|falling apart|don't know what)\b/i.test(
      lowerText
    )
  ) {
    return 'heavyContent';
  }

  return null;
}

// ============================================================================
// 5. MEMORY-INFORMED BASELINE TONALITY
// ============================================================================

/**
 * Baseline adjustments based on what we know about the user.
 * If we know they're going through something, adjust from the start.
 */
const MEMORY_INFORMED_ADJUSTMENTS: Record<
  NonNullable<SuperhumanVoiceContext['knownUserContext']>,
  {
    baseSpeedAdjust: number;
    baseVolumeAdjust: number;
    basePauseMultiplier: number;
    defaultEmotion: string;
    openingStyle: 'warm' | 'gentle' | 'energetic' | 'supportive';
  }
> = {
  grieving: {
    baseSpeedAdjust: -0.12,
    baseVolumeAdjust: -0.1,
    basePauseMultiplier: 1.3,
    defaultEmotion: 'sympathetic',
    openingStyle: 'gentle',
  },
  stressed: {
    baseSpeedAdjust: -0.05,
    baseVolumeAdjust: -0.05,
    basePauseMultiplier: 1.15,
    defaultEmotion: 'calm',
    openingStyle: 'supportive',
  },
  celebrating: {
    baseSpeedAdjust: 0.05,
    baseVolumeAdjust: 0.05,
    basePauseMultiplier: 0.9,
    defaultEmotion: 'happy',
    openingStyle: 'energetic',
  },
  struggling: {
    baseSpeedAdjust: -0.08,
    baseVolumeAdjust: -0.05,
    basePauseMultiplier: 1.2,
    defaultEmotion: 'affectionate',
    openingStyle: 'supportive',
  },
  growing: {
    baseSpeedAdjust: 0,
    baseVolumeAdjust: 0,
    basePauseMultiplier: 1.0,
    defaultEmotion: 'curious',
    openingStyle: 'warm',
  },
};

/**
 * Get baseline adjustments from known user context.
 */
export function getMemoryInformedBaseline(
  knownContext: SuperhumanVoiceContext['knownUserContext']
):
  | (typeof MEMORY_INFORMED_ADJUSTMENTS)[NonNullable<SuperhumanVoiceContext['knownUserContext']>]
  | null {
  if (!knownContext) return null;
  return MEMORY_INFORMED_ADJUSTMENTS[knownContext];
}

// ============================================================================
// 6. EMOTIONAL TRANSITION BRIDGES
// ============================================================================

/**
 * Bridging sounds/phrases for emotional transitions.
 * Prevents jarring shifts between emotions.
 */
const EMOTIONAL_TRANSITION_BRIDGES: Record<string, Record<string, string>> = {
  // From sympathetic to...
  sympathetic: {
    curious: '<break time="200ms"/><speed ratio="0.9"/>But you know...<break time="150ms"/>',
    happy: '<break time="250ms"/><speed ratio="0.92"/>And...<break time="150ms"/>',
    excited: '<break time="200ms"/>But here\'s the thing—<break time="100ms"/>',
    affectionate: '<break time="150ms"/>',
  },

  // From happy to...
  happy: {
    sympathetic: '<break time="200ms"/><speed ratio="0.88"/>Though...<break time="200ms"/>',
    curious: '<break time="100ms"/>And—<break time="100ms"/>',
    affectionate: '<break time="150ms"/>',
  },

  // From excited to...
  excited: {
    sympathetic: '<break time="250ms"/><speed ratio="0.85"/>That said...<break time="200ms"/>',
    calm: '<break time="200ms"/><speed ratio="0.9"/>Okay, so...<break time="150ms"/>',
    curious: '<break time="100ms"/>',
  },

  // From calm to...
  calm: {
    excited: '<break time="150ms"/>Oh!<break time="100ms"/>',
    sympathetic: '<break time="200ms"/>',
    affectionate: '<break time="150ms"/>',
  },

  // From curious to...
  curious: {
    sympathetic: '<break time="200ms"/><speed ratio="0.9"/>Mm.<break time="150ms"/>',
    excited: '<break time="100ms"/>Oh!<break time="100ms"/>',
    affectionate: '<break time="150ms"/>',
  },
};

/**
 * Get a transition bridge between two emotions.
 */
export function getEmotionalTransitionBridge(
  fromEmotion: string | undefined,
  toEmotion: string | undefined
): string | null {
  if (!fromEmotion || !toEmotion) return null;
  if (fromEmotion === toEmotion) return null;

  const fromBridges = EMOTIONAL_TRANSITION_BRIDGES[fromEmotion];
  if (!fromBridges) return null;

  return fromBridges[toEmotion] || null;
}

// ============================================================================
// INTERNAL ENHANCEMENT STATE
// ============================================================================

interface EnhancementState {
  result: string;
  appliedEnhancements: string[];
  speedMultiplier: number;
  volumeMultiplier: number;
  pauseMultiplier: number;
}

function createInitialState(text: string): EnhancementState {
  return {
    result: text,
    appliedEnhancements: [],
    speedMultiplier: 1.0,
    volumeMultiplier: 1.0,
    pauseMultiplier: 1.0,
  };
}

// ============================================================================
// ENHANCEMENT STEP FUNCTIONS
// ============================================================================

function applyProsodicMirroringStep(
  state: EnhancementState,
  context: SuperhumanVoiceContext
): void {
  const prosodicMirroring = calculateProsodicMirroring(context.userWPM);
  if (Math.abs(prosodicMirroring.speedMultiplier - 1.0) > 0.02) {
    state.speedMultiplier *= prosodicMirroring.speedMultiplier;
    state.appliedEnhancements.push(`prosodic_mirroring: ${prosodicMirroring.reason}`);
  }
}

function applyVulnerabilitySofteningStep(
  state: EnhancementState,
  context: SuperhumanVoiceContext
): void {
  const vulnAdjustments = getVulnerabilityVoiceAdjustments(context.vulnerabilityDepth);
  if (context.vulnerabilityDepth && context.vulnerabilityDepth !== 'surface') {
    state.speedMultiplier *= vulnAdjustments.speedMultiplier;
    state.volumeMultiplier *= vulnAdjustments.volumeMultiplier;
    state.pauseMultiplier *= vulnAdjustments.pauseMultiplier;
    state.appliedEnhancements.push(`vulnerability_softening: ${context.vulnerabilityDepth}`);

    if (vulnAdjustments.openingPauseMs > 0) {
      state.result = `<break time="${vulnAdjustments.openingPauseMs}ms"/>${state.result}`;
    }
    if (!state.result.includes('<emotion')) {
      state.result = `<emotion value="${vulnAdjustments.emotion}"/>${state.result}`;
    }
  }
}

function applySilencePresenceStep(state: EnhancementState, context: SuperhumanVoiceContext): void {
  if (!context.presenceLevel || context.presenceLevel === 'normal') return;
  if (context.presenceLevel !== 'holding' && context.presenceLevel !== 'silent') return;

  const presencePhrase = context.personaId
    ? getPersonaSilencePresencePhrase(context.personaId)
    : getSilencePresencePhrase(context.presenceLevel);

  if (presencePhrase && Math.random() < 0.4) {
    state.result = presencePhrase + state.result;
    state.appliedEnhancements.push(`silence_presence: ${context.presenceLevel}`);
  }
}

function applyAnticipatoryComfortStep(
  state: EnhancementState,
  context: SuperhumanVoiceContext,
  originalText: string
): void {
  if (!context.isHeavyContent) return;

  const contentType = detectHeavyContentType(originalText);
  if (!contentType) return;

  const comfortSound = context.personaId
    ? getPersonaAnticipatoryComfortSound(
        context.personaId,
        contentType === 'heavyContent' ? 'general' : contentType
      )
    : getAnticipatoryComfortSound(contentType);

  if (!state.result.startsWith('<break') && !state.result.startsWith('<emotion')) {
    state.result = comfortSound + state.result;
    state.appliedEnhancements.push(`anticipatory_comfort: ${contentType}`);
  }
}

function applyMemoryBaselineStep(state: EnhancementState, context: SuperhumanVoiceContext): void {
  const memoryBaseline = getMemoryInformedBaseline(context.knownUserContext);
  if (!memoryBaseline) return;

  state.speedMultiplier += memoryBaseline.baseSpeedAdjust;
  state.volumeMultiplier += memoryBaseline.baseVolumeAdjust;
  state.pauseMultiplier *= memoryBaseline.basePauseMultiplier;
  state.appliedEnhancements.push(`memory_baseline: ${context.knownUserContext ?? 'unknown'}`);

  if (!state.result.includes('<emotion')) {
    state.result = `<emotion value="${memoryBaseline.defaultEmotion}"/>${state.result}`;
  }
}

function applyEmotionalBridgeStep(state: EnhancementState, context: SuperhumanVoiceContext): void {
  const transitionBridge = context.personaId
    ? getPersonaEmotionalTransitionBridge(
        context.personaId,
        context.previousEmotion ?? '',
        context.currentEmotion ?? ''
      )
    : getEmotionalTransitionBridge(context.previousEmotion, context.currentEmotion);

  if (transitionBridge) {
    state.result = transitionBridge + state.result;
    state.appliedEnhancements.push(
      `emotion_bridge: ${context.previousEmotion ?? 'none'}->${context.currentEmotion ?? 'none'}`
    );
  }
}

function applyGlobalAdjustments(state: EnhancementState): void {
  // Clamp multipliers to safe ranges
  state.speedMultiplier = Math.max(0.7, Math.min(1.2, state.speedMultiplier));
  state.volumeMultiplier = Math.max(0.6, Math.min(1.1, state.volumeMultiplier));
  state.pauseMultiplier = Math.max(0.8, Math.min(2.0, state.pauseMultiplier));

  // Apply speed wrapper if significantly different from 1.0
  if (Math.abs(state.speedMultiplier - 1.0) > 0.03 && !state.result.includes('<speed ratio=')) {
    state.result = `<speed ratio="${state.speedMultiplier.toFixed(2)}"/>${state.result}`;
  }

  // Apply volume wrapper if significantly different from 1.0
  if (Math.abs(state.volumeMultiplier - 1.0) > 0.05 && !state.result.includes('<volume ratio=')) {
    state.result = `<volume ratio="${state.volumeMultiplier.toFixed(2)}"/>${state.result}`;
  }
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Apply all superhuman voice enhancements to text.
 *
 * This is the main entry point that orchestrates all Better Than Human
 * voice features to create impossibly present, attuned speech.
 */
export function applySuperhmanVoice(
  text: string,
  context: SuperhumanVoiceContext
): SuperhumanVoiceResult {
  if (!text || text.trim().length === 0) {
    return {
      text,
      appliedEnhancements: [],
      speedMultiplier: 1.0,
      volumeMultiplier: 1.0,
      pauseMultiplier: 1.0,
    };
  }

  const state = createInitialState(text);

  // Apply all enhancement steps
  applyProsodicMirroringStep(state, context);
  applyVulnerabilitySofteningStep(state, context);
  applySilencePresenceStep(state, context);
  applyAnticipatoryComfortStep(state, context, text);
  applyMemoryBaselineStep(state, context);
  applyEmotionalBridgeStep(state, context);
  applyGlobalAdjustments(state);

  // Log enhancements
  if (state.appliedEnhancements.length > 0) {
    log.debug(
      {
        sessionId: context.sessionId,
        enhancements: state.appliedEnhancements,
        speed: state.speedMultiplier.toFixed(2),
        volume: state.volumeMultiplier.toFixed(2),
        pause: state.pauseMultiplier.toFixed(2),
      },
      '✨ Superhuman voice enhancements applied'
    );
  }

  return {
    text: state.result,
    appliedEnhancements: state.appliedEnhancements,
    speedMultiplier: state.speedMultiplier,
    volumeMultiplier: state.volumeMultiplier,
    pauseMultiplier: state.pauseMultiplier,
    debug: {
      originalLength: text.length,
      enhancedLength: state.result.length,
      context: {
        vulnerabilityDepth: context.vulnerabilityDepth,
        presenceLevel: context.presenceLevel,
        userWPM: context.userWPM,
        knownUserContext: context.knownUserContext,
      },
    },
  };
}

// ============================================================================
// SESSION TRACKING
// ============================================================================

interface SuperhumanVoiceSession {
  sessionId: string;
  lastEmotion: string | null;
  enhancementHistory: string[];
  turnCount: number;
}

const sessions = new Map<string, SuperhumanVoiceSession>();

/**
 * Get or create session state for superhuman voice.
 */
export function getSuperhmanVoiceSession(sessionId: string): SuperhumanVoiceSession {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      sessionId,
      lastEmotion: null,
      enhancementHistory: [],
      turnCount: 0,
    });
  }
  return sessions.get(sessionId)!;
}

/**
 * Update session after applying enhancements.
 */
export function updateSuperhmanVoiceSession(
  sessionId: string,
  result: SuperhumanVoiceResult,
  currentEmotion?: string
): void {
  const session = getSuperhmanVoiceSession(sessionId);
  session.lastEmotion = currentEmotion || null;
  session.enhancementHistory.push(...result.appliedEnhancements);
  session.turnCount++;

  // Keep history manageable
  if (session.enhancementHistory.length > 50) {
    session.enhancementHistory = session.enhancementHistory.slice(-30);
  }
}

/**
 * Get the last emotion for a session (for transition bridges).
 */
export function getLastEmotion(sessionId: string): string | null {
  return sessions.get(sessionId)?.lastEmotion || null;
}

/**
 * Reset session state.
 */
export function resetSuperhmanVoiceSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/**
 * Reset all sessions.
 */
export function resetAllSuperhmanVoiceSessions(): void {
  sessions.clear();
}

/**
 * Get active session count.
 */
export function getActiveSuperhmanVoiceSessionCount(): number {
  return sessions.size;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  applySuperhmanVoice,
  calculateProsodicMirroring,
  getVulnerabilityVoiceAdjustments,
  getSilencePresencePhrase,
  getAnticipatoryComfortSound,
  detectHeavyContentType,
  getMemoryInformedBaseline,
  getEmotionalTransitionBridge,
  getSuperhmanVoiceSession,
  updateSuperhmanVoiceSession,
  getLastEmotion,
  resetSuperhmanVoiceSession,
  resetAllSuperhmanVoiceSessions,
  getActiveSuperhmanVoiceSessionCount,
};
