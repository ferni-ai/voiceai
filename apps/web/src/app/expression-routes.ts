/**
 * Routes the agent's expression signals through the expression arbiter
 * (app/expression-arbiter.ts) when `ferni:expression-arbiter` is on.
 *
 * Each routed message asks for exactly one visible reaction, with a priority:
 * - safety: crisis_detected, emotional_intervention
 * - replyTone: reply_tone (Ferni's own voice; also needs ferni:reply-tone)
 * - reaction: emotion (the user's voice), laughter_detected
 * - ambient: avatar_cue (anticipatory hints)
 *
 * The user's emotion no longer drives Ferni's speaking intensity, and Ferni
 * mirrors only positive affect: for distress he shows a grounded face.
 *
 * With the flag off, only reply_tone is consumed here, exactly as before.
 *
 * @module app/expression-routes
 */

import { DURATION } from '../config/animation-constants.js';
import type { DataMessage, VoiceEmotion } from '../types/events.js';
import { ferni } from '../ui/better-than-human.ui.js';
import { ferniExpressions, type EmotionalExpression } from '../ui/ferni-expressions.ui.js';
import { presenceUI } from '../ui/presence.ui.js';
import { waveformUI } from '../ui/waveform.ui.js';
import { createLogger } from '../utils/logger.js';
import {
  expressionArbiter,
  isExpressionArbiterEnabled,
  type ExpressionPriority,
} from './expression-arbiter.js';
import { handleReplyTone } from './reply-tone.js';

const log = createLogger('ExpressionRoutes');

type MicroExpression = Parameters<typeof ferni.playMicroExpression>[0];

/** How long a micro-expression owns the face. */
const MICRO_HOLD_MS = 600;

interface Face {
  expression: EmotionalExpression;
  holdMs: number;
}

function showFace(source: string, priority: ExpressionPriority, face: Face): boolean {
  return expressionArbiter.request({
    source,
    priority,
    key: face.expression,
    holdMs: face.holdMs,
    show: () => ferniExpressions.setExpression(face.expression, DURATION.MODERATE, face.holdMs),
  });
}

function showMicro(source: string, micro: MicroExpression, play: () => void): boolean {
  return expressionArbiter.request({
    source,
    priority: 'ambient',
    key: `micro:${micro}`,
    holdMs: MICRO_HOLD_MS,
    show: play,
  });
}

// ============================================================================
// USER EMOTION: mirror joy, ground distress
// ============================================================================

/** The user's emotion → Ferni's face. Distress gets a grounded face, never a mirror. */
export function faceForUserEmotion(emotion: string, intensity: number): Face | null {
  switch (emotion) {
    case 'happy':
      return { expression: intensity > 0.7 ? 'delighted' : 'happy', holdMs: 2000 };
    case 'excited':
      return { expression: 'excited', holdMs: 1500 };
    case 'sad':
      return { expression: 'empathetic', holdMs: 3000 };
    case 'anxious':
      return { expression: 'present', holdMs: 3000 };
    case 'frustrated':
      return { expression: 'attentive', holdMs: 3000 };
    default:
      return null; // calm and neutral need no reaction
  }
}

/** Presence glow for the user's emotion: supportive colours for distress. */
const GLOW: Readonly<Record<VoiceEmotion, Parameters<typeof presenceUI.setVoiceEmotion>[0]>> = {
  neutral: 'neutral',
  happy: 'happy',
  excited: 'excited',
  calm: 'calm',
  sad: 'empathetic',
  anxious: 'calm',
  frustrated: 'serious',
};

function routeEmotion(message: DataMessage): void {
  const { emotion, confidence, intensity } = message;
  if (typeof emotion !== 'string' || typeof confidence !== 'number' || confidence < 0.4) return;
  const level = typeof intensity === 'number' ? intensity : 0.5;
  waveformUI.setEmotion(emotion as VoiceEmotion, level); // the user's own waveform
  presenceUI.setVoiceEmotion(GLOW[emotion as VoiceEmotion] ?? 'neutral');
  if (confidence <= 0.6 || level <= 0.5) return;
  const face = faceForUserEmotion(emotion, level);
  if (face) showFace('emotion', 'reaction', face);
}

