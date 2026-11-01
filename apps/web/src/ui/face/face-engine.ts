/**
 * The one writer of Ferni's face. Off by default: the faceEngine switch in
 * config/motion-flags.ts.
 *
 * Today two expression systems write his eyes (ferni-expressions' own lid
 * table and luxo's token expressions, whose CSS matches no live element), so
 * one signal can drive both, a handoff re-animates his lids four times, and
 * most of his 100 designed faces never show. With the engine on, both
 * systems hand their requests here: names resolve to the token faces, the
 * priority rule decides who may change the face (choreography > agent >
 * reactions > ambient, never a replay), and the renderer draws it with
 * compositor-only layers. Plan: docs/plans/2026-10-12-face-engine.md
 *
 * @module ui/face/face-engine
 */

import type { ExpressionId } from '../../config/avatar-expressions.js';
import { isMotionFlagOn } from '../../config/motion-flags.js';
import { createLogger } from '../../utils/logger.js';
import { mayReplace, resolveFace, type FaceSource, type HeldFace } from './face-model.js';
import { createFaceRenderer, type FaceRenderer } from './face-renderer.js';

const log = createLogger('FaceEngine');

/** While on, the old SVG eyes and lid overlay are hidden; the engine's layers replace them. */
const ON_CLASS = 'face-engine-on';
const HIDE_OLD_CSS = `.${ON_CLASS} #avatarEyes, .${ON_CLASS} #avatarLidOverlay { visibility: hidden; }`;
/** No blinking while his eyes are (nearly) shut. */
const NO_BLINK: ReadonlySet<ExpressionId> = new Set(['resting', 'sleepy', 'drowsy', 'exhausted']);

export function faceEngineEnabled(): boolean {
  return isMotionFlagOn('faceEngine');
}

const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer: FaceRenderer | null = null;
let held: HeldFace | null = null;
let blinkTimer: ReturnType<typeof setTimeout> | undefined;

function ensureRenderer(): FaceRenderer | null {
  if (renderer) return renderer;
  const root = document.getElementById('coachAvatar');
  if (!root) return null;
  if (!document.getElementById('face-engine-hide-old')) {
    const style = document.createElement('style');
    style.id = 'face-engine-hide-old';
    style.textContent = HIDE_OLD_CSS;
    document.head.appendChild(style);
  }
  root.classList.add(ON_CLASS);
  renderer = createFaceRenderer(root);
  return renderer;
}

function scheduleBlink(): void {
  clearTimeout(blinkTimer);
  if (!held || NO_BLINK.has(held.id)) return;
  blinkTimer = setTimeout(
    () => {
      renderer?.blink();
      scheduleBlink();
    },
    2600 + Math.random() * 3400
  );
}

/**
 * Asks for a face. Returns false when nothing changed: an unknown name, the
 * face already showing, or a lower-priority request while a higher one holds.
 */
export function setFace(
  name: string,
  opts: { source?: FaceSource; hold?: number; instant?: boolean } = {}
): boolean {
  const id = resolveFace(name);
  if (!id) {
    log.debug('Unknown face, ignored', name);
    return false;
  }
  const source = opts.source ?? 'reaction';
  const now = Date.now();
  if (!mayReplace(held, { id, source }, now)) return false;
  const r = ensureRenderer();
  if (!r) return false;
  held = { id, source, until: now + (opts.hold ?? 0) };
  r.show(id, { instant: opts.instant === true || reducedMotion() });
  scheduleBlink();
  return true;
}

/** The face showing now, or null before the first one. */
export function currentFace(): ExpressionId | null {
  return held?.id ?? null;
}

/** For tests and hot reloads: forget the face and remove the layers. */
export function resetFaceEngine(): void {
  clearTimeout(blinkTimer);
  renderer?.destroy();
  renderer = null;
  held = null;
  document.getElementById('coachAvatar')?.classList.remove(ON_CLASS);
}

/**
 * For the older expression APIs (ferni-expressions, luxo-expressions): when
 * the engine is on it takes the request and returns true, and the caller
 * does nothing more; when off it returns false and the old path runs as before.
 */
export function handOffToFaceEngine(name: string, source: FaceSource, hold = 0): boolean {
  if (!faceEngineEnabled()) return false;
  setFace(name, { source, hold });
  return true;
}
