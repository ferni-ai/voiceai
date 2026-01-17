/**
 * Humanization Bridge - Better Than Human Signal Handlers
 *
 * Handles signals from the backend superhuman capabilities and
 * translates them to frontend EQ responses.
 *
 * These respond to signals from the backend emotion dispatcher:
 * - concern_detected: User is distressed → protective mode
 * - voice_state_detected: Voice-text mismatch → extra care
 * - emotional_trajectory: Mood is changing → adapt presence
 * - high_engagement: User is excited → match energy
 * - disengagement: User is drifting → gentle reconnection
 * - vulnerability: User shared something hard → holding space
 * - breakthrough: User had realization → celebrate subtly
 *
 * @module @ferni/eq/bridge/humanization-bridge
 */

import { EASING } from '../../config/animation-constants.js';
import { emotionState } from '../../emotion/emotion-state.js';
import type { EmotionalExpression } from '../../ui/ferni-expressions.ui.js';
import { ferniExpressions } from '../../ui/ferni-expressions.ui.js';
import { createLogger } from '../../utils/logger.js';
import type { BetterThanHumanSignal } from '../types.js';
import { getAvatarSoul } from '../utils/avatar-soul-loader.js';
import { playMicroExpression, setBreathSyncEnabled, setBreathSyncStrength } from '../capabilities/index.js';

const log = createLogger('HumanizationBridge');

// ============================================================================
// AVATAR CONTAINER (for somatic presence)
// ============================================================================

let avatarContainer: HTMLElement | null = null;

/**
 * Set the avatar container element
 */
export function setAvatarContainer(container: HTMLElement | null): void {
  avatarContainer = container;
}

// ============================================================================
// BETTER THAN HUMAN SIGNAL HANDLERS
// ============================================================================

/**
 * Handle Better Than Human signals from backend
 */
export function handleBetterThanHumanSignal(signal: BetterThanHumanSignal): void {
  log.debug('Better Than Human signal received:', signal.signalType);

  switch (signal.signalType) {
    case 'emotional_bond_deepen':
      void handleEmotionalBondSignal(signal);
      break;
    case 'protective_instinct':
      void handleProtectiveInstinctSignal(signal);
      break;
    case 'spontaneous_delight':
      void handleSpontaneousDelightSignal(signal);
      break;
    case 'inside_joke_callback':
      void handleInsideJokeSignal(signal);
      break;
    case 'superhuman_observation':
      void handleSuperhumanObservationSignal(signal);
      break;
    case 'visible_vulnerability':
      void handleVisibleVulnerabilitySignal(signal);
      break;
    case 'temporal_insight':
      void handleTemporalInsightSignal(signal);
      break;
    case 'meta_relationship_moment':
      void handleMetaRelationshipSignal(signal);
      break;
    case 'somatic_presence':
      void handleSomaticPresenceSignal(signal);
      break;
    case 'anticipatory_presence':
      void handleAnticipatoryPresenceSignal(signal);
      break;
  }
}

/**
 * Emotional bond deepening - warmth/trust/protectiveness
 */
async function handleEmotionalBondSignal(signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();
  const bondLevel = signal.bondLevel || 0.7;

  if (soul) {
    soul.setGlowBleed(0.2 + bondLevel * 0.2, 'rgba(196, 162, 101, 0.5)');
    soul.setPupilDilation('CONNECTED', 'slow');
  }

  ferniExpressions.setExpression('warm', 400);
  playMicroExpression('warmth_pulse');
}

/**
 * Protective instinct - defending user from self-criticism
 */
async function handleProtectiveInstinctSignal(signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();
  const intensity = signal.intensity || 0.8;

  if (soul) {
    soul.setPupilDilation('CONNECTED', 'fast');
    if (intensity > 0.8) {
      soul.enterProtectiveMode();
    }
  }

  ferniExpressions.setExpression('attentive', 300);
  playMicroExpression('protective');
}

