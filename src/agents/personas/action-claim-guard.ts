/**
 * Ferni never says he did, or is doing, something a tool didn't do this turn.
 *
 * Prod call 2026-10-14: the caller asked Ferni to phone a relative and gave a
 * number. Ferni said he was calling right now and would report back once he
 * reached them. No call was placed: no on-behalf call tool was open to that
 * call, so nothing ran, and the model narrated the action instead.
 *
 * Every reply the model writes passes through here (ferni-agent.ts llmNode),
 * a sentence at a time. A sentence that claims a call, a text or email, a
 * booking, a reminder or a save, done or under way, is dropped unless a tool
 * of that kind returned a result this turn that is not a refusal or error
 * ("Nothing was sent", "NOT SENT YET", "I couldn't ..."). When one is dropped,
 * one honest line takes its place: Ferni can't do that from here (no such
 * tool this turn), it didn't go through (the tool failed or only previewed),
 * or he hasn't done it yet (the tool was there and not called), each with
 * what he can do instead. A claim in a reply that also calls a tool of that
 * kind is dropped without a line: the tool's result answers next.
 *
 * Offers and questions ("want me to call her?", "once you say yes I'll ring
 * her") and negations ("I can't call anyone") are not claims. Only English.
 * ACTION_CLAIM_GUARD=off turns the guard off. Logs carry the kind and the
 * reason, never the caller's or Ferni's words.
 *
 * @module agents/personas/action-claim-guard
 */
import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';

const log = createLogger({ module: 'ActionClaimGuard' });

type Chunk = llm.ChatChunk | string | object;

export type ActionKind = 'call' | 'send' | 'schedule' | 'reminder' | 'save';
const KINDS: readonly ActionKind[] = ['call', 'send', 'schedule', 'reminder', 'save'];
export type MissReason = 'no_tool' | 'failed' | 'not_called';

export function actionClaimGuardEnabled(env: Env = process.env): boolean {
  return flagOn('ACTION_CLAIM_GUARD', env);
}

const I = "(?:i'm|i am|i'll|i will|i've|i have|i just|i|we're|we've|we'll)";
const ADV = '(?:(?:just|now|already|actually|going to|gonna|about to|right now) )*';
const NOW = '(?:now|right now|right away|as we speak|straight away)';
const WHO = "(?:her|him|them|you|your \\w+|my \\w+|the \\w+|\\w+'s|\\w+)";
const CALL_VERB =
  '(?:call|calling|called|ring|ringing|rang|dial|dialing|dialled|dialed|phone|phoning|phoned)';
const SEND_VERB =
  '(?:text|texting|texted|message|messaging|messaged|email|emailing|emailed|send|sending|sent|post|posting|posted)';

