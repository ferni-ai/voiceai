/**
 * A persona's resting voice from env: <PERSONA>_VOICE_EMOTION and
 * <PERSONA>_VOICE_SPEED, the same prefix as its <PERSONA>_VOICE_ID. Wired for
 * Ferni (FERNI_VOICE_*) and Maya (MAYA_SANTOS_VOICE_*); OVERRIDES below adds
 * a persona in one line. All unset by default. On 2026-10-17 Seth kept the calm B voice but picked a "lively"
 * delivery for Ferni by ear: excited at 1.08. On 2026-10-22 he heard Maya as
 * "way too chill": her manifest asks for upbeat, but every upbeat name in it
 * (happy, proud, enthusiastic...) reaches Cartesia as the Director's
 * `content` (emotion.ts NEAREST_STABLE), and on her voice no prosody tag moved
 * breathiness much (fix/maya-brighter-delivery measurements).
 *
 * Ferni's manifest default_emotion and default_speed never reach the TTS
 * request: Ferni gets no persona delivery (persona-delivery.ts), so he rests
 * at the Director's 1.0 with its six stable tones. A teammate rests at its
 * manifest's pace and tone when TEAM_VOICES is on. These variables move that
 * rest. With them unset every request is exactly as before.
 *
 * - <PERSONA>_VOICE_SPEED (clamped to 0.85-1.2): the resting pace, layered
 *   under the Director's own pace (attune.ts layerDelivery). For a teammate
 *   with a manifest delivery it replaces the manifest's base and moves its
 *   pace band by the same ratio. Sent only while the pacing lever is live.
 * - <PERSONA>_VOICE_EMOTION (a Sonic 3 emotion): the resting tone, on the
 *   reply's opening `<emotion>` tag while the emotion lever is live. It
 *   replaces only the Director's resting picks (no tone, content,
 *   affectionate). A sympathetic, calm, contemplative or curious reply keeps
 *   its tone, and heavy words never yield a resting pick (emotion.ts
 *   FITS.heavy), so a hard moment is never brightened.
 *
 * A bad value is ignored with one warning, and the default applies.
 *
 * @module speech/tts-gateway/director/ferni-resting-voice
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { SONIC3_EMOTIONS } from '../../sonic-emotions.js';
import type { SSMLProsodyConfig } from '../types.js';
import {
  deliveryFromManifest,
  personaDelivery,
  teamVoicesOn,
  type PersonaDelivery,
} from './persona-delivery.js';
import type { DirectorMode } from './types.js';

type Env = Record<string, string | undefined>;

const log = createLogger({ module: 'FerniRestingVoice' });

export const FERNI_SPEED_LIMITS = [0.85, 1.2] as const;

/**
 * Each persona's override values, read by literal name so the env scan
 * (env-read-names.generated.ts) and the EFFECTIVE_SETTINGS report see them.
 * A persona gets overrides by adding one line here (and its two names to
 * flag-manifest.ts).
 */
const OVERRIDES: Readonly<Record<string, (env: Env) => { emotion?: string; speed?: string }>> = {
  ferni: (env) => ({ emotion: env.FERNI_VOICE_EMOTION, speed: env.FERNI_VOICE_SPEED }),
  'maya-santos': (env) => ({
    emotion: env.MAYA_SANTOS_VOICE_EMOTION,
    speed: env.MAYA_SANTOS_VOICE_SPEED,
  }),
};

/** The env name prefix of a persona's overrides, as its <PREFIX>_VOICE_ID: maya-santos -> MAYA_SANTOS. */
const prefixOf = (personaId: string): string => personaId.toUpperCase().replace(/-/g, '_');

function override(
  personaId: string | undefined,
  kind: 'emotion' | 'speed',
  env: Env
): { name: string; raw: string } | undefined {
  const read = personaId ? OVERRIDES[personaId] : undefined;
  const raw = read?.(env)[kind]?.trim();
  if (!raw || !personaId) return undefined;
  return { name: `${prefixOf(personaId)}_VOICE_${kind.toUpperCase()}`, raw };
}

/** The Director's resting picks: the only tones <PERSONA>_VOICE_EMOTION replaces. */
const RESTING_PICKS: ReadonlySet<string | undefined> = new Set([
  undefined,
  'content',
  'affectionate',
]);

