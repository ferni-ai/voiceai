/**
 * Which of the owner's words answer a read-back, and what they say (outreach-confirm.ts). Owner
 * call 10-26 18:48: "Yeah, go ahead and call." was voided by "What's his name again?" said BEFORE
 * Ferni asked again. The window is the owner's turns after Ferni's latest read-back of this action
 * (a question Ferni answered drops out); the fast path (consent-words.ts) takes a plain yes, the
 * judge (consent-judge.ts) the rest, and a veto keeps any no, deferral, hedge or redirect from
 * ever being a yes, whoever judged it.
 * @module tools/domains/communication/outreach/consent-window
 */

import { judge, judgedNow, type ConsentInput } from './consent-judge.js';
import { isClearYes, isPlainNo, NOES, pronounOf, words } from './consent-words.js';
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

export function mentionsChannel(text: string, channel: Channel): boolean {
  return CHANNEL_WORDS[channel].test(text);
}

const lastFour = (pending: Pick<PendingAction, 'args'>): string | undefined => {
  const raw = ['phoneNumber', 'to', 'contactPhone'].map((k) => pending.args[k]);
  const digits = String(raw.find((v) => typeof v === 'string') ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : undefined;
};
// Never a read-back of THIS action: a later time, another way round ("call you back").
const NOT_A_READ_BACK = new Set(words('later tomorrow tonight instead you back'));
// The honest line's own re-ask (agents/personas/honest-line.ts NOT_YET), about the action waiting.
const RE_ASK: Record<Channel, RegExp> = {
  call: /^should i go ahead and call( him| her| them)?( now)?\?$/i,
  text: /^should i go ahead and send it\?$/i,
  other: /^should i go ahead and send it\?$/i,
};
const STOP = new Set(words('my the a your his her their'));

/** Ferni asking about THIS action again: it repeats the person or last four digits, or is the
 * honest line's own re-ask (not when `strict`); never "later"/"you"/"back" or someone else's kin. */
export function isReadBack(
  text: string,
  pending: Pick<PendingAction, 'toolId' | 'args' | 'readBack'>,
  strict = false
): boolean {
  const plain = text.replace(/<[^>]*>/g, ' ');
  const ask = plain
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().endsWith('?'))
    .pop()
    ?.trim();
  const channel = channelOf(pending);
  if (!ask || !CHANNEL_WORDS[channel].test(ask)) return false;
  const said = words(plain);
  const target = targetWords(pending as PendingAction).filter((w) => !STOP.has(w));
  if (said.some((w) => NOT_A_READ_BACK.has(w) || (KIN.has(w) && !target.includes(w)))) return false;
  const four = lastFour(pending);
  const repeats =
    target.some((w) => said.includes(w)) || (!!four && plain.replace(/\D/g, '').includes(four));
  return repeats || (!strict && RE_ASK[channel].test(ask));
}

// STT marks most questions with "?"; these open one even without it ("Do it." does not).
const ASKS = /^(what|whats|who|whos|where|when|why|how|hows|which)\b/;
// "Wait, which number?": a question, not a no. It leaves the call waiting for the next answer.
const PAUSES = /^(um |uh |oh |well )?(wait|hold on|hang on|one sec|one second|just a sec)\b/;
const ASKS_FOR = /\b(which|who|whos|what|whats|where|when|how|tell me|remind me|repeat|again)\b/;
const clarifies = (text: string): boolean => {
  const line = words(text).join(' ');
  const rest = line.replace(PAUSES, '');
  if (!PAUSES.test(line) || REDIRECT.test(rest) || hedges(text)) return false;
  if (words(rest).some((w) => NOES.includes(w) || VETO.has(w) || DEFERRED.has(w))) return false;
  return text.includes('?') || ASKS_FOR.test(rest);
};
const isQuestion = (text: string): boolean =>
  text.includes('?') || ASKS.test(words(text).join(' ')) || clarifies(text);

/** The owner's words answering the latest read-back ('void': other tool output came between).
 * overTalk: words over Ferni after the answer began (maybe his own voice): never a yes. */
