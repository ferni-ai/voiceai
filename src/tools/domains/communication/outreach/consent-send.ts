/**
 * What a confirmed action sends (outreach-confirm.ts, outreach-server-confirm.ts): the args fixed
 * at the owner's yes, so nothing said after it reaches the call. With CALL_CONSENT_NATURAL, crisis
 * risk on the call (a crisis line heard by this gate, or risk the safety kernel noted on the call:
 * crisis-call-risk.ts), even while the yes is being recorded, holds every outbound action for the
 * rest of the call.
 */

import { crisisRiskNoted } from '../../../../services/safety/index.js';
import { getLogger } from '../../../../utils/safe-logger.js';
import { liveSessionIdOf } from '../../../registry/live-session.js';
import { dropConfirmThread, sentConfirmThread } from './confirm-thread.js';
import { consentNaturalOn } from './consent-judge.js';
import type { PendingAction, SessionLog } from './outreach-confirm.js';

const log = getLogger();

/** What a held tool returns for the rest of the call. */
export const HELD_REPLY =
  "Nothing was sent. Don't read it back, offer it or try it again on this call.";

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

/** CALL_CONSENT_NATURAL: whether this call's outbound is held: a crisis line heard by this gate
 * (hold), or risk the safety kernel noted on the call, read by the live call's id (a tool run's
 * `run`, else the id it was built with; later checks reuse it). Reads in flight aren't counted:
 * one that finds risk notes it before the reply's request is built. */
export function callHeld(entry: SessionLog, run?: unknown, builtId?: string): boolean {
  const liveId = liveSessionIdOf(run) ?? builtId ?? entry.liveId;
  entry.liveId = liveId;
  if (liveId !== undefined && crisisRiskNoted(liveId)) hold(entry);
  return entry.crisisHeld === true;
}

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
 * CALL_CONSENT_NATURAL: a crisis line said meanwhile voids the send. When the yes carried a
 * confirmed message, the model is told to say it will pass it on; the note holds none of its words. */
export async function sendOnYes(
  yes: { toolId: string; pending: PendingAction; entry: SessionLog; attest: () => Promise<void> },
  send: (args: Record<string, unknown>) => Promise<unknown>
): Promise<unknown> {
  const { toolId, pending, entry } = yes;
  const args = argsOnYes(pending);
  await yes.attest();
  if (consentNaturalOn() && callHeld(entry)) return HELD_REPLY;
  log.info({ toolId, previewedBy: pending.toolId }, 'OUTREACH_CONFIRM: caller said yes, sending');
  const result = await sentConfirmThread(pending, send(args));
  if (args === pending.args || typeof result !== 'string') return result;
  return `${result} Their yes carried a message for the person, now in the call's purpose: tell them in a few words you'll pass it on.`;
}
