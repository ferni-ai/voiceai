/**
 * Stop every reply starting with the same reaction word.
 *
 * Live calls opened 3-4 of every 4 replies with "Oh", "Ugh", "Ha" or "Yeah"
 * even with a prompt reminder against it (the reminder removed them offline,
 * 0/9, but not live: 3/4 on 2026-09-27). A reaction word now and then is
 * human; on every turn it is a tic. This lets one through at most every
 * OPENER_EVERY replies and otherwise drops it before the words reach TTS and
 * captions: "Ha! Oh, of course he did." becomes "Of course he did."
 *
 * FERNI_PLAYFUL=on: a bright turn whose reminder invited a reaction word
 * (ferni-playful.ts) keeps it, but a kept word still comes at most once in
 * PLAYFUL_GAP replies and never twice running, so not every reply opens "Oh".
 * Every reaction word he uses counts toward that ("wow", "dude", "oh man"),
 * not only the stock ones: the playful turn invites more of them.
 *
 * @module agents/personas/opener-gate
 */

import type { llm } from '@livekit/agents';
import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';

import { flagOn } from '../../config/env-flag.js';
import { firstClauseFlushEnabled } from './first-clause-flush.js';
import { leadingBurst, withoutBurst, withRenderedBurst } from './vocal-bursts.js';

export const OPENER_EVERY = 3;
/** FERNI_PLAYFUL: a reaction word is kept on at most one reply in this many. */
export const PLAYFUL_GAP = 3;
/** Characters of a reply to see before deciding (enough for "Ha! Oh, well,"). */
const DECIDE_AFTER = 24;

const TAG_PREFIX = /^(\s*(?:<[^>]+>\s*)*)/;
// Not "well": it opens real content ("Well done!"), not only a reaction.
const INTERJECTION = /^(?:oh+|ugh+|ha(?:ha)*|hah|yeah|yep|hmm+|mm+|ah+|aw+|wow|whoa)\b[\s,.!…-]*/i;
/** FERNI_PLAYFUL: every reaction word Ferni opens with, so each one counts toward the limit. */
export const PLAYFUL_INTERJECTION =
  /^(?:o+h+|ugh+|ha(?:ha)*|hah|heh|yeah|yep|hmm+|mm+|ah+|aw+|wow+|whoa+|dude|man|huh|yikes|geez|jeez|gosh|dang|damn|boy|whew|phew)\b[\s,.!…-]*/i;

/**
 * Drop leading reaction words, keeping any leading markup tag. Leaves the
 * text alone when nothing substantive follows (a reply that is only "Oh?").
 */
export function stripStockOpener(
  text: string,
  words: RegExp = INTERJECTION
): { text: string; stripped: boolean } {
  const tag = TAG_PREFIX.exec(text)?.[1] ?? '';
  let rest = text.slice(tag.length);
  let stripped = false;
  for (let m = words.exec(rest); m && m[0].length > 0; m = words.exec(rest)) {
    rest = rest.slice(m[0].length);
    stripped = true;
  }
  if (!stripped || !/[A-Za-z]/.test(rest.slice(0, 1))) return { text, stripped: false };
  return { text: tag + rest.charAt(0).toUpperCase() + rest.slice(1), stripped: true };
}

/** The reaction word a reply opens with, normalised ("Hahaha!" is "ha", "Ohh," is "oh"), or null. */
export function openerWord(text: string, words: RegExp = INTERJECTION): string | null {
  const m = words.exec(text.slice((TAG_PREFIX.exec(text)?.[1] ?? '').length));
  if (!m) return null;
  const word = m[0].toLowerCase().replace(/[^a-z]/g, '');
  return /^(?:ha)+h?$/.test(word) ? 'ha' : word.replace(/(.)\1+/g, '$1');
}

/** A whole first word: letters/digits followed by something that ends it. */
const WHOLE_WORD = /^([A-Za-z0-9']+)(?=[^A-Za-z0-9'])/;

/**
 * Whether enough of the reply has arrived to decide its opener, without
 * waiting for DECIDE_AFTER characters: the first word is whole and is not a
 * reaction word, or every reaction word so far is followed by a whole real
 * word. Gemini's first chunk is 2-6 characters and the next ~20 take 150-310
 * ms on gemini-3.5-flash (2026-10-10, n=6): waiting for 24 characters held
 * every reply's first words that long. The decision is the same text either
 * way; only when it is made moves.
 */
export function openingDecidable(text: string, words: RegExp = INTERJECTION): boolean {
  let rest = text.replace(TAG_PREFIX, '');
  if (rest.length >= DECIDE_AFTER) return true;
  for (;;) {
    rest = rest.replace(/^[\s,.!?…-]+/, '');
    const word = WHOLE_WORD.exec(rest);
    if (!word) return false; // the next word (or markup) isn't whole yet
    if (!words.test(rest)) return true; // a real word: nothing left to strip
    rest = rest.slice(word[1].length);
  }
}

/** Leading markup (`<emotion/>`, `<break/>`) and cues (`[laughter]`) before the first spoken letter. */
const LEAD_MARKUP = /^(\s*(?:<[^>]+>\s*|\[[^\]]*\]\s*)*)/;

/**
 * Capitalise a reply's first spoken letter. The fast model often starts
 * lowercase ("it's, um, always that scramble", prod 2026-10-10), copying the
 * mid-sentence examples in the turn prompt; once one lowercase reply is in the
 * history, later ones follow it. Fixing it here fixes captions, audio and the
 * saved history at once.
 */
