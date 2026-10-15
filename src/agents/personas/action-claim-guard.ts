/**
 * Ferni never says he did, or is doing, something no tool did.
 *
 * Prod call 2026-10-14: the caller asked Ferni to phone a relative and gave a
 * number. Ferni said he was calling right now and would report back once he
 * reached them. No call was placed: no call tool was open to that call, so
 * nothing ran, and the model narrated the action instead.
 *
 * Every reply the model writes passes through here (ferni-agent.ts llmNode),
 * a sentence at a time. A sentence that claims a call, a text or email, a
 * booking, a reminder or a save (action-claims.ts) is dropped unless the
 * latest tool result of that kind on this call carried it out. One honest line
 * takes its place, where the claim was:
 * - no tool of that kind open: he can't do that from here, and what he can do
 *   instead (a reminder when one is open);
 * - the confirm preview came back (outreach-confirm.ts): nothing's gone out
 *   until the caller says yes;
 * - the tool refused or failed: it didn't go through;
 * - the tool is open and wasn't called: he hasn't yet, want him to? This one
 *   waits for the end of the reply and is left out when the reply calls a tool
 *   of that kind, whose result answers next.
 * Text and tool calls keep their order. ACTION_CLAIM_GUARD=off turns the guard
 * off. Logs carry the kind and the reason, never words.
 *
 * @module agents/personas/action-claim-guard
 */
import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { callActions, claimedAction, kindsOfTool, type ActionKind } from './action-claims.js';

const log = createLogger({ module: 'ActionClaimGuard' });

type Chunk = llm.ChatChunk | string | object;
export type MissReason = 'no_tool' | 'awaiting_yes' | 'failed' | 'not_called';

export function actionClaimGuardEnabled(env: Env = process.env): boolean {
  return flagOn('ACTION_CLAIM_GUARD', env);
}

const NOT_YET: Record<ActionKind, string> = {
  call: "I haven't placed that call yet.",
  send: "I haven't sent anything yet.",
  schedule: "I haven't booked that yet.",
  reminder: "I haven't set that yet.",
  save: "I haven't saved that yet.",
};
const AWAITING: Record<ActionKind, string> = {
  call: "Nothing's been dialed yet, I need your yes first.",
  send: "Nothing's gone out yet, I need your yes first.",
  schedule: "Nothing's booked yet, I need your yes first.",
  reminder: "Nothing's set yet, I need your yes first.",
  save: "Nothing's saved yet, I need your yes first.",
};
const DID_NOT_GO: Record<ActionKind, string> = {
  call: "That call didn't go through, so nothing's been dialed.",
  send: "That didn't go through, so nothing's been sent.",
  schedule: "That didn't go through, so it isn't booked.",
  reminder: "That didn't go through, so there's no reminder set.",
  save: "That didn't go through, so it isn't saved.",
};
const CANNOT: Record<ActionKind, string> = {
  call: "I can't place calls from here, so I haven't called anyone.",
  send: "I can't send messages from here, so nothing's gone out.",
  schedule: "I can't book things from here, so that isn't booked.",
  reminder: "I can't set reminders from here, so there isn't one set.",
  save: "I can't save that from here, so it isn't saved.",
};
const INSTEAD: Record<ActionKind, string> = {
  call: ' I can help you work out what to say, though.',
  send: ' I can help you word it, though.',
  schedule: '',
  reminder: ' Maybe pop it in your phone so it nudges you.',
  save: '',
};
const REMIND = ' I can set a reminder for you to do it, if you like.';

/** What Ferni says in place of a claim, and what he can do instead. */
export function honestLine(kind: ActionKind, reason: MissReason, canRemind: boolean): string {
  if (reason === 'not_called') return `${NOT_YET[kind]} Want me to?`;
  if (reason === 'awaiting_yes') return AWAITING[kind];
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
  const m = text.match(/[.!?]+\s/);
  return m?.index === undefined ? 0 : m.index + m[0].length;
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
  const { done, awaiting, failed } = callActions(chatCtx);
  const open = new Set(Object.keys(tools.functionTools ?? {}).flatMap(kindsOfTool));
  const reasonFor = (kind: ActionKind): MissReason =>
    !open.has(kind)
      ? 'no_tool'
      : awaiting.has(kind)
        ? 'awaiting_yes'
        : failed.has(kind)
          ? 'failed'
          : 'not_called';
  let id = '';
  let stringChunks = true;
  const out = (text: string): Chunk =>
    stringChunks ? text : { id, delta: { role: 'assistant', content: text } };
  const guarded = new ReadableStream<Chunk>({
    async start(controller) {
      let pending = '';
      let last = '';
      let said = false; // an honest line already went out
      let deferred: ActionKind | undefined;
      const calling = new Set<ActionKind>();
      const emit = (text: string): void => {
        if (!text) return;
        const spaced = last && !/\s$/.test(last) && !/^\s/.test(text) ? ` ${text}` : text;
        controller.enqueue(out(spaced));
        last = spaced;
      };
      const flush = (text: string): void => {
        const kind = claimedAction(text);
        if (!kind || done.has(kind)) return emit(text);
        const reason = reasonFor(kind);
        log.warn({ kind, reason }, 'ACTION_CLAIM_DROPPED');
        if (said || deferred) return;
        if (reason === 'not_called') {
          deferred = kind;
          return;
        }
        said = true;
        const line = honestLine(kind, reason, open.has('reminder'));
        emit(line);
      };
      try {
        for (let next = await reader.read(); !next.done; next = await reader.read()) {
          const chunk = next.value;
          const content = contentOf(chunk);
          if (content === undefined) {
            // A tool call goes out after the words before it, as the model wrote them.
            if (pending) flush(pending);
            pending = '';
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
            flush(pending.slice(0, end));
            pending = pending.slice(end);
          }
        }
        if (pending) flush(pending);
        if (deferred && !said && !calling.has(deferred)) {
          emit(honestLine(deferred, 'not_called', open.has('reminder')));
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