/**
 * Spontaneous delight - appreciation/gratitude/joy
 */
async function handleSpontaneousDelightSignal(_signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();

  if (soul) {
    soul.flashShimmer(1.0);
    soul.setPupilDilation('DILATED', 'fast');
    soul.setGlowBleed(0.35, 'rgba(196, 162, 101, 0.6)');
  }

  ferniExpressions.setExpression('pleased', 400);
  playMicroExpression('delight_flash');
}

/**
 * Inside joke callback - shared humor
 */
async function handleInsideJokeSignal(_signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();

  if (soul) {
    soul.flashShimmer(0.8);
    soul.setPupilDilation('INTERESTED', 'fast');
  }

  ferniExpressions.setExpression('warm', 300);
  playMicroExpression('insider');
}

/**
 * Superhuman observation - pattern surfacing
 */
async function handleSuperhumanObservationSignal(_signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();

  if (soul) {
    soul.setPupilDilation('CONTRACTED', 'slow');
    soul.glanceAway(300);
  }

  ferniExpressions.setExpression('noticing', 400);
  playMicroExpression('noticing');
}

/**
 * Visible vulnerability - showing uncertainty
 */
async function handleVisibleVulnerabilitySignal(_signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();

  if (soul) {
    soul.setPupilDilation('NEUTRAL', 'slow');
    soul.setGlowBleed(0.15, 'rgba(154, 123, 90, 0.4)');
  }

  ferniExpressions.setExpression('contemplative', 500);
}

/**
 * Temporal insight - cross-session comparison
 */
async function handleTemporalInsightSignal(_signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();

  if (soul) {
    soul.triggerMemorySpark();
    soul.setPupilDilation('CONNECTED', 'slow');
  }

  ferniExpressions.setExpression('remembering', 400);
  playMicroExpression('memory_spark');
}

/**
 * Meta-relationship moment - commenting on the relationship
 */
async function handleMetaRelationshipSignal(_signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();

  if (soul) {
    soul.setPupilDilation('CONNECTED', 'slow');
    soul.setGlowBleed(0.3, 'rgba(196, 162, 101, 0.5)');
    soul.startComfortPulse();
  }

  ferniExpressions.setExpression('warm', 500);
  playMicroExpression('warmth_pulse');
}

/**
 * Somatic presence - physical embodiment cues
 */
async function handleSomaticPresenceSignal(signal: BetterThanHumanSignal): Promise<void> {
  if (!avatarContainer) return;

  const cue = signal.somaticCue || '';

  if (cue.includes('settling') || cue.includes('breath')) {
    avatarContainer.animate(
      [
        { transform: 'translateY(0)' },
        { transform: 'translateY(2px)' },
        { transform: 'translateY(0)' },
      ],
      {
        duration: 800,
        easing: EASING.GENTLE,
      }
    );
  } else if (cue.includes('processing') || cue.includes('heavy')) {
    ferniExpressions.setExpression('contemplative', 600);
  }
}

/**
 * Anticipatory presence - "thinking of you"
 */
async function handleAnticipatoryPresenceSignal(_signal: BetterThanHumanSignal): Promise<void> {
  const soul = await getAvatarSoul();

  if (soul) {
    soul.setPupilDilation('INTERESTED', 'slow');
    soul.setGlowBleed(0.25, 'rgba(196, 162, 101, 0.45)');
  }

  ferniExpressions.setExpression('warm', 400);
  playMicroExpression('recognition');
}

// ============================================================================
// BEHAVIOR SYSTEM SIGNAL HANDLERS
// Bidirectional behavior system - Code triggers speech, speech triggers code
// ============================================================================

/**
 * Handle behavior mode shift
 */
