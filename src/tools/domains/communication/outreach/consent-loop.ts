/**
 * What the gate does when a read-back isn't confirmed (outreach-confirm.ts), so it never loops.
 * Owner call 10-26: eleven read-backs of one call to Dad, none placed.
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
import { READBACK_GRACE_MS } from './consent-readback.js';
import { askOnceLine, channelOf, personOf, VERB } from './consent-action.js';
import {
  asksAgain,
  classifyFerniTurn,
  reopenable,
  ferniTurn,
  type ConfirmState,
} from './consent-window.js';
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
function keyOf(action: Action): string {
  const { address, name } = targetOf(action.args);
  return `${channelOf(action)}:${address ?? name ?? action.toolId}`;
}
/** After a close: the owner asked again in their own words ("No, call him!", "I said yes").
 * That allows only a new read-back, never a call. */
function askedAgain(events: ConfirmEvent[], since: number, action: Action): boolean {
  return events.some((e) => e.seq > since && e.kind === 'caller' && asksAgain(e.text, action));
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
  // A plain no (or a second unclear) may be reopened by a fresh read-back; a deferral or a
  // redirect may not: "Later." then "Should I go ahead and call?" then "Yes." isn't a yes to now.
  const again = reopenable(pending, entry.events);
  entry.closed = again ? { action: pending, seq: sinceSeq, at: Date.now() } : undefined;
  const key = keyOf(pending);
  const asks = (entry.asks ??= new Map<string, AskRecord>());
  asks.set(key, { previews: asks.get(key)?.previews ?? 1, at: Date.now(), closedSeq: sinceSeq });
  log.info({ toolId: pending.toolId, why }, 'OUTREACH_CONFIRM: cancelled, nothing sent');
  return (
    `Nothing was sent. Tell the caller, in a few words: "${honestLine(pending)}" Don't read it ` +
    `back or ask again unless they ask for it in their own words.`
  );
}

/** A cancelled action Ferni has since read back afresh (the classifier says so, past the vetoes):
 * it is stored again, its window starting at that read-back, so the next yes can place it. */
export async function reopenClosed(
  entry: SessionLog,
  on: boolean,
  windowMs: number
): Promise<void> {
  const closed = entry.closed;
  if (entry.pending || !closed || Date.now() - closed.at > windowMs) return;
  const reads = entry.events.flatMap((e) => (e.seq > closed.seq && e.kind === 'agent' ? [e] : []));
  await Promise.all(
    reads.map(async (e) => classifyFerniTurn(closed.action, e.text, on, READBACK_GRACE_MS))
  );
  const fresh = reads.filter((e) => ferniTurn(closed.action, e.text) === 'readback').pop();
  if (!fresh) return;
  // The owner's words since the cancel count too: "Call my sister instead." then a re-read of Dad.
  if (!reopenable(closed.action, entry.events, closed.seq, fresh.seq)) {
    entry.closed = undefined;
    return;
  }
  Object.assign(closed.action, { createdSeq: fresh.seq - 1, reopened: true, asked: false });
  closed.action.expiresAt = Date.now() + windowMs;
  [entry.pending, entry.closed] = [closed.action, undefined];
  log.info({ toolId: closed.action.toolId }, 'OUTREACH_CONFIRM: read back afresh after a cancel');
}

/** The model called the tool again and it isn't confirmed: what the tool says, or undefined when
 * a new read-back should replace it (changed arguments, expiry, other tool output between). */
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
  Object.assign(pending, {
    ...{ callId: next.callId, createdSeq: entry.seq, expiresAt: next.expiresAt },
    reopened: false, // the window now waits for this reply to reach the model
  });
  if (state === 'waiting') return stillWaitingReply(pending.readBack, pending.toolId);
  pending.asked = true;
  const ask = askOnceLine(pending);
  log.info({ toolId: pending.toolId }, 'OUTREACH_CONFIRM: unclear, asking once');
  return (
    `NOT SENT YET: the caller's answer wasn't a clear yes. Ask exactly this, once, and nothing ` +
    `else about it: "${ask}" Call ${pending.toolId} again only after they answer.`
  );
}
