/**
 * The note that tells the reply model how this person is: what not to re-ask,
 * which patterns to respect, how they like support, what to go gently
 * around. About 100 tokens, worded as hunches, and never something Ferni says
 * back to them as a label.
 *
 * The model loads when the call starts. noteFor() is synchronous and never
 * waits on the store, so it adds nothing to reply latency: until the model
 * has loaded, a turn simply goes without the note.
 *
 * @module intelligence/theory-of-mind/note
 */

import { createLogger } from '../../utils/safe-logger.js';
import { firestoreMindStore, type MindStore } from './store.js';
import type { MindModel, Pattern } from './types.js';
import { isEstablished } from './update.js';

const log = createLogger({ module: 'TheoryOfMind' });

export const MIND_NOTE_HEADER = '[HOW THEY ARE]';
/** ~100 tokens at ~4 chars a token. */
export const MAX_NOTE_CHARS = 400;
const MIN_CONFIDENCE = 0.4;
const STALE_MS = 180 * 86_400_000;
const MAX_PATTERNS = 3;
const CLOSING = 'Hunches from earlier calls: let them shape how you respond; never name them.';

/** Patterns Ferni should act on: established, confident, seen this half-year. */
export function patternsToRespect(model: MindModel, now: Date): Pattern[] {
  return model.patterns
    .filter(
      (p) =>
        isEstablished(p) &&
        p.confidence >= MIN_CONFIDENCE &&
        now.getTime() - Date.parse(p.lastSeen) < STALE_MS
    )
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_PATTERNS);
}

/** The call-start note, and the told topics it covers. Null when there is nothing to say. */
export function renderMindNote(
  model: MindModel,
  now: Date
): { note: string; told: string[] } | null {
  const lines: string[] = [];
  const fits = (line: string) =>
    [MIND_NOTE_HEADER, ...lines, line, CLOSING].join('\n').length <= MAX_NOTE_CHARS;
  // Most important first, so a tight budget drops the least.
  const gentle = model.sensitivities.map((s) => `${s.topic} (${s.how})`).join('; ');
  if (gentle && fits(`Go gently around: ${gentle}.`)) lines.push(`Go gently around: ${gentle}.`);
  const patterns = patternsToRespect(model, now).map((p) => p.statement);
  while (patterns.length > 0) {
    const line = `They tend to: ${patterns.join('; ')}.`;
    if (fits(line)) {
      lines.push(line);
      break;
    }
    patterns.pop();
  }
  const told = model.toldFerni.map((t) => t.topic);
  while (told.length > 0) {
    const line = `Already told you: ${told.join('; ')}. Build on these, don't ask as if new.`;
    if (fits(line)) {
      lines.push(line);
      break;
    }
    told.pop();
  }
  const mood = model.current && model.current.until > now.toISOString() ? model.current : null;
  if (mood && fits(`Lately: ${mood.state}.`)) lines.push(`Lately: ${mood.state}.`);
  if (lines.length === 0) return null;
  return { note: [MIND_NOTE_HEADER, ...lines, CLOSING].join('\n'), told };
}

const STOP = new Set(['about', 'their', 'there', 'they', 'with', 'from', 'that', 'this', 'have']);
const words = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9']+/)
      .filter((w) => w.length >= 4 && !STOP.has(w))
  );

export interface MindNoteDeps {
  userId: string;
  store?: MindStore;
  now?: () => Date;
}

export interface MindNote {
  /** Resolves once the model has loaded (for tests and startup logging). */
  ready: Promise<void>;
  /** The note for this transcript, or null. Synchronous: never waits on the store. */
  noteFor(transcript: string): string | null;
  /** Ferni started replying: the next transcript is a new turn. */
  newTurn(): void;
}

/**
 * The full note comes once, with the caller's first words. After that, when
 * they bring up something they told Ferni before that the note left out, one
 * line reminds Ferni it already knows it: once per topic, one a turn.
 */
export function createMindNote(deps: MindNoteDeps): MindNote {
  const now = deps.now ?? (() => new Date());
  let model: MindModel | null = null;
  let started = false;
  let remindedThisTurn = false;
  const covered = new Set<string>();
  const ready = (deps.store ?? firestoreMindStore)
    .load(deps.userId)
    .then((m) => {
      model = m;
    })
    .catch((error: unknown) => log.warn({ error: String(error) }, 'Mind model not loaded'));

  return {
    ready,
    noteFor(transcript) {
      if (!model || !transcript.trim()) return null;
      if (!started) {
        started = true;
        const rendered = renderMindNote(model, now());
        if (!rendered) return null;
        for (const t of rendered.told) covered.add(t);
        log.info({ chars: rendered.note.length }, 'Mind note added');
        return rendered.note;
      }
      if (remindedThisTurn) return null;
      const said = words(transcript);
      const topic = model.toldFerni.find(
        (t) => !covered.has(t.topic) && [...words(t.topic)].some((w) => said.has(w))
      )?.topic;
      if (!topic) return null;
      covered.add(topic);
      remindedThisTurn = true;
      return `${MIND_NOTE_HEADER} They already told you about ${topic} on an earlier call. Build on it; don't ask as if it's new.`;
    },
    newTurn() {
      remindedThisTurn = false;
    },
  };
}
