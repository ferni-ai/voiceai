/**
 * Ferni's resting voice from env: FERNI_VOICE_EMOTION and FERNI_VOICE_SPEED,
 * both unset by default. On 2026-10-17 Seth kept the calm B voice but picked
 * a "lively" delivery by ear: excited at 1.08.
 *
 * Ferni's manifest default_emotion and default_speed never reach the TTS
 * request: Ferni gets no persona delivery (persona-delivery.ts), so he rests
 * at the Director's 1.0 with its six stable tones. These two variables move
 * that rest. With both unset every request is exactly as before.
 *
 * - FERNI_VOICE_SPEED (clamped to 0.85-1.2): his resting pace, layered under
 *   the Director's own pace the way a teammate's manifest base is
 *   (attune.ts layerDelivery). Sent only while the pacing lever is live.
 * - FERNI_VOICE_EMOTION (a Sonic 3 emotion): his resting tone, on the
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

/** The Director's resting picks: the only tones FERNI_VOICE_EMOTION replaces. */
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
  log.warn({ name, value, using }, 'Ferni voice override not usable as given');
}

/** FERNI_VOICE_EMOTION as a Sonic 3 emotion, or undefined (unset or not one Sonic 3 accepts). */
export function ferniRestingEmotion(env: Env = process.env): string | undefined {
  const raw = env.FERNI_VOICE_EMOTION?.trim();
  if (!raw) return undefined;
  const name = raw.toLowerCase();
  if (SONIC3_EMOTIONS.has(name)) return name;
  warnOnce('FERNI_VOICE_EMOTION', raw, "the Director's tones");
  return undefined;
}

/** FERNI_VOICE_SPEED inside 0.85-1.2, or undefined (unset or not a number). */
export function ferniRestingSpeed(env: Env = process.env): number | undefined {
  const raw = env.FERNI_VOICE_SPEED?.trim();
  if (!raw) return undefined;
  const speed = Number(raw);
  if (!Number.isFinite(speed)) {
    warnOnce('FERNI_VOICE_SPEED', raw, 'resting pace 1');
    return undefined;
  }
  const [lo, hi] = FERNI_SPEED_LIMITS;
  const clamped = Math.round(Math.min(hi, Math.max(lo, speed)) * 100) / 100;
  if (clamped !== speed) warnOnce('FERNI_VOICE_SPEED', raw, String(clamped));
  return clamped;
}

/**
 * The persona layer under the Director's pace: Ferni's from FERNI_VOICE_SPEED
 * (none when unset), a teammate's from its manifest when TEAM_VOICES is on.
 */
export function personaLayer(
  personaId: string | undefined,
  env: Env = process.env
): PersonaDelivery | undefined {
  if (personaId === 'ferni') {
    const base = ferniRestingSpeed(env);
    return base === undefined ? undefined : deliveryFromManifest('ferni', { default_speed: base });
  }
  return teamVoicesOn(env) ? personaDelivery(personaId) : undefined;
}

/**
 * The opening-tag renderer for this reply: for Ferni with the emotion lever
 * live and FERNI_VOICE_EMOTION set, a resting pick is rendered as his resting
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
  if (personaId !== 'ferni') return render;
  const resting = emotionLever === 'live' ? ferniRestingEmotion(env) : undefined;
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
