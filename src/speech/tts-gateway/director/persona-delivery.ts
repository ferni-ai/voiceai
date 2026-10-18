/**
 * Per-persona delivery (TEAM_VOICES=on, off by default): each teammate's
 * resting pace, pace band, loudness and tone set, read from its manifest.
 *
 * Without it every persona spoke through Ferni's delivery: one six-emotion
 * set and one pace band around 1.0. Nayan's manifest and prompt ask for
 * ~0.85, yet on dev 2026-10-04..12 his replies averaged 0.998, and every
 * teammate averaged 0.991-0.998 (voiceai-evidence/reports/
 * sonic-capabilities-audit-2026-10-12.md section 4).
 *
 * This module only reads the manifest and picks the persona's tone. It sets
 * no speed or volume: attune.ts owns both (layerDelivery). The persona is its
 * first layer, the resting point: the Director (and VOICE_ATTUNE, when on)
 * still decides a pace RELATIVE to a resting 1.0, smoothed across turns in
 * that relative space, and attune places it on the persona's scale, `base x
 * relative`, inside the persona's band. So a heavy reply slows Nayan from
 * 0.85, not from Ferni's 1.0.
 *
 * Ferni is the reference the Director was tuned on (its six stable emotions
 * were measured on Ferni's voice), so Ferni gets no profile and is unchanged
 * (FERNI_VOICE_SPEED / FERNI_VOICE_EMOTION aside: ferni-resting-voice.ts).
 *
 * Manifest fields (voice section): default_speed (or legacy settings.speed),
 * speed_band [min, max], default_volume, emotion_range, default_emotion.
 * Emotion names that are not Sonic values are mapped to the nearest one
 * (sonic-emotions.ts), then to the Director's stable set; names with neither
 * are dropped and logged.
 *
 * @module speech/tts-gateway/director/persona-delivery
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { flagOn, type Env } from '../../../config/env-flag.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { toSonicEmotion } from '../../sonic-emotions.js';
import {
  fitsWords,
  toStableEmotion,
  type EmotionDecision,
  type StableEmotion,
  type Valence,
} from './emotion.js';

const log = createLogger({ module: 'PersonaDelivery' });

/** Cartesia's accepted ranges (providers/cartesia.ts prosodyTags). */
const SPEED_LIMITS = [0.6, 1.5] as const;
const VOLUME_LIMITS = [0.5, 2] as const;
/** Band around the base when a manifest names none: the Director's own spread. */
const DEFAULT_SPREAD = [0.1, 0.08] as const;

export interface PersonaDelivery {
  personaId: string;
  /** Resting pace; 1 is Ferni's. */
  base: number;
  /** The pace never leaves this band. */
  band: readonly [number, number];
  /** Resting loudness, 1 = unchanged. */
  volume: number;
  /** The Director's stable emotions this persona uses; undefined = no limit. */
  emotions?: ReadonlySet<StableEmotion>;
  /** Tone when the Director chose none (personaEmotion). */
  defaultEmotion?: StableEmotion;
  /** Manifest emotion names with no Sonic equivalent. */
  dropped: readonly string[];
}

