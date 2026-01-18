/**
 * Expressive Eyes Controller - Pixar-Style Eye Animation System
 *
 * Controls eye expressions based on the Ferni EQ Framework (BETTER-THAN-HUMAN.md):
 * - Micro-expressions: 40-150ms subliminal flashes that build trust
 * - Active listening: Subtle nods and presence cues
 * - Anticipatory expressions: Show emotion before user finishes
 * - Voice agent state reactions: Speaking, listening, thinking
 *
 * ANIMATION PRINCIPLES (Pixar's 12 Principles):
 * - Squash & Stretch: Eyes compress when speaking, stretch when surprised
 * - Anticipation: Small movement before big reaction
 * - Secondary Action: Sparkles follow eye movement
 * - Timing: Micro-expressions are subliminal (40-150ms)
 *
 * NO OPACITY CHANGES - all expression through transform only
 */

import { getElementById } from '../utils/dom.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('ExpressiveEyes');
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

/** Full emotion expressions (transform to target and hold) */
export type Emotion =
  | 'neutral'
  | 'curious'
  | 'happy'
  | 'sad'
  | 'surprised'
  | 'thinking'
  | 'concerned'
  | 'empathetic'
  | 'playful'
  | 'excited'
  | 'calm'
  | 'tired'
  | 'recognition'
  | 'warmth'
  | 'delight';

/** Micro-expressions (40-150ms subliminal flashes) */
export type MicroExpression =
  | 'recognition'  // "I see you" moment - 80ms
  | 'concern'      // Empathetic response - 100ms
  | 'delight'      // Genuine joy spark - 120ms
  | 'warmth'       // Caring moment - 100ms
  | 'interest'     // Engaged attention - 90ms
  | 'surprise';    // Quick startle - 150ms

/** Voice agent states that trigger eye reactions */
export type VoiceState = 'idle' | 'speaking' | 'listening' | 'thinking';

/** Anticipatory states (show emotion before user finishes) */
export type AnticipateState = 'none' | 'concern' | 'joy';

/** Music dancing styles */
export type MusicStyle = 'none' | 'dancing' | 'chill' | 'intense';

/** Game states for playful expressions */
export type GameState = 'none' | 'active' | 'waiting' | 'correct' | 'wrong' | 'streak';

// Micro-expression durations in ms (must match CSS)
const MICRO_DURATIONS: Record<MicroExpression, number> = {
  recognition: 80,
  concern: 100,
  delight: 120,
  warmth: 100,
  interest: 90,
  surprise: 150,
};

// ============================================================================
// STATE
// ============================================================================

interface EyeState {
  coachElement: HTMLElement | null;
  avatarEyesElement: Element | null;
  currentEmotion: Emotion;
  currentVoiceState: VoiceState;
  isActiveListening: boolean;
  anticipateState: AnticipateState;
  microExpressionInProgress: boolean;
  musicStyle: MusicStyle;
  gameState: GameState;
}

