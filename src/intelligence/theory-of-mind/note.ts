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
import type { MindStore } from './store.js';
import type { MindModel, Pattern } from './types.js';
import { isEstablished } from './update.js';

const log = createLogger({ module: 'TheoryOfMind' });

export const MIND_NOTE_HEADER = '[HOW THEY ARE]';
/** ~100 tokens at ~4 chars a token. */
export const MAX_NOTE_CHARS = 400;
const MIN_CONFIDENCE = 0.4;
const STALE_MS = 180 * 86_400_000;
const MAX_PATTERNS = 3;
const CLOSING =
  'Hunches from earlier calls, for you only: let them shape your reply; never name them.';

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

/** A topic the caller asked Ferni to forget (memory/recall/forget.ts), as the session layer reads it. */
export type IsForgotten = (text: string) => boolean;
const nothingForgotten: IsForgotten = () => false;

/** The told topics Ferni may build on: not forgotten, and not one they want gone around. */
function toldToBuildOn(model: MindModel, forgotten: IsForgotten): string[] {
  const tender = (topic: string): boolean =>
    model.sensitivities.some(
      (s) =>
        topic.toLowerCase().includes(s.topic.toLowerCase()) ||
        [...words(s.topic)].some((w) => words(topic).has(w))
    );
  return model.toldFerni.map((t) => t.topic).filter((topic) => !forgotten(topic) && !tender(topic));
}

/** The call-start note, and the told topics it covers. Null when there is nothing to say. */
export function renderMindNote(
  model: MindModel,
  now: Date,
  forgotten: IsForgotten = nothingForgotten
): { note: string; told: string[] } | null {
  const lines: string[] = [];
  const fits = (line: string) =>
    [MIND_NOTE_HEADER, ...lines, line, CLOSING].join('\n').length <= MAX_NOTE_CHARS;
  // Most important first, so a tight budget drops the least. What they asked to
  // go gently around leads, so Ferni never raises it himself.
  const gentle = model.sensitivities
    .filter((s) => !forgotten(s.topic))
    .map((s) => `${s.topic} (${s.how})`)
    .join('; ');
  const gentleLine = `Go gently around ${gentle}; don't bring it up yourself.`;
  if (gentle && fits(gentleLine)) lines.push(gentleLine);
  const patterns = patternsToRespect(model, now)
    .map((p) => p.statement)
    .filter((statement) => !forgotten(statement));
  while (patterns.length > 0) {
    const line = `What you've noticed about them: ${patterns.join('; ')}.`;
    if (fits(line)) {
      lines.push(line);
      break;
    }
    patterns.pop();
  }
  const told = toldToBuildOn(model, forgotten);
  while (told.length > 0) {
    const line = `They've already told you about ${told.join('; ')}; pick up from there, don't ask as if new.`;
    if (fits(line)) {
      lines.push(line);
      break;
    }
    told.pop();
  }
  const mood = model.current && model.current.until > now.toISOString() ? model.current : null;
  const moodLine = mood && `Last time they seemed ${mood.state}; see how that is now.`;
  if (moodLine && !forgotten(mood.state) && fits(moodLine)) lines.push(moodLine);
  if (lines.length === 0) return null;
  return { note: [MIND_NOTE_HEADER, ...lines, CLOSING].join('\n'), told };
}

const STOP = new Set([
  ...['about', 'their', 'there', 'they', 'with', 'from', 'that', 'this', 'have', 'just', 'really'],
  // Everyday words that would tie a passing remark to an old topic ("anyway, Monday...").
  ...['today', 'tomorrow', 'yesterday', 'week', 'weekend', 'month', 'year', 'time', 'morning'],
  ...['night', 'work', 'home', 'thing', 'things', 'stuff', 'good', 'going', 'gonna', 'like'],
  ...['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
]);
const words = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9']+/)
      .filter((w) => w.length >= 4 && !STOP.has(w))
  );

export interface MindNoteDeps {
  userId: string;
  /** Where the model lives; mind-note-hook.ts hands in the Firestore adapter. */
  store: MindStore;
  /**
   * What the caller asked Ferni to forget, loaded with the model. Null when it
   * can't be read: then there is no note at all, since one could name a
   * forgotten topic. Absent: nothing is forgotten (tests, local runs).
   */
  forgotten?: () => Promise<IsForgotten | null>;
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
  let forgotten: IsForgotten = nothingForgotten;
  let started = false;
  let remindedThisTurn = false;
  const covered = new Set<string>();
  const ready = Promise.all([deps.store.load(deps.userId), deps.forgotten?.() ?? nothingForgotten])
    .then(([m, isForgotten]) => {
      if (!isForgotten) {
        log.warn('Mind note skipped: forgotten topics unreadable');
        return;
      }
      forgotten = isForgotten;
      model = m;
    })
    .catch((error: unknown) => log.warn({ error: String(error) }, 'Mind model not loaded'));

  return {
    ready,
    noteFor(transcript) {
      if (!model || !transcript.trim()) return null;
      if (!started) {
        started = true;
        const rendered = renderMindNote(model, now(), forgotten);
        if (!rendered) return null;
        for (const t of rendered.told) covered.add(t);
        log.info({ chars: rendered.note.length }, 'Mind note added');
        return rendered.note;
      }
      if (remindedThisTurn) return null;
      const said = words(transcript);
      const topic = toldToBuildOn(model, forgotten).find(
        (t) => !covered.has(t) && [...words(t)].some((w) => said.has(w))
      );
      if (!topic) return null;
      covered.add(topic);
      remindedThisTurn = true;
      return `${MIND_NOTE_HEADER} They told you about ${topic} on an earlier call. Pick up from there; don't ask as if it's new.`;
    },
    newTurn() {
      remindedThisTurn = false;
    },
  };
}
