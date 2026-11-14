/**
 * Ferni's face during a crisis: the safety face holds, and only the calm faces
 * in config/crisis-faces.ts may show, until the call ends.
 *
 * Before this, a crisis showed holdingSpace or empathetic for 4–5 s, and then
 * any reaction (a laugh, a wink, an excited bounce) could replace it while the
 * person was still in crisis.
 *
 * `observeCrisisSignal` runs on every data message before any handler, so the
 * hold starts whichever handler, flag or cooldown then takes the message:
 * - `crisis_detected` and `emotional_intervention` (turn handler);
 * - any message whose `concernLevel` is `crisis` (the humanization signal
 *   `concern_detected`, emotion-event-dispatcher).
 * The server sends nothing that ends a crisis, so the hold lasts until the call
 * ends (onCallEnded, app/call-end.ts). No message releases it. While it holds,
 * only warmth and glow play: no hop, sparkle, lamp bounce, tap reaction or
 * celebration (crisisAffectAllows, ui/face/crisis-face-hold.ts).
 *
 * @module app/crisis-face
 */

import { DURATION } from '../config/animation-constants.js';
import { CRISIS_CALM_FACES } from '../config/crisis-faces.js';
import type { DataMessage } from '../types/events.js';
import { coachUI } from '../ui/coach.ui.js';
import { holdCrisisFace } from '../ui/face/crisis-face-hold.js';
import { ferniExpressions } from '../ui/ferni-expressions.ui.js';
import * as luxoExpressions from '../ui/luxo-expressions.ui.js';
import { presenceUI } from '../ui/presence.ui.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CrisisFace');

const SAFETY_MESSAGES: ReadonlySet<string> = new Set(['crisis_detected', 'emotional_intervention']);

/** A crisis or safety message: its type alone counts, whatever its other fields hold. */
function isCrisisSignal(message: DataMessage): boolean {
  return SAFETY_MESSAGES.has(message.type) || message['concernLevel'] === 'crisis';
}

/** Puts the safety face on every layer that draws one, so nothing showing before stays. */
function showSafetyFace(): void {
  try {
    presenceUI.setVoiceEmotion('empathetic'); // glow and the legacy data-emotion eyes
    luxoExpressions.setExpression('empathetic'); // data-expression, which luxo also mirrors to data-emotion
    ferniExpressions.setExpression(CRISIS_CALM_FACES[0], DURATION.MODERATE); // lids, or the face engine
  } finally {
    // A joy, excited or sparkling ring from before the crisis goes calm, even if a layer above threw
    coachUI.resetRingToCalm();
  }
}

/** Start (or renew) the crisis face hold when a crisis or safety message arrives. */
export function observeCrisisSignal(message: DataMessage): void {
  if (!isCrisisSignal(message)) return;
  holdCrisisFace();
  try {
    showSafetyFace();
  } catch (error) {
    // The hold is already on; a face layer that failed to draw must not stop the message.
    log.warn('Safety face not shown', { error: String(error) });
  }
}
