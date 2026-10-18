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
 * booking, a reminder or a save (action-claims.ts) is dropped in these cases
 * only, and one honest line says what happened and what he can do instead:
 * - no tool of that kind is open this turn (it doesn't exist here, or is off):
 *   he can't do that for them; the line goes where the claim was;
 * - the latest tool result of that kind on this call refused or failed: it
 *   didn't go through; the line goes at the end, and not at all when the reply
 *   calls a tool of that kind again;
 * - the latest tool result of that kind is a read-back still waiting for the
 *   caller's yes (outreach-confirm.ts), and the caller's last words were not a
 *   plain yes: nothing has gone out; the line goes where the claim was and asks.
 *   Prod call 2026-10-16: after "NOT SENT YET" Ferni said "I am dialing her
 *   now", then "I'll take care of that call to your mom right now". No call went.
 * - the latest call result is held for a better hour (deferred-calls.ts): nothing
 *   rang yet; the line goes where the claim was and says when it will.
 * - on the caller's yes, before the call tool has returned: whether it rang is
 *   not known yet, so a call claim is dropped with no line when the reply calls
 *   the tool (its result is spoken next), and asks again when it doesn't.
 *   Prod call 2026-10-17: on the yes Nayan said "Well, I'm placing the call
 *   now." and the call was held until 9:00 AM their time.
 * - a claim that emergency services were called or help is coming (#1553):
 *   Ferni can't reach them, so it is always false, whatever the tools did; the
 *   line says nobody was called and to call 911 or 988 now (emergency-claim.ts).
 *   "Help is on the way" stands once the caller has said they called for help.
 * Everything else streams untouched, so the confirm read-back, the yes turn's
 * other words (outreach-confirm.ts), a tool the model is about to call, and talk about an
 * action that really happened are never changed. Text and tool calls keep
 * their order. ACTION_CLAIM_GUARD=off turns the guard off. Logs carry the kind
 * and the reason, never words.
 *
 * Holding a sentence delays the first audio (dev A/B, increment 3: about
 * 0.2-0.5 s, a whole model chunk). With ACTION_CLAIM_STREAM=on (off by default,
 * so every turn holds as before), sentences are held only when an action is in play: the caller asked for one in their last few turns, or a tool of
 * that kind ran on this call. A sentence ending a chunk goes out at once. On
 * every other turn the words stream as they come and a claim, rare there, is
 * corrected by the honest line straight after it.
 *
 * @module agents/personas/action-claim-guard
 */
import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

import { flagOn, type Env } from '../../config/env-flag.js';
import { isClearYes } from '../../tools/domains/communication/outreach/outreach-confirm.js';
import { createLogger } from '../../utils/safe-logger.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';
import {
  callActions,
  claimedAction,
  emergencyClaim,
  kindsOfTool,
  type ActionKind,
} from './action-claims.js';
import { withAnnouncedCheckLog } from './announced-check.js';
import { withCallerVoiceGuard } from './caller-voice-guard.js';
import { EMERGENCY_LINE, helpAlreadyCalled } from './emergency-claim.js';

const log = createLogger({ module: 'ActionClaimGuard' });

/** A calendar tool that books a schedule item, so it saves to Ferni's own list here (#1547). */
const isCalendarCreate = (name: string): boolean =>
  /calendar/i.test(name) && kindsOfTool(name).includes('schedule');

type Chunk = llm.ChatChunk | string | object;
/** 'uncalled': a create tool is open, but no create ran on this call for this claim (#1547). */
export type MissReason =
  'no_tool' | 'failed' | 'awaiting' | 'held' | 'uncalled' | 'elsewhere' | 'emergency';

export function actionClaimGuardEnabled(env: Env = process.env): boolean {
  return flagOn('ACTION_CLAIM_GUARD', env);
}

/** Stream turns with no action in play (off: every turn holds, as before). */
export function actionClaimStreamEnabled(env: Env = process.env): boolean {
  return flagOn('ACTION_CLAIM_STREAM', env);
}

const DID_NOT_GO: Record<ActionKind, string> = {
  call: "That call didn't go through, so nothing's been dialed.",
  send: "That didn't go through, so nothing's been sent.",
  ride: "That didn't go through, so no ride is booked.",
  schedule: "That didn't go through, so it isn't booked.",
  reminder: "That didn't go through, so there's no reminder set.",
  save: "That didn't go through, so it isn't saved.",
};
const CANNOT: Record<ActionKind, string> = {
  call: "I can't actually make calls for you, so I haven't rung anyone.",
  send: "I can't actually send messages for you, so nothing's gone out.",
  ride: "I can't actually order rides for you, so nothing's on its way.",
  schedule: "I can't actually book that for you, so it isn't booked.",
  reminder: "I can't actually set reminders for you, so there isn't one set.",
  save: "I can't actually save that for you, so it isn't saved.",
};
/** A yes/no question, since the gate sends only on a plain yes to it. */
const NOT_YET: Record<ActionKind, string> = {
  call: "I haven't actually dialed yet, though. Should I go ahead and call?",
  send: "Nothing's gone out yet, though. Should I go ahead and send it?",
  ride: 'No ride is booked yet, though. Should I go ahead and book it?',
  schedule: "It isn't booked yet, though. Should I go ahead and book it?",
  reminder: "It isn't set yet, though. Should I go ahead and set it?",
  save: "It isn't saved yet, though. Should I go ahead and save it?",
};
/** A held action: set for later, not done (only calls are held today). */
const HELD: Record<ActionKind, string> = {
  call: "I haven't dialed yet, though. The call is held for a better time.",
  send: "Nothing's gone out yet, though. It's held for a better time.",
  ride: "No ride is booked yet, though. It's held for later.",
  schedule: "It isn't booked yet, though. It's held for later.",
  reminder: "It isn't set yet, though. It's held for later.",
  save: "It isn't saved yet, though. It's held for later.",
};
const INSTEAD: Record<ActionKind, string> = {
  call: ' I can help you work out what to say, though.',
  send: ' I can help you word it, though.',
  ride: '',
  schedule: '',
  reminder: ' Maybe pop it in your phone so it nudges you.',
  save: '',
};
const REMIND = ' Want me to remind you to do it?';

/** What Ferni says in place of a claim, and what he can do instead. */
export function honestLine(
  kind: ActionKind,
  reason: MissReason,
  canRemind: boolean,
  when?: string
): string {
  if (reason === 'emergency') return EMERGENCY_LINE;
  if (reason === 'elsewhere') return "It's saved to Ferni's own list, not your calendar.";
  if (reason === 'awaiting' || reason === 'uncalled') return NOT_YET[kind];
  if (reason === 'held') {
    return kind === 'call' && when
      ? `I haven't dialed yet, though. I'll call ${when} their time.`
      : HELD[kind];
  }
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
  /\b(?:call\w*|cal|ring\w*|rang|rung|phon\w*|dial\w*|buzz|face ?time|whats ?app|text\w*|tex|txt|messag\w*|msg|dm|e-?mail\w*|send\w*|sent|ping\w*|contact\w*|reach\w*|hit (?:up|her|him|them)|holler|connect\w*|put (?:me )?through|loop (?:in|\w+ in)|get (?:my|her|him|them|\w+ for me)|(?:talk|speak) (?:to|with) (?:my|her|him|them)|ask (?:my|her|him|them)\b|hold of|ahold|on the line|tell (?!me\b)\w+|let (?:her|him|them|my \w+|\w+) know|order\w*|buy\w*|bought|pay\w*|purchas\w*|book\w*|schedul\w*|set (?:\w+ ){0,2}up|sort (?:\w+ ){0,2}out|cab|taxi|uber|lyft|ride|table|get (?:me|us) in|notify|inform\w*|needs? to know|reserv\w*|appointment\w*|meeting|calendar|remind\w*|wake me|alarm\w*|timer\w*|sav\w*|remember\w*|write (?:that|it|this) down|jot|note\w*|number\w*|llam\w*|appel\w*|anruf\w*|ruf|chiam\w*|liga\w*)\b|\d{3}/i;
/**
 * The fallback when the ask's wording is new: any request, anyone named in it, or an
 * emergency. A wrong match only costs a held sentence; a missed ask speaks a claim.
 * Case-blind, since speech-to-text capitalises the start of every sentence.
 */
const ASK_SHAPE =
  /\b(?:(?:can|could|would|will) you|please|i need you to|i want you to|go ahead|for me|ambulance|911|police|emergency|fire department|help|hurt\w*|fell|fallen|(?:can'?t|cannot|can not) breathe|heart attack|chest|bleed\w*|breaking in|broke in|overdos\w*|suicid\w*|not breathing|collaps\w*|passed out|unconscious|stroke|chok\w*|seizure|fire|accident|gun|knife|cops|kill (?:my|him|her)sel(?:f|ves)|end it all|(?:don'?t|do not) want to (?:live|be here)|ayuda|hilfe|socorro|aiuto|au secours|(?:my|your|our) (?:\w+ )?(?:mom|mum|mother|mama|dad|father|papa|sister|sis|brother|bro|grandma|grandmother|gran|nana|grandpa|grandfather|aunt|auntie|uncle|cousin|wife|husband|partner|girlfriend|boyfriend|son|daughter|kids?|friend|bestie|boss|doctor|dentist|therapist|landlord|teacher|neighbou?r|family|roommate)|her|him|them)\b/i;
/** Someone named mid-sentence: a capitalised word other than Ferni's name (case matters here). */
const NAMED = /\s(?!(?:Ferni|Fern)\b)[A-Z][a-z]+/;

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
/** Ferni offered to act ("Should I text your sister?"), so the caller's "Yes." asks for it. */
const OFFER =
  /\b(?:want me to|should i|shall i|can i|could i|i can|i could|i'll|i will|would you like|like me to|do you want|need me to|is it ok(?:ay)? if i|mind if i|how about i|happy to|say the word|let me know if|if you (?:want|like))\b/i;
/** A bare offer ("Want me to do that?") points at an action Ferni named a line or two before. */
const BARE_OFFER =
  /\b(?:want me to|should i|shall i|can i|do you want|need me to|happy to)\b.*\?|^(?:should i|want me to)\??$/i;
const actedOn = (text: string): boolean =>
  HONEST_SAID.test(text) ||
  text
    .split(/(?<=[.!?])\s+/)
    .some(
      (part) =>
        claimedAction(part) !== null ||
        (OFFER.test(part) && (ACTION_TALK.test(part) || ASK_SHAPE.test(part)))
    );
/** Curly apostrophes from speech-to-text read as straight ones. */
const plain = (text: string): string => text.replace(/[\u2018\u2019]/g, "'");

/** The caller's latest words. */
function lastCallerWords(chatCtx: { items: readonly unknown[] }): string {
  const asks = (chatCtx.items as readonly Item[]).filter(
    (item) => item.type === 'message' && item.role === 'user'
  );
  return asks.length ? plain(spokenOf(asks[asks.length - 1])) : '';
}

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
  const said = items
    .filter((item) => item.type === 'message' && item.role === 'assistant')
    .map((item) => plain(spokenOf(item)));
  const recent = said.slice(-ASK_WINDOW);
  if (recent.some(actedOn)) return true;
  if (
    recent.some(
      (line, i) =>
        BARE_OFFER.test(line) &&
        recent.slice(Math.max(0, i - 2), i + 1).some((l) => ACTION_TALK.test(l))
    )
  )
    return true;
  const asks = items.filter((item) => item.type === 'message' && item.role === 'user');
  return asks
    .map((item) => plain(spokenOf(item)))
    .filter(Boolean)
    .slice(-ASK_WINDOW)
    .some((text) => ACTION_TALK.test(text) || ASK_SHAPE.test(text) || NAMED.test(text));
}

/**
 * The model's reply, held a sentence at a time: a sentence claiming an action
 * no tool carried out is dropped, and one honest line goes in its place.
 */
export async function withActionClaimCheck<T>(
  reply: Promise<T> | T,
  chatCtx: { items: readonly unknown[] },
  tools: { functionTools?: Record<string, unknown> },
  persona = 'ferni',
  env: Env = process.env
): Promise<T> {
  return withCallerVoiceGuard(await checkActionClaims(reply, chatCtx, tools, env), env, persona);
}

/** The claim check alone; withActionClaimCheck also runs the caller voice guard after it. */
async function checkActionClaims<T>(
  reply: Promise<T> | T,
  chatCtx: { items: readonly unknown[] },
  tools: { functionTools?: Record<string, unknown> },
  env: Env
): Promise<T> {
  const stream = await reply;
  // Either way the reply is also tapped for "I'll check" with no tool call (announced-check.ts).
  if (stream === null || stream === undefined) return stream;
  if (!actionClaimGuardEnabled(env)) return withAnnouncedCheckLog(stream, tools, env);
  const reader = (stream as unknown as ReadableStream<Chunk>).getReader();
  const { done, failed, awaiting, elsewhere, held, heldWhen } = callActions(chatCtx);
  // A plain yes to the read-back: the tool sends on its next call, so the claim may stand.
  const yesTurn = isClearYes(lastCallerWords(chatCtx));
  const toolNames = Object.keys(tools.functionTools ?? {});
  const open = new Set(toolNames.flatMap(kindsOfTool));
  // Only a calendar create can make "on your calendar" false here; other bookings are not held (#1547).
  const calendarCreateOpen = toolNames.some(isCalendarCreate);
  const hold = !actionClaimStreamEnabled(env) || actionInPlay(chatCtx);
  const helpCalled = helpAlreadyCalled(chatCtx);
  /** Why a claim of this kind is false, or null when it may stand. */
  const missing = (kind: ActionKind, calling: ReadonlySet<ActionKind>): MissReason | null =>
    !open.has(kind)
      ? 'no_tool'
      : failed.has(kind)
        ? 'failed'
        : failed.has(kind)
          ? 'failed'
          : elsewhere.has(kind)
            ? 'elsewhere'
            : held.has(kind)
              ? 'held'
              : awaiting.has(kind) && !yesTurn
                ? 'awaiting'
                : kind === 'schedule' && calendarCreateOpen && !done.has(kind) && !calling.has(kind)
                  ? 'uncalled'
                  : null;
  /** Why this sentence's claim is false, or null. An emergency claim always is (#1553). */
  const reasonFor = (
    text: string,
    kind: ActionKind | null,
    calling: ReadonlySet<ActionKind>
  ): MissReason | null => {
    const emergency = kind === 'call' ? emergencyClaim(text) : null;
    if (emergency) return emergency === 'coming' && helpCalled ? null : 'emergency';
    return kind ? missing(kind, calling) : null;
  };
  /** A call claimed on the yes, before the call tool has said whether anything rang. */
  const ahead = (kind: ActionKind): boolean => kind === 'call' && yesTurn && awaiting.has(kind);
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
      let crisisSaid = false; // the emergency line already went out
      let lineLast = false; // the last thing out was an honest line
      // `text` is the held sentence, kept until the reply shows whether the claim came true.
      let deferred: { kind: ActionKind; reason: MissReason; text?: string } | undefined;
      // Held sentences that follow an uncalled claim, released in order once the claim resolves.
      const queued: string[] = [];
      let early: ActionKind | undefined; // a call claimed ahead of its tool's result
      const calling = new Set<ActionKind>();
      let calendarCalled = false; // a calendar create ran in this reply
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
        const reason = reasonFor(text, kind, calling);
        if (kind && !reason && hold && ahead(kind)) {
          log.warn({ kind, reason: 'before_result', held: hold }, 'ACTION_CLAIM_DROPPED');
          early ??= kind; // said nothing yet: the tool's result is spoken next
          return;
        }
        if (!kind || !reason) {
          if (!hold) return;
          if (deferred?.reason === 'uncalled') queued.push(text);
          else emit(text);
          return;
        }
        log.warn({ kind, reason, held: hold }, 'ACTION_CLAIM_DROPPED');
        // The way to real help goes out once, even after another honest line.
        if (reason === 'emergency') {
          if (!crisisSaid) {
            emit(hold ? EMERGENCY_LINE : `Scratch that, ${EMERGENCY_LINE}`);
            crisisSaid = said = lineLast = true;
          }
          return;
        }
        if (said || deferred) return;
        // A call of the kind later in this reply makes the claim true, so a held claim waits for the
        // reply to show. Streamed words cannot wait, so they are corrected at once.
        if (reason === 'failed' || reason === 'elsewhere' || (reason === 'uncalled' && hold)) {
          deferred = { kind, reason, text: hold ? text : undefined };
          return;
        }
        said = true;
        const line = honestLine(kind, reason, open.has('reminder'), heldWhen);
        emit(hold ? line : `Scratch that, ${line}`);
        lineLast = true;
      };
      try {
        for (let next = await reader.read(); !next.done; next = await reader.read()) {
          const chunk = next.value;
          const content = contentOf(chunk);
          if (content === undefined) {
            // A tool call goes out after the words before it, as the model wrote them. Other
            // chunks with no text (the Google plugin's usage chunk after every piece) pass by:
            // flushing on them cut words at the piece break ("cr ickets", "don' t").
            const names = toolNamesOf(chunk);
            if (names.length > 0) {
              if (pending) flush(pending);
              pending = '';
              passed = 0;
            }
            for (const name of names) kindsOfTool(name).forEach((k) => calling.add(k));
            if (names.some(isCalendarCreate)) calendarCalled = true;
            // A create came after the claim. A create only saves to Ferni's own list (#1547), so the
            // claim is still false: the honest line replaces it, and what followed goes out after.
            if (deferred?.reason === 'uncalled' && calling.has(deferred.kind)) {
              if (deferred.text) {
                emit(
                  calendarCalled ? honestLine(deferred.kind, 'elsewhere', false) : deferred.text
                );
              }
              for (const text of queued.splice(0)) emit(text);
              deferred = undefined;
            }
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
        if (deferred && !said && !calling.has(deferred.kind)) {
          emit(honestLine(deferred.kind, deferred.reason, open.has('reminder')));
        }
        // A yes the reply never acted on: nothing rang, so ask again.
        if (early && !said && !calling.has(early)) emit(honestLine(early, 'awaiting', false));
        for (const text of queued.splice(0)) emit(text);
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
  return withAnnouncedCheckLog(guarded as unknown as T, tools, env);
}
