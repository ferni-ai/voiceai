/**
 * What a confirmed action sends (outreach-confirm.ts): the args fixed at the owner's yes, so
 * nothing said after it reaches the call. With CALL_CONSENT_NATURAL, a crisis line said around a
 * read-back, or while the yes is being recorded, holds that tool for the rest of the call.
 */

import { getLogger } from '../../../../utils/safe-logger.js';
import { dropConfirmThread, sentConfirmThread } from './confirm-thread.js';
import { consentNaturalOn } from './consent-judge.js';
import { crisisSaid } from './consent-window.js';
import type { PendingAction, SessionLog } from './outreach-confirm.js';

const log = getLogger();

/** What a held tool returns for the rest of the call. */
export const HELD_REPLY =
  "Nothing was sent. Don't read it back, offer it or try it again on this call.";

/** CALL_CONSENT_NATURAL: a crisis line was said around this tool's read-back: it is dropped, and
 * neither read back nor sent again on this call. */
export function hold(entry: SessionLog, toolId: string): void {
  (entry.held ??= new Set()).add(toolId);
  if (entry.pending?.toolId === toolId) dropConfirmThread(entry.pending);
  if (entry.pending?.toolId === toolId) entry.pending = undefined;
  if (entry.closed?.action.toolId === toolId) entry.closed = undefined;
  log.info({ toolId }, 'CALL_CONSENT_NATURAL: held for the rest of the call');
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
  const decided = entry.seq;
  await yes.attest();
  if (consentNaturalOn() && entry.seq > decided && crisisSaid(entry.events)) {
    hold(entry, pending.toolId);
    return HELD_REPLY;
  }
  log.info({ toolId, previewedBy: pending.toolId }, 'OUTREACH_CONFIRM: caller said yes, sending');
  const result = await sentConfirmThread(pending, send(args));
  if (args === pending.args || typeof result !== 'string') return result;
  return `${result} Their yes carried a message for the person, now in the call's purpose: tell them in a few words you'll pass it on.`;
}
