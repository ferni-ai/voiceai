/**
 * The crisis face hold. From the first crisis or safety message until the call
 * ends, Ferni's face shows only the calm faces in config/crisis-faces.ts.
 *
 * Every face writer asks `crisisFaceAllows(name)` before it draws, and draws
 * nothing when the answer is no:
 * - handOffToFaceEngine (face-engine.ts), which both expression APIs
 *   (ferni-expressions' lids, luxo's data-expression faces and their per-face
 *   animations) pass through first, engine on or off;
 * - setFace, the face engine's renderer;
 * - the legacy data-emotion eyes and glow (presence) and the coach's emotion
 *   reactions, which never reach the engine.
 *
 * Only the call's end releases the hold. No message does: the server sends no
 * "crisis over" signal, so a missing, unknown or malformed signal, or a
 * reconnect mid-call, keeps the hold (fails closed).
 *
 * @module ui/face/crisis-face-hold
 */

import { CRISIS_CALM_FACES } from '../../config/crisis-faces.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('CrisisFaceHold');

const CALM: ReadonlySet<string> = new Set(CRISIS_CALM_FACES);

let held = false;

/** A crisis or safety message arrived: hold the calm faces until the call ends. */
export function holdCrisisFace(): void {
  if (!held) log.info('Crisis face hold on until the call ends');
  held = true;
}

/** The call ended: faces are free again for the next call. */
export function releaseCrisisFace(): void {
  held = false;
}

export function isCrisisFaceHeld(): boolean {
  return held;
}

/** Whether `name` may show now: anything outside a crisis, only calm faces inside one. */
export function crisisFaceAllows(name: string): boolean {
  if (!held || CALM.has(name)) return true;
  log.debug('Face refused during crisis hold', { name });
  return false;
}
