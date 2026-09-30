/**
 * How they sound today, next to how they usually sound.
 *
 * A friend who knows your voice hears "you sound tired" before you say a
 * word about it. Ferni keeps a baseline of each caller's own voice across
 * calls (services/trust-systems/voice-prosody-learning.ts); this turns a
 * sustained difference in the current call into a quiet note for the reply:
 * let it shape the tone, and name it at most once, lightly, as a question.
 *
 * Pure: averaging and wording. The live-call adapter lives with the audio
 * processor.
 *
 * @module speech/expression/voice-today
 */

/** The voice measures compared against the caller's baseline. */
export interface VoiceMeasures {
  pitchMean: number;
  pitchRange: number;
  pitchVariability: number;
  energyMean: number;
  energyRange: number;
  energyVariability: number;
  speakingRate: number;
  pauseFrequency: number;
  pauseDuration: number;
  breathiness: number;
  tension: number;
  clarity: number;
}

/** A comparison against the caller's baseline (see analyzeDeviation). */
export interface VoiceComparison {
  deviates: boolean;
  direction: 'elevated' | 'subdued' | 'normal';
  /** 0-1. */
  magnitude: number;
  /** 0-1, how well the baseline is known. */
  confidence: number;
  significantFactors: ReadonlyArray<{
    factor: keyof VoiceMeasures;
    current: number;
    baseline: number;
  }>;
}

/** Utterances to average: one sentence is a moment, a few are a state. */
export const RECENT_UTTERANCES = 5;
/** Utterances heard before comparing at all. */
export const MIN_UTTERANCES = 3;
const MIN_MAGNITUDE = 0.3;
const MIN_CONFIDENCE = 0.7;

/** Keep the last few utterances' measures (oldest first). */
export function rememberUtterance(
  recent: readonly VoiceMeasures[],
  measures: VoiceMeasures
): VoiceMeasures[] {
  return [...recent, measures].slice(-RECENT_UTTERANCES);
}

/** The average of the recent utterances, or null when there are too few. */
export function averageMeasures(recent: readonly VoiceMeasures[]): VoiceMeasures | null {
  if (recent.length < MIN_UTTERANCES) return null;
  const keys = Object.keys(recent[0]) as Array<keyof VoiceMeasures>;
  const avg = {} as VoiceMeasures;
  for (const k of keys) avg[k] = recent.reduce((sum, m) => sum + m[k], 0) / recent.length;
  return avg;
}

/** Plain words for how a measure moved; unlisted measures are not worth saying. */
const WORDS: Partial<Record<keyof VoiceMeasures, { up: string; down: string }>> = {
  energyMean: { up: 'louder', down: 'quieter' },
  speakingRate: { up: 'faster', down: 'slower' },
  pitchRange: { up: 'more animated', down: 'flatter' },
  pitchMean: { up: 'higher', down: 'lower' },
  tension: { up: 'tenser', down: 'more relaxed' },
};

function describe(comparison: VoiceComparison): string[] {
  const words: string[] = [];
  for (const f of comparison.significantFactors) {
    const w = WORDS[f.factor];
    if (w) words.push(f.current > f.baseline ? w.up : w.down);
  }
  return [...new Set(words)].slice(0, 3);
}

const join = (words: string[]): string =>
  words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;

/**
 * The note for the reply, or null when they sound like themselves (or their
 * usual voice is not known well enough to say).
 */
export function voiceTodayCue(comparison: VoiceComparison | null): string | null {
  if (!comparison?.deviates || comparison.direction === 'normal') return null;
  if (comparison.magnitude < MIN_MAGNITUDE || comparison.confidence < MIN_CONFIDENCE) return null;
  const words = describe(comparison);
  if (words.length === 0) return null;

  const how = `their voice is ${join(words)} than it usually is with you`;
  const shape =
    comparison.direction === 'subdued'
      ? 'Let it soften you: slower, gentler, fewer questions. If it fits, you may notice it once, lightly and as a question ("you sound a little tired today?"), never as a diagnosis.'
      : 'It could be excitement or stress: meet their energy and let what they say tell you which. If it fits, you may notice it once, lightly.';
  return [
    '[HOW THEY SOUND TODAY]',
    `Compared with other calls, ${how}.`,
    `${shape} If they say they are fine, believe them.`,
  ].join('\n');
}
