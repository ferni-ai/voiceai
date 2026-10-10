/**
 * Live-call signal handlers: trust signals, anticipatory avatar cues, and the
 * safety signals (crisis, emotional intervention).
 *
 * Each message's kind is read from the field the backend envelope writes it to
 * (src/agents/shared/data-message-envelope.ts): `signalType` for trust_signal,
 * `anticipatoryType` for avatar_cue. The message `type` is always the message
 * type itself.
 *
 * @module app/live-signal-handlers
 */

import type { DataMessage } from '../types/events.js';
import { ferni } from '../ui/better-than-human.ui.js';
import { ferniExpressions } from '../ui/ferni-expressions.ui.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('LiveSignalHandlers');

type MicroExpression = Parameters<typeof ferni.playMicroExpression>[0];

// ============================================================================
// TRUST SIGNALS
// ============================================================================

/**
 * Trust signal from the backend. Two senders:
 * - the trust-signal emitter: a "Ferni noticed..." card (signalType, title, message);
 * - the turn handler: an avatar hint only (signalType such as
 *   emotional_mismatch_detected, plus avatarHint).
 */
export interface TrustSignalEvent extends DataMessage {
  type: 'trust_signal';
  signalType?: string;
  title?: string;
  message?: string;
  personaId?: string;
  timing?: 'immediate' | 'after_response' | 'end_of_turn';
  avatarHint?: string;
  metadata?: Record<string, unknown>;
}

/** Turn-handler avatar hints → the micro-expression that shows them. */
const TRUST_HINT_EXPRESSION: Readonly<Record<string, MicroExpression>> = {
  attentive: 'concern_flash', // they said one thing and sound like another
  thoughtful: 'memory_spark', // a growth reflection is available
  joyful: 'delight_flash', // a small win to celebrate
};

/**
 * Show a trust signal: a card when it carries a message (trust-signals UI via
 * progressive-features), an avatar micro-expression when it carries a hint.
 */
export function handleTrustSignal(event: TrustSignalEvent): void {
  log.info('💚 Trust signal received', {
    type: event.signalType,
    title: event.title,
    hint: event.avatarHint,
  });

  if (event.message) {
    window.dispatchEvent(
      new CustomEvent('ferni:backend-trust-signal', {
        detail: {
          type: event.signalType,
          title: event.title,
          message: event.message,
          personaId: event.personaId,
        },
      })
    );
  }

  const expression = event.avatarHint ? TRUST_HINT_EXPRESSION[event.avatarHint] : undefined;
  if (expression) ferni.playMicroExpression(expression);
}

// ============================================================================
// AVATAR CUES - Anticipatory Emotional Intelligence
// ============================================================================

/**
 * Avatar cue from the anticipatory trigger engine, sent when it predicts the
 * user's emotion before they finish speaking ("reading the future").
 */
export interface AvatarCueEvent extends DataMessage {
  type: 'avatar_cue';
  /** 'anticipatory_response' from the anticipation engine */
  anticipatoryType?: string;
  expression?: 'soften' | 'concern' | 'warmth' | 'excitement' | 'attentive' | 'neutral';
  gesture?: 'micro-nod' | 'lean-in' | 'open-hands' | 'gentle-smile' | 'none';
  eyeContact?: 'maintain' | 'soften' | 'give-space';
  /** What the engine predicted (for debugging/analytics) */
  anticipatedOutcome?: string;
}

const CUE_EXPRESSION: Readonly<Record<string, MicroExpression>> = {
  concern: 'concern_flash',
  warmth: 'warmth_pulse',
  soften: 'warmth_pulse',
  excitement: 'interest_flash',
  attentive: 'protective',
  neutral: 'noticing',
};

/** Map an anticipatory cue to the avatar's micro-expressions and gestures. */
export function handleAvatarCue(event: AvatarCueEvent): void {
  log.info('🔮 Avatar cue received (anticipatory)', {
    kind: event.anticipatoryType,
    expression: event.expression,
    gesture: event.gesture,
    anticipatedOutcome: event.anticipatedOutcome,
  });

  const expression = event.expression ? CUE_EXPRESSION[event.expression] : undefined;
  if (expression) ferni.playMicroExpression(expression);

  if (event.gesture === 'lean-in') {
    ferni.playMicroExpression('curious_lean');
  } else if (event.gesture === 'gentle-smile') {
    ferni.playMicroExpression('warmth_pulse');
  } else if (event.gesture === 'micro-nod') {
    ferni.onUserSpeechPause(200); // a short pause triggers the active-listening nod
  }
}

// ============================================================================
// SAFETY SIGNALS
// ============================================================================

/**
 * Crisis detected (turn handler). The agent is already speaking the crisis
 * response; the avatar holds a steady, protective presence while it does:
 * empathetic expression and strong breath sync for grounding.
 */
export function handleCrisisDetected(message: DataMessage): void {
  log.info('🛟 Crisis signal received', { severity: message['severity'] });
  ferni.playMicroExpression('protective');
  ferniExpressions.empathy();
  ferni.setBreathSyncStrength(0.7);
}

/**
 * Emotional intervention (turn handler): the user's mood is spiralling. The
 * avatar shows concern and holds space instead of matching their energy.
 */
export function handleEmotionalIntervention(message: DataMessage): void {
  log.info('🫂 Emotional intervention received', { trajectory: message['trajectory'] });
  ferni.playMicroExpression('concern_flash');
  ferniExpressions.holdSpace();
  ferni.setBreathSyncStrength(0.6);
}
