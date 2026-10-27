/**
 * Which of the owner's words answer a read-back, and what they say (outreach-confirm.ts).
 *
 * Owner call 10-26 18:48: "Yeah, go ahead and call." placed nothing because "What's his name
 * again?" and a "not" said BEFORE Ferni read the call back again were judged with it. The answer
 * window is the owner's turns after Ferni's latest read-back of this action (an assistant turn
 * that asks about it, e.g. "Should I go ahead and call?"); a question Ferni then answered drops
 * out of it. With no read-back heard, the window starts where the preview reached the model.
 *
 * Inside the window: the fast path (consent-words.ts) takes a plain yes or a plain no; the
 * judge (consent-judge.ts) reads the rest. A veto keeps any no, deferral or redirect from ever
 * being taken as a yes ("Okay, he can call you.", "Okay, check in with me."), whoever judged it.
 *
 * @module tools/domains/communication/outreach/consent-window
 */

import { judge, judgedNow, type ConsentInput } from './consent-judge.js';
import { isClearYes, isPlainNo, words } from './consent-words.js';
import { familyOf } from './outreach-confirm-family.js';
import type { ConfirmEvent, PendingAction } from './outreach-confirm.js';

export type Channel = ConsentInput['channel'];
export type ConfirmState = 'confirmed' | 'waiting' | 'void' | 'unclear' | 'declined';

const PLACES_A_CALL = new Set(['callOnBehalf', 'callAndConverse', 'callUser']);

export function channelOf(pending: Pick<PendingAction, 'toolId' | 'args'>): Channel {
  const family = familyOf(pending.toolId, pending.args);
  if (PLACES_A_CALL.has(pending.toolId) || family === 'call') return 'call';
  return family === 'text' || pending.toolId === 'quickText' ? 'text' : 'other';
}

const CHANNEL_WORDS: Record<Channel, RegExp> = {
  call: /\b(call|dial|ring|phone)/i,
  text: /\b(text|message|send)/i,
  other: /\b(send|email|post|go ahead)/i,
};
const KIN = new Set(
  words(
    'mom mum mother dad father sister brother wife husband son daughter grandma grandpa aunt uncle'
  )
);

/** Whom it reaches, in words: the names asked for and the name read back ("a call to Dad at …"). */
const NAME_KEYS = ['contactQuery', 'contactName', 'contact', 'friendName', 'recipientName'];
function targetWords(pending: PendingAction): string[] {
  const asked = NAME_KEYS.flatMap((k) => words(String(pending.args[k] ?? '')));
  return [...asked, ...words(personOf(pending))];
}

/** The person in the read-back ("a call to Dad at 555…" → "Dad"), else the name asked for. */
export function personOf(pending: Pick<PendingAction, 'readBack' | 'args'>): string {
  const named = / to (.+?)(?: at |, |$)/.exec(pending.readBack)?.[1]?.trim();
  const asked = NAME_KEYS.map((k) => pending.args[k]).find(
    (a) => typeof a === 'string' && a.trim()
  );
  return named || (asked as string | undefined) || 'them';
}

/** Whether the words name this channel ("call him", "send her a text"). */
export function mentionsChannel(text: string, channel: Channel): boolean {
  return CHANNEL_WORDS[channel].test(text);
}

/** Ferni asking about this action again: a question with its channel, naming nobody else. */
export function isReadBack(text: string, channel: Channel, target: readonly string[]): boolean {
  if (!text.includes('?') || !CHANNEL_WORDS[channel].test(text)) return false;
  return !words(text).some((w) => KIN.has(w) && !target.includes(w));
}

// STT marks most questions with "?"; these open one even without it ("Do it." does not).
const ASKS = /^(what|whats|who|whos|where|when|why|how|hows|which)\b/;
const isQuestion = (text: string): boolean =>
  text.includes('?') || ASKS.test(words(text).join(' '));

/**
 * The owner's words that answer the latest read-back; 'void' if other tool output came between.
 * overTalk: words came over Ferni after the answer began (maybe his own voice): never a yes alone.
 */
