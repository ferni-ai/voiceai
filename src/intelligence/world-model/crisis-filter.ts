/**
 * Exclude crisis content from the world-model snapshot.
 *
 * Crisis routing stays on its own high-priority builder. The snapshot
 * must not copy crisis episode text, self-harm markers, or similar.
 * Never log the matched text.
 *
 * @module intelligence/world-model/crisis-filter
 */

const CRISIS_MARKERS = [
  'suicid',
  'self-harm',
  'self harm',
  'kill myself',
  'killing myself',
  'end my life',
  'want to die',
  'crisis episode',
  'crisis line',
  'overdose',
];

export function isCrisisText(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) {
    return false;
  }
  const lower = value.toLowerCase();
  return CRISIS_MARKERS.some((marker) => lower.includes(marker));
}

export function excludeCrisisText<T>(items: T[], getText: (item: T) => string): T[] {
  return items.filter((item) => !isCrisisText(getText(item)));
}