/** Sentences that claim an action of each kind, done or under way. */
const CLAIMS: Record<ActionKind, RegExp[]> = {
  call: [
    new RegExp(`\\b${I} ${ADV}${CALL_VERB}\\b`),
    new RegExp(`\\b(?:calling|ringing|dialing|phoning) ${WHO}(?: \\w+)? ${NOW}\\b`),
    /\b(?:the call is|call's|it's|she's|he's|they're|phone's) (?:ringing|connecting|going through|placed|started|on its way)\b/,
    /\b(?:let you know|tell you|report back|get back to you)\b.{0,30}\b(?:reach|get (?:a ?hold|ahold) of|get through to|hear back from|talk to|speak to|speak with|talk with)\b/,
  ],
  send: [
    new RegExp(`\\b${I} ${ADV}${SEND_VERB}\\b`),
    /\b(?:text|message|email|note|it|that)(?: has| is|'s) (?:been )?(?:sent|on its way|gone out|delivered)\b/,
    /^\W*(?:sent|done, sent)\b/,
  ],
  schedule: [
    new RegExp(
      `\\b${I} ${ADV}(?:put|added|add|scheduled|schedule|scheduling|booked|book|booking)\\b.{0,40}\\b(?:calendar|schedule|appointment|meeting|event|reservation|table)\\b`
    ),
    /\b(?:it's|that's|you're|you are) (?:all )?(?:on your calendar|booked|scheduled|in the calendar)\b/,
  ],
  reminder: [
    new RegExp(
      `\\b${I} ${ADV}(?:set|added|created|scheduled|started) (?:a|the|your|that|an) (?:\\w+ )?(?:reminder|timer|alarm)\\b`
    ),
    /\b(?:reminder|timer|alarm)(?: is|'s| has been) (?:set|on|running|going|started)\b/,
    new RegExp(`\\b${I} ${ADV}(?:remind|reminding) you\\b`),
  ],
  save: [
    new RegExp(
      `\\b${I} ${ADV}(?:saved|stored|written down|wrote down|logged|added) (?:it|that|this|those)\\b`
    ),
    /\b(?:it's|that's|it is|that is) (?:been )?(?:saved|stored|logged)\b/,
    /^\W*(?:saved|done, saved|got it, saved)\b/,
  ],
};

/** An offer, a question, a condition or a negation: not a claim that it happened. */
const NOT_A_CLAIM =
  /\?|\b(?:want me to|should i|shall i|can i|could i|i can|i could|i'd|i would|would you like|do you want|if you(?:'d)? (?:want|like)|if you say|once you|after you|when you say|say the word|let me know if|can't|cannot|couldn't|won't|wasn't able|haven't|hasn't|didn't|don't|not|never|unable|no way to)\b/;

/**
 * Ferni's own life ("I called my sister last week") and idioms ("sending you
 * good vibes", "I called it", "I'm calling it a night"): not an action now.
 */
const NOT_AN_ACTION =
  /\b(?:yesterday|last (?:night|week|month|year|time)|ago|when i was|used to|back when|the other day|years|growing up|as a kid)\b|\bsend(?:ing)? (?:you )?(?:\w+ )?(?:love|hugs?|vibes|strength|thoughts|prayers|energy|luck|warmth|kindness)\b|\b(?:called it|call(?:ing)? it (?:a night|a day|quits|now))\b/;

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** The kind of action a sentence claims was done or is under way, or null. */
export function claimedAction(sentence: string): ActionKind | null {
  const text = normalize(sentence);
  if (!text || NOT_A_CLAIM.test(text) || NOT_AN_ACTION.test(text)) return null;
  return KINDS.find((kind) => CLAIMS[kind].some((re) => re.test(text))) ?? null;
}

/** Tool names by the kind of action they carry out (lower case). */
const TOOL_KINDS: Record<ActionKind, RegExp> = {
  call: /^(?:callonbehalf|callandconverse|quickcall|reachout|multioutreach|makephonecall|backgroundcall|invitefriendbycall|calluser|callcontact|haveferni?call|callforconversation|call_make|telephony_call)$/,
  send: /^(?:reachout|multioutreach|quicktext|quickemail|send\w*|backgroundfollowup|post\w*|sms_send|message_send)$/,
  schedule:
    /^(?:\w*calendar\w*|\w*event\w*|\w*appointment\w*|\w*reservation\w*|book\w*|schedule(?!reminder)\w*)$/,
  reminder: /^\w*(?:remind|timer|alarm)\w*$/,
  save: /^(?:remember\w*|save\w*|addtask|addnote|\w*journal\w*|loghabit\w*|createhabit)$/,
};

export function kindsOfTool(name: string): ActionKind[] {
  const id = name.toLowerCase();
  return KINDS.filter((kind) => TOOL_KINDS[kind].test(id));
}

/** A tool result that says the action did not happen. */
const REFUSAL =
  /^\W*(?:nothing was|not sent yet|sorry|i couldn't|i could not|i can't|i cannot|i don't|i wasn't|couldn't|could not|unable|failed|error|cannot)\b|"success"\s*:\s*false|"error"\s*:/i;

function outputText(output: unknown): string {
  if (typeof output !== 'string') return JSON.stringify(output ?? '');
  try {
    const value: unknown = JSON.parse(output);
    return typeof value === 'string' ? value : output;
  } catch {
    return output;
  }
}

interface ItemView {
  type?: string;
  role?: string;
  name?: string;
  output?: unknown;
  isError?: boolean;
  textContent?: string;
}

/** What this turn's tools did: kinds that succeeded, and kinds that ran but did not. */
export function turnActions(chatCtx: { items: readonly unknown[] }): {
  done: Set<ActionKind>;
  failed: Set<ActionKind>;
} {
  const items = chatCtx.items as readonly ItemView[];
  let start = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    const caller = item.type === 'message' && item.role === 'user';
    if (caller && !(item.textContent ?? '').startsWith(TURN_CONTEXT_HEADER)) {
      start = i + 1;
      break;
    }
  }
  const done = new Set<ActionKind>();
  const failed = new Set<ActionKind>();
  for (const item of items.slice(start)) {
    if (item.type !== 'function_call_output') continue;
    const ok = !item.isError && !REFUSAL.test(outputText(item.output).trim());
    for (const kind of kindsOfTool(item.name ?? '')) (ok ? done : failed).add(kind);
  }
  for (const kind of done) failed.delete(kind);
  return { done, failed };
}

const NOT_YET: Record<ActionKind, string> = {
  call: "I haven't placed that call yet.",
  send: "I haven't sent anything yet.",
  schedule: "I haven't added that yet.",
  reminder: "I haven't set that yet.",
  save: "I haven't saved that yet.",
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
  schedule: "I can't put things on your calendar from here, so that isn't booked.",
  reminder: "I can't set reminders from here, so there isn't one set.",
  save: "I can't save that from here, so it isn't saved.",
};
const INSTEAD: Record<ActionKind, string> = {
  call: ' I can help you work out what to say, though.',
  send: ' I can help you word it, though.',
  schedule: '',
  reminder: " Jot it down somewhere you'll see it.",
  save: '',
};
const REMIND = ' I can set a reminder for you to do it, if you like.';

/** What Ferni says in place of a claim, and what he can do instead. */
export function honestLine(kind: ActionKind, reason: MissReason, canRemind: boolean): string {
  if (reason === 'not_called') return `${NOT_YET[kind]} Want me to?`;
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

const sessionIdOf = (session: unknown): string | undefined =>
  (session as { userData?: { services?: { sessionId?: string } } } | undefined)?.userData?.services
    ?.sessionId;

/**
 * The model's reply, held a sentence at a time: a sentence claiming an action
 * no tool did this turn is dropped, and one honest line goes in its place.
 */
export async function withActionClaimCheck<T>(
  reply: Promise<T> | T,
  chatCtx: { items: readonly unknown[] },
  tools: { functionTools?: Record<string, unknown> },
  session?: object,
  env: Env = process.env
): Promise<T> {
  const stream = await reply;
  if (stream === null || stream === undefined || !actionClaimGuardEnabled(env)) return stream;
  const reader = (stream as unknown as ReadableStream<Chunk>).getReader();
  const { done, failed } = turnActions(chatCtx);
  const open = new Set(Object.keys(tools.functionTools ?? {}).flatMap(kindsOfTool));
  const reasonFor = (kind: ActionKind): MissReason =>
    !open.has(kind) ? 'no_tool' : failed.has(kind) ? 'failed' : 'not_called';
  let template: Chunk = '';
  const out = (text: string): Chunk =>
    typeof template === 'string'
      ? text
      : { ...(template as llm.ChatChunk), delta: { role: 'assistant', content: text } };
  const guarded = new ReadableStream<Chunk>({
    async start(controller) {
      let pending = '';
      let last = '';
      const dropped: ActionKind[] = [];
      const calling = new Set<ActionKind>();
      const flush = (text: string): void => {
        const kind = claimedAction(text);
        if (kind && !done.has(kind)) {
          dropped.push(kind);
          return;
        }
        if (text) controller.enqueue(out(text));
        last = text || last;
      };
      try {
        for (let next = await reader.read(); !next.done; next = await reader.read()) {
          const chunk = next.value;
          const content = contentOf(chunk);
          if (content === undefined) {
            for (const name of toolNamesOf(chunk)) kindsOfTool(name).forEach((k) => calling.add(k));
            controller.enqueue(chunk);
            continue;
          }
          template = chunk;
          pending += content;
          for (let end = sentenceEnd(pending); end > 0; end = sentenceEnd(pending)) {
            flush(pending.slice(0, end));
            pending = pending.slice(end);
          }
        }
        if (pending) flush(pending);
        // A claim beside a call to a tool of its kind waits for that tool's result instead.
        const kind = dropped.find((k) => !calling.has(k));
        if (dropped.length > 0) {
          log.warn(
            {
              sessionId: sessionIdOf(session),
              kinds: dropped,
              reason: reasonFor(kind ?? dropped[0]),
              toolCalled: !kind,
            },
            'ACTION_CLAIM_DROPPED'
          );
        }
        if (kind) {
          const line = honestLine(kind, reasonFor(kind), open.has('reminder'));
          controller.enqueue(out(`${last && !/\s$/.test(last) ? ' ' : ''}${line}`));
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
