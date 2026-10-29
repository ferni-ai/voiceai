/**
 * Speech beats: Ferni's head moves with the stress in his voice, not on a
 * timer.
 *
 * Behind the speechBeats switch (config/motion-flags.ts, off by default). With it on:
 * - while it is Ferni's turn (`ferni:avatar-turn` with speaker `ferni`), each
 *   frame reads the gated RMS of the agent audio (audioService.getRmsVolume,
 *   the same source as lid-blend.ts) and speech-beat-detector.ts finds
 *   stressed-syllable onsets;
 * - on each onset the avatar makes a tiny beat gesture: a 1-2 px head dip with
 *   a 0.3 degree tilt (alternating sides), plus a 1 px eye lift on strong
 *   beats, like a brow raise. Both go through compositor transform layers
 *   (additive), so they stack on breathing, the body pulse and the spring body;
 * - `#coach` carries `data-speech-beats`, which inline-styles.css reads to
 *   stand the canned 3.5 s `conversationalSpeaking` loop down;
 * - when the voice pauses long enough to end a phrase,
 *   `ferni:avatar-phrase-end` is dispatched on window (for gaze to use).
 * No gestures under prefers-reduced-motion (the phrase-end event still fires).
 *
 * Avatar audit item 11, "Prosody beats instead of a canned loop".
 */

import { DURATION } from '../../config/animation-constants.js';
import { audioService } from '../../services/audio.service.js';
import { isMotionFlagOn } from '../../config/motion-flags.js';
import { createLogger } from '../../utils/logger.js';
import { addTransformLayer, type TransformLayer } from './compositor.js';
import { createBeatDetector, type BeatDetector } from './speech-beat-detector.js';

const log = createLogger('SpeechBeats');

/** The turn driver's event (detail `{ speaker }`). */
export const SPEECH_BEATS_TURN_EVENT = 'ferni:avatar-turn';
/** Dispatched on window at the end of each spoken phrase; detail `{ at }` (performance.now()). */
export const AVATAR_PHRASE_END_EVENT = 'ferni:avatar-phrase-end';
/** Set on `#coach` while speech beats own the speaking head motion (read by inline-styles.css). */
export const SPEECH_BEATS_ATTR = 'data-speech-beats';

/** Head dip in px: BASE at the weakest beat, BASE + RANGE at the strongest. */
export const BEAT_DIP_BASE_PX = 1;
export const BEAT_DIP_RANGE_PX = 1;
export const BEAT_TILT_DEG = 0.3;
/** Beats at or above this strength also lift the eyes a little. */
export const EYE_LIFT_STRENGTH = 0.6;
export const EYE_LIFT_PX = 1;
/** One beat lasts this long: shorter than the detector's refractory gap, so beats never overlap. */
export const BEAT_DURATION_MS = DURATION.MODERATE;
/** Share of the beat spent going down; the rest settles back slowly. */
export const BEAT_PEAK_AT = 0.3;

const HEAD_REST = 'translateY(0px) rotate(0deg)';
const EYES_REST = 'translateY(0px)';

const smooth = (x: number): number => x * x * (3 - 2 * x);

/** 0-1 amount of the gesture `elapsedMs` into a beat: quick down, slow back. */
export function beatAmount(elapsedMs: number): number {
  const p = elapsedMs / BEAT_DURATION_MS;
  if (!(p > 0) || p >= 1) return 0;
  if (p < BEAT_PEAK_AT) return smooth(p / BEAT_PEAK_AT);
  return smooth(1 - (p - BEAT_PEAK_AT) / (1 - BEAT_PEAK_AT));
}

/** Head transform for a beat of `strength` (0-1) at `amount` (0-1), tilting to `side`. */
export function headTransform(strength: number, amount: number, side: 1 | -1): string {
  const level = Math.max(0, Math.min(1, strength));
  const dip = (BEAT_DIP_BASE_PX + level * BEAT_DIP_RANGE_PX) * amount;
  const tilt = side * BEAT_TILT_DEG * amount;
  return `translateY(${dip.toFixed(2)}px) rotate(${tilt.toFixed(3)}deg)`;
}

export function isSpeechBeatsEnabled(): boolean {
  return isMotionFlagOn('speechBeats');
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface Beat {
  start: number;
  strength: number;
  side: 1 | -1;
}

let coach: HTMLElement | null = null;
let head: TransformLayer | null = null;
let eyes: TransformLayer | null = null;
let detector: BeatDetector | null = null;
let frame: number | null = null;
let beat: Beat | null = null;
let side: 1 | -1 = 1;

function endBeat(): void {
  if (!beat) return;
  head?.set(HEAD_REST);
  if (beat.strength >= EYE_LIFT_STRENGTH) eyes?.set(EYES_REST);
  beat = null;
}

function drawBeat(now: number): void {
  if (!beat) return;
  const elapsed = now - beat.start;
  if (elapsed >= BEAT_DURATION_MS) {
    endBeat();
    return;
  }
  const amount = beatAmount(elapsed);
  head?.set(headTransform(beat.strength, amount, beat.side));
  if (beat.strength >= EYE_LIFT_STRENGTH) {
    eyes?.set(`translateY(${(-EYE_LIFT_PX * amount).toFixed(2)}px)`);
  }
}

function tick(): void {
  frame = requestAnimationFrame(tick);
  const now = performance.now();
  const level = audioService.getRmsVolume();
  if (level !== null && detector) {
    const step = detector.step(level, now);
    if (step.beat && !prefersReducedMotion()) {
      side = side === 1 ? -1 : 1;
      beat = { start: now, strength: step.strength, side };
    }
    if (step.phraseEnd) {
      window.dispatchEvent(new CustomEvent(AVATAR_PHRASE_END_EVENT, { detail: { at: now } }));
    }
  }
  drawBeat(now);
}

function stopLoop(): void {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  detector?.reset();
  endBeat();
}

/** Run the envelope loop only during Ferni's turn. */
function onTurn(event: Event): void {
  const detail: unknown = event instanceof CustomEvent ? event.detail : undefined;
  const speaker = (detail as { speaker?: unknown } | null | undefined)?.speaker;
  if (speaker !== 'ferni') stopLoop();
  else if (frame === null) frame = requestAnimationFrame(tick);
}

/** Starts speech beats when the flag is on; returns whether it started. */
export function initSpeechBeats(): boolean {
  disposeSpeechBeats();
  if (!isSpeechBeatsEnabled()) return false;
  const root = document.getElementById('coach');
  const container = root?.querySelector('.avatar-container');
  if (!root || !container || typeof container.animate !== 'function') {
    log.warn('Speech beats: avatar not found or Web Animations unavailable, staying off');
    return false;
  }
  coach = root;
  coach.setAttribute(SPEECH_BEATS_ATTR, '');
  head = addTransformLayer(container);
  const eyeEl = container.querySelector('.avatar-eyes');
  eyes = eyeEl ? addTransformLayer(eyeEl) : null;
  detector = createBeatDetector();
  window.addEventListener(SPEECH_BEATS_TURN_EVENT, onTurn);
  log.info('Speech beats on');
  return true;
}

export function disposeSpeechBeats(): void {
  stopLoop();
  window.removeEventListener(SPEECH_BEATS_TURN_EVENT, onTurn);
  head?.dispose();
  eyes?.dispose();
  head = null;
  eyes = null;
  detector = null;
  coach?.removeAttribute(SPEECH_BEATS_ATTR);
  coach = null;
  side = 1;
}