export function handleBehaviorModeShift(mode: string, reason?: string): void {
  log.debug('Behavior mode shift:', { mode, reason });

  const modeExpressionMap: Record<string, EmotionalExpression> = {
    presence: 'attentive',
    deep_listening: 'attentive',
    processing: 'thinking',
    celebration: 'excited',
    holding_space: 'empathetic',
    energy_match: 'neutral',
    grounding: 'present',
  };

  const expression = modeExpressionMap[mode];
  if (expression) {
    ferniExpressions.setExpression(expression);
  }

  if (mode === 'presence' || mode === 'holding_space' || mode === 'deep_listening') {
    setBreathSyncStrength(0.8);
    setBreathSyncEnabled(true);
  } else if (mode === 'celebration') {
    setBreathSyncStrength(0.3);
  }
}

/**
 * Handle behavior expression (non-verbal presence)
 */
export function handleBehaviorExpression(expression: string): void {
  log.debug('Behavior expression:', { expression });

  const expressionMap: Record<string, EmotionalExpression> = {
    breath: 'present',
    hum: 'pleased',
    nod: 'attentive',
    sigh: 'empathetic',
    soft_sound: 'attentive',
    yield: 'neutral',
  };

  const avatarExpression = expressionMap[expression];
  if (avatarExpression) {
    ferniExpressions.setExpression(avatarExpression);
  }
}

/**
 * Handle hold space (intentional silence)
 */
export function handleBehaviorHoldSpace(duration: number, reason?: string): void {
  log.debug('Behavior hold space:', { duration, reason });

  ferniExpressions.setExpression('empathetic');
  setBreathSyncStrength(0.9);

  setTimeout(() => {
    ferniExpressions.setExpression('neutral');
    setBreathSyncStrength(0.5);
  }, duration);
}

/**
 * Handle processing state (visible thinking)
 */
export function handleBehaviorProcessing(started: boolean, _expression?: string): void {
  log.debug('Behavior processing:', { started });

  if (started) {
    ferniExpressions.setExpression('thinking');
  } else {
    ferniExpressions.setExpression('neutral');
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let initialized = false;

/**
 * Initialize Better Than Human signal handlers
 */
export function initBetterThanHumanSignalHandlers(): void {
  if (initialized) return;

  // Listen for humanization signals from backend
  document.addEventListener('humanization_signal', ((event: CustomEvent) => {
    const signal = event.detail as BetterThanHumanSignal;
    if (signal && signal.signalType) {
      handleBetterThanHumanSignal(signal);
    }
  }) as EventListener);

  // Also listen via custom event channel (for WebSocket messages)
  document.addEventListener('ferni:humanization-signal', ((event: CustomEvent) => {
    const signal = event.detail as BetterThanHumanSignal;
    if (signal && signal.signalType) {
      handleBetterThanHumanSignal(signal);
    }
  }) as EventListener);

  log.info('Better Than Human signal handlers initialized');
  initialized = true;
}

/**
 * Initialize behavior signal handlers from the bidirectional behavior system
 */
export function initBehaviorSignalHandlers(): void {
  // Mode shift - Ferni changed presence mode
  window.addEventListener('ferni:eq-mode-shift', ((event: CustomEvent) => {
    const { mode, reason } = event.detail;
    handleBehaviorModeShift(mode, reason);
  }) as EventListener);

  // Expression - Non-verbal presence triggered
  window.addEventListener('ferni:eq-expression', ((event: CustomEvent) => {
    const { expression } = event.detail;
    handleBehaviorExpression(expression);
  }) as EventListener);

  // Hold space - Intentional meaningful silence
  window.addEventListener('ferni:eq-hold-space', ((event: CustomEvent) => {
    const { duration, reason } = event.detail;
    handleBehaviorHoldSpace(duration, reason);
  }) as EventListener);

  // Processing state change
  window.addEventListener('ferni:eq-processing', ((event: CustomEvent) => {
    const { started, expression } = event.detail;
    handleBehaviorProcessing(started, expression);
  }) as EventListener);

  log.info('Behavior signal handlers initialized');
}

/**
 * Dispose handlers (cleanup)
 */
export function disposeSignalHandlers(): void {
  initialized = false;
  avatarContainer = null;
}
