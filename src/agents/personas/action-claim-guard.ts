/**
 * Ferni never says he did, or is doing, something he can't do or that failed.
 *
 * Prod call 2026-10-14: the caller asked Ferni to phone a relative and gave a
 * number. Ferni said he was calling right now and would report back once he
 * reached them. No call was placed: no call tool was open to that call, so
 * nothing ran, and the model narrated the action instead.
 *
 * Every reply the model writes passes through here (ferni-agent.ts llmNode),
 * a sentence at a time. A sentence that claims a call, a text or email, a
 * booking, a reminder or a save (action-claims.ts) is dropped in two cases
 * only, and one honest line says what happened and what he can do instead:
 * - no tool of that kind is open this turn (it doesn't exist here, or is off):
 *   he can't do that for them; the line goes where the claim was;
 * - the latest tool result of that kind on this call refused or failed: it
 *   didn't go through; the line goes at the end, and not at all when the reply
 *   calls a tool of that kind again.
 * Everything else streams untouched, so the confirm read-back and the yes turn
 * (outreach-confirm.ts), a tool the model is about to call, and talk about an
 * action that really happened are never changed. Text and tool calls keep
 * their order. ACTION_CLAIM_GUARD=off turns the guard off. Logs carry the kind
 * and the reason, never words.
 *
 * Holding a sentence delays the first audio (dev A/B, increment 3: about
 * 0.2-0.5 s, a whole model chunk), so sentences are held only when an action
 * is in play: the caller asked for one in their last few turns, or a tool of
 * that kind ran on this call. A sentence ending a chunk goes out at once. On
 * every other turn the words stream as they come and a claim, rare there, is
 * corrected by the honest line straight after it.
 *
 * @module agents/personas/action-claim-guard
 */
import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';
import { callActions, claimedAction, kindsOfTool, type ActionKind } from './action-claims.js';

const log = createLogger({ module: 'ActionClaimGuard' });

type Chunk = llm.ChatChunk | string | object;
export type MissReason = 'no_tool' | 'failed';

export function actionClaimGuardEnabled(env: Env = process.env): boolean {
  return flagOn('ACTION_CLAIM_GUARD', env);
}

const DID_NOT_GO: Record<ActionKind, string> = {
  call: "That call didn't go through, so nothing's been dialed.",
  send: "That didn't go through, so nothing's been sent.",
  schedule: "That didn't go through, so it isn't booked.",
  reminder: "That didn't go through, so there's no reminder set.",
  save: "That didn't go through, so it isn't saved.",
};
const CANNOT: Record<ActionKind, string> = {
  call: "I can't actually make calls for you, so I haven't rung anyone.",
  send: "I can't actually send messages for you, so nothing's gone out.",
  schedule: "I can't actually book that for you, so it isn't booked.",
  reminder: "I can't actually set reminders for you, so there isn't one set.",
  save: "I can't actually save that for you, so it isn't saved.",
};
const INSTEAD: Record<ActionKind, string> = {
  call: ' I can help you work out what to say, though.',
  send: ' I can help you word it, though.',
  schedule: '',
  reminder: ' Maybe pop it in your phone so it nudges you.',
  save: '',
};
const REMIND = ' Want me to remind you to do it?';

/** What Ferni says in place of a claim, and what he can do instead. */
export function honestLine(kind: ActionKind, reason: MissReason, canRemind: boolean): string {
  const instead = canRemind && kind !== 'reminder' && kind !== 'save' ? REMIND : INSTEAD[kind];
  return `${reason === 'failed' ? DID_NOT_GO[kind] : CANNOT[kind]}${instead}`;
}

function contentOf(chunk: Chunk): string | undefined {
  if (typeof chunk === 'string') return chunk;
  const delta = (chunk as Partial<llm.ChatChunk> | null)?.delta;
  if (delta === undefined || (delta.toolCalls?.length ?? 0) > 0) return undefined;
  return delta.content ?? '';
}

