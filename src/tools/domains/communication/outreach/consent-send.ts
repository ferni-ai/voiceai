/**
 * What a confirmed action sends (outreach-confirm.ts, outreach-server-confirm.ts): the args fixed
 * at the owner's yes, so nothing said after it reaches the call. With CALL_CONSENT_NATURAL, crisis
 * risk on the call (a crisis line heard by this gate, or risk the safety kernel noted on the call:
 * crisis-call-risk.ts) holds every outbound action for the rest of the call, checked again right
 * before each send (heldBeforeSend), so no path to a send can skip it.
 */

import { crisisReadInFlight, crisisRiskNoted } from '../../../../services/safety/index.js';
import { getLogger } from '../../../../utils/safe-logger.js';
import { liveSessionIdOf } from '../../../registry/live-session.js';
import { dropConfirmThread, sentConfirmThread } from './confirm-thread.js';
import { consentNaturalOn } from './consent-judge.js';
import type { PendingAction, SessionLog } from './outreach-confirm.js';

const log = getLogger();

/** What a held tool returns for the rest of the call. */
export const HELD_REPLY =
  "Nothing was sent. Don't read it back, offer it or try it again on this call.";

/** What a send held for a crisis read still in flight returns: this attempt only. */
const PENDING_REPLY = 'Nothing was sent yet; ask me again in a moment.';

/** How long a send waits for the call's crisis reads in flight to settle before holding it. */
const CRISIS_READ_WAIT_MS = 1500;
const READ_POLL_MS = 50;

/** CALL_CONSENT_NATURAL: a crisis line was heard on this call: any read-back waiting or just
 * cancelled is dropped, and no outbound action is read back or sent again until the call ends.
 * The emergency-contact flows aren't gated here and keep their own crisis handling. */
export function hold(entry: SessionLog): void {
  const first = entry.crisisHeld !== true;
  entry.crisisHeld = true;
  if (entry.pending) dropConfirmThread(entry.pending);
  entry.pending = undefined;
  entry.closed = undefined;
  if (first) log.info('CALL_CONSENT_NATURAL: outbound held for the rest of the call');
}

/** CALL_CONSENT_NATURAL: why this call's outbound is held, if it is: crisis (a line heard by this
 * gate, or risk the safety kernel noted on the call, read by the live call's id: a tool run's
 * `run`, else the id it was built with, else the last one found), or no_session (no id to read
 * by: held, never skipped; a missing id is never kept, so each check looks again). */
export function outboundHold(
  entry: SessionLog,
  run?: unknown,
  builtId?: string
): 'crisis' | 'no_session' | undefined {
  const liveId = liveSessionIdOf(run) ?? builtId ?? entry.liveId;
  if (liveId !== undefined) entry.liveId = liveId;
  if (liveId !== undefined && crisisRiskNoted(liveId)) hold(entry);
  if (entry.crisisHeld === true) return 'crisis';
  if (liveId !== undefined) return undefined;
  log.warn({ outcome: 'no_session' }, 'CALL_CONSENT_NATURAL: no live call id, outbound held');
  return 'no_session';
}

/** Whether the call's crisis reads in flight settle by `until` (CRISIS_READ_WAIT_MS from now). */
async function readsSettled(
  liveId: string,
  until = Date.now() + CRISIS_READ_WAIT_MS
): Promise<boolean> {
  if (!crisisReadInFlight(liveId)) return true;
  if (Date.now() >= until) return false;
  await new Promise((resolve) => {
    setTimeout(resolve, READ_POLL_MS);
  });
  return readsSettled(liveId, until);
}

/** CALL_CONSENT_NATURAL, the last check before a confirmed action (`pending`, already taken from
 * the entry) is sent: outboundHold, once any crisis read in flight on the call has settled. A held
 * action is dropped; a read still in flight at the bound holds only this attempt (not latched), so
 * a fresh read-back can place it once the read settles clean. Returns the tool's reply if held. */
export async function heldBeforeSend(
  entry: SessionLog,
  pending: PendingAction
): Promise<string | undefined> {
  const settled = entry.liveId === undefined || (await readsSettled(entry.liveId));
  const why = outboundHold(entry) ?? (settled ? undefined : 'read_pending');
  if (why === undefined) return undefined;
  dropConfirmThread(pending);
  if (why !== 'read_pending') return HELD_REPLY;
  log.info({ toolId: pending.toolId, outcome: why }, 'CALL_CONSENT_NATURAL: send held');
  return PENDING_REPLY;
}

/** Whether a send's result is a held reply (heldBeforeSend), not the tool's own. */
export const isHeldReply = (result: unknown): boolean =>
  result === HELD_REPLY || result === PENDING_REPLY;

/** What a confirmed action runs with: with CALL_CONSENT_NATURAL, the message the owner confirmed
 * when it was read back (pending.message) is added to the call's purpose, as data. Only its length
 * is logged, never its words. */
export function argsOnYes(pending: PendingAction): Record<string, unknown> {
  const { purpose } = pending.args;
  const { message } = pending;
  if (!consentNaturalOn() || typeof purpose !== 'string' || !message) return pending.args;
  log.info(
    { toolId: pending.toolId, messageLength: message.length },
    'CALL_CONSENT_NATURAL: the yes carried a message, added to the purpose'
  );
  const tell = `tell them ${JSON.stringify(message)}`;
  return { ...pending.args, purpose: purpose.trim() ? `${purpose.trim()}, and ${tell}` : tell };
}

/** Sends what was confirmed, with the args fixed before the owner's yes is recorded (`attest`).
 * CALL_CONSENT_NATURAL: checked by heldBeforeSend after that, so risk meanwhile holds it. When the
 * yes carried a confirmed message, the model is told to say it'll pass it on (none of its words). */
export async function sendOnYes(
  yes: { toolId: string; pending: PendingAction; entry: SessionLog; attest: () => Promise<void> },
  send: (args: Record<string, unknown>) => Promise<unknown>
): Promise<unknown> {
  const { toolId, pending, entry } = yes;
  const args = argsOnYes(pending);
  await yes.attest();
  const held = consentNaturalOn() ? await heldBeforeSend(entry, pending) : undefined;
  if (held !== undefined) return held;
  log.info({ toolId, previewedBy: pending.toolId }, 'OUTREACH_CONFIRM: caller said yes, sending');
  const result = await sentConfirmThread(pending, send(args));
  if (args === pending.args || typeof result !== 'string') return result;
  return `${result} Their yes carried a message for the person, now in the call's purpose: tell them in a few words you'll pass it on.`;
}
