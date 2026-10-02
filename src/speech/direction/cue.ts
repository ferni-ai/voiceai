/**
 * Cues: stage directions for moments the agent speaks without the main LLM.
 *
 * Greetings, check-ins, "one moment" while a tool runs, recovery after a
 * failure: these used to be fixed strings ("Done!", "One moment.") that
 * sounded canned and repeated. A cue says what the moment is and what must
 * happen; the director has the character write the words for this
 * conversation, and the fixed string stays as the understudy.
 *
 * @module speech/direction/cue
 */

export type CueUrgency = 'now' | 'soon';

export interface Cue {
  /** Short name for the moment, used in logs and metrics ("greeting", "idle_checkin"). */
  moment: string;
  /** The stage direction: the beat, the intent, any limits. */
  direction: string;
  /** Facts the line may use; the actor must not invent others. */
  facts?: Record<string, string>;
  /** Words that must appear in the line (e.g. a track name). */
  mustInclude?: string[];
  /** The line spoken if the actor is late or its line is unusable. */
  fallback: string;
  /** 'now' for mid-conversation beats, 'soon' for moments with slack (greeting, idle check-in). */
  urgency: CueUrgency;
  /** Longest acceptable line, in characters. */
  maxChars?: number;
}

/** How long the actor may take before the understudy speaks. */
export const CUE_BUDGET_MS: Record<CueUrgency, number> = { now: 1200, soon: 2500 };

const DEFAULT_MAX_CHARS = 220;

/** Markup, stage directions and assistant-speak that must never be spoken. */
const UNSPEAKABLE = /[[\]<>*_#{}]|\bas an ai\b|\blanguage model\b/i;

/**
 * Clean the actor's line and decide whether it can be spoken.
 *
 * @returns the line to speak, or null to fall back to the understudy
 */
export function acceptLine(
  raw: string | undefined,
  cue: Cue,
  recentLines: string[] = []
): string | null {
  if (!raw) return null;
  const line = raw
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/^\w+:\s*/, (m) => (/^(ferni|agent|assistant)\s*:/i.test(m) ? '' : m))
    .replace(/\s+/g, ' ')
    .trim();

  if (!line) return null;
  if (line.length > (cue.maxChars ?? DEFAULT_MAX_CHARS)) return null;
  if (UNSPEAKABLE.test(line)) return null;
  for (const term of cue.mustInclude ?? []) {
    if (!line.toLowerCase().includes(term.toLowerCase())) return null;
  }
  const normalized = line.toLowerCase();
  if (recentLines.some((r) => r.trim().toLowerCase() === normalized)) return null;
  return line;
}