export function capitalizeStart(text: string): string {
  const lead = LEAD_MARKUP.exec(text)?.[1] ?? '';
  const first = text.charAt(lead.length);
  if (first < 'a' || first > 'z') return text;
  return lead + first.toUpperCase() + text.slice(lead.length + 1);
}

type Chunk = llm.ChatChunk | string | object;

function contentOf(chunk: Chunk): string | undefined {
  if (typeof chunk === 'string') return chunk;
  const c = chunk as llm.ChatChunk;
  if (c && typeof c === 'object' && 'delta' in c && c.delta && !c.delta.toolCalls?.length) {
    return c.delta.content ?? '';
  }
  return undefined; // tool calls, usage, flush sentinels: not reply text
}

/** Per-agent gate: keeps a reaction-word opener at most every `every` replies. */
export class OpenerGate {
  private repliesSinceKept: number;
  /** FERNI_PLAYFUL: replies since a reaction word was kept, and which word it was. */
  private turnsSinceKept = PLAYFUL_GAP;
  private lastKept: string | null = null;
  /** The reaction words this gate counts: every one Ferni uses with FERNI_PLAYFUL on. */
  private readonly words: RegExp;

  /**
   * `early`: decide as soon as the opening is decidable (openingDecidable)
   * instead of after DECIDE_AFTER characters. OPENER_GATE_EARLY=on, and
   * FIRST_CLAUSE_FLUSH=on: a first clause shorter than DECIDE_AFTER would
   * otherwise wait here for its sentence (first-clause-flush.ts).
   * `playful`: FERNI_PLAYFUL=on, a bright turn may keep its word (mayKeep).
   */
  constructor(
    private readonly every: number = OPENER_EVERY,
    private readonly early: boolean = process.env.OPENER_GATE_EARLY === 'on' ||
      firstClauseFlushEnabled(),
    private readonly playful: boolean = flagOn('FERNI_PLAYFUL')
  ) {
    this.repliesSinceKept = every; // the first reply may keep one
    this.words = playful ? PLAYFUL_INTERJECTION : INTERJECTION;
  }

  /**
   * Decide for one reply's opening text. `openedBySound`: a turn-opening clip
   * already said "Mm" (turn-opening-sound.ts), so the reply's own reaction word
   * goes, and the clip counts as this reply's kept opener. `burst`
   * (VOCAL_BURSTS=on) is whether this reply may open with a vocal burst: one it
   * may is kept, in the spelling that renders; one it may not is dropped, as is
   * any burst after a turn-opening clip. Undefined: as before. `bright`: the
   * reminder invited a reaction word on a bright turn (FERNI_PLAYFUL).
   */
  decide(opening: string, openedBySound = false, burst?: boolean, bright = false): string {
    this.turnsSinceKept++;
    const found = burst === undefined ? null : leadingBurst(opening);
    if (found && burst && !openedBySound) {
      this.kept(null);
      return capitalizeStart(withRenderedBurst(opening, found));
    }
    if (found) opening = capitalizeStart(withoutBurst(opening, found));
    const { text, stripped } = stripStockOpener(opening, this.words);
    if (openedBySound) {
      this.kept('mm');
      return stripped ? text : capitalizeStart(opening);
    }
    if (!stripped) return capitalizeStart(opening);
    if (this.mayKeep(opening, bright)) {
      this.kept(openerWord(opening, this.words));
      return capitalizeStart(opening);
    }
    this.repliesSinceKept++;
    return text;
  }

  private kept(word: string | null): void {
    this.repliesSinceKept = 0;
    this.turnsSinceKept = 0;
    this.lastKept = word;
  }

  /**
   * Off: one every `every` replies that opened on a reaction word. With
   * FERNI_PLAYFUL also on a bright turn, but never within PLAYFUL_GAP replies
   * of the last kept word and never the same word twice running.
   */
  private mayKeep(opening: string, bright: boolean): boolean {
    const due = this.repliesSinceKept >= this.every;
    if (!this.playful) return due;
    const word = openerWord(opening, this.words);
    if (this.turnsSinceKept < PLAYFUL_GAP || word === this.lastKept) return false;
    return due || bright;
  }

  /**
   * Wrap one reply's LLM stream; `openedBySound` is asked when the opening is
   * decided; `burst` and `bright` as in decide.
   */
  wrap(
    input: ReadableStream<Chunk>,
    openedBySound: () => boolean = () => false,
    burst?: boolean,
    bright = false
  ): ReadableStream<Chunk> {
    const decide = (opening: string): string =>
      this.decide(opening, openedBySound(), burst, bright);
    const early = this.early;
    const words = this.words;
    let buffered = '';
    let template: Chunk | null = null;
    let decided = false;
    const release = (controller: ReadableStreamDefaultController<Chunk>): void => {
      decided = true;
      if (!buffered) return;
      const text = decide(buffered);
      if (typeof template === 'string' || template === null) controller.enqueue(text);
      else {
        const c = template as llm.ChatChunk;
        controller.enqueue({
          ...c,
          delta: { ...c.delta, role: c.delta?.role ?? 'assistant', content: text },
        });
      }
      buffered = '';
    };
    return new ReadableStream<Chunk>({
      async start(controller) {
        try {
          for await (const chunk of input as unknown as AsyncIterable<Chunk>) {
            const content = decided ? undefined : contentOf(chunk);
            if (content === undefined) {
              if (!decided) release(controller);
              controller.enqueue(chunk);
              continue;
            }
            buffered += content;
            template = chunk;
            const ready = early
              ? openingDecidable(buffered, words)
              : buffered.replace(TAG_PREFIX, '').length >= DECIDE_AFTER;
            if (ready) release(controller);
          }
          if (!decided) release(controller);
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
  }
}
