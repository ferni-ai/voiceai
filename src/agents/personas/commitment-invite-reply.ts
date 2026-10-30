/**
 * The reply on the invite turn (commitment-invite.ts), checked after the
 * model writes it. Offline (2026-10-12) Gemini named a step for the caller on
 * about half of invite turns despite the note ("would you want to commit to
 * finding three projects by tomorrow?"), and that is what read as coaching.
 * A sentence that hands them a concrete action is dropped; if no question is
 * left, one of the plain asks goes in its place.
 *
 * Only that one reply a call is held, a sentence at a time, so its first
 * words wait for the end of their sentence instead of streaming word by word.
 *
 * @module agents/personas/commitment-invite-reply
 */
import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

import { createLogger } from '../../utils/safe-logger.js';
import { ASKS, inviteTurnSeed } from './commitment-invite.js';
import { contentOf, type ReplyChunk as Chunk } from './reply-chunks.js';

const log = createLogger({ module: 'CommitmentInvite' });

const DEADLINE =
  /\b(?:today|tonight|tomorrow|this (?:week|weekend|afternoon|evening)|by (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|the weekend|next)|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|before (?:bed|work|we talk))\b/i;
const IMPERATIVE =
  /^(?:\W*(?:so|okay|ok|well|maybe|just|and)\W+)*(?:try|write|jot|send|text|call|make|list|pick|find|spend|take|set|block|put|grab|start|open|look|book|ask|tell|draft|go)\b/i;
/** Ferni handing them an action: "commit to", "how about you", "what if you", "you could try". */
const HANDS_A_STEP =
  /\b(?:commit to|how about (?:you|we|(?:just |maybe )?(?!(?:some|any|no|every)thing\b)\w+ing)\b|what if you|why don'?t you|you (?:could|should|might) (?:try|just|start|write|send|text|call|make|list|pick|spend|take|block|look)|(?:do|would) you (?:want|like) to (?:try |commit to )(?!that\b|it\b|something\b|anything\b|one\b|a (?:little|small|tiny)\b)\w+ing\b|maybe (?:try|just)\b)/i;

/** A sentence that names a step for them rather than asking for theirs. */
export function suggestsStep(sentence: string): boolean {
  return HANDS_A_STEP.test(sentence) || (IMPERATIVE.test(sentence) && DEADLINE.test(sentence));
}

/** The reply with any step-naming sentence dropped, and a plain ask if no question is left. */
export function checkInviteReply(text: string, seed: number): { text: string; changed: boolean } {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const kept = sentences.filter((s) => !suggestsStep(s));
  if (kept.length === sentences.length) return { text, changed: false };
  const out = kept.join('').trim();
  const ask = ASKS[seed % ASKS.length];
  return { text: out.includes('?') ? out : `${out} ${ask}`.trim(), changed: true };
}

/** The reply stream, checked a sentence at a time when this is the invite turn; else as is. */
export function withInviteReplyCheck(
  input: ReadableStream<Chunk>,
  session: object
): ReadableStream<Chunk> {
  const seed = inviteTurnSeed(session);
  if (seed === undefined) return input;
  let pending = '';
  let asked = false;
  let template: Chunk = '';
  const out = (text: string): Chunk =>
    typeof template === 'string'
      ? text
      : { ...(template as llm.ChatChunk), delta: { role: 'assistant', content: text } };
  return new ReadableStream<Chunk>({
    async start(controller) {
      let dropped = false;
      let sent = false;
      const flush = (text: string): void => {
        if (suggestsStep(text)) {
          dropped = true;
          log.info({ dropped: true }, 'COMMITMENT_INVITE_REPLY');
          return;
        }
        asked ||= text.includes('?');
        sent ||= Boolean(text);
        if (text) controller.enqueue(out(text));
      };
      try {
        for await (const chunk of input as unknown as AsyncIterable<Chunk>) {
          const content = contentOf(chunk);
          if (content === undefined) {
            controller.enqueue(chunk);
            continue;
          }
          template = chunk;
          pending += content;
          for (let m = /[.!?]+\s/.exec(pending); m; m = /[.!?]+\s/.exec(pending)) {
            flush(pending.slice(0, m.index + m[0].length));
            pending = pending.slice(m.index + m[0].length);
          }
        }
        if (pending) flush(pending);
        if (dropped && !asked)
          controller.enqueue(out(`${sent ? ' ' : ''}${ASKS[seed % ASKS.length]}`));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
