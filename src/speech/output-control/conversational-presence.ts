/**
 * Conversational Presence System
 *
 * > "The gap between turns is the enemy."
 *
 * Designed by thinking like a human conversational sound expert:
 *
 * PROBLEM: AI voice systems feel robotic because of dead air gaps.
 * SOLUTION: Fill the gap with intelligent audio presence.
 *
 * Key principles:
 * 1. INSTANT PRESENCE - The moment we detect end-of-turn, emit presence
 * 2. SOFT ATTACKS - Never start responses at full volume
 * 3. ANTICIPATORY AUDIO - Pre-generate likely response starts
 * 4. GRACEFUL FADES - Interruptions fade out, not hard stop
 * 5. CONTINUOUS BREATH - Even "listening" has audio texture
 *
 * Human conversation timeline:
 * ```
 * User: "How are you doing today?"
 *       ↓ (overlap starts here - human starts inhaling/preparing)
 * Agent: [soft breath] "Mmm..." [thinking] "I'm doing pretty good actually"
 * ```
 *
 * @module speech/conversational-presence
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ConversationalPresence' });

// ============================================================================
// TYPES
// ============================================================================

export interface PresenceContext {
  /** User's emotional state (affects presence tone) */
  userEmotion?: 'neutral' | 'excited' | 'sad' | 'frustrated' | 'curious';
  /** How long user has been speaking (ms) - longer = more engaged presence */
  userSpeechDuration?: number;
  /** Turn count - early turns get warmer presence */
  turnCount: number;
  /** Whether this is an interruption recovery */
  isInterruptionRecovery?: boolean;
  /** Persona ID for voice matching */
  personaId?: string;
}

export interface PresenceSignal {
  /** SSML to prepend to response (fills the gap) */
  presenceSSML: string;
  /** Whether to use soft attack on first words */
  useSoftAttack: boolean;
  /** Volume ratio to start at (ramps up naturally) */
  initialVolume: number;
  /** Speed ratio for opening (slightly slower = more human) */
  initialSpeed: number;
  /** Thinking sound to use (or empty for just breath) */
  thinkingSound: string;
}

export interface InterruptionFade {
  /** How to end the interrupted speech */
  fadeSSML: string;
  /** Duration of fade in ms */
  fadeDurationMs: number;
}

// ============================================================================
// PRE-CACHED PRESENCE SOUNDS
// ============================================================================

/**
 * These are instant-play presence signals.
 * Designed to be:
 * - Very short (100-300ms)
 * - Natural sounding
 * - Not attention-grabbing (background presence)
 *
 * The goal is to fill the gap, not to be noticed.
 */
const PRESENCE_SIGNALS = {
  // Soft breath/thinking sounds (barely audible)
  softBreath: '<break time="80ms"/>',

  // Micro-acknowledgments (signals "I heard you")
  microAck: {
    neutral: [
      '<break time="60ms"/><speed ratio="0.92"/>Mm.<break time="100ms"/>',
      '<break time="80ms"/><speed ratio="0.90"/>Hmm.<break time="120ms"/>',
      '<break time="50ms"/>',
    ],
    engaged: [
      '<break time="40ms"/><speed ratio="0.95"/>Yeah.<break time="80ms"/>',
      '<break time="60ms"/><speed ratio="0.92"/>Right.<break time="100ms"/>',
    ],
    empathetic: [
      '<break time="100ms"/><volume ratio="0.9"/><speed ratio="0.88"/>Mm.<break time="150ms"/>',
      '<break time="80ms"/><volume ratio="0.85"/><speed ratio="0.85"/>Yeah...<break time="120ms"/>',
    ],
  },

  // Thinking transitions (for complex questions)
  thinking: {
    light: [
      '<break time="150ms"/><speed ratio="0.90"/>Okay...<break time="200ms"/>',
      '<break time="100ms"/>Let me...<break time="180ms"/>',
    ],
    medium: [
      '<break time="200ms"/><speed ratio="0.88"/>Hmm...<break time="250ms"/>',
      '<break time="180ms"/><speed ratio="0.90"/>You know...<break time="200ms"/>',
    ],
    heavy: [
      '<break time="250ms"/><speed ratio="0.85"/>That\'s...<break time="300ms"/>',
      '<break time="200ms"/><speed ratio="0.88"/>Let me think...<break time="280ms"/>',
    ],
  },
};

