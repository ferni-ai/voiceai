/**
 * No promise without a thread (THREADS_PENDING_CONFIRM, off by default).
 *
 * A call or text Ferni read back and is waiting on the caller's yes lived only
 * in memory (outreach-confirm.ts keeps it per session), so a dropped call lost
 * it and nothing ever brought it up again. With the flag on, each read-back is
 * also written as a follow-up (bogle_users/{uid}/follow_through) for the
 * verified owner, marked waiting on you:
 * - the yes that sends it closes it as done, with what the tool said;
 * - a no, or a newer read-back in its place, releases it;
 * - a call that ends while it waits leaves it open, so a later call or text
 *   can pick it up.
 * The record holds the tool, the saved contact's id and a short title like
 * "Call Mom". Never the number, the address or the words to send.
 *
 * Writes never hold up the tool: they run in the background and a failure is
 * logged. Flag off: nothing is written and outreach-confirm behaves as before.
 *
 * Tools (L3) may not import the Firestore store or outreach (L4), so the live
 * call installs the port (services/outreach/confirm-thread-adapter.ts). Not
 * installed (no live call in this process): nothing is kept.
 *
 * @module tools/domains/communication/outreach/confirm-thread
 */

import { randomUUID } from 'crypto';
import { flagOn, type Env } from '../../../../config/env-flag.js';
import {
  apply,
  type FollowUp,
  type FollowUpAction,
  type FollowUpEvent,
  type FollowUpStore,
} from '../../../../services/follow-through/index.js';
import { createLogger } from '../../../../utils/safe-logger.js';

const log = createLogger({ module: 'confirm-thread' });

export function threadsPendingConfirmOn(env: Env = process.env): boolean {
  return flagOn('THREADS_PENDING_CONFIRM', env);
}

export interface ConfirmThreadPort {
  /** The follow-up store, or null where there is none (local dev without credentials). */
  store: () => FollowUpStore | null;
  /** The owner's IANA zone, for when the follow-up comes due. */
  zoneOf: (userId: string) => Promise<string>;
}

let port: ConfirmThreadPort | undefined;

export function setConfirmThreadPort(next: ConfirmThreadPort | undefined): void {
  port = next;
}

export function getConfirmThreadPort(): ConfirmThreadPort | undefined {
  return port;
}

/** The follow-up written for each stored read-back, keyed by outreach-confirm's pending action. */
const threads = new WeakMap<object, Promise<FollowUp | null>>();

const VERBS: Readonly<Record<string, string>> = {
  call: 'Call',
  voicemail: 'Voicemail',
  text: 'Text',
  sms: 'Text',
  email: 'Email',
};
const TOOL_VERBS: Readonly<Record<string, string>> = {
  callOnBehalf: 'Call',
  callAndConverse: 'Call',
  backgroundCall: 'Call',
  inviteFriendByCall: 'Call',
  sendSupportCall: 'Call',
  makePhoneCall: 'Call',
  sendTextMessage: 'Text',
  sendVoiceMessage: 'Voice message to',
  backgroundFollowUp: 'Email',
  sendApprovedEmail: 'Email',
  scheduleReminder: 'Reminder for',
  postToTwitter: 'Post to Twitter',
  postToLinkedIn: 'Post to LinkedIn',
};

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const DIGIT_WORDS = new Set('zero oh one two three four five six seven eight nine'.split(' '));

/** Three or more digits in any form ("5-5-5", "(801) 555", "five five five"): part of a number. */
function holdsNumber(name: string): boolean {
  const digits = name.replace(/\D/g, '').length;
  const spoken = (name.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => DIGIT_WORDS.has(w));
  return digits + spoken.length >= 3;
}

/** A name the caller would say, or '' when all we have is a number or an address. */
function nameIn(args: Record<string, unknown>): string {
  const keys = ['contactQuery', 'contact', 'contactName', 'friendName', 'recipientName'];
  const name = keys.map((k) => text(args[k])).find(Boolean) ?? '';
  return holdsNumber(name) || name.includes('@') ? '' : name.slice(0, 40);
}

/** Who and how reachOut fixed at the read-back (outreach-confirm's PLANNED), when it did. */
export interface PlannedTarget {
  readonly contactId?: string;
  readonly channel?: string;
}

/** "Call Mom", "Text Dana": what it is and who for, never where it goes. */
export function threadTitle(
  toolId: string,
  args: Record<string, unknown>,
  planned?: PlannedTarget
): string {
  const channel = text(planned?.channel) || text(args.preferredChannel);
  const verb = VERBS[channel] ?? TOOL_VERBS[toolId] ?? 'Reach out to';
  if (verb.startsWith('Post to')) return verb;
  return `${verb} ${nameIn(args) || 'them'}`;
}

