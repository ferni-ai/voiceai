/**
 * Wrap-up: when the caller says goodbye after something was settled on the
 * call, Ferni's goodbye closes the loop in one sentence, the way a friend
 * does ("So you're calling the landlord tomorrow, and I'll check in
 * Thursday."). Never a recap or a list, never on a call where nothing was
 * decided, never after hard news. WRAP_UP=on (off by default).
 *
 * What was decided is read off the critical path: after each of Ferni's
 * replies, when the new lines carry a plan-shaped word (I'll, tomorrow,
 * remind, a weekday...), a small model lists the call's decided items. The
 * goodbye reply only reads what is already there, in code, with nothing
 * awaited: a goodbye with no reading yet gets no note, not a slower reply.
 *
 * @module agents/personas/wrap-up
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { Line } from './director-notes.js';
import { hardNews } from './turn-candor.js';
import {
  DEFAULT_UNDERSTANDING_MODEL,
  geminiUnderstand,
  type UnderstandFn,
} from './turn-understanding.js';

const log = createLogger({ module: 'WrapUp' });

export function wrapUpEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.WRAP_UP === 'on';
}

export interface Decided {
  who: 'caller' | 'ferni';
  /** A short verb phrase: "call the landlord". */
  what: string;
  when: string | null;
}

export const DECIDED_PROMPT = `You read a phone call between a caller and their friend Ferni and list what was concretely decided or promised in it: a plan, a task, a time, something the caller said they will do, or something Ferni said he will do (check in, call back, remind them). Not wishes, maybes, hypotheticals, things already done, or figures of speech ("I'll be honest", "I'll tell you what"). Return JSON only:
{"items":[{"who":"caller"|"ferni","what":string,"when":string|null}],"heavy":bool}
what: a short verb phrase in base form, at most 8 words ("call the landlord"). when: the time they gave ("tomorrow", "Thursday"), or null. At most 3 items, most recent first; [] when nothing was decided. Keep PREVIOUSLY FOUND items that still stand. heavy: the call includes hard news, grief, illness, a crisis, or the caller is in real distress.`;