// ============================================================================
// LAUGHTER
// ============================================================================

const LAUGH_FACE: Readonly<Record<string, Face>> = {
  hearty: { expression: 'delighted', holdMs: 2500 },
  laugh: { expression: 'happy', holdMs: 2000 },
  chuckle: { expression: 'pleased', holdMs: 1500 },
  giggle: { expression: 'pleased', holdMs: 1500 },
  nervous: { expression: 'warm', holdMs: 2000 },
  polite: { expression: 'pleased', holdMs: 1000 },
};

function routeLaughter(message: DataMessage): void {
  const { laughType, confidence } = message;
  if (typeof confidence !== 'number' || confidence < 0.6) {
    showMicro('laughter', 'warmth_pulse', () => ferni.playMicroExpression('warmth_pulse'));
    return;
  }
  const face = (typeof laughType === 'string' ? LAUGH_FACE[laughType] : undefined) ?? {
    expression: 'warm',
    holdMs: 1500,
  };
  showFace('laughter', 'reaction', face);
}

// ============================================================================
// AVATAR CUES (anticipatory)
// ============================================================================

const CUE_MICRO: Readonly<Record<string, MicroExpression>> = {
  concern: 'concern_flash',
  warmth: 'warmth_pulse',
  soften: 'warmth_pulse',
  excitement: 'interest_flash',
  attentive: 'protective',
  neutral: 'noticing',
};

const GESTURE_MICRO: Readonly<Record<string, MicroExpression>> = {
  'lean-in': 'curious_lean',
  'gentle-smile': 'warmth_pulse',
};

function routeAvatarCue(message: DataMessage): void {
  const { expression, gesture } = message;
  if (gesture === 'micro-nod') {
    // a short pause triggers the active-listening nod
    showMicro('avatar_cue', 'recognition', () => ferni.onUserSpeechPause(200));
    return;
  }
  const micro =
    (typeof expression === 'string' ? CUE_MICRO[expression] : undefined) ??
    (typeof gesture === 'string' ? GESTURE_MICRO[gesture] : undefined);
  if (micro) showMicro('avatar_cue', micro, () => ferni.playMicroExpression(micro));
}

// ============================================================================
// SAFETY
// ============================================================================

/** Safety faces hold long enough that reactions can't break the grounding. */
const SAFETY_HOLD_MS = 5000;

function routeSafety(message: DataMessage): void {
  const crisis = message.type === 'crisis_detected';
  ferni.setBreathSyncStrength(crisis ? 0.7 : 0.6); // grounding breath, not a reaction
  showFace(String(message.type), 'safety', {
    expression: crisis ? 'empathetic' : 'holdingSpace',
    holdMs: SAFETY_HOLD_MS,
  });
}

// ============================================================================
// ROUTER
// ============================================================================

const ROUTES: Readonly<Record<string, (message: DataMessage) => void>> = {
  emotion: routeEmotion,
  laughter_detected: routeLaughter,
  avatar_cue: routeAvatarCue,
  crisis_detected: routeSafety,
  emotional_intervention: routeSafety,
};

/** Reply tone sets a resting face (no hold) at reply-tone priority. */
function setReplyFace(expression: EmotionalExpression): void {
  expressionArbiter.request({
    source: 'reply_tone',
    priority: 'replyTone',
    key: expression,
    show: () => ferniExpressions.setExpression(expression),
  });
}

/**
 * Handle the expression messages. Returns true when the message was consumed.
 * Flag off: only reply_tone, as before. Flag on: every routed type.
 */
export function routeExpressionMessage(message: DataMessage): boolean {
  if (!isExpressionArbiterEnabled()) return handleReplyTone(message);
  if (handleReplyTone(message, setReplyFace)) return true;
  const route = ROUTES[String(message.type)];
  if (!route) return false;
  try {
    route(message);
  } catch (error) {
    log.warn('Expression route failed', { type: message.type, error: String(error) });
  }
  return true;
}