export function teamVoicesOn(env: Env = process.env): boolean {
  return flagOn('TEAM_VOICES', env);
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const clamp = (n: number, [lo, hi]: readonly [number, number]): number =>
  Math.min(hi, Math.max(lo, n));
const round2 = (n: number): number => Math.round(n * 100) / 100;

function readBand(raw: unknown, base: number): readonly [number, number] {
  if (Array.isArray(raw) && raw.length === 2) {
    const [lo, hi] = raw.map(num);
    if (lo !== undefined && hi !== undefined && lo <= base && base <= hi) {
      return [clamp(lo, SPEED_LIMITS), clamp(hi, SPEED_LIMITS)];
    }
  }
  return [
    round2(clamp(base - DEFAULT_SPREAD[0], SPEED_LIMITS)),
    round2(clamp(base + DEFAULT_SPREAD[1], SPEED_LIMITS)),
  ];
}

/** A manifest emotion name as one of the Director's stable emotions, if it has one. */
function stableOf(name: unknown): StableEmotion | undefined {
  if (typeof name !== 'string') return undefined;
  const sonic = toSonicEmotion(name);
  return sonic ? toStableEmotion(sonic) : undefined;
}

/** Pure: a persona's delivery from its manifest's voice section. */
export function deliveryFromManifest(personaId: string, voice: unknown): PersonaDelivery {
  const v = (voice ?? {}) as Record<string, unknown>;
  const settings = (v.settings ?? {}) as Record<string, unknown>;
  const base = round2(clamp(num(v.default_speed) ?? num(settings.speed) ?? 1, SPEED_LIMITS));
  const dropped: string[] = [];
  const emotions = new Set<StableEmotion>();
  const range = Array.isArray(v.emotion_range) ? v.emotion_range : [];
  for (const name of range) {
    const stable = stableOf(name);
    if (stable) emotions.add(stable);
    else dropped.push(String(name));
  }
  const defaultEmotion = stableOf(v.default_emotion);
  if (defaultEmotion) emotions.add(defaultEmotion);
  return {
    personaId,
    base,
    band: readBand(v.speed_band, base),
    volume: round2(clamp(num(v.default_volume) ?? 1, VOLUME_LIMITS)),
    emotions: emotions.size > 0 ? emotions : undefined,
    defaultEmotion,
    dropped,
  };
}

/**
 * The persona's tone: the Director's pick when the persona uses it, else the
 * persona's default or first emotion that fits the words, else none (the
 * voice then takes its tone from the words). Applied after the Director has
 * decided pace and loudness from its own pick (engine.ts), so it colours the
 * tag only and never moves speed or volume.
 */
export function personaEmotion(
  delivery: PersonaDelivery,
  chosen: StableEmotion | undefined,
  valence: Valence
): StableEmotion | undefined {
  const allowed = delivery.emotions;
  const own = delivery.defaultEmotion;
  // Nothing chosen: the persona's own default, if the words can carry it.
  if (!chosen) return own && fitsWords(own, valence) ? own : undefined;
  if (!allowed || allowed.has(chosen)) return chosen;
  const preferred = delivery.defaultEmotion ? [delivery.defaultEmotion, ...allowed] : [...allowed];
  return preferred.find((e) => fitsWords(e, valence));
}

/** The Director's tone decision, as the persona would make it (source 'persona' when changed). */
export function personaTone(
  delivery: PersonaDelivery | undefined,
  decision: EmotionDecision,
  valence: Valence
): EmotionDecision {
  if (!delivery) return decision;
  const emotion = personaEmotion(delivery, decision.emotion, valence);
  return emotion === decision.emotion
    ? decision
    : { emotion, source: emotion ? 'persona' : 'none' };
}

const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;
const cache = new Map<string, PersonaDelivery | undefined>();

function readManifestVoice(personaId: string): unknown {
  for (const root of ['src/personas/bundles', 'dist/personas/bundles']) {
    const path = join(process.cwd(), root, personaId, 'persona.manifest.json');
    if (existsSync(path)) {
      return (JSON.parse(readFileSync(path, 'utf8')) as { voice?: unknown }).voice;
    }
  }
  return undefined;
}

/**
 * The delivery for a persona (canonical bundle id), cached; undefined for
 * Ferni (the reference), an unknown persona, or an unreadable manifest.
 */
export function personaDelivery(personaId: string | undefined): PersonaDelivery | undefined {
  if (!personaId || personaId === 'ferni' || !SAFE_ID.test(personaId)) return undefined;
  if (cache.has(personaId)) return cache.get(personaId);
  let delivery: PersonaDelivery | undefined;
  try {
    const voice = readManifestVoice(personaId);
    delivery = voice ? deliveryFromManifest(personaId, voice) : undefined;
    if (delivery) {
      log.info(
        {
          personaId,
          base: delivery.base,
          band: delivery.band,
          volume: delivery.volume,
          emotions: delivery.emotions ? [...delivery.emotions] : 'any',
          defaultEmotion: delivery.defaultEmotion,
          dropped: delivery.dropped,
        },
        'Persona delivery loaded'
      );
    }
  } catch (error) {
    log.warn(
      { personaId, error: String(error) },
      'Persona delivery unreadable; using Ferni delivery'
    );
  }
  cache.set(personaId, delivery);
  return delivery;
}

/** Tests: forget cached profiles. */
export function resetPersonaDeliveryCache(): void {
  cache.clear();
}
