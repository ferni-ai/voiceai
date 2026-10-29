/**
 * Avatar motion and expression switches. Every one is off by default.
 *
 * Until 2026-10-29 each switch was read straight from localStorage in its own
 * module, so it could be turned on in one browser but never for a build (motion
 * audit 2026-10-29, gap 1). Now each is read here, first match wins:
 * 1. a browser override: `localStorage.setItem('<key>', 'on')` ('true' works
 *    too), or 'off' / 'false' to force it off on a build that has it on;
 * 2. the build value: `<VITE_NAME>=on` (or 'true') when the web app is built;
 * 3. off.
 *
 * | Switch            | Override key                | Build value               |
 * |-------------------|-----------------------------|---------------------------|
 * | naturalBlink      | ferni:natural-blink         | VITE_NATURAL_BLINK        |
 * | lidBlend          | ferni:lid-blend             | VITE_LID_BLEND            |
 * | gaze              | ferni:gaze                  | VITE_GAZE                 |
 * | listenNods        | ferni:listen-nods           | VITE_LISTEN_NODS          |
 * | springBody        | ferni:spring-body           | VITE_SPRING_BODY          |
 * | weightedEasing    | ferni:weighted-easing       | VITE_WEIGHTED_EASING      |
 * | speechBeats       | ferni:speech-beats          | VITE_SPEECH_BEATS         |
 * | thinkingGlance    | ferni:thinking-glance       | VITE_THINKING_GLANCE      |
 * | turnGestures      | ferni:turn-gestures         | VITE_TURN_GESTURES        |
 * | faceEngine        | ferni:face-engine           | VITE_FACE_ENGINE          |
 * | expressionArbiter | ferni:expression-arbiter    | VITE_EXPRESSION_ARBITER   |
 * | replyTone         | ferni:reply-tone            | VITE_REPLY_TONE           |
 * | soundDirector     | ferni:sound-director        | VITE_SOUND_DIRECTOR       |
 * | idleLife          | ferni:idle-life             | VITE_IDLE_LIFE            |
 *
 * This is the only place these switches are read
 * (tests/config/motion-flags.test.ts fails on a direct read anywhere else).
 *
 * @module config/motion-flags
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('MotionFlags');

/**
 * Each switch's override key and build value. The build values are read with
 * static `import.meta.env.VITE_*` access so Vite inlines them, and read on each
 * call so a test can stub them.
 */
const SWITCHES = {
  naturalBlink: { key: 'ferni:natural-blink', build: () => import.meta.env.VITE_NATURAL_BLINK },
  lidBlend: { key: 'ferni:lid-blend', build: () => import.meta.env.VITE_LID_BLEND },
  gaze: { key: 'ferni:gaze', build: () => import.meta.env.VITE_GAZE },
  listenNods: { key: 'ferni:listen-nods', build: () => import.meta.env.VITE_LISTEN_NODS },
  springBody: { key: 'ferni:spring-body', build: () => import.meta.env.VITE_SPRING_BODY },
  weightedEasing: {
    key: 'ferni:weighted-easing',
    build: () => import.meta.env.VITE_WEIGHTED_EASING,
  },
  speechBeats: { key: 'ferni:speech-beats', build: () => import.meta.env.VITE_SPEECH_BEATS },
  thinkingGlance: {
    key: 'ferni:thinking-glance',
    build: () => import.meta.env.VITE_THINKING_GLANCE,
  },
  turnGestures: { key: 'ferni:turn-gestures', build: () => import.meta.env.VITE_TURN_GESTURES },
  faceEngine: { key: 'ferni:face-engine', build: () => import.meta.env.VITE_FACE_ENGINE },
  expressionArbiter: {
    key: 'ferni:expression-arbiter',
    build: () => import.meta.env.VITE_EXPRESSION_ARBITER,
  },
  replyTone: { key: 'ferni:reply-tone', build: () => import.meta.env.VITE_REPLY_TONE },
  soundDirector: {
    key: 'ferni:sound-director',
    build: () => import.meta.env.VITE_SOUND_DIRECTOR,
  },
  idleLife: { key: 'ferni:idle-life', build: () => import.meta.env.VITE_IDLE_LIFE },
} as const satisfies Record<string, { key: string; build: () => string | undefined }>;

export type MotionFlag = keyof typeof SWITCHES;

/** The browser override key of each switch, for tests and for turning one on by hand. */
export const MOTION_FLAG_KEYS = Object.fromEntries(
  Object.entries(SWITCHES).map(([flag, { key }]) => [flag, key])
) as { readonly [F in MotionFlag]: (typeof SWITCHES)[F]['key'] };

const isOn = (value: unknown): boolean => value === 'on' || value === 'true';
const isOff = (value: unknown): boolean => value === 'off' || value === 'false';

/** Whether a motion switch is on: browser override, then build value, then off. */
export function isMotionFlagOn(flag: MotionFlag): boolean {
  const { key, build } = SWITCHES[flag];
  try {
    const override = localStorage.getItem(key);
    if (isOn(override)) return true;
    if (isOff(override)) return false;
  } catch (error) {
    log.debug('localStorage unavailable for a motion switch', { flag, error: String(error) });
  }
  return isOn(build());
}
