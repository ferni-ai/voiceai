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
 * @module agents/personas/opener-gate
 */

import type { llm } from '@livekit/agents';
import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';

export const OPENER_EVERY = 3;
/** Characters of a reply to see before deciding (enough for "Ha! Oh, well,"). */
const DECIDE_AFTER = 24;

const TAG_PREFIX = /^(\s*(?:<[^>]+>\s*)*)/;
// Not "well": it opens real content ("Well done!"), not only a reaction.
const INTERJECTION = /^(?:oh+|ugh+|ha(?:ha)*|hah|yeah|yep|hmm+|mm+|ah+|aw+|wow|whoa)\b[\s,.!…-]*/i;

/**
 * Drop leading reaction words, keeping any leading markup tag. Leaves the
 * text alone when nothing substantive follows (a reply that is only "Oh?").
 */
export function stripStockOpener(text: string): { text: string; stripped: boolean } {
  const tag = TAG_PREFIX.exec(text)?.[1] ?? '';
  let rest = text.slice(tag.length);
  let stripped = false;
  for (let m = INTERJECTION.exec(rest); m && m[0].length > 0; m = INTERJECTION.exec(rest)) {
    rest = rest.slice(m[0].length);
    stripped = true;
  }
  if (!stripped || !/[A-Za-z]/.test(rest.slice(0, 1))) return { text, stripped: false };
  return { text: tag + rest.charAt(0).toUpperCase() + rest.slice(1), stripped: true };
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

  constructor(private readonly every: number = OPENER_EVERY) {
    this.repliesSinceKept = every; // the first reply may keep one
  }

  /** Decide for one reply's opening text. */
  decide(opening: string): string {
    const { text, stripped } = stripStockOpener(opening);
    if (!stripped) return capitalizeStart(opening);
    if (this.repliesSinceKept >= this.every) {
      this.repliesSinceKept = 0;
      return capitalizeStart(opening);
    }
    this.repliesSinceKept++;
    return text;
  }

  /** Wrap one reply's LLM stream. */
  wrap(input: ReadableStream<Chunk>): ReadableStream<Chunk> {
    const decide = (opening: string): string => this.decide(opening);
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
        controller.enqueue({ ...c, delta: { ...c.delta, role: c.delta?.role ?? 'assistant', content: text } });
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
            if (buffered.replace(TAG_PREFIX, '').length >= DECIDE_AFTER) release(controller);
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
