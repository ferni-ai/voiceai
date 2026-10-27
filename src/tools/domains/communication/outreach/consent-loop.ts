/**
 * What the gate does when a read-back isn't confirmed (outreach-confirm.ts), so it never loops.
 *
 * Owner call 10-26: eleven read-backs of one call to Dad, none placed. Each unconfirmed yes
 * dropped the stored call, and the model's next try read it back again, without end.
 *
 * - Unclear: the call stays stored, and Ferni asks ONE plain question ("Just to be sure: call
 *   Dad now?"). A second unclear answer cancels it.
 * - No: cancelled, with an honest line ("Okay, I won't call Dad.").
 * - No answer yet: it stays stored, read back as it is, not prepared again.
 * - The same action (channel and person) is read back at most twice per request. After a cancel
 *   or that limit, it is read back again only once the owner asks for it in their own words.
 *
 * @module tools/domains/communication/outreach/consent-loop
 */

import { getLogger } from '../../../../utils/safe-logger.js';
import { isPlainNo } from './consent-words.js';
import { channelOf, asksAgain, isReadBack, personOf, type ConfirmState } from './consent-window.js';
import { dropConfirmThread } from './confirm-thread.js';
import { stillWaitingReply, targetOf } from './outreach-confirm-family.js';
import type { ConfirmEvent, PendingAction, SessionLog } from './outreach-confirm.js';

const log = getLogger();

/** Read-backs of one action in this request; closedSeq: cancelled (or over the limit) there. */
export interface AskRecord {
  previews: number;
  at: number;
  closedSeq?: number;
}
type Action = Pick<PendingAction, 'toolId' | 'args' | 'readBack'>;

const MAX_PREVIEWS = 2;
const ASK_MEMORY_MS = 10 * 60 * 1000;
const VERB = { call: 'call', text: 'text', other: 'send that to' } as const;

function keyOf(action: Action): string {
  const { address, name } = targetOf(action.args);
  return `${channelOf(action)}:${address ?? name ?? action.toolId}`;
}

/**
 * After it was closed: the owner asked for this call again ("No, call him!", "I said yes"), or
 * Ferni read this very action back (naming the person) and the owner answered. Either only
 * allows a new read-back, never a call.
 */
function askedAgain(events: ConfirmEvent[], since: number, action: Action): boolean {
  const later = events.filter((e) => e.seq > since);
  const reread = later.findIndex((e) => e.kind === 'agent' && isReadBack(e.text, action, true));
  return later.some(
    (e, i) =>
      e.kind === 'caller' &&
      (asksAgain(e.text, action) || (reread >= 0 && i > reread && !isPlainNo(e.text)))
  );
}

function honestLine(action: Action): string {
  return `Okay, I won't ${VERB[channelOf(action)]} ${personOf(action)}.`;
}

function closedReply(action: Action): string {
  return (
    `Nothing was sent, and don't read it back again: the caller hasn't said yes to it. Tell them ` +
    `in a few words: "${honestLine(action)}" Only if they ask for it again, in their own words, try again.`
  );
}

/** A read-back of this action may go out now; otherwise, what to say instead. */
export function previewAllowed(entry: SessionLog, action: Action): string | undefined {
  const asks = (entry.asks ??= new Map<string, AskRecord>());
  const key = keyOf(action);
  const now = Date.now();
  let rec = asks.get(key);
  if (rec && now - rec.at > ASK_MEMORY_MS) rec = undefined;
  if (rec?.closedSeq !== undefined && askedAgain(entry.events, rec.closedSeq, action))
    rec = undefined;
  if (rec && rec.closedSeq === undefined && rec.previews >= MAX_PREVIEWS) rec.closedSeq = entry.seq;
  if (rec?.closedSeq !== undefined) {
    log.info({ toolId: action.toolId }, 'OUTREACH_CONFIRM: read back enough, nothing sent');
    return closedReply(action);
  }
  asks.set(key, { previews: (rec?.previews ?? 0) + 1, at: now });
  return undefined;
}

/** It was sent: the next request for it starts afresh. */
export function forgetAsks(entry: SessionLog, action: Action): void {
  entry.asks?.delete(keyOf(action));
}

/** Drops the stored action, closes it for this request, and says so honestly. */
export function cancel(
  entry: SessionLog,
  pending: PendingAction,
  why: ConfirmState,
  /** The final that ended it may itself ask again ("No, call him!"). */
  sinceSeq = entry.seq
): string {
  dropConfirmThread(pending);
  entry.pending = undefined;
  const key = keyOf(pending);
  const asks = (entry.asks ??= new Map<string, AskRecord>());
  asks.set(key, { previews: asks.get(key)?.previews ?? 1, at: Date.now(), closedSeq: sinceSeq });
  log.info({ toolId: pending.toolId, why }, 'OUTREACH_CONFIRM: cancelled, nothing sent');
  return (
    `Nothing was sent. Tell the caller, in a few words: "${honestLine(pending)}" Don't read it ` +
    `back or ask again unless they ask for it in their own words.`
  );
}

/**
 * The model called the tool again for the stored action, and it isn't confirmed. Returns what
 * the tool says, or undefined when a new read-back should replace it (changed arguments,
 * expiry, or other tool output in between).
 */
export function unconfirmedReply(
  entry: SessionLog,
  pending: PendingAction,
  state: ConfirmState,
  next: { callId: string; same: boolean; expiresAt: number }
): string | undefined {
  if (!next.same || state === 'void' || state === 'confirmed') return undefined;
  if (state === 'declined' || (state === 'unclear' && pending.asked))
    return cancel(entry, pending, state);
  // Its next answer is to what Ferni says now, so judge from here.
  Object.assign(pending, { callId: next.callId, createdSeq: entry.seq, expiresAt: next.expiresAt });
  if (state === 'waiting') return stillWaitingReply(pending.readBack, pending.toolId);
  pending.asked = true;
  const ask = `Just to be sure: ${VERB[channelOf(pending)]} ${personOf(pending)} now?`;
  log.info({ toolId: pending.toolId }, 'OUTREACH_CONFIRM: unclear, asking once');
  return (
    `NOT SENT YET: the caller's answer wasn't a clear yes. Ask exactly this, once, and nothing ` +
    `else about it: "${ask}" Call ${pending.toolId} again only after they answer.`
  );
}
