/**
 * Which of the owner's words answer a read-back, and what they say (outreach-confirm.ts). Owner
 * call 10-26 18:48: "Yeah, go ahead and call." was voided by "What's his name again?" said BEFORE
 * Ferni asked again. The window is the owner's turns after Ferni's latest read-back of this action
 * (a question Ferni answered drops out). Only an allow-listed plain yes in it places (consent-words.ts);
 * anything else asks once. A no, a deferral or a redirect to someone else ends it for good.
 * @module tools/domains/communication/outreach/consent-window
 */

import { judge, judgedNow, type ConsentInput } from './consent-judge.js';
import {
  CHANNEL_WORDS,
  digitRuns,
  ferniTurnNow,
  ferniTurnOf,
  READBACK_GRACE_MS,
} from './consent-readback.js';
import type { ActionFacts, FerniTurn } from './consent-readback.js';
import { isClearYes, isPlainNo, LATER, NOES, OTHERS, pronounOf, words } from './consent-words.js';
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

const numberOf = (pending: Pick<PendingAction, 'args'>): string => {
  const raw = ['phoneNumber', 'to', 'contactPhone'].map((k) => pending.args[k]);
  return String(raw.find((v) => typeof v === 'string') ?? '').replace(/\D/g, '');
};
const STOP = new Set(words('my the a your his her their'));
export const VERB = { call: 'call', text: 'text', other: 'send that to' } as const;

/** The one question the gate has Ferni ask when an answer isn't a plain yes (consent-loop.ts). */
export function askOnceLine(pending: Pick<PendingAction, 'toolId' | 'args' | 'readBack'>): string {
  return `Just to be sure: ${VERB[channelOf(pending)]} ${personOf(pending)} now?`;
}

const factsOf = (pending: PendingAction): ActionFacts => ({
  channel: channelOf(pending),
  person: personOf(pending),
  target: targetWords(pending).filter((w) => !STOP.has(w)),
  digits: numberOf(pending),
  owner: pending.owner ?? [],
  askOnce: askOnceLine(pending),
});
/** Classifies Ferni's turn for the stored action, from when it ends (consent-readback.ts). */
export const classifyFerniTurn = async (
  pending: PendingAction,
  text: string,
  on: boolean,
  graceMs?: number
): Promise<void> => ferniTurnOf(pending, factsOf(pending), text, on, graceMs);

// STT marks most questions with "?"; these open one even without it ("Do it." does not).
const ASKS = /^(what|whats|who|whos|where|when|why|how|hows|which)\b/;
// "Wait, which number?": asking only for a detail of the read-back (who, which number, what
// time), nothing more. Ferni's answer drops it from the window; any other question stays in it,
// so a later yes reaches at most a fresh read-back. "Hold on, can I call him myself?" is a no.
const PAUSES = /^(um |uh |oh |well )?(wait|hold on|hang on|one sec|one second|just a sec)\b/;
const DETAIL = new Set(
  words(`which what whats who whos where when how hows number phone name time is its it the that
    this was again one sorry say repeat tell me remind do you have did and um uh oh`)
);
// "his" only for a call to Dad: "Wait, do you have her number?" asks about someone else.
const OWN = { him: ['his'], her: ['her'] } as const;
const asksDetail = (text: string, pending: PendingAction): boolean => {
  const rest = words(text).join(' ').replace(PAUSES, '');
  const pronoun = pronounOf(targetWords(pending));
  const own: readonly string[] = pronoun ? OWN[pronoun] : ['his', 'her', 'their'];
  return isQuestion(text) && words(rest).every((w) => DETAIL.has(w) || own.includes(w));
};
const clarifies = (text: string, pending: PendingAction): boolean =>
  PAUSES.test(words(text).join(' ')) && asksDetail(text, pending);
const isQuestion = (text: string): boolean =>
  text.includes('?') || ASKS.test(words(text).join(' ')) || PAUSES.test(words(text).join(' '));

/** The owner's words answering the latest read-back ('void': other tool output came between).
 * overTalk: words over Ferni after the answer began (maybe his own voice), or an answer to a
 * question of Ferni's that isn't a read-back of this action: never a yes. */
export function answerWindow(
  pending: PendingAction,
  events: ConfirmEvent[]
): { turns: string[]; overTalk: boolean } | 'void' {
  let delivered = false;
  let overTalk = false;
  let turns: Array<{ text: string; detail: boolean }> = [];
  let blocked = false; // Ferni asked something else: no yes counts until he reads it back again
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
      const kind = ferniTurnNow(pending, factsOf(pending), e.text);
      const again = kind === 'readback';
      const asked = kind === 'other_question';
      turns = again || asked ? [] : turns.filter((t) => !t.detail);
      blocked = !again && (asked || blocked);
      overTalk &&= !again;
      continue;
    }
    // Words over Ferni are not the answer, and once it has begun they keep it from being a yes.
    if (e.agentSpeaking) overTalk ||= turns.length > 0;
    else turns.push({ text: e.text, detail: asksDetail(e.text, pending) });
  }
  return { turns: turns.map((t) => t.text), overTalk: overTalk || blocked };
}