const warned = new Set<string>();

function warnOnce(name: string, value: string, using: string): void {
  const key = `${name}=${value}`;
  if (warned.has(key)) return;
  warned.add(key);
  log.warn({ name, value, using }, 'Resting voice override not usable as given');
}

/** <PERSONA>_VOICE_EMOTION as a Sonic 3 emotion, or undefined (unset or not one Sonic 3 accepts). */
export function restingEmotion(
  personaId: string | undefined,
  env: Env = process.env
): string | undefined {
  const set = override(personaId, 'emotion', env);
  if (!set) return undefined;
  const { name, raw } = set;
  const emotion = raw.toLowerCase();
  if (SONIC3_EMOTIONS.has(emotion)) return emotion;
  warnOnce(name, raw, "the Director's tones");
  return undefined;
}

/** <PERSONA>_VOICE_SPEED inside 0.85-1.2, or undefined (unset or not a number). */
export function restingSpeed(
  personaId: string | undefined,
  env: Env = process.env
): number | undefined {
  const set = override(personaId, 'speed', env);
  if (!set) return undefined;
  const { name, raw } = set;
  const speed = Number(raw);
  if (!Number.isFinite(speed)) {
    warnOnce(name, raw, 'the default resting pace');
    return undefined;
  }
  const [lo, hi] = FERNI_SPEED_LIMITS;
  const clamped = round2(Math.min(hi, Math.max(lo, speed)));
  if (clamped !== speed) warnOnce(name, raw, String(clamped));
  return clamped;
}

export const ferniRestingEmotion = (env: Env = process.env): string | undefined =>
  restingEmotion('ferni', env);
export const ferniRestingSpeed = (env: Env = process.env): number | undefined =>
  restingSpeed('ferni', env);

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A manifest delivery moved to rest at `base`, its band moved by the same ratio. */
function atRest(delivery: PersonaDelivery, base: number): PersonaDelivery {
  const ratio = base / delivery.base;
  const [lo, hi] = delivery.band;
  return { ...delivery, base, band: [round2(lo * ratio), round2(hi * ratio)] };
}

/**
 * The persona layer under the Director's pace: a teammate's manifest delivery
 * when TEAM_VOICES is on (Ferni has none), moved to <PERSONA>_VOICE_SPEED
 * when that is set.
 */
export function personaLayer(
  personaId: string | undefined,
  env: Env = process.env
): PersonaDelivery | undefined {
  const own = personaId !== 'ferni' && teamVoicesOn(env) ? personaDelivery(personaId) : undefined;
  const base = restingSpeed(personaId, env);
  if (base === undefined || !personaId) return own;
  return own ? atRest(own, base) : deliveryFromManifest(personaId, { default_speed: base });
}

/**
 * The opening-tag renderer for this reply: with the emotion lever live and
 * <PERSONA>_VOICE_EMOTION set, a resting pick is rendered as that resting
 * tone; otherwise `render` itself. With EMOTION_LIFT on (`lift`), only a
 * bright reply takes it, and the opening speed is capped (emotion-lift.ts).
 */
export function restingToneTags(
  render: (prosody: SSMLProsodyConfig) => string,
  personaId: string | undefined,
  emotionLever: DirectorMode,
  env: Env = process.env,
  lift?: {
    readonly bright: boolean;
    cap: (speed: number | undefined) => number | undefined;
    sent: (prosody: SSMLProsodyConfig) => void;
  }
): (prosody: SSMLProsodyConfig) => string {
  const resting = emotionLever === 'live' ? restingEmotion(personaId, env) : undefined;
  if (!resting && !lift) return render;
  return (prosody) => {
    const takes =
      resting !== undefined && RESTING_PICKS.has(prosody.emotion) && (!lift || lift.bright);
    const speed = lift ? lift.cap(prosody.speed) : prosody.speed;
    const sent = { ...prosody, speed, ...(takes ? { emotion: resting } : {}) };
    lift?.sent(sent);
    return render(sent);
  };
}

/** Tests: warn again. */
export function resetFerniRestingVoiceWarnings(): void {
  warned.clear();
}
