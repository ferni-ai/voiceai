/**
 * Speech beat detector: finds stressed-syllable onsets and phrase ends in the
 * agent's loudness envelope.
 *
 * Pure (no DOM, no clock): feed it one level per frame with a timestamp and it
 * says whether this frame is a beat (a sharp rise in loudness, like the stress
 * on "I *really* mean it") or the end of a phrase (the voice has gone quiet
 * long enough to be a pause, not a gap between syllables).
 *
 * Used by speech-beats.ts (ferni:speech-beats). Avatar audit item 11.
 */

/** Envelope follower: rises fast so onsets stay sharp, falls slower to ride over consonants. */
export const ENVELOPE_ATTACK = 0.6;
export const ENVELOPE_RELEASE = 0.2;
/** A beat is a rise of at least this much (0-1 level) within RISE_WINDOW_MS. */
export const RISE_THRESHOLD = 0.18;
export const RISE_WINDOW_MS = 80;
/** The envelope must also reach this level, so a rise out of near-silence into a whisper is not a beat. */
export const BEAT_FLOOR = 0.2;
/** No two beats closer than this; stressed syllables in speech come ~2-4 per second at most. */
export const BEAT_REFRACTORY_MS = 500;
/** Above this the voice counts as sounding; below SILENT_LEVEL it counts as quiet. */
export const VOICED_LEVEL = 0.08;
export const SILENT_LEVEL = 0.04;
/** Quiet this long after a phrase ends it. Gaps between words are shorter. */
export const PHRASE_GAP_MS = 300;
/** A phrase needs at least this much voicing, so a cough or click doesn't end one. */
export const MIN_PHRASE_MS = 400;

export interface BeatFrame {
  /** A stressed-syllable onset on this frame. */
  beat: boolean;
  /** 0-1, how sharp the rise was (only meaningful when `beat`). */
  strength: number;
  /** A phrase ended on this frame (fires once per phrase). */
  phraseEnd: boolean;
}

export interface BeatDetector {
  step(level: number, nowMs: number): BeatFrame;
  reset(): void;
}

interface Sample {
  t: number;
  env: number;
}

export function createBeatDetector(): BeatDetector {
  let env = 0;
  let history: Sample[] = [];
  let lastBeatAt = Number.NEGATIVE_INFINITY;
  let voicedSince: number | null = null;
  let voicedMs = 0;
  let quietSince: number | null = null;
  let lastT: number | null = null;

  function reset(): void {
    env = 0;
    history = [];
    lastBeatAt = Number.NEGATIVE_INFINITY;
    voicedSince = null;
    voicedMs = 0;
    quietSince = null;
    lastT = null;
  }

  function detectBeat(nowMs: number): { beat: boolean; strength: number } {
    history = history.filter((s) => nowMs - s.t <= RISE_WINDOW_MS);
    const floor = history.reduce((min, s) => Math.min(min, s.env), env);
    history.push({ t: nowMs, env });
    const rise = env - floor;
    if (rise < RISE_THRESHOLD || env < BEAT_FLOOR) return { beat: false, strength: 0 };
    if (nowMs - lastBeatAt < BEAT_REFRACTORY_MS) return { beat: false, strength: 0 };
    lastBeatAt = nowMs;
    return { beat: true, strength: Math.min(1, rise / (RISE_THRESHOLD * 3)) };
  }

  function detectPhraseEnd(nowMs: number): boolean {
    const dt = lastT === null ? 0 : Math.max(0, nowMs - lastT);
    if (env > VOICED_LEVEL) {
      voicedSince ??= nowMs;
      voicedMs += dt;
      quietSince = null;
      return false;
    }
    if (env >= SILENT_LEVEL || voicedSince === null) return false;
    quietSince ??= nowMs;
    if (nowMs - quietSince < PHRASE_GAP_MS) return false;
    const ended = voicedMs >= MIN_PHRASE_MS;
    voicedSince = null;
    voicedMs = 0;
    return ended;
  }

  function step(level: number, nowMs: number): BeatFrame {
    const target = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
    env += (target - env) * (target > env ? ENVELOPE_ATTACK : ENVELOPE_RELEASE);
    const { beat, strength } = detectBeat(nowMs);
    const phraseEnd = detectPhraseEnd(nowMs);
    lastT = nowMs;
    return { beat, strength, phraseEnd };
  }

  return { step, reset };
}