// Said any time after the read-back, these end it for good: only a fresh read-back can follow.
const REDIRECT =
  /\b(call|text|ring|message) (you|me|us)\b|\bcheck in with (me|us)\b|\b(he|she|they) (can|could|should|will) (call|text|ring)\b|\b(have|let|get) \w+ (call|text|ring)\b|\b(get|ask|tell) \w+ to (call|text|ring)\b/;
const DEFERRED = new Set(LATER);
const AFTER_CALL = new Set(words('now right please them'));
/** "Call Peter", "call my sister", "call 555-0199": another person or number, which ends it. */
function callsSomeoneElse(text: string, pending: PendingAction): boolean {
  const target = targetWords(pending);
  const pronoun = pronounOf(target);
  if (digitRuns(text).some((n) => !numberOf(pending).includes(n))) return true;
  const objects =
    /\b(?:call|ring|dial|give)[,.]?\s+(?:(?:um|uh|er|oh|so|well|like)[,.]?\s+)*(?:my\s+|your\s+|the\s+)?([A-Za-z]+)/gi;
  for (const m of text.matchAll(objects)) {
    const raw = m[1];
    const w = raw.toLowerCase();
    if (target.includes(w) || w === pronoun || AFTER_CALL.has(w)) continue;
    if (!pronoun && (w === 'him' || w === 'her')) continue;
    if (OTHERS.has(w) || /^[A-Z]/.test(raw) || w === 'him' || w === 'her') return true;
  }
  return false;
}
/** "No, call him!", "I said yes": the owner asking for THIS call again, after a no. */
export function asksAgain(
  text: string,
  pending: Pick<PendingAction, 'toolId' | 'args' | 'readBack'>
): boolean {
  const p = pending as PendingAction;
  const said = words(text);
  const line = said.join(' ');
  if (said.some((w) => DEFERRED.has(w) || (NOES.includes(w) && w !== 'no'))) return false;
  if (REDIRECT.test(line) || clarifies(text, p)) return false;
  if (/\bi said (yes|yeah|call|go ahead)\b/.test(line)) return true;
  return (
    CHANNEL_WORDS[channelOf(p)].test(line) &&
    !callsSomeoneElse(text, p) &&
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
      callsSomeoneElse(text, pending)
    );
  };
  // A clarifying "Wait, which number?" is exempt from the plain-no check only. Finals are also
  // read together: STT may split "call" | "my sister".
  return (
    said.some((t) => ends(t) || (isPlainNo(t) && !clarifies(t, pending))) || ends(said.join(' '))
  );
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
  // Only an allow-listed plain yes places (consent-words.ts); never over Ferni or beside a question.
  const call = channelOf(pending) === 'call';
  const plain =
    !answer.overTalk &&
    !turns.some(isQuestion) &&
    isClearYes(turns.join(' '), targetWords(pending), pending.owner, call);
  // The judge can only take a yes away: a no declines, a doubt asks once. Its error, or its
  // "question" (a bare request, e.g. "Call him.", which the allow-list already pinned), changes nothing.
  // On words that are all agreement, its "no" is a misread at worst ("Yes," | "Ferni."): ask once.
  const judged = judgedNow(pending, turns);
  if (judged?.verdict === 'no' && !plain) return 'declined';
  const doubt = judged?.verdict !== undefined && judged.verdict !== 'yes';
  if (!plain || (doubt && !['error', 'question'].includes(judged.reason))) return 'unclear';
  return 'confirmed';
}

/** Starts the judge on the current answer (a plain yes too: it may take it away); resolves when done. */
export async function judgeWindow(
  pending: PendingAction,
  events: ConfirmEvent[],
  on: boolean
): Promise<void> {
  // Ferni's turns since the read-back: classified since each ended; deciding waits only a grace.
  const said = events.filter((e) => e.seq > pending.createdSeq);
  const grace = READBACK_GRACE_MS;
  await Promise.all(
    said.map(async (e) => e.kind === 'agent' && classifyFerniTurn(pending, e.text, on, grace))
  );
  const state = windowState(pending, events, Date.now());
  if (!on || (state !== 'unclear' && state !== 'confirmed')) return;
  const answer = answerWindow(pending, events);
  if (answer === 'void' || judgedNow(pending, answer.turns)) return;
  // The judge hears the person, channel and last four digits: never the number or message.
  const [channel, person, last4] = [
    channelOf(pending),
    personOf(pending),
    numberOf(pending).slice(-4) || undefined,
  ];
  await judge(pending, { channel, person, last4, turns: answer.turns });
}