// ============================================================================
// SOFT ATTACK PATTERNS
// ============================================================================

/**
 * Soft attacks prevent jarring response starts.
 * Human voices naturally ramp up - they don't start at full volume.
 */
const SOFT_ATTACK_CONFIG = {
  // Start at 85% volume, ramp to 100% over first ~3 words
  initialVolume: 0.85,
  // Start slightly slower, normalize by end of first sentence
  initialSpeed: 0.94,
  // Number of words before normalizing
  rampWords: 3,
};

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Generate presence signal for the start of a response.
 *
 * This should be called the MOMENT we detect the user has stopped speaking,
 * even before we have the full transcript. It fills the gap.
 *
 * @param context - Context about the conversation state
 * @returns Presence signal with SSML and configuration
 */
export function generatePresenceSignal(context: PresenceContext): PresenceSignal {
  const { userEmotion, userSpeechDuration, turnCount, isInterruptionRecovery } = context;

  // Default: minimal presence (just a breath pause)
  let presenceSSML = PRESENCE_SIGNALS.softBreath;
  let thinkingSound = '';

  // Determine presence type based on context
  const presenceType = determinePresenceType(context);

  // Select appropriate micro-acknowledgment
  if (presenceType !== 'silent') {
    const acks = PRESENCE_SIGNALS.microAck[presenceType];
    presenceSSML = acks[Math.floor(Math.random() * acks.length)];
  }

  // Add thinking sound for longer user messages (they said a lot = we need to think)
  if (userSpeechDuration && userSpeechDuration > 5000) {
    const thinkingLevel = userSpeechDuration > 10000 ? 'heavy' : 'medium';
    const sounds = PRESENCE_SIGNALS.thinking[thinkingLevel];
    thinkingSound = sounds[Math.floor(Math.random() * sounds.length)];
    // Don't double-up on presence - use thinking sound as presence
    presenceSSML = thinkingSound;
    thinkingSound = '';
  }

  // Interruption recovery: start softer, more gentle
  let { initialVolume } = SOFT_ATTACK_CONFIG;
  let { initialSpeed } = SOFT_ATTACK_CONFIG;

  if (isInterruptionRecovery) {
    initialVolume = 0.8; // Even softer after interruption
    initialSpeed = 0.9; // Slower, more deliberate
    presenceSSML = `<break time="150ms"/><volume ratio="0.8"/>${presenceSSML.replace(
      '<break time="',
      '<break time="'
    )}`;
  }

  // Early turns (building rapport): warmer, softer
  if (turnCount < 3) {
    initialVolume = Math.min(initialVolume, 0.88);
    initialSpeed = Math.min(initialSpeed, 0.92);
  }

  log.debug('Generated presence signal', {
    presenceType,
    initialVolume,
    initialSpeed,
    hasThinkingSound: !!thinkingSound,
    turnCount,
    userEmotion,
  });

  return {
    presenceSSML,
    useSoftAttack: true,
    initialVolume,
    initialSpeed,
    thinkingSound,
  };
}

/**
 * Determine what type of presence signal to use
 */
function determinePresenceType(
  context: PresenceContext
): 'neutral' | 'engaged' | 'empathetic' | 'silent' {
  const { userEmotion, userSpeechDuration } = context;

  // Empathetic for sad/frustrated users
  if (userEmotion === 'sad' || userEmotion === 'frustrated') {
    return 'empathetic';
  }

  // Engaged for excited/curious users or long messages
  if (userEmotion === 'excited' || userEmotion === 'curious') {
    return 'engaged';
  }

  if (userSpeechDuration && userSpeechDuration > 3000) {
    return 'engaged';
  }

  // Short messages: minimal/silent presence (don't over-acknowledge "yes" or "okay")
  if (userSpeechDuration && userSpeechDuration < 1000) {
    return 'silent';
  }

  return 'neutral';
}

/**
 * Apply soft attack to the beginning of a response.
 *
 * Takes the first few words and wraps them in volume/speed SSML
 * that gradually normalizes.
 *
 * @param text - The response text (may already have some SSML)
 * @param signal - The presence signal configuration
 * @returns Text with soft attack applied
 */