function toolNamesOf(chunk: Chunk): string[] {
  if (typeof chunk !== 'object' || chunk === null) return [];
  const calls = (chunk as { delta?: { toolCalls?: Array<{ name?: string }> } }).delta?.toolCalls;
  return (calls ?? []).map((call) => call.name ?? '');
}

/** Length of the first whole sentence in the text, with its trailing space; 0 if none yet. */
function sentenceEnd(text: string): number {
  const m = text.match(/[.!?]+(?:\s|(?=[A-Z]))/);
  return m?.index === undefined ? 0 : m.index + m[0].length;
}

/** What a caller says when they want Ferni to do something: call, text, book, remind, save. */
const ACTION_TALK =
  /\b(?:call\w*|cal|ring\w*|rang|rung|phon\w*|dial\w*|buzz|face ?time|whats ?app|text\w*|tex|txt|messag\w*|msg|dm|e-?mail\w*|send\w*|sent|ping\w*|contact\w*|reach\w*|hit (?:up|her|him|them)|holler|connect\w*|put (?:me )?through|loop (?:in|\w+ in)|get (?:my|her|him|them|\w+ for me)|(?:talk|speak) (?:to|with) (?:my|her|him|them)|ask (?:my|her|him|them)\b|hold of|ahold|on the line|tell (?!me\b)\w+|let (?:her|him|them|my \w+|\w+) know|book\w*|schedul\w*|set up|reserv\w*|appointment\w*|meeting|calendar|remind\w*|wake me|alarm\w*|timer\w*|sav\w*|remember\w*|write (?:that|it|this) down|jot|note\w*|number\w*|llam\w*|appel\w*|anruf\w*|ruf|chiam\w*|liga\w*)\b|\d{3}/i;
/** How many of the caller's (and Ferni's) latest messages can put an action in play. */
const ASK_WINDOW = 6;

interface Item {
  type?: string;
  role?: string;
  name?: string;
  content?: unknown;
  textContent?: string;
}

/** The caller's spoken words: the first line only, since a per-turn reminder rides after a blank line (turn-style.ts). */
const spokenOf = (item: Item): string => {
  const text =
    item.textContent ??
    (Array.isArray(item.content)
      ? item.content.filter((part): part is string => typeof part === 'string').join(' ')
      : '');
  const first = text.split('\n')[0].trim();
  return first.startsWith(TURN_CONTEXT_HEADER) ? '' : first;
};

/** Ferni's own line claimed an action or said honestly he couldn't: the action is still in play. */
const HONEST_SAID = /\b(?:can't actually|didn't go through)\b/i;
const actedOn = (text: string): boolean =>
  HONEST_SAID.test(text) ||
  text.split(/(?<=[.!?])\s+/).some((part) => claimedAction(part) !== null);

/** The caller asked for an action lately, or an action tool ran on this call. */
export function actionInPlay(chatCtx: { items: readonly unknown[] }): boolean {
  const items = chatCtx.items as readonly Item[];
  if (
    items.some(
      (item) =>
        (item.type === 'function_call' || item.type === 'function_call_output') &&
        kindsOfTool(item.name ?? '').length > 0
    )
  )
    return true;
  // Ferni's own last replies too: after "yes" and "hello?" the ask can be four messages back,
  // but his "dialing her now" or honest line keeps the action in play (prod, 2026-10-15).
  const said = items.filter((item) => item.type === 'message' && item.role === 'assistant');
  if (said.slice(-ASK_WINDOW).some((item) => actedOn(spokenOf(item)))) return true;
  const asks = items.filter((item) => item.type === 'message' && item.role === 'user');
  return asks
    .map(spokenOf)
    .filter(Boolean)
    .slice(-ASK_WINDOW)
    .some((text) => ACTION_TALK.test(text));
}

/**
 * The model's reply, held a sentence at a time: a sentence claiming an action
 * no tool carried out is dropped, and one honest line goes in its place.
 */