export function answerWindow(
  pending: PendingAction,
  events: ConfirmEvent[]
): { turns: string[]; overTalk: boolean } | 'void' {
  const channel = channelOf(pending);
  const target = targetWords(pending);
  let delivered = false;
  let overTalk = false;
  let turns: Array<{ text: string; question: boolean }> = [];
  for (const e of events) {
    if (e.seq <= pending.createdSeq) continue;
    if (e.kind === 'tool') {
      // The preview's own output reaching the model is expected once; any other output voids it.
      if (!delivered && e.callIds.length > 0 && e.callIds.every((id) => id === pending.callId)) {
        delivered = true;
        continue;
      }
      return 'void';
    }
    // Words before the preview was read are not the answer.
    if (!delivered) continue;
    if (e.kind === 'agent') {
      const again = isReadBack(e.text, channel, target);
      turns = again ? [] : turns.filter((t) => !t.question);
      overTalk &&= !again;
      continue;
    }
    // Words over Ferni are not the answer, and once it has begun they keep it from being a yes.
    if (e.agentSpeaking) overTalk ||= turns.length > 0;
    else turns.push({ text: e.text, question: isQuestion(e.text) });
  }
  return { turns: turns.map((t) => t.text), overTalk };
}

// A yes is never taken beside these, from the fast path or the judge: a no, a later time, a
// condition, or the action redirected to the owner ("he can call you", "check in with me").
const VETO = new Set([
  ...'no nope nah not dont never wait stop cancel instead but first myself'.split(' '),
  ...'later soon after tomorrow tonight morning afternoon evening weekend'.split(' '),
  ...'monday tuesday wednesday thursday friday saturday sunday'.split(' '),
]);
const REDIRECT = /\b(call|text|ring|message) (you|me|us)\b|\bcheck in with (me|us)\b/;
const CALL_WORD = /\b(call|calling|ring|dial|phone)\b/;

export function vetoed(turns: string[], channel: Channel): boolean {
  const said = words(turns.join(' '));
  const line = said.join(' ');
  if (said.some((w) => VETO.has(w)) || REDIRECT.test(line)) return true;
  // "call" phrases never confirm a text.
  return channel === 'text' && CALL_WORD.test(line);
}

/** What the judge is told about this action and answer: no number, no message. */
function judgeInput(pending: PendingAction, turns: string[]): ConsentInput {
  const raw = ['phoneNumber', 'to', 'contactPhone']
    .map((k) => pending.args[k])
    .find((v) => typeof v === 'string');
  const digits = typeof raw === 'string' ? raw.replace(/\D/g, '') : '';
  return {
    channel: channelOf(pending),
    person: personOf(pending),
    last4: digits.length >= 4 ? digits.slice(-4) : undefined,
    turns,
  };
}

/**
 * Where a pending action stands now, without waiting: the fast path's answer, or the judge's
 * if it has already finished for exactly these turns, else 'unclear'.
 */
export function windowState(
  pending: PendingAction,
  events: ConfirmEvent[],
  now: number
): ConfirmState {
  if (now > pending.expiresAt) return 'void';
  const answer = answerWindow(pending, events);
  if (answer === 'void') return 'void';
  const { turns } = answer;
  if (turns.length === 0) return 'waiting';
  if (isPlainNo(turns[turns.length - 1])) return 'declined';
  const channel = channelOf(pending);
  // An unanswered question is never a yes either ("Okay. How's it going?").
  const veto = answer.overTalk || turns.some(isQuestion) || vetoed(turns, channel);
  if (!veto && isClearYes(turns.join(' '), targetWords(pending), pending.owner, channel === 'call'))
    return 'confirmed';
  const judged = judgedNow(pending, turns);
  if (judged?.verdict === 'no') return 'declined';
  return judged?.verdict === 'yes' && !veto ? 'confirmed' : 'unclear';
}

/** Starts the judge for the current window if the fast path can't decide it; resolves when done. */
export async function judgeWindow(
  pending: PendingAction,
  events: ConfirmEvent[],
  on: boolean
): Promise<void> {
  if (!on || windowState(pending, events, Date.now()) !== 'unclear') return;
  const answer = answerWindow(pending, events);
  if (answer === 'void' || judgedNow(pending, answer.turns)) return;
  await judge(pending, judgeInput(pending, answer.turns));
}
