/**
 * What a music memory keeps as evidence that the music helped: labels only, never text.
 *
 * Until 2026-10-25 each memory also kept `userResponse`, the caller's own words after the music
 * (bogle_users/{uid}/music_learning/memories). The words now only decide "helped" when the memory
 * is made (detectMusicHelped); every load and save keeps these labels and drops any other field.
 *
 * @module audio/music-memory-evidence
 */

export interface MusicEvidence {
  /** Detected emotional shift */
  emotionalShift?: 'positive' | 'neutral' | 'negative';
  /** Did they continue the session happily? */
  continuedSession: boolean;
  /** Did they explicitly thank or praise the music? */
  explicitPositive: boolean;
  /** Voice tone analysis */
  voiceTone?: 'warmer' | 'calmer' | 'energized' | 'neutral';
}

const VOICE_TONES = new Set(['warmer', 'calmer', 'energized', 'neutral']);
const SHIFTS = new Set(['positive', 'neutral', 'negative']);

/** The labels a memory keeps, from whatever a stored doc holds (old docs held the words). */
export function cleanMusicEvidence(raw: unknown): MusicEvidence {
  const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    emotionalShift: SHIFTS.has(e.emotionalShift as string)
      ? (e.emotionalShift as MusicEvidence['emotionalShift'])
      : undefined,
    continuedSession: e.continuedSession !== false,
    explicitPositive: e.explicitPositive === true,
    voiceTone: VOICE_TONES.has(e.voiceTone as string)
      ? (e.voiceTone as MusicEvidence['voiceTone'])
      : undefined,
  };
}

/** A stored memory's evidence holds more than the labels (the caller's words, in old docs). */
export function hasExtraEvidence(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const clean = cleanMusicEvidence(raw) as unknown as Record<string, unknown>;
  return Object.entries(raw).some(([k, v]) => v !== undefined && clean[k] !== v);
}
