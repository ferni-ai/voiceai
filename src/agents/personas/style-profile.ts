/**
 * How this caller likes Ferni to talk, as multipliers on the odds the turn
 * shaper already draws (turn-shape.ts, turn-extras.ts). 1 is the global
 * behaviour; a profile can make replies shorter or longer and laughs,
 * opinions and fillers rarer or more common, within 0.5x..1.5x. It never
 * turns on anything a global flag has off: the multiply sits inside each
 * flag's own branch.
 *
 * Read from bogle_users/{uid}/style_profile/current once per call, lazily:
 * the first turn starts the read and gets the neutral profile, later turns
 * get the loaded one, so a call never waits on it. Off unless
 * STYLE_PROFILE=on. Nothing writes profiles yet; the learner (fed by the
 * per-turn outcome log) comes separately, so every profile is neutral until then.
 *
 * @module agents/personas/style-profile
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'style-profile' });

export interface StyleProfile {
  /** Above 1 favours fuller replies, below 1 shorter ones. */
  replyLength: number;
  laugh: number;
  opinion: number;
  filler: number;
}

export const NEUTRAL_STYLE: Readonly<StyleProfile> = Object.freeze({
  replyLength: 1,
  laugh: 1,
  opinion: 1,
  filler: 1,
});

export const MIN_MULTIPLIER = 0.5;
export const MAX_MULTIPLIER = 1.5;

export function isStyleProfileOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.STYLE_PROFILE === 'on';
}

function clampMultiplier(x: unknown): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) return 1;
  return Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, x));
}

/** A stored profile, with anything missing or out of range made safe. */
export function toStyleProfile(raw: unknown): StyleProfile {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    replyLength: clampMultiplier(r.replyLength),
    laugh: clampMultiplier(r.laugh),
    opinion: clampMultiplier(r.opinion),
    filler: clampMultiplier(r.filler),
  };
}

/** A base probability scaled by a multiplier, kept a probability. */
export function scaled(p: number, multiplier: number): number {
  return Math.min(1, Math.max(0, p * multiplier));
}

const SHORT_SHAPES = new Set(['react', 'one']);

/**
 * Shape odds leaning longer (bias above 1) or shorter (below 1), renormalised.
 * A move with a single shape (a lookup always answers) is unchanged.
 */
export function biasShapeOdds<S extends string>(
  odds: ReadonlyArray<readonly [S, number]>,
  lengthBias: number
): Array<[S, number]> {
  const weighted = odds.map(([shape, p]): [S, number] => [
    shape,
    SHORT_SHAPES.has(shape) ? p / lengthBias : p * lengthBias,
  ]);
  const total = weighted.reduce((sum, [, p]) => sum + p, 0);
  return total > 0 ? weighted.map(([shape, p]): [S, number] => [shape, p / total]) : [...weighted];
}

type Loaded = { profile: StyleProfile } | { loading: Promise<void> };
const perSession = new WeakMap<object, Loaded>();

async function load(userId: string): Promise<StyleProfile> {
  const db = getFirestoreDb();
  if (!db) return NEUTRAL_STYLE;
  const doc = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('style_profile')
    .doc('current')
    .get();
  return doc.exists ? toStyleProfile(doc.data()) : NEUTRAL_STYLE;
}

/**
 * This call's style profile. Neutral when the flag is off, there is no
 * caller id, or the read hasn't finished (or failed).
 */
export function getStyleProfile(
  session: object,
  env: Record<string, string | undefined> = process.env
): StyleProfile {
  if (!isStyleProfileOn(env)) return NEUTRAL_STYLE;
  const known = perSession.get(session);
  if (known && 'profile' in known) return known.profile;
  if (known) return NEUTRAL_STYLE;
  const userId = (session as { userData?: { userId?: unknown } }).userData?.userId;
  if (typeof userId !== 'string' || !userId) return NEUTRAL_STYLE;
  const loading = load(userId)
    .then((profile) => {
      perSession.set(session, { profile });
      log.info({ ...profile }, 'STYLE_PROFILE applied');
    })
    .catch((error: unknown) => {
      perSession.set(session, { profile: NEUTRAL_STYLE });
      log.warn({ error: String(error) }, 'Style profile not loaded; using neutral');
    });
  perSession.set(session, { loading });
  return NEUTRAL_STYLE;
}