/**
 * A saved contact's id ("contact_1797…_k3x9a", Firestore ids): a letter, then
 * letters, digits, _ or -. A number or an address never has that shape.
 */
const CONTACT_ID = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;

function contactIdIn(args: Record<string, unknown>, planned?: PlannedTarget): string | undefined {
  const id = text(planned?.contactId) || text(args.contactId);
  return CONTACT_ID.test(id) ? id : undefined;
}

/**
 * Write the follow-up for a read-back just stored. Only for a verified owner:
 * a guest's or an unknown speaker's read-back leaves no record.
 */
export function openConfirmThread(
  pending: object,
  p: {
    userId: string;
    toolId: string;
    args: Record<string, unknown>;
    planned?: PlannedTarget;
    ownerVerified: boolean;
  }
): void {
  if (!threadsPendingConfirmOn() || !p.ownerVerified) return;
  const keep = port;
  const store = keep?.store();
  if (!keep || !store) {
    log.warn({ toolId: p.toolId }, 'THREADS_PENDING_CONFIRM: no follow-up store, not kept');
    return;
  }
  const contactId = contactIdIn(p.args, p.planned);
  const action: FollowUpAction = {
    tool: p.toolId,
    ...(contactId ? { contactId } : {}),
    waitingOn: 'you',
  };
  const written = (async () => {
    const zone = await keep.zoneOf(p.userId);
    const thread = await store.open(
      {
        userId: p.userId,
        kind: 'promise',
        text: threadTitle(p.toolId, p.args, p.planned),
        dueAt: null,
        zone,
        repeat: null,
        source: { store: 'outreach_confirm', ref: randomUUID() },
        action,
      },
      new Date()
    );
    log.info(
      { toolId: p.toolId, followUpId: thread.id },
      'THREADS_PENDING_CONFIRM: waiting on you'
    );
    return thread;
  })().catch((err: unknown) => {
    log.warn({ err, toolId: p.toolId }, 'THREADS_PENDING_CONFIRM: could not write the follow-up');
    return null;
  });
  threads.set(pending, written);
}

/** Close the read-back's follow-up, once. No record (flag off, not the owner): nothing to do. */
function closeThread(
  pending: object,
  how: 'dropped' | NonNullable<FollowUpAction['outcome']>
): void {
  const written = threads.get(pending);
  if (!written) return;
  threads.delete(pending);
  const store = port?.store();
  void written
    .then(async (thread) => {
      if (!thread || !store) return;
      const event: FollowUpEvent = how === 'dropped' ? { type: 'release' } : { type: 'done' };
      const next = apply(thread, event, new Date());
      if (!next.success) {
        log.warn(
          { followUpId: thread.id, error: next.error },
          'THREADS_PENDING_CONFIRM: not closed'
        );
        return;
      }
      const { waitingOn: _waiting, ...rest } = thread.action ?? { tool: 'unknown' };
      const action: FollowUpAction = how === 'dropped' ? rest : { ...rest, outcome: how };
      const saved = await store.save({ ...next.data, action }, thread.updatedAt);
      if (!saved)
        log.warn(
          { followUpId: thread.id },
          'THREADS_PENDING_CONFIRM: changed elsewhere, not closed'
        );
    })
    .catch((err: unknown) => {
      log.warn({ err }, 'THREADS_PENDING_CONFIRM: could not close the follow-up');
    });
}

/** The caller said no, or a newer read-back took its place: nothing is waiting on them now. */
export function dropConfirmThread(pending: object): void {
  closeThread(pending, 'dropped');
}

/** What a confirmed send's result says happened. Tool results are mostly free text. */
export function outcomeOf(result: unknown): NonNullable<FollowUpAction['outcome']> {
  if (typeof result === 'string')
    return /^nothing was\b/i.test(result.trim()) ? 'failed' : 'unknown';
  const success = (result as { success?: unknown } | null)?.success;
  return success === true ? 'sent' : success === false ? 'failed' : 'unknown';
}

/** The yes sent it: close the follow-up as done once the tool settles. Returns `result` as is. */
export function sentConfirmThread<T>(pending: object, result: Promise<T>): Promise<T> {
  if (!threads.has(pending)) return result;
  result.then(
    (r) => closeThread(pending, outcomeOf(r)),
    () => closeThread(pending, 'failed')
  );
  return result;
}
