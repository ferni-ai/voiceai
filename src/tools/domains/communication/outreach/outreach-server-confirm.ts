/**
 * OUTREACH_SERVER_CONFIRM's half of the outbound confirm gate (outreach-confirm.ts):
 * the caller's yes sends the read-back from the server, and sibling tools share
 * one read-back (outreach-confirm-family.ts says who counts as the same action).
 *
 * outreach-confirm.ts owns the session log and the yes judgement and passes
 * them in (ConfirmGate), so this module never imports it at run time.
 *
 * @module tools/domains/communication/outreach/outreach-server-confirm
 */

import { getLogger } from '../../../../utils/safe-logger.js';
import { isSyntheticUserId } from '../../../../utils/synthetic-user.js';
import {
  dropConfirmThread,
  openConfirmThread,
  outcomeOf,
  sentConfirmThread,
} from './confirm-thread.js';
import {
  alreadyPlacedReply,
  failedNote,
  familyOf,
  isKin,
  resultNote,
  SERVER_CONFIRM_SETTLE_MS,
  stillWaitingReply,
  targetOf,
  underwayNote,
  type Family,
  type Target,
} from './outreach-confirm-family.js';
import type {
  ConfirmEvent,
  ConfirmSpec,
  PendingAction,
  Planned,
  SessionLog,
} from './outreach-confirm.js';

const log = getLogger();

/** What the gate lends this module: its yes judgement, owner check and markers. */
export interface ConfirmGate {
  confirmationState: (
    pending: PendingAction,
    events: ConfirmEvent[],
    now: number
  ) => 'confirmed' | 'waiting' | 'void';
  ownerKnown: (session: object) => boolean;
  isClearNo: (text: string) => boolean;
  /** The owner's first names from the call's user data, so a yes may address them (PendingAction.owner). */
  ownerFirstNames: (opts: unknown) => string[];
  windowMs: number;
  planOnly: symbol;
  planned: symbol;
}

/** Take the stored action, so nothing can send it twice, and send it as read back. */
async function sendTaken(
  gate: ConfirmGate,
  entry: SessionLog,
  pending: PendingAction,
  send: () => Promise<unknown>
): Promise<unknown> {
  entry.pending = undefined;
  clearTimeout(entry.settle);
  entry.settle = undefined;
  const { server } = pending;
  const sent = server && { ...server, expiresAt: Date.now() + gate.windowMs };
  entry.sent = sent || undefined;
  const result = sentConfirmThread(pending, send());
  // A send that failed is not "already placed": the caller may ask again.
  const forget = (): void => {
    if (entry.sent === sent) entry.sent = undefined;
  };
  void result.then((r) => outcomeOf(r) === 'failed' && forget(), forget);
  return result;
}

/**
 * OUTREACH_SERVER_CONFIRM: a final that confirms the read-back sends it once
 * the caller has been quiet for SERVER_CONFIRM_SETTLE_MS, judged again then.
 */
export function settleThenSend(gate: ConfirmGate, session: object, entry: SessionLog): void {
  const { confirmationState } = gate;
  clearTimeout(entry.settle);
  entry.settle = undefined;
  const { pending } = entry;
  const server = pending?.server;
  if (!server || confirmationState(pending, entry.events, Date.now()) !== 'confirmed') return;
  entry.settle = setTimeout(() => {
    entry.settle = undefined;
    // A later final ("Call Bob instead"), another tool's output, a no or expiry voids it.
    if (entry.pending !== pending) return;
    if (confirmationState(pending, entry.events, Date.now()) !== 'confirmed') return;
    if (!gate.ownerKnown(session) || isSyntheticUserId(pending.userId)) {
      log.warn(
        { toolId: server.toolId },
        'OUTREACH_SERVER_CONFIRM: owner not proven, nothing sent'
      );
      return;
    }
    log.info({ toolId: server.toolId }, 'OUTREACH_SERVER_CONFIRM: caller said yes, sending');
    entry.note?.(underwayNote(server.toolId, server.readBack));
    const failed = (why: unknown): void => {
      log.warn({ toolId: server.toolId }, 'OUTREACH_SERVER_CONFIRM: the send failed');
      entry.note?.(failedNote(server.toolId, server.readBack, why));
    };
    void sendTaken(gate, entry, pending, server.send).then((result) => {
      if (outcomeOf(result) === 'failed') failed(result);
      else entry.note?.(resultNote(server.toolId, result));
    }, failed);
  }, SERVER_CONFIRM_SETTLE_MS);
}

