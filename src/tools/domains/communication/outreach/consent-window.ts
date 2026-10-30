/**
 * Which of the owner's words answer a read-back, and what they say (outreach-confirm.ts). Owner
 * call 10-26 18:48: "Yeah, go ahead and call." was voided by "What's his name again?" said BEFORE
 * Ferni asked again. The window is the owner's turns after Ferni's latest read-back of this action
 * (a question Ferni answered drops out). Only an allow-listed plain yes in it places (consent-words.ts);
 * anything else asks once. A no, a deferral or a redirect to someone else ends it for good.
 * @module tools/domains/communication/outreach/consent-window
 */

import { askOnceLine, channelOf, numberOf, personOf, STOP, targetWords } from './consent-action.js';
import { judge, judgedNow } from './consent-judge.js';
import {
  CHANNEL_WORDS,
  digitRuns,
  ferniTurnNow,
  ferniTurnOf,
  READBACK_GRACE_MS,
} from './consent-readback.js';
import type { ActionFacts, FerniTurn } from './consent-readback.js';
import {
  agreesAfterNo,
  isClearYes,
  isPlainNo,
  isStatusQuestion,
  LATER,
  NOES,
  OTHERS,
  pronounOf,
  words,
} from './consent-words.js';
import type { ConfirmEvent, PendingAction } from './outreach-confirm.js';

export type ConfirmState = 'confirmed' | 'waiting' | 'void' | 'unclear' | 'declined';

const factsOf = (pending: PendingAction): ActionFacts => ({
  channel: channelOf(pending),
  person: personOf(pending),
  target: targetWords(pending).filter((w) => !STOP.has(w)),
  digits: numberOf(pending),
  owner: pending.owner ?? [],
  askOnce: askOnceLine(pending),
});
/** What Ferni's turn is for the stored action, now (consent-readback.ts). */
export const ferniTurn = (pending: PendingAction, text: string): FerniTurn =>
  ferniTurnNow(pending, factsOf(pending), text);
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
/** Another line or number for the person: "his work line", "his new number", "the other one". */
const ANOTHER_LINE =
  /\b(work|cell|cellphone|mobile|office|landline|line)\b|\b(other|another|different|new|newer|second|backup) (phone )?(number|one)\b/;
const isQuestion = (text: string): boolean =>
  text.includes('?') || ASKS.test(words(text).join(' ')) || PAUSES.test(words(text).join(' '));

/** The owner's words answering the latest read-back ('void': other tool output came between).
 * overTalk: words over Ferni after the answer began (maybe his own voice), or an answer to a
 * question of Ferni's that isn't a read-back of this action: never a yes. */
