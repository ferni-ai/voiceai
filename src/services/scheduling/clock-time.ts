/**
 * The clock time named in a phrase ("noon", "8am", "8:30 pm", "at 8"), for
 * the natural-language time parser.
 *
 * @module services/scheduling/clock-time
 */

/** An explicit clock time as [hour, minute]: "noon", "8am", "8:30 pm", "20:00", "at 8". */
export function clockTime(lower: string): [number, number] | null {
  if (/\bnoon\b/.test(lower)) return [12, 0];
  if (/\bmidnight\b/.test(lower)) return [0, 0];
  const m =
    lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\b|p\.?m\b)/) ??
    lower.match(/\b(\d{1,2}):(\d{2})\b/) ??
    lower.match(/\bat\s+(\d{1,2})\b(?!\s*(?:st|nd|rd|th)\b)/);
  if (!m) return null;
  let hour = parseInt(m[1]);
  if (m[3]?.startsWith('p') && hour < 12) hour += 12;
  if (m[3]?.startsWith('a') && hour === 12) hour = 0;
  // "tomorrow evening at 8" is 8 pm
  if (!m[3] && hour < 12 && /\b(afternoon|evening|tonight|night)\b/.test(lower)) hour += 12;
  return [hour, parseInt(m[2] || '0')];
}
