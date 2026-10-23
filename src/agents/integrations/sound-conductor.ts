/**
 * One per-call conductor every non-speech clip asks before it plays
 * (SOUND_CONDUCTOR=off|shadow|on, off by default).
 *
 * Each sound decided on its own until now, so they piled up: on 60 real prod
 * calls 25% of all sounds sat within 1.5 s of another (backchannel then
 * opener 36 times, 13 of them the same sound; opener then laugh 36), and 30%
 * of backchannels repeated a clip heard inside 60 s (sounds-audit-2026-10-22,
 * LIVE.md). The conductor keeps the call's played sounds and answers each
 * request with one of:
 *
 * - turn_edge: a sound played under TURN_EDGE_MS ago (one sound per turn edge);
 * - same_sound: an opener (or slow-turn "Mm") right after a backchannel of the
 *   same sound, e.g. "Mm-hmm" then "Mm";
 * - repeat: this exact clip played under NO_REPEAT_MS ago. Keyed on the clip
 *   text, so rotating takes ("Mm.", "Mmm.") pass;
 * - budget: this kind already used its SOUND_BUDGET_PER_MIN in the last minute.
 *
 * The heavy-moment veto stays in each sound's own gate (presence-heavy.ts,
 * #2413); the conductor only spaces sounds out.
 *
 * Modes: off never builds a conductor (each sound path calls play() as
 * before); shadow logs SOUND_DECISION for every attempt and plays regardless;
 * on skips a blocked sound. Both remember only sounds the conductor allowed,
 * so shadow's blocks are the ones on would make.
 *
 * @module agents/integrations/sound-conductor
 */

import { flagModeOf, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SoundConductor' });

export type ConductedSound =
  'backchannel' | 'opener' | 'laugh' | 'presence' | 'tool_hum' | 'slow_turn';

export type SoundConductorMode = 'off' | 'shadow' | 'on';

export function soundConductorMode(env: Env = process.env): SoundConductorMode {
  return flagModeOf('SOUND_CONDUCTOR', env);
}

/** One sound per turn edge: LIVE.md's stack window, inside which 25% of sounds piled up. */
export const TURN_EDGE_MS = 1_500;
/** Same clip text again: 30% of prod backchannels repeated inside 60 s (LIVE.md section 6). */
export const NO_REPEAT_MS = 60_000;
/**
 * Backchannel then an opener of the same sound: a backchannel ~0.22 s into the
 * caller's last pause, up to ~2 s of end-of-turn wait, the opener ~0.12 s after
 * commit. Earlier than that, the caller spoke between them.
 */
export const SAME_SOUND_MS = 2_500;

/** Per kind, per rolling minute. */
export const SOUND_BUDGET_PER_MIN: Readonly<Record<ConductedSound, number>> = {
  // Prod real 1.7/min, busiest room type 2.5/min: caps only bursts like the call with 72 in 25 min.
  backchannel: 4,
  // One per reply; prod real 1.2/min, 1.5 on outbound rooms. Three replies a minute is a fast exchange.
  opener: 3,
  // Prod real 0.54/min after FERNI_PLAYFUL with one call at 37; LAUGH_CAP allows 4 a call anyway.
  laugh: 1,
  // Hum/whistle/yawn are once a call already (0 repeats in LIVE.md); this is a backstop.
  presence: 1,
  // TOOL_HUM_MAX_PER_CALL is 2, never two tool runs in a row; prod logged 3 in 17 days.
  tool_hum: 1,
  // At most one per slow turn; two a minute is already every other reply.
  slow_turn: 2,
};

export type SoundReason = 'ok' | 'turn_edge' | 'same_sound' | 'repeat' | 'budget';

export interface SoundRequest {
  kind: ConductedSound;
  /** The clip's own text or label (never caller words). */
  clip: string;
  /** Wall clock, ms. */
  at: number;
}

export interface SoundDecision {
  allow: boolean;
  reason: SoundReason;
  /** Since the last sound the conductor allowed and that played; null before the first. */
  sinceLastMs: number | null;
}

/** "Mm", "Mm-hmm", "Mhm", "Hmm" are one sound; "Yeah", "Yeh" another. */
export function soundFamily(clip: string): string {
  const letters = clip
    .replace(/<[^>]*>/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  if (/^h?m+(?:h+m+)*$/.test(letters)) return 'mm';
  if (/^ye+a*h+$/.test(letters)) return 'yeah';
  return letters;
}

/** A live reaction clip's kind: a laugh clip or take, else a backchannel. */
export function liveSoundKind(clip: string): ConductedSound {
  return clip.includes('[laughter]') || /^\s*ha\b/i.test(clip) ? 'laugh' : 'backchannel';
}

export interface SoundConductor {
  request: (req: SoundRequest) => SoundDecision;
  /** A sound the conductor allowed has started. */
  played: (req: SoundRequest) => void;
}

export function createSoundConductor(): SoundConductor {
  /** Sounds played in the last NO_REPEAT_MS (the longest window), oldest first. */
  let heard: SoundRequest[] = [];
  return {
    request(req: SoundRequest): SoundDecision {
      heard = heard.filter((s) => req.at - s.at < NO_REPEAT_MS);
      const last = heard.at(-1);
      const sinceLastMs = last ? req.at - last.at : null;
      const decide = (reason: SoundReason): SoundDecision => ({
        allow: reason === 'ok',
        reason,
        sinceLastMs,
      });
      if (sinceLastMs !== null && sinceLastMs < TURN_EDGE_MS) return decide('turn_edge');
      if (
        last?.kind === 'backchannel' &&
        (req.kind === 'opener' || req.kind === 'slow_turn') &&
        sinceLastMs !== null &&
        sinceLastMs < SAME_SOUND_MS &&
        soundFamily(last.clip) === soundFamily(req.clip)
      )
        return decide('same_sound');
      if (heard.some((s) => s.clip === req.clip)) return decide('repeat');
      const used = heard.filter((s) => s.kind === req.kind).length;
      return decide(used >= SOUND_BUDGET_PER_MIN[req.kind] ? 'budget' : 'ok');
    },
    played(req: SoundRequest): void {
      heard.push(req);
    },
  };
}

/** Run one sound's `play` through the conductor; true when it played. */
export type SoundGate = (kind: ConductedSound, clip: string, play: () => boolean) => boolean;

export interface SoundGateDeps {
  conductor?: () => SoundConductor;
  log?: (fields: Record<string, unknown>, msg: string) => void;
  now?: () => number;
}

/** The call's gate for `mode`. Off: play() as is, no conductor built. */
export function createSoundGate(mode: SoundConductorMode, deps: SoundGateDeps = {}): SoundGate {
  if (mode === 'off') return (_kind, _clip, play) => play();
  const conductor = (deps.conductor ?? createSoundConductor)();
  const write = deps.log ?? ((fields, msg) => log.info(fields, msg));
  const now = deps.now ?? Date.now;
  return (kind, clip, play) => {
    const req = { kind, clip, at: now() };
    const d = conductor.request(req);
    const played = (mode === 'shadow' || d.allow) && play();
    if (played && d.allow) conductor.played(req);
    write(
      { kind, clip, allow: d.allow, reason: d.reason, sinceLastMs: d.sinceLastMs, played, mode },
      'SOUND_DECISION'
    );
    return played;
  };
}