function answerWindow(
  pending: PendingAction,
  events: ConfirmEvent[]
): { turns: string[]; overTalk: boolean } | 'void' {
  let delivered = pending.reopened === true;
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
      const kind = ferniTurn(pending, e.text);
      const again = kind === 'readback';
      const asked = kind === 'other_question';
      turns = again || asked ? [] : turns.filter((t) => !t.detail);
      blocked = !again && (asked || blocked);
      overTalk &&= !again;
      continue;
    }
    if (neutral(e.text, pending)) continue; // only a status question: the window stays as it was
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
    /\b(?:call|ring|dial|give)[,.]?\s+(?:(?:um|uh|er|oh|so|well|like)[,.]?\s+)*(?:my\s+|your\s+|the\s+)?(\p{L}+)/giu;
  for (const m of text.matchAll(objects)) {
    const raw = m[1];
    const w = raw.toLowerCase();
    if (target.includes(w) || w === pronoun || AFTER_CALL.has(w)) continue;
    if (!pronoun && (w === 'him' || w === 'her')) continue;
    if (
      OTHERS.has(w) ||
      /^[A-Z]/.test(raw) ||
      /[^\x00-\x7f]/.test(raw) ||
      w === 'him' ||
      w === 'her'
    )
      return true;
  }
  return false;
}
/** "No, call him!", "I said yes": the owner asking for THIS call again, after a no. */
export function asksAgain(
  text: string,
  pending: Pick<PendingAction, 'toolId' | 'args' | 'readBack'>
): boolean {
  const p = pending as PendingAction;
  if (asksStatus(text, p)) return false; // "Did you call him?" asks whether it happened, not for it
  // "No no no, yes.", "No, I mean yes.": a no that takes itself back in the same turn.
  if (agreesAfterNo(text, targetWords(p), p.owner, channelOf(p) === 'call')) return true;
  // "No wait, yes, call him.": the last clause from a yes on is a plain yes that calls them.
  const clauses = text
    .split(/[,.;!?]+/)
    .map((c) => c.trim())
    .filter(Boolean);
  const from = clauses.map((c) => /^(yes|yeah|yep|sure|okay|ok)\b/i.test(c)).lastIndexOf(true);
  const tail = from >= 0 ? clauses.slice(from).join(' ') : '';
  if (/\bcall\b/i.test(tail) && isClearYes(tail, targetWords(p), p.owner, channelOf(p) === 'call'))
    return true;
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
/** A deferral or a redirect: "later", "not now", "call me", "have Priya call him". */
const deferredOrRedirected = (text: string): boolean => {
  const line = words(text).join(' ');
  return (
    REDIRECT.test(line) ||
    /\bnot (now|yet|today)\b/.test(line) ||
    words(text).some((x) => DEFERRED.has(x))
  );
};
/** Neither a yes nor a no: the whole turn is exactly "Did you (already) call him (yet)?" (an
 * allow-list, consent-words.ts). Anything more is a question: the next yes asks once. */
const neutral = (text: string, pending: PendingAction): boolean =>
  isStatusQuestion(text, targetWords(pending), channelOf(pending) === 'call');
/** The same question about anyone ("Did you call my dad?" with Sam read back): not an end. */
const asksStatus = (text: string, pending: PendingAction): boolean =>
  isStatusQuestion(text, targetWords(pending), channelOf(pending) === 'call', true);
// "No." or "No, don't call him.": a no that says nothing else. "No, the other one." is not.
const BARE_NO = new Set(
  words(
    'no nope nah dont not never mind cancel stop wait hold on hang please thanks thank you okay ok um uh oh well actually sorry call him her them it that'
  )
);
const bareNo = (text: string, pending: PendingAction): boolean =>
  words(text).every((w) => BARE_NO.has(w) || targetWords(pending).includes(w));

/** The owner's finals in (from, to]: by default, since the read-back was stored. */
const callerTurns = (
  pending: PendingAction,
  events: ConfirmEvent[],
  from = pending.createdSeq,
  to = Infinity
): string[] =>
  events.flatMap((e) => (e.seq > from && e.seq < to && e.kind === 'caller' ? [e.text] : []));
/** Ends it for good: a deferral, a redirect, someone else (a status question stays a question). */
const endsForGood = (text: string, pending: PendingAction): boolean =>
  deferredOrRedirected(text) || (!asksStatus(text, pending) && callsSomeoneElse(text, pending));

/** Any final since the read-back was stored, over Ferni or before he read it, that ends it.
 * Finals are also read together: STT may split "call" | "my sister". A clarifying "Wait, which
 * number?" is exempt from the plain-no check only. */
function endedBy(pending: PendingAction, events: ConfirmEvent[]): boolean {
  const said = callerTurns(pending, events);
  const joined = said.filter((t) => !asksStatus(t, pending)).join(' ');
  const no = (t: string): boolean => isPlainNo(t) && !clarifies(t, pending);
  return said.some((t) => endsForGood(t, pending) || no(t)) || endsForGood(joined, pending);
}
/** Whether a fresh read-back (at seq `to`) may reopen it after a cancel (consent-loop.ts): every
 * owner word since its read-back counts, up to the re-read. Only a bare no, a no that agrees in
 * the same turn, or doubt; never a deferral, a redirect, someone else or another line. */
export function reopenable(pending: PendingAction, events: ConfirmEvent[], to: number): boolean {
  const said = callerTurns(pending, events, pending.startSeq, to);
  return (
    !said.some((t) => foreclosesReopen(t, pending)) &&
    !deferredOrRedirected(said.join(' ')) &&
    !callsSomeoneElse(said.join(' '), pending)
  );
}
/** One owner turn that shuts the door on a re-read: a deferral, a redirect, someone else, another
 * line, or a no that says more. The gate records it on the action as it is said (`final`). */
export function foreclosesReopen(text: string, pending: PendingAction): boolean {
  const call = channelOf(pending) === 'call';
  return (
    deferredOrRedirected(text) ||
    callsSomeoneElse(text, pending) ||
    ANOTHER_LINE.test(words(text).join(' ')) ||
    (isPlainNo(text) &&
      !bareNo(text, pending) &&
      !agreesAfterNo(text, targetWords(pending), pending.owner, call))
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