export function applySoftAttack(text: string, signal: PresenceSignal): string {
  if (!signal.useSoftAttack) {
    return text;
  }

  // If text already starts with SSML tags, don't double-wrap
  if (text.trim().startsWith('<')) {
    return text;
  }

  // Split into words, apply soft attack to first few
  const words = text.split(/\s+/);
  if (words.length === 0) {
    return text;
  }

  // Build soft attack prefix
  const softStart = `<volume ratio="${signal.initialVolume.toFixed(2)}"/><speed ratio="${signal.initialSpeed.toFixed(2)}"/>`;

  // First 2-3 words at reduced volume/speed
  const rampWords = Math.min(SOFT_ATTACK_CONFIG.rampWords, words.length);
  const softPart = words.slice(0, rampWords).join(' ');
  const normalPart = words.slice(rampWords).join(' ');

  // Ramp back to normal after soft part
  if (normalPart) {
    return `${softStart}${softPart} <volume ratio="1.0"/><speed ratio="1.0"/>${normalPart}`;
  }

  return `${softStart}${softPart}`;
}

/**
 * Generate SSML for graceful interruption fade-out.
 *
 * Instead of hard-stopping when interrupted, this creates a natural
 * trailing off like a human would.
 *
 * @returns Fade configuration (to be applied to TTS stream)
 */
export function generateInterruptionFade(): InterruptionFade {
  // Humans trail off when interrupted - we simulate this with:
  // - Quick volume fade
  // - Slight speed decrease
  // - Optional "..." trailing
  return {
    fadeSSML: '<volume ratio="0.6"/><speed ratio="0.85"/>',
    fadeDurationMs: 150,
  };
}

/**
 * Wrap a full response with conversational presence.
 *
 * This is the main function to call before sending text to TTS.
 * It prepends presence signals and applies soft attack.
 *
 * @param responseText - The LLM response text
 * @param context - Conversation context
 * @returns SSML-wrapped response ready for TTS
 */
export function wrapWithConversationalPresence(
  responseText: string,
  context: PresenceContext
): string {
  const signal = generatePresenceSignal(context);

  // Build the full response:
  // 1. Presence signal (fills the gap)
  // 2. Thinking sound if needed
  // 3. Soft attack on actual response
  let result = signal.presenceSSML;

  if (signal.thinkingSound) {
    result += signal.thinkingSound;
  }

  result += applySoftAttack(responseText, signal);

  return result;
}

// ============================================================================
// CONTINUOUS PRESENCE (Background audio texture)
// ============================================================================

/**
 * Configuration for continuous presence during listening.
 *
 * This creates the feeling that Ferni is "alive" even when not speaking.
 * Currently placeholder - would require custom audio integration.
 */
export interface ContinuousPresenceConfig {
  /** Enable ambient breath sounds during listening */
  enableAmbientBreath: boolean;
  /** Interval between subtle presence signals (ms) */
  ambientIntervalMs: number;
  /** Volume of ambient presence (very low) */
  ambientVolume: number;
}

export const DEFAULT_CONTINUOUS_PRESENCE: ContinuousPresenceConfig = {
  enableAmbientBreath: false, // Future feature
  ambientIntervalMs: 8000,
  ambientVolume: 0.1,
};

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

interface SessionPresenceState {
  lastPresenceAt: number;
  presenceCount: number;
  lastUserEmotion?: string;
}

const sessionStates = new Map<string, SessionPresenceState>();

/**
 * Get or create session state for presence tracking
 */
export function getSessionPresenceState(sessionId: string): SessionPresenceState {
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, {
      lastPresenceAt: 0,
      presenceCount: 0,
    });
  }
  return sessionStates.get(sessionId)!;
}

/**
 * Record that we emitted a presence signal
 */
export function recordPresence(sessionId: string): void {
  const state = getSessionPresenceState(sessionId);
  state.lastPresenceAt = Date.now();
  state.presenceCount++;
}

/**
 * Check if we should emit presence (avoid over-doing it)
 */
export function shouldEmitPresence(sessionId: string, minIntervalMs = 2000): boolean {
  const state = getSessionPresenceState(sessionId);
  return Date.now() - state.lastPresenceAt > minIntervalMs;
}

/**
 * Clean up session state
 */
export function cleanupSessionPresence(sessionId: string): void {
  sessionStates.delete(sessionId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generatePresenceSignal,
  applySoftAttack,
  generateInterruptionFade,
  wrapWithConversationalPresence,
  getSessionPresenceState,
  recordPresence,
  shouldEmitPresence,
  cleanupSessionPresence,
  PRESENCE_SIGNALS,
  SOFT_ATTACK_CONFIG,
};