export async function withActionClaimCheck<T>(
  reply: Promise<T> | T,
  chatCtx: { items: readonly unknown[] },
  tools: { functionTools?: Record<string, unknown> },
  env: Env = process.env
): Promise<T> {
  const stream = await reply;
  if (stream === null || stream === undefined || !actionClaimGuardEnabled(env)) return stream;
  const reader = (stream as unknown as ReadableStream<Chunk>).getReader();
  const { failed } = callActions(chatCtx);
  const open = new Set(Object.keys(tools.functionTools ?? {}).flatMap(kindsOfTool));
  const hold = actionInPlay(chatCtx);
  /** Why a claim of this kind is false, or null when it may stand. */
  const missing = (kind: ActionKind): MissReason | null =>
    !open.has(kind) ? 'no_tool' : failed.has(kind) ? 'failed' : null;
  let id = '';
  let stringChunks = true;
  const out = (text: string): Chunk =>
    stringChunks ? text : { id, delta: { role: 'assistant', content: text } };
  const guarded = new ReadableStream<Chunk>({
    async start(controller) {
      let pending = '';
      let passed = 0; // how much of pending already streamed out
      let last = '';
      let said = false; // an honest line already went out
      let lineLast = false; // the last thing out was an honest line
      let deferred: ActionKind | undefined;
      const calling = new Set<ActionKind>();
      const emit = (raw: string): void => {
        const text = !last || /\s$/.test(last) ? raw.trimStart() : raw;
        if (!text) return;
        const spaced = last && !/\s$/.test(last) && !/^\s/.test(text) ? ` ${text}` : text;
        controller.enqueue(out(spaced));
        last = spaced;
      };
      /** A streamed chunk goes out as the model wrote it, spaced only after an honest line. */
      const pass = (text: string): void => {
        if (!text) return;
        const spaced = lineLast && !/^\s/.test(text) ? ` ${text}` : text;
        controller.enqueue(out(spaced));
        last = spaced;
        lineLast = false;
      };
      /** A whole sentence: held ones go out unless they claim; streamed ones are already out. */
      const flush = (text: string): void => {
        const kind = claimedAction(text);
        const reason = kind ? missing(kind) : null;
        if (!kind || !reason) {
          if (hold) emit(text);
          return;
        }
        log.warn({ kind, reason, held: hold }, 'ACTION_CLAIM_DROPPED');
        if (said || deferred) return;
        if (reason === 'failed') {
          deferred = kind;
          return;
        }
        said = true;
        const line = honestLine(kind, reason, open.has('reminder'));
        emit(hold ? line : `Scratch that, ${line}`);
        lineLast = true;
      };
      try {
        for (let next = await reader.read(); !next.done; next = await reader.read()) {
          const chunk = next.value;
          const content = contentOf(chunk);
          if (content === undefined) {
            // A tool call goes out after the words before it, as the model wrote them.
            if (pending) flush(pending);
            pending = '';
            passed = 0;
            for (const name of toolNamesOf(chunk)) kindsOfTool(name).forEach((k) => calling.add(k));
            controller.enqueue(chunk);
            continue;
          }
          if (typeof chunk !== 'string') {
            stringChunks = false;
            id = (chunk as llm.ChatChunk).id ?? id;
          }
          pending += content;
          for (let end = sentenceEnd(pending); end > 0; end = sentenceEnd(pending)) {
            if (!hold) pass(pending.slice(passed, end)); // the rest of this sentence, then any correction
            flush(pending.slice(0, end));
            pending = pending.slice(end);
            passed = 0;
          }
          if (!hold) {
            pass(pending.slice(passed));
            passed = pending.length;
          }
        }
        if (pending) flush(pending);
        if (deferred && !said && !calling.has(deferred)) {
          emit(honestLine(deferred, 'failed', open.has('reminder')));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch((error: unknown) => {
        log.debug({ error: String(error) }, 'reply cancel after the claim check failed');
      });
    },
  });
  return guarded as unknown as T;
}
