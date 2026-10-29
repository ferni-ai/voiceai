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
 *   not known yet, so a call claim (or a bare "I'm on it") is dropped with no
 *   line when the reply calls the tool (its result is spoken next), and asks
 *   again when it doesn't.
 *   Prod call 2026-10-17: on the yes Nayan said "Well, I'm placing the call
 *   now." and the call was held until 9:00 AM their time.
 * - Ferni says he called emergency services or help (#1553), always false: the
 *   way to real help goes out instead (emergency-correction.ts).
 * Everything else streams untouched, so the confirm read-back, the yes turn's
 * other words (outreach-confirm.ts), a tool the model is about to call, and talk about an
 * action that really happened are never changed. Text and tool calls keep
 * their order. ACTION_CLAIM_GUARD=off turns the guard off. Logs carry the kind
 * and the reason, never words.
 * With ACTION_CLAIM_PAST=on (off by default), a plain past report ("I booked it.",
 * "I sent it.") is held too, but only when a tool of its kind was open and none ran.
 * With GROUNDED_CLAIMS=on (off by default), a held call or message claim, "I checked" and "let
 * me look" stand only on a tool's run (flags/GROUNDED_CLAIMS.ts; #3003, #3005, #3006).
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
import { bareOnIt, callActions, claimedAction, pastClaim, kindsOfTool } from './action-claims.js';
import { isLookupTool, lookupKind, withAnnouncedCheckLog } from './announced-check.js';
import { withCallerVoiceGuard } from './caller-voice-guard.js';
import { withHouseFactsGuard } from './house-facts.js';
import { CRISIS_TALK } from './emergency-claim.js';
import { honestLine, inPlace, type ClaimKind, type MissReason } from './honest-line.js';
import type { Kinds, SeenActions } from './honest-line.js';
import { emergencyCheck, emergencyCorrection } from './emergency-correction.js';
import { clauseSafeFor, FirstClauseFlush, firstClauseFlushEnabled } from './first-clause-flush.js';
import { plain, spokenOf, type Item } from './spoken-words.js';
import {
  askedCallLine,
  askedCallLookup,
  callOutcomeUnheard,
  claimsFromBefore,
  unheardLine,
  type AskedCallStatus,
} from './call-narration.js';
import { kindsRunThisTurn, offerFor, promisedAction, reportsBack } from './action-promises.js';
import { firestoreCallRecords, type CallRecords } from '../../services/outreach/call-status.js';
import { sessionIdIn, turnHoldTimer } from '../../speech/output-control/turn-timing.js';
import { contentOf, type ReplyChunk as Chunk } from './reply-chunks.js';

const log = createLogger({ module: 'ActionClaimGuard' });

/** A calendar tool that books a schedule item, so it saves to Ferni's own list here (#1547). */
const isCalendarCreate = (name: string): boolean =>
  /calendar/i.test(name) && kindsOfTool(name).includes('schedule');

export function actionClaimGuardEnabled(env: Env = process.env): boolean {
  return flagOn('ACTION_CLAIM_GUARD', env);
}

/** Also check plain past reports ("I booked it.") against the tools (action-claims.ts pastClaim). */
export function actionClaimPastEnabled(env: Env = process.env): boolean {
  return flagOn('ACTION_CLAIM_PAST', env);
}

/** Stream turns with no action in play (off: every turn holds, as before). */
export function actionClaimStreamEnabled(env: Env = process.env): boolean {
  return flagOn('ACTION_CLAIM_STREAM', env);
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
const ASK_SHAPE = new RegExp(
  `\\b(?:(?:can|could|would|will) you|please|i need you to|i want you to|go ahead|for me|help|${CRISIS_TALK}|(?:my|your|our) (?:\\w+ )?(?:mom|mum|mother|mama|dad|father|papa|sister|sis|brother|bro|grandma|grandmother|gran|nana|grandpa|grandfather|aunt|auntie|uncle|cousin|wife|husband|partner|girlfriend|boyfriend|son|daughter|kids?|friend|bestie|boss|doctor|dentist|therapist|landlord|teacher|neighbou?r|family|roommate)|her|him|them)\\b`,
  'i'
);
/** Someone named mid-sentence: a capitalised word other than Ferni's name (case matters here). */
const NAMED = /\s(?!(?:Ferni|Fern)\b)[A-Z][a-z]+/;

/** How many of the caller's (and Ferni's) latest messages can put an action in play. */
const ASK_WINDOW = 6;

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
  caller:
    | string
    | {
        personaId?: string;
        userId?: string;
        calls?: CallRecords;
        userProfile?: { contactInfo?: { phone?: string; email?: string } } | null;
      } = 'ferni',
  env: Env = process.env
): Promise<T> {
  const who = typeof caller === 'string' ? { personaId: caller } : caller;
  // How long the first words wait here, for the TURN_RECEIPT (turn-timing.ts).
  const firstWords = turnHoldTimer(sessionIdIn(caller), 'actionClaim');
  // Asked "how did it go with my dad?": where that requested call stands, read alongside the reply.
  const words = lastCallerWords(chatCtx);
  const calls = who.calls ?? firestoreCallRecords;
  const asked = actionClaimGuardEnabled(env)
    ? askedCallLookup(words, who.userId, calls)
    : undefined;
  // House facts read the model's own words, before the claim check re-splits "SITE.AI" at the capital.
  const facts = withHouseFactsGuard(reply, chatCtx, env, {
    personaId: who.personaId,
    contact: who.userProfile?.contactInfo,
  });
  const checked = await checkActionClaims(facts, chatCtx, tools, env, asked, firstWords);
  return withCallerVoiceGuard(checked, env, who.personaId ?? 'ferni');
}

/** The claim check alone; withActionClaimCheck runs the house facts guard before it, the caller voice guard after. */
async function checkActionClaims<T>(
  reply: Promise<T> | T,
  chatCtx: { items: readonly unknown[] },
  tools: { functionTools?: Record<string, unknown> },
  env: Env,
  askedLookup?: Promise<AskedCallStatus>,
  firstWords?: ReturnType<typeof turnHoldTimer>
): Promise<T> {
  const stream = await reply;
  // Either way the reply is also tapped for "I'll check" with no tool call (announced-check.ts).
  if (stream === null || stream === undefined) return stream;
  if (!actionClaimGuardEnabled(env)) return withAnnouncedCheckLog(stream, tools, env);
  const reader = (stream as unknown as ReadableStream<Chunk>).getReader();
  const { done, failed, awaiting, elsewhere, held, heldWhen }: SeenActions = callActions(chatCtx);
  const grounded = flagOn('GROUNDED_CLAIMS', env); // claims stand only on a tool's run
  // A plain yes to the read-back: the tool sends on its next call, so the claim may stand.
  const yesTurn = isClearYes(lastCallerWords(chatCtx));
  const toolNames = Object.keys(tools.functionTools ?? {});
  const open = new Set<ClaimKind>(toolNames.flatMap(kindsOfTool));
  if (toolNames.some(isLookupTool)) open.add('lookup');
  // Only a calendar create can make "on your calendar" false here; other bookings are not held (#1547).
  const calendarCreateOpen = toolNames.some(isCalendarCreate);
  const hold = !actionClaimStreamEnabled(env) || actionInPlay(chatCtx);
  const isEmergency = emergencyCheck(chatCtx);
  // A story of how a call went that no result came back from (call-narration.ts).
  const callRan = [done, awaiting, failed, held].some((kinds) => kinds.has('call'));
  const unheard = callOutcomeUnheard(chatCtx, callRan, await askedLookup, grounded);
  /** Why a claim of this kind is false, or null when it may stand. */
  const missing = (kind: ClaimKind, calling: Kinds): MissReason | null =>
    !open.has(kind)
      ? 'no_tool'
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
  // A tool that ran since the caller last spoke already answers a promise of its kind.
  const ranThisTurn = kindsRunThisTurn(chatCtx);
  const before: Kinds = claimsFromBefore(chatCtx); // a call result in the conversation, or asked
  /** Why a promise ("I'll text him") is not kept yet, or null when it may stand (action-promises.ts). */
  const unkept = (kind: ClaimKind, calling: Kinds): MissReason | null =>
    calling.has(kind) || ranThisTurn.has(kind) || (awaiting.has(kind) && !yesTurn)
      ? null // its tool runs in this reply, ran this turn, or this is the read-back
      : (missing(kind, calling) ?? 'promised');
  /** Why a plain past report ("I sent it.") is false, or null: no tool open, or its latest run went out. */
  const unrun = (kind: ClaimKind, calling: Kinds): MissReason | null =>
    !open.has(kind) || calling.has(kind) || done.has(kind)
      ? null
      : (missing(kind, calling) ?? 'uncalled');
  /** GROUNDED_CLAIMS: a held call or message claim with no run of its tool behind it. */
  const unbacked = (kind: ClaimKind, calling: Kinds): MissReason | null => {
    const ran = [calling, ranThisTurn, done, awaiting, before].some((kinds) => kinds.has(kind));
    return grounded && hold && (kind === 'call' || kind === 'send') && !ran ? 'uncalled' : null;
  };
  /**
   * What one sentence claims or promises, and why that is false (reason null: it may stand).
   * An emergency claim is judged first, so "I'll call 911 for you" never becomes an offer.
   */
  const judge = (text: string, calling: Kinds) => {
    if (isEmergency(text))
      return { kind: 'call', reason: 'emergency', claimed: 'call', promised: null } as const;
    // On the yes to a call, "I'm on it" says the call is under way too.
    const onIt = ahead('call') && bareOnIt(text) ? 'call' : null;
    const claimed = claimedAction(text) ?? reportsBack(text, env) ?? onIt;
    // "I'll text him then": a promise only a tool call in this reply keeps (action-promises.ts).
    const promised = hold ? promisedAction(text, env) : null;
    // "I booked it.": only with its tool open and none run, in this reply or earlier on the call.
    const past = !claimed && actionClaimPastEnabled(env) ? pastClaim(text) : null;
    const lookup = grounded && !claimed && !past && !promised ? lookupKind(text, hold) : null;
    const kind = claimed ?? past ?? promised ?? lookup;
    const reason = !kind
      ? null
      : claimed
        ? (missing(kind, calling) ?? unbacked(kind, calling))
        : past
          ? unrun(past, calling)
          : unkept(kind, calling);
    return { kind, reason, claimed, promised };
  };
  /** A call claimed on the yes, before the call tool has said whether anything rang. */
  const ahead = (kind: ClaimKind): boolean => kind === 'call' && yesTurn && awaiting.has(kind);
  // FIRST_CLAUSE_FLUSH: a held reply's first clause goes early when it names no action (first-clause-flush.ts).
  const firstClause = new FirstClauseFlush(hold && firstClauseFlushEnabled(env));
  const talk = (c: string): boolean =>
    ACTION_TALK.test(plain(c)) || (grounded && !!lookupKind(c, true));
  const clauseSafe = clauseSafeFor(ahead('call'), unheard, talk);
  let id = '';
  let stringChunks = true;
  const out = (text: string): Chunk => {
    firstWords?.stop(); // the first words out of the guard
    return stringChunks ? text : { id, delta: { role: 'assistant', content: text } };
  };
  const guarded = new ReadableStream<Chunk>({
    async start(controller) {
      let pending = '';
      let passed = 0; // how much of pending already streamed out
      let last = '';
      let said = false; // an honest line already went out
      const correctEmergency = emergencyCorrection(); // the emergency line, once per reply
      let lineLast = false; // the last thing out was an honest line
      // `text` is the held sentence, kept until the reply shows whether the claim came true.
      // `afterWords`: something was already said before the claim this reply.
      let deferred:
        | {
            kind: ClaimKind;
            reason: MissReason;
            text?: string;
            offer?: string;
            afterWords: boolean;
          }
        | undefined;
      // Held sentences that follow an uncalled claim, released in order once the claim resolves.
      const queued: string[] = [];
      let early: ClaimKind | undefined; // a call claimed ahead of its tool's result
      const calling = new Set<ClaimKind>();
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
      /** Held words go out in order: behind an uncalled claim's sentence, or now. */
      const release = (text: string): void => {
        if (deferred?.reason === 'uncalled' || deferred?.reason === 'promised') queued.push(text);
        else emit(text);
      };
      /** A whole sentence is checked; held ones go out (less the first clause sent) unless they claim. */
      const flush = (whole: string): void => {
        const text = whole.slice(firstClause.sent);
        const { kind, claimed, promised, reason: judged } = judge(whole, calling);
        let reason = judged;
        if (kind && !reason && hold && ahead(kind)) {
          log.warn({ kind, reason: 'before_result', held: hold }, 'ACTION_CLAIM_DROPPED');
          early ??= kind; // said nothing yet: the tool's result is spoken next
          return;
        }
        // "I'll call her now" claims and promises: it stands only with its tool in this reply.
        if (claimed && !reason && promised === claimed) reason = unkept(claimed, calling);
        if (!kind || !reason) {
          if (hold) release(text);
          return;
        }
        log.warn({ kind, reason, held: hold }, 'ACTION_CLAIM_DROPPED');
        if (reason === 'emergency') {
          const { line, rest } = correctEmergency(text, hold);
          if (line) emit(line);
          if (line) said = lineLast = true;
          if (rest) release(rest);
          return;
        }
        if (said || deferred) return;
        // A call of the kind later in this reply makes the claim true, so a held claim waits for the
        // reply to show. Streamed words cannot wait, so they are corrected at once.
        const waits = reason === 'uncalled' || reason === 'promised';
        if (reason === 'failed' || reason === 'elsewhere' || (waits && hold)) {
          // An unkept promise is asked as an offer instead ("Want me to text him?").
          const offer = reason === 'promised' ? offerFor(whole, grounded) : undefined;
          deferred = {
            kind,
            reason,
            text: hold ? text : undefined,
            offer,
            afterWords: last !== '',
          };
          return;
        }
        said = true;
        const line = honestLine(kind, reason, open.has('reminder'), heldWhen);
        emit(hold ? line : `Scratch that, ${line}`);
        lineLast = true;
      };
      /** A story of how an unheard call went: dropped, and said honestly once. */
      const told = (text: string): boolean => {
        if (!unheard?.tells(text)) return false;
        log.warn({ kind: 'call', reason: 'unheard', held: hold }, 'ACTION_CLAIM_DROPPED');
        if (said) return true;
        said = true;
        const line =
          unheard.asked !== undefined
            ? askedCallLine(unheard.asked) // the call they asked about: where it stands
            : held.has('call')
              ? honestLine('call', 'held', false, heldWhen)
              : unheardLine(grounded, callRan);
        emit(hold ? line : `Scratch that, ${line}`);
        lineLast = true;
        return true;
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
              if (pending && !told(pending)) flush(pending);
              pending = '';
              passed = 0;
              firstClause.close();
            }
            for (const name of names) kindsOfTool(name).forEach((k) => calling.add(k));
            if (names.some(isLookupTool)) calling.add('lookup'); // a look-up keeps "let me look"
            if (names.some(isCalendarCreate)) calendarCalled = true;
            // A create came after the claim. A create only saves to Ferni's own list (#1547), so the
            // claim is still false: the honest line replaces it, and what followed goes out after.
            const waiting = deferred?.reason === 'uncalled' || deferred?.reason === 'promised';
            if (deferred && waiting && calling.has(deferred.kind)) {
              if (deferred.text) {
                const elsewhereNow = deferred.reason === 'uncalled' && calendarCalled;
                emit(elsewhereNow ? honestLine(deferred.kind, 'elsewhere', false) : deferred.text);
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
          if (content) firstWords?.start(); // the model's first words in
          pending += content;
          for (let end = sentenceEnd(pending); end > 0; end = sentenceEnd(pending)) {
            if (!hold) pass(pending.slice(passed, end)); // the rest of this sentence, then any correction
            if (!told(pending.slice(0, end))) flush(pending.slice(0, end));
            pending = pending.slice(end);
            passed = 0;
            firstClause.close();
          }
          if (!hold) {
            pass(pending.slice(passed));
            passed = pending.length;
          } else emit(pending.slice(0, firstClause.take(pending, clauseSafe))); // first clause, once
        }
        if (pending && !told(pending)) flush(pending);
        if (deferred && !said && !calling.has(deferred.kind)) {
          const line =
            deferred.offer ?? honestLine(deferred.kind, deferred.reason, open.has('reminder'));
          // The held words after the claim go with its line, unless a call claimed early speaks next.
          const after = early ? [] : queued.splice(0);
          if (deferred.kind === 'lookup' && !deferred.offer) after.length = 0; // what "I checked" found
          for (const text of inPlace(line, deferred.afterWords, after)) emit(text);
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
