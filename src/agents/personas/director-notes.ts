/**
 * The director: private notes that nudge Ferni's next reply, instead of rules.
 *
 * After Ferni finishes a reply, a fast model reads the recent conversation
 * and writes zero to two short notes for the next reply: subtext worth
 * noticing, a callback to something said earlier, the energy to match, a
 * habit to break. They are hints with reasons, never lines. The next request
 * carries them after the user's words (the channel the turn reminder showed
 * works; see turn-style.ts), and the character sheet tells Ferni to use them
 * only when they fit.
 *
 * It runs off the critical path: the notes are written while the caller is
 * talking and used on their next turn, so a slow or failed call just means no
 * note. DIRECTOR_NOTES=on enables it.
 *
 * @module agents/personas/director-notes
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'DirectorNotes' });

export function directorNotesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.DIRECTOR_NOTES === 'on';
}

export interface Line {
  speaker: 'user' | 'ferni';
  text: string;
}

/** Writes notes from a prompt; injectable so tests need no model. */
export type NoteWriter = (system: string, prompt: string) => Promise<string | undefined>;

export const DIRECTOR_SYSTEM = [
  "You are the director of a live, unscripted phone call between Ferni (warm, dry, curious; grew up in Wyoming, lived in Japan, a life coach who talks like a friend) and someone he cares about. Ferni improvises every word. Between his turns you whisper at most two private notes for his next reply.",
  "Every note must point at something that actually happened in this call, naming the words or detail: what they hinted at but didn't say, a pattern across what they've said, something from earlier worth coming back to, the energy they're bringing, or a habit of Ferni's to drop (too many questions, fixing too early, sounding upbeat, repeating himself). Give the nudge and its reason in under 20 words.",
  "Never tell him to acknowledge, validate, support or ask about feelings: that's what a therapist does and he's a friend. Never write lines for him to say.",
  'If the conversation is flowing and Ferni is doing fine, reply NONE. Reply with only the notes, one per line, no numbering, or exactly NONE.',
].join('\n');

export function buildDirectorPrompt(lines: Line[], userName?: string): string {
  const who = userName || 'Them';
  const transcript = lines
    .slice(-12)
    .map((l) => `${l.speaker === 'ferni' ? 'Ferni' : who}: ${l.text}`)
    .join('\n');
  return `The call so far:\n${transcript}\n\nYour notes for Ferni's next reply:`;
}

const GENERIC = /^(acknowledge|validate|show (support|empathy)|let (them|him|her) know|be supportive|offer (support|comfort)|empathi[sz]e)/i;
const STOP = new Set('that this they them their with what have from about your just like been were when then there some would could should into only also very really'.split(' '));

/** Words a note must share with the call to be about the call (4+ letters, not function words). */
function contentWords(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-z']{4,}/g) ?? []).filter((w) => !STOP.has(w))
  );
}

/**
 * The notes in a reply: at most two short lines; none for NONE or anything
 * unusable. With the call's lines given, a note must mention something said
 * in it: the director once reported a "weather bit" nobody had mentioned.
 */
export function parseNotes(reply: string | undefined, call?: Line[]): string[] {
  if (!reply) return [];
  const said = call ? contentWords(call.map((l) => l.text).join(' ')) : null;
  const notes = reply
    .split('\n')
    .map((l) => l.replace(/^[\s\-*\d.)]+/, '').trim())
    .filter((l) => l && !/^none\b/i.test(l))
    // A note that is a quoted line for Ferni to say is exactly what we don't want.
    .filter((l) => !/^["“'].*["”']$/.test(l))
    .filter((l) => !GENERIC.test(l))
    .filter((l) => !said || [...contentWords(l)].some((w) => said.has(w)))
    .map((l) => (l.length > 160 ? `${l.slice(0, 157)}...` : l));
  return notes.slice(0, 2);
}

const defaultWriter: NoteWriter = async (system, prompt) => {
  const { getGenerativeModel } = await import('../../config/generative-model.js');
  const model = await getGenerativeModel({
    model: process.env.DIRECTOR_MODEL || 'gemini-2.5-flash',
    systemInstruction: system,
    generationConfig: { temperature: 0.7, maxOutputTokens: 120 },
  });
  if (!model) return undefined;
  const result = await model.generateContent(prompt);
  return result.response.text();
};

export class Director {
  private notes: string[] = [];
  private generation = 0;

  constructor(
    private readonly opts: { sessionId: string; userName?: string; writer?: NoteWriter; budgetMs?: number }
  ) {}

  /** Ferni finished a reply: think about the next one. Never throws. */
  observe(lines: Line[]): Promise<void> {
    const gen = ++this.generation;
    this.notes = []; // last turn's notes are stale now
    const writer = this.opts.writer ?? defaultWriter;
    const started = Date.now();
    const work = (async () => {
      try {
        const reply = await withTimeout(
          writer(DIRECTOR_SYSTEM, buildDirectorPrompt(lines, this.opts.userName)),
          this.opts.budgetMs ?? 4000
        );
        if (gen !== this.generation) return; // a newer turn superseded this one
        if (reply === undefined) {
          // No model, or over budget: not the same as the director saying NONE.
          log.warn({ sessionId: this.opts.sessionId, ms: Date.now() - started }, 'director gave no reply');
          return;
        }
        this.notes = parseNotes(reply, lines.slice(-12));
        log.info(
          { sessionId: this.opts.sessionId, ms: Date.now() - started, notes: this.notes },
          'DIRECTOR_NOTES'
        );
      } catch (error) {
        if (gen === this.generation) this.notes = [];
        log.warn({ sessionId: this.opts.sessionId, error: String(error) }, 'director notes failed');
      }
    })();
    return work;
  }

  /**
   * The notes for the reply being generated now. llmNode can run several
   * times for one reply (preemptive, final, after tools), so reading doesn't
   * consume them; the next observe() clears them.
   */
  current(): string[] {
    return this.notes;
  }
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** The notes as the text appended to the caller's latest words for this request. */
export function formatNotes(notes: string[]): string {
  return notes.length ? `[Director: ${notes.join(' / ')}]` : '';
}

// Keyed by the AgentSession object, like the turn tool retrieval.
const directors = new WeakMap<object, Director>();

export function setDirector(session: object, d: Director | null): void {
  if (d) directors.set(session, d);
  else directors.delete(session);
}

export function getDirector(session: object | undefined): Director | undefined {
  return session ? directors.get(session) : undefined;
}

/** The spoken conversation in a chat context: user and assistant messages, markup removed. */
export function linesFromChat(
  items: ReadonlyArray<{ type?: string; role?: string; textContent?: string }>
): Line[] {
  const lines: Line[] = [];
  for (const item of items) {
    if (item.type !== 'message' || (item.role !== 'user' && item.role !== 'assistant')) continue;
    const text = (item.textContent ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) lines.push({ speaker: item.role === 'user' ? 'user' : 'ferni', text });
  }
  return lines;
}