export function answerWindow(
  pending: PendingAction,
  events: ConfirmEvent[]
): { turns: string[]; overTalk: boolean } | 'void' {
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
      const again = isReadBack(e.text, pending);
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
// condition, a hedge ("maybe", "I guess", "because that worked so well"), another channel.
const VETO = new Set(
  words(`no nope nah not dont never wait stop cancel instead but first myself later soon after
    tomorrow tonight morning afternoon evening weekend monday tuesday wednesday thursday friday
    saturday sunday when if once until unless maybe perhaps guess suppose probably whatever because`)
);
const HEDGE =
  /\b(let me think|think about it|not sure|in (an?|a few|\d+|\w+) (minutes?|mins?|hours?|hrs?|bit|while))\b/;
// Normalised like words(), keeping digits: "let me... think", "not-sure", "in 10 minutes".
const lower = (t: string): string => t.toLowerCase().replace(/['’]/g, '');
const norm = (t: string): string => lower(t).replace(/[^a-z0-9]+/g, ' ');
const hedges = (text: string): boolean => HEDGE.test(norm(text));
const AGREES =
  /\b(yes|yeah|yep|yup|ya|sure|ok|okay|alright|absolutely|definitely|certainly|of course|please|go ahead|go for it|do it|fine|sounds good|thats right|correct)\b/;
const CALL_WORD = /\b(call|calling|ring|dial|phone)\b/;
const OTHER_WAY = /\b(text|texts|message|email|send)\b/;
// Said at any point after the read-back, these end it for good (deny by default): a plain no, a
// redirect, or a deferral. Ferni asking again doesn't undo them: the stored action is dropped,
// and only a fresh read-back (a new preview, consent-loop.ts) can follow.
const REDIRECT =
  /\b(call|text|ring|message) (you|me|us)\b|\bcheck in with (me|us)\b|\b(he|she|they) (can|could|should|will) (call|text|ring)\b|\b(have|let|get) \w+ (call|text|ring)\b/;
const DEFERRED = new Set(
  words('later tomorrow tonight instead monday tuesday wednesday thursday friday saturday sunday')
);
const OTHERS = new Set([...KIN, ...words('grandma grandpa cousin friend boss doctor neighbor')]);
const AFTER_CALL = new Set(words('now right please them'));

/** Whom "call X" / "give X a call" names: 'other' (another person or number: a redirect), 'odd'
 * (anything else: never a yes without asking), or undefined (the person read back). */
function callee(text: string, pending: PendingAction): 'other' | 'odd' | undefined {
  const target = targetWords(pending);
  const pronoun = pronounOf(target);
  const number = (lastFour(pending) && String(pending.args.phoneNumber ?? pending.args.to)) || '';
  const digits = number.replace(/\D/g, '');
  if ((text.match(/\d[\d\s().-]{1,}\d/g) ?? []).some((n) => !digits.includes(n.replace(/\D/g, ''))))
    return 'other';
  let found: 'odd' | undefined;
  const objects =
    /\b(?:call|ring|dial),?\s+(?:my\s+|your\s+|the\s+)?([A-Za-z]+)|\bgive\s+(?:my\s+|your\s+|the\s+)?([A-Za-z]+)\s+a\s+call/gi;
  for (const m of text.matchAll(objects)) {
    const raw = m[1] ?? m[2];
    const w = raw.toLowerCase();
    if (target.includes(w) || w === pronoun || AFTER_CALL.has(w)) continue;
    if (!pronoun && (w === 'him' || w === 'her')) continue;
    if (OTHERS.has(w) || /^[A-Z]/.test(raw) || w === 'him' || w === 'her') return 'other';
    found = 'odd';
  }
  return found;
}
/** "No, call him!", "I said yes": the owner asking for THIS call again, after a no. */
export function asksAgain(
  text: string,
  pending: Pick<PendingAction, 'toolId' | 'args' | 'readBack'>
): boolean {
  const p = pending as PendingAction;
  const said = words(text);
  const line = said.join(' ');
  if (said.some((w) => VETO.has(w) && w !== 'no') || REDIRECT.test(line) || clarifies(text))
    return false;
  if (/\bi said (yes|yeah|call|go ahead)\b/.test(line)) return true;
  return (
    mentionsChannel(text, channelOf(p)) &&
    callee(text, p) === undefined &&
    /\b(call|text|ring|dial|message)\b/.test(line)
  );
}
/** Any final since the read-back was stored, over Ferni or before he read it, that ends it. */
export function endedBy(pending: PendingAction, events: ConfirmEvent[]): boolean {
  const said = events.flatMap((e) =>
    e.seq > pending.createdSeq && e.kind === 'caller' ? [e.text] : []
  );
  const ends = (text: string): boolean => {
    const w = words(text);
    return (
      REDIRECT.test(w.join(' ')) ||
      w.some((x) => DEFERRED.has(x)) ||
      callee(text, pending) === 'other'
    );
  };
  // A clarifying "Wait, which number?" is exempt from the plain-no check only. Finals are also
  // read together: STT may split "call" | "my sister".
  return said.some((t) => ends(t) || (isPlainNo(t) && !clarifies(t))) || ends(said.join(' '));
}
export function vetoed(turns: string[], pending: PendingAction): boolean {
  const channel = channelOf(pending);
  const said = words(turns.join(' '));
  const line = said.join(' ');
  const joined = turns.join(' ');
  if (said.some((w) => VETO.has(w)) || hedges(joined)) return true;
  if ([...turns, joined].some((t) => callee(t, pending) !== undefined)) return true;
  // "call" phrases never confirm a text, nor "text" a call.
  return channel === 'text' ? CALL_WORD.test(line) : channel === 'call' && OTHER_WAY.test(line);
}

/** Where it stands now: the fast path's answer, else the judge's if it has finished. */
export function windowState(
  pending: PendingAction,
  events: ConfirmEvent[],
  now: number
): ConfirmState {
  if (now > pending.expiresAt) return 'void';
  if (endedBy(pending, events)) return 'declined';
  const answer = answerWindow(pending, events);
  if (answer === 'void') return 'void';
  const { turns } = answer;
  if (turns.length === 0) return 'waiting';
  const channel = channelOf(pending);
  // An unanswered question is never a yes either ("Okay. How's it going?").
  const veto = answer.overTalk || turns.some(isQuestion) || vetoed(turns, pending);
  if (!veto && isClearYes(turns.join(' '), targetWords(pending), pending.owner, channel === 'call'))
    return 'confirmed';
  const judged = judgedNow(pending, turns);
  if (judged?.verdict === 'no') return 'declined';
  // The judge's yes counts only beside a word of agreement: "Call." may be a fresh request.
  const agrees = AGREES.test(words(turns.join(' ')).join(' '));
  return judged?.verdict === 'yes' && !veto && agrees ? 'confirmed' : 'unclear';
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
  // The judge hears the person, channel and last four digits: never the number or message.
  const [channel, person, last4] = [channelOf(pending), personOf(pending), lastFour(pending)];
  await judge(pending, { channel, person, last4, turns: answer.turns });
}