const state: EyeState = {
  coachElement: null,
  avatarEyesElement: null,
  currentEmotion: 'neutral',
  currentVoiceState: 'idle',
  isActiveListening: false,
  anticipateState: 'none',
  microExpressionInProgress: false,
  musicStyle: 'none',
  gameState: 'none',
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the expressive eyes system.
 * Call after DOM is ready.
 */
export function initExpressiveEyes(): void {
  try {
    state.coachElement = getElementById('coach');
    state.avatarEyesElement = state.coachElement?.querySelector('.avatar-eyes') ?? null;

    if (!state.avatarEyesElement) {
      log.warn('Avatar eyes element not found - expressions disabled');
      return;
    }

    log.debug('Expressive eyes initialized');
  } catch (error) {
    log.error({ error }, 'Failed to initialize expressive eyes');
  }
}

// ============================================================================
// EMOTION CONTROL
// ============================================================================

/**
 * Set the current emotion expression.
 * This applies a sustained expression (not a micro-expression).
 */
export function setEmotion(emotion: Emotion): void {
  if (!state.coachElement) return;

  state.currentEmotion = emotion;

  // Set data-emotion attribute for CSS targeting
  if (emotion === 'neutral') {
    state.coachElement.removeAttribute('data-emotion');
  } else {
    state.coachElement.setAttribute('data-emotion', emotion);
  }

  log.debug({ emotion }, 'Set emotion');
}

/**
 * Get the current emotion.
 */
export function getEmotion(): Emotion {
  return state.currentEmotion;
}

/**
 * Clear emotion back to neutral.
 */
export function clearEmotion(): void {
  setEmotion('neutral');
}

// ============================================================================
// MICRO-EXPRESSIONS (Subliminal 40-150ms flashes)
// ============================================================================

/**
 * Play a micro-expression.
 * These are subliminal (40-150ms) and build unconscious trust.
 *
 * Per BETTER-THAN-HUMAN.md:
 * - recognition: "I see you" moment when user starts speaking
 * - concern: Quick empathetic flash when detecting distress
 * - delight: Genuine joy spark at good news
 * - warmth: Caring pulse during emotional moments
 * - interest: Engaged flash when topic changes
 * - surprise: Quick startle at unexpected input
 */
export function playMicroExpression(type: MicroExpression): void {
  if (!state.avatarEyesElement) return;

  // Don't interrupt another micro-expression
  if (state.microExpressionInProgress) return;

  state.microExpressionInProgress = true;
  const className = `micro-${type}`;
  const duration = MICRO_DURATIONS[type];

  // Add class to trigger CSS animation
  state.avatarEyesElement.classList.add(className);

  // Remove after animation completes
  trackedTimeout(() => {
    state.avatarEyesElement?.classList.remove(className);
    state.microExpressionInProgress = false;
  }, duration + 20); // Small buffer after animation

  log.debug({ type, duration }, 'Played micro-expression');
}

/**
 * Check if a micro-expression is currently playing.
 */
export function isMicroExpressionPlaying(): boolean {
  return state.microExpressionInProgress;
}

// ============================================================================
// VOICE STATE REACTIONS
// ============================================================================

/**
 * Set voice agent state for eye reactions.
 * Eyes automatically animate based on state via CSS.
 */
export function setVoiceState(voiceState: VoiceState): void {
  if (!state.coachElement) return;

  state.currentVoiceState = voiceState;

  // Remove previous state classes
  state.coachElement.classList.remove('is-idle', 'is-speaking', 'is-listening', 'is-thinking');

  // Add current state class
  if (voiceState !== 'idle') {
    state.coachElement.classList.add(`is-${voiceState}`);
  }
  state.coachElement.classList.add('is-connected'); // Always show connected when active

  log.debug({ voiceState }, 'Set voice state');
}

/**
 * Get current voice state.
 */
export function getVoiceState(): VoiceState {
  return state.currentVoiceState;
}

// ============================================================================
// ACTIVE LISTENING
// ============================================================================

/**
 * Trigger a listening micro-nod.
 * Call this periodically during user speech to show presence.
 */
export function triggerListeningNod(): void {
  if (!state.coachElement) return;

  // Add class to trigger CSS animation
  state.coachElement.classList.add('active-listening');

  // Remove after animation (600ms per CSS)
  trackedTimeout(() => {
    state.coachElement?.classList.remove('active-listening');
  }, 650);
}

/**
 * Start active listening mode.
 * Eyes widen slightly and show attentive presence.
 */
export function startActiveListening(): void {
  if (!state.coachElement) return;
  state.isActiveListening = true;
  setVoiceState('listening');
}

/**
 * Stop active listening mode.
 */
export function stopActiveListening(): void {
  if (!state.coachElement) return;
  state.isActiveListening = false;
}

/**
 * Handle user speech pause.
 * Triggers contemplative expression if pause is significant.
 */
export function onUserSpeechPause(pauseDurationMs: number): void {
  if (!state.coachElement) return;

  // If user pauses for 500ms+, show contemplative expression
  if (pauseDurationMs >= 500) {
    state.coachElement.classList.add('contemplative');

    trackedTimeout(() => {
      state.coachElement?.classList.remove('contemplative');
    }, 1500);
  }
}

// ============================================================================
// ANTICIPATORY EXPRESSIONS
// ============================================================================

/**
 * Set anticipatory state.
 * Shows emotion before user finishes their statement.
 * This is what makes Ferni feel "superhuman" - anticipating before being told.
 */
export function setAnticipateState(anticipate: AnticipateState): void {
  if (!state.coachElement) return;

  state.anticipateState = anticipate;

  // Remove previous anticipate classes
  state.coachElement.classList.remove('anticipate-concern', 'anticipate-joy');

  // Add new anticipate class
  if (anticipate !== 'none') {
    state.coachElement.classList.add(`anticipate-${anticipate}`);
  }
}

/**
 * Clear anticipatory state.
 */
export function clearAnticipateState(): void {
  setAnticipateState('none');
}

// ============================================================================
// BLINK CONTROL
// ============================================================================

/**
 * Force a blink.
 * Useful for punctuating moments or adding life to static states.
 */
export function forceBlink(): void {
  if (!state.avatarEyesElement) return;

  state.avatarEyesElement.classList.add('blinking');

  // Single blink takes ~200ms
  trackedTimeout(() => {
    state.avatarEyesElement?.classList.remove('blinking');
  }, 250);
}

// ============================================================================
// HIGH-LEVEL BEHAVIORS
// ============================================================================

/**
 * React to detected concern in user's voice/content.
 * Combines micro-expression + sustained expression.
 */
export function showConcernResponse(): void {
  playMicroExpression('concern');
  trackedTimeout(() => {
    setEmotion('concerned');
  }, 150);
}

/**
 * React to good news or positive moment.
 * Quick delight flash followed by happy expression.
 */
export function showDelightResponse(): void {
  playMicroExpression('delight');
  trackedTimeout(() => {
    setEmotion('happy');
  }, 180);
}

/**
 * React to user starting to speak.
 * Recognition flash to show "I see you".
 */
export function showRecognitionResponse(): void {
  playMicroExpression('recognition');
}

/**
 * Show warmth during emotional moment.
 */
export function showWarmthResponse(): void {
  playMicroExpression('warmth');
  trackedTimeout(() => {
    setEmotion('warmth');
  }, 150);
}

/**
 * Show interest when topic changes or user asks question.
 */
export function showInterestResponse(): void {
  playMicroExpression('interest');
  trackedTimeout(() => {
    setEmotion('curious');
  }, 120);
}

// ============================================================================
// MUSIC & DANCING
// ============================================================================

/**
 * Set music dancing style.
 * Eyes groove to the beat with different intensities!
 *
 * @param style - 'dancing' (default bounce), 'chill' (slow sway), 'intense' (fast bounce), 'none' (stop)
 */
export function setMusicStyle(style: MusicStyle): void {
  if (!state.coachElement) return;

  state.musicStyle = style;

  // Remove all music classes
  state.coachElement.classList.remove('music-dancing', 'music-chill', 'music-intense');

  // Add new music class
  if (style !== 'none') {
    state.coachElement.classList.add(`music-${style}`);
  }

  log.debug({ style }, 'Set music style');
}

/**
 * Start dancing to music (default bounce).
 */
export function startDancing(): void {
  setMusicStyle('dancing');
}

/**
 * Stop dancing.
 */
export function stopDancing(): void {
  setMusicStyle('none');
}

/**
 * Check if currently dancing.
 */
export function isDancing(): boolean {
  return state.musicStyle !== 'none';
}

// ============================================================================
// GAMES
// ============================================================================

/**
 * Set game state for playful expressions.
 *
 * @param gameState - Game state to set
 *   - 'active': Alert, focused, ready to play
 *   - 'waiting': Anticipating user's answer
 *   - 'correct': Celebration bounce!
 *   - 'wrong': Sympathetic squint
 *   - 'streak': Excited continuous bouncing
 *   - 'none': Exit game mode
 */
export function setGameState(gameState: GameState): void {
  if (!state.coachElement) return;

  state.gameState = gameState;

  // Remove all game classes
  state.coachElement.classList.remove(
    'game-active',
    'game-waiting',
    'game-correct',
    'game-wrong',
    'game-streak'
  );

  // Add new game class
  if (gameState !== 'none') {
    state.coachElement.classList.add(`game-${gameState}`);
  }

  log.debug({ gameState }, 'Set game state');
}

/**
 * Trigger correct answer celebration.
 * Plays a bouncy celebration animation then returns to active.
 */
export function celebrateCorrect(): void {
  setGameState('correct');

  // Return to active state after animation (600ms)
  trackedTimeout(() => {
    if (state.gameState === 'correct') {
      setGameState('active');
    }
  }, 650);
}

/**
 * Show wrong answer reaction.
 * Plays sympathetic squint then returns to active.
 */
export function showWrongAnswer(): void {
  setGameState('wrong');

  // Return to active state after animation (500ms)
  trackedTimeout(() => {
    if (state.gameState === 'wrong') {
      setGameState('active');
    }
  }, 550);
}

/**
 * Start streak mode (continuous excited bouncing).
 */
export function startStreak(): void {
  setGameState('streak');
}

/**
 * End streak mode, return to active.
 */
export function endStreak(): void {
  if (state.gameState === 'streak') {
    setGameState('active');
  }
}

/**
 * Exit game mode entirely.
 */
export function exitGameMode(): void {
  setGameState('none');
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Dispose of expressive eyes resources.
 */
export function dispose(): void {
  clearAllTimeouts();
  state.coachElement = null;
  state.avatarEyesElement = null;
  state.currentEmotion = 'neutral';
  state.currentVoiceState = 'idle';
  state.isActiveListening = false;
  state.anticipateState = 'none';
  state.microExpressionInProgress = false;
  state.musicStyle = 'none';
  state.gameState = 'none';
}

// ============================================================================
// EXPORT OBJECT
// ============================================================================

export const expressiveEyes = {
  init: initExpressiveEyes,
  dispose,

  // Emotion control
  setEmotion,
  getEmotion,
  clearEmotion,

  // Micro-expressions
  playMicroExpression,
  isMicroExpressionPlaying,

  // Voice state
  setVoiceState,
  getVoiceState,

  // Active listening
  triggerListeningNod,
  startActiveListening,
  stopActiveListening,
  onUserSpeechPause,

  // Anticipatory
  setAnticipateState,
  clearAnticipateState,

  // Blink
  forceBlink,

  // High-level behaviors
  showConcernResponse,
  showDelightResponse,
  showRecognitionResponse,
  showWarmthResponse,
  showInterestResponse,

  // Music & Dancing 🎵
  setMusicStyle,
  startDancing,
  stopDancing,
  isDancing,

  // Games 🎮
  setGameState,
  celebrateCorrect,
  showWrongAnswer,
  startStreak,
  endStreak,
  exitGameMode,
};