export type Execute = (a: unknown, o?: unknown) => Promise<unknown>;

/** One call of a gated tool, with OUTREACH_SERVER_CONFIRM on. */
export interface FamilyCall {
  gate: ConfirmGate;
  toolId: string;
  spec: ConfirmSpec;
  execute: Execute;
  session: object;
  entry: SessionLog;
  args: Record<string, unknown>;
  opts: unknown;
  callId: string;
  userId: string;
}

/** Whether the caller said no to this read-back since it was stored. */
function saidNoTo(gate: ConfirmGate, entry: SessionLog, pending: PendingAction): boolean {
  return entry.events.some(
    (e) => e.seq > pending.createdSeq && e.kind === 'caller' && gate.isClearNo(e.text)
  );
}

/** What was sent or still waits for this person, by this tool or a sibling; undefined: neither. */
function familyAnswer(c: FamilyCall, family: Family | undefined, target: Target): unknown {
  const { gate } = c;
  const { sent, pending } = c.entry;
  const now = Date.now();
  if (sent && now <= sent.expiresAt && isKin(sent, c.toolId, family, target)) {
    log.info({ toolId: c.toolId }, 'OUTREACH_SERVER_CONFIRM: already placed, nothing sent');
    return alreadyPlacedReply(sent.readBack);
  }
  if (!pending || pending.userId !== c.userId) return undefined;
  const kin = pending.server !== undefined && isKin(pending.server, c.toolId, family, target);
  if (gate.confirmationState(pending, c.entry.events, now) === 'confirmed') {
    if (pending.toolId !== c.toolId && !kin) return undefined;
    log.info({ toolId: c.toolId }, 'OUTREACH_CONFIRM: caller said yes, sending');
    const send = pending.server?.send ?? (async () => c.execute(pending.args, c.opts));
    return sendTaken(gate, c.entry, pending, send);
  }
  if (!kin || !pending.server || saidNoTo(gate, c.entry, pending) || now > pending.expiresAt)
    return undefined;
  // The same action for the same person: read it again, and judge the answer to this reading.
  Object.assign(pending, {
    callId: c.callId,
    createdSeq: c.entry.seq,
    expiresAt: now + gate.windowMs,
  });
  log.info({ toolId: c.toolId }, 'OUTREACH_SERVER_CONFIRM: kept the stored read-back');
  return stillWaitingReply(pending.server.readBack, pending.toolId);
}

/** The gate with OUTREACH_SERVER_CONFIRM on: siblings share one read-back (outreach-confirm-family.ts). */
export async function gateInFamily(c: FamilyCall): Promise<unknown> {
  const { gate } = c;
  const early = familyAnswer(c, familyOf(c.toolId, c.args), targetOf(c.args));
  if (early !== undefined) return early;
  const prepared = await c.spec.prepare(c.args, c.userId, async (a) =>
    c.execute({ ...a, [gate.planOnly]: true }, c.opts)
  );
  if (typeof prepared === 'string') return prepared;
  const planned = (prepared.args as Record<symbol, unknown>)[gate.planned] as Planned | undefined;
  const family = familyOf(c.toolId, prepared.args);
  const target = targetOf(prepared.args, planned?.to);
  // The resolved number may match where the name didn't, and a yes may have landed meanwhile.
  const late = familyAnswer(c, family, target);
  if (late !== undefined) return late;
  const { entry } = c;
  if (entry.pending) dropConfirmThread(entry.pending); // replaced, never sent
  const send = async (): Promise<unknown> => c.execute(prepared.args, c.opts);
  const { readBack } = prepared;
  entry.pending = {
    toolId: c.toolId,
    userId: c.userId,
    spec: c.spec,
    readBack,
    args: prepared.args,
    callId: c.callId,
    createdSeq: entry.seq,
    expiresAt: Date.now() + gate.windowMs,
    server: { toolId: c.toolId, family, target, readBack, send },
    owner: gate.ownerFirstNames(c.opts),
  };
  openConfirmThread(entry.pending, {
    userId: c.userId,
    toolId: c.toolId,
    args: prepared.args,
    planned,
    ownerVerified: gate.ownerKnown(c.session),
  });
  log.info({ toolId: c.toolId }, 'OUTREACH_CONFIRM: preview stored, waiting for caller');
  return (
    `NOT SENT YET. Read this to the caller word for word and ask if you should go ahead: ` +
    `${readBack}. Call ${c.toolId} again only after the caller says yes.`
  );
}