/** A line that could carry a plan: worth asking the model about. Cheap and broad on purpose. */
const PLAN_CUE =
  /\b(?:i'?ll|i will|we'?ll|you'?ll|let'?s|gonna|going to|plan|remind|check in|call (?:you|him|her|them)|text (?:you|him|her|them)|today|tonight|tomorrow|this (?:morning|afternoon|evening|weekend)|next (?:week|month)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|o'?clock|at \d)\b/i;

/**
 * The caller signing off. "I need to go to the dentist" is a plan, not a
 * goodbye, so "go" followed by where or what doesn't count.
 */
const SIGNING_OFF =
  /\b(?:bye|goodbye|good night|night night|talk (?:to you )?(?:later|soon)|catch you later|i'?ll let you go|that'?s all for (?:now|today)|i'?m heading out|(?:gotta|got to|have to|need to|should(?: probably)?) (?:go|run|head out)\b(?!\s+(?:to|and|get|see|pick|buy|grab|do|check|back|over|out|for|with)\b))/i;

export function signingOff(text: string): boolean {
  return SIGNING_OFF.test(text);
}

const WHO = new Set(['caller', 'ferni']);

/** The model's JSON, or null when it isn't usable. */
export function parseDecided(reply: string): { items: Decided[]; heavy: boolean } | null {
  const json = reply.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const p = JSON.parse(json) as { items?: unknown; heavy?: unknown };
    if (!Array.isArray(p.items)) return null;
    const items = p.items
      .map((raw) => raw as Partial<Record<keyof Decided, unknown>>)
      .filter(
        (i) =>
          WHO.has(i.who as string) &&
          typeof i.what === 'string' &&
          i.what.trim() !== '' &&
          i.what.trim().split(/\s+/).length <= 10
      )
      .slice(0, 3)
      .map((i) => ({
        who: i.who as Decided['who'],
        what: (i.what as string).trim().replace(/[.!]+$/, ''),
        when: typeof i.when === 'string' && i.when.trim() ? i.when.trim() : null,
      }));
    return { items, heavy: p.heavy === true };
  } catch {
    return null;
  }
}

/** The note for the goodbye reply: what was settled, and how to say it. */
export function formatWrapUp(items: Decided[]): string {
  const parts = items.map((i) => {
    const when = i.when ? ` ${i.when}` : '';
    return i.who === 'caller' ? `they'll ${i.what}${when}` : `you said you'd ${i.what}${when}`;
  });
  return `[Wrapping up: they're saying goodbye. Close the loop in one natural sentence, the way a friend would, naming what you two settled (${parts.join('; ')}), then a short goodbye. Not a list, not a recap of the call.]`;
}

const TIMEOUT_MS = 4000;
const CALL_LINES = 24;

/** One call's reading of what was decided, and whether the goodbye has used it. */
export class WrapUp {
  private items: Decided[] = [];
  private heavy = false;
  private seen = 0;
  private generation = 0;
  private offered = false;
  private closed = false;

  constructor(
    private readonly decide: UnderstandFn = geminiUnderstand(
      process.env.WRAP_UP_MODEL || DEFAULT_UNDERSTANDING_MODEL
    ),
    private readonly timeoutMs = TIMEOUT_MS
  ) {}

  /** Ferni finished a reply: read what was decided from the call so far. Never throws. */
  async observe(lines: Line[]): Promise<void> {
    if (this.offered) {
      this.closed = true; // the goodbye that carried the note has been spoken
      return;
    }
    if (lines.some((l) => l.speaker === 'user' && hardNews(l.text))) this.heavy = true;
    if (lines.length < this.seen) this.seen = 0; // a handoff swapped the chat
    const fresh = lines.slice(this.seen);
    this.seen = lines.length;
    if (this.heavy || !fresh.some((l) => PLAN_CUE.test(l.text))) return;

    const gen = ++this.generation;
    const started = Date.now();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.timeoutMs);
    try {
      const input = [
        `PREVIOUSLY FOUND: ${JSON.stringify(this.items)}`,
        'THE CALL:',
        ...lines
          .slice(-CALL_LINES)
          .map((l) => `${l.speaker === 'ferni' ? 'Ferni' : 'Caller'}: ${l.text}`),
      ].join('\n');
      const parsed = parseDecided(await this.decide(DECIDED_PROMPT, input, abort.signal));
      if (gen !== this.generation || !parsed) return;
      this.items = parsed.items;
      if (parsed.heavy) this.heavy = true;
      // Counts only: the items are the caller's words.
      log.info(
        { items: this.items.length, heavy: this.heavy, ms: Date.now() - started },
        'WRAP_UP_DECIDED'
      );
    } catch (error) {
      log.warn({ error: String(error), ms: Date.now() - started }, 'wrap-up reading failed');
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * The note for this reply, or '' (in code, nothing awaited). Only when the
   * caller is signing off, something was decided, the call carried no hard
   * news, and the loop hasn't been closed already.
   */
  noteFor(said: string, wantsToEnd = false): string {
    if (this.closed || this.heavy || !this.items.length || hardNews(said)) return '';
    if (!wantsToEnd && !signingOff(said)) return '';
    if (!this.offered) log.info({ items: this.items.length }, 'WRAP_UP_NOTE');
    this.offered = true;
    return formatWrapUp(this.items);
  }
}

// Keyed by the AgentSession object, like the director.
const wrapUps = new WeakMap<object, WrapUp>();

export function setWrapUp(session: object, w: WrapUp | null): void {
  if (w) wrapUps.set(session, w);
  else wrapUps.delete(session);
}

export function getWrapUp(session: object | undefined): WrapUp | undefined {
  return session ? wrapUps.get(session) : undefined;
}
