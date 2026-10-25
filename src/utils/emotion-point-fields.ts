/**
 * Typed, bounded fields for a stored emotion point, shared by every store that
 * keeps one (emotional_history, emotional_data/{uid}/points). Each check returns
 * null for anything that isn't exactly the expected kind of value, so a caller
 * can never store a sentence under a field meant for a label or a score.
 */

/**
 * The labels the voice, text and check-in writers use (emotional-state.ts's
 * primary and granular emotions, the prosody labels, the arc valence map).
 */
export const EMOTION_LABELS: ReadonlySet<string> = new Set([
  ...['joy', 'sadness', 'anger', 'fear', 'surprise', 'disgust', 'trust', 'anticipation'],
  ...['neutral', 'ecstatic', 'happy', 'content', 'hopeful', 'relieved', 'proud', 'grateful'],
  ...['devastated', 'sad', 'melancholy', 'disappointed', 'lonely', 'grief', 'furious'],
  ...['angry', 'frustrated', 'irritated', 'resentful', 'terrified', 'anxious', 'worried'],
  ...['nervous', 'overwhelmed', 'vulnerable', 'shocked', 'amazed', 'confused', 'calm'],
  ...['exhausted', 'bored', 'curious', 'nostalgic', 'ambivalent', 'stressed', 'excited'],
  ...['excitement', 'agitated', 'tired', 'confident', 'fearful', 'guilty', 'isolated'],
  ...['disconnected', 'peaceful', 'relaxed', 'hurt', 'ashamed', 'embarrassed', 'scared'],
  ...['upset', 'annoyed', 'hopeless', 'numb', 'restless', 'energized', 'motivated'],
  ...['playful', 'loved', 'jealous'],
]);

const EARLIEST = Date.parse('2020-01-01T00:00:00Z');
const FUTURE_SLACK_MS = 24 * 3_600_000;

/** A label from the list, lower-cased; null for anything else. */
export function emotionLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const label = raw.trim().toLowerCase();
  return EMOTION_LABELS.has(label) ? label : null;
}

/** A finite number in [lo, hi]; null for anything else (strings included). */
export function boundedNumber(raw: unknown, lo: number, hi: number): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= lo && raw <= hi ? raw : null;
}

/** An ISO time between 2020 and a day from now; null for anything else. */
export function validTimestamp(raw: unknown, now = Date.now()): string | null {
  const ms =
    raw instanceof Date ? raw.getTime() : typeof raw === 'string' ? Date.parse(raw) : NaN;
  if (!Number.isFinite(ms) || ms < EARLIEST || ms > now + FUTURE_SLACK_MS) return null;
  return new Date(ms).toISOString();
}

/** The value of an own property, never one inherited (a `__proto__` key included). */
export function ownField(raw: object, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(raw, key)
    ? (raw as Record<string, unknown>)[key]
    : undefined;
}

/** True when `raw` holds exactly `kept`'s keys with the same values. */
export function sameFields(raw: object, kept: Record<string, unknown>): boolean {
  const keys = Object.keys(kept);
  return (
    Object.keys(raw).length === keys.length && keys.every((k) => ownField(raw, k) === kept[k])
  );
}
