/**
 * The stored action in words, for the consent checks: its channel, whom it reaches, its number,
 * and the gate's one ask-once question (consent-window.ts, consent-loop.ts).
 * @module tools/domains/communication/outreach/consent-action
 */

import type { ConsentInput } from './consent-judge.js';
import { words } from './consent-words.js';
import { familyOf } from './outreach-confirm-family.js';
import type { PendingAction } from './outreach-confirm.js';

export type Channel = ConsentInput['channel'];
/**
 * CALL_RETRY_ASKS_FIRST (owner 2026-11-26): one more try at a missed call, set for tomorrow where
 * the callee is. A call, but not now: its read-back ("one more try at Rosa tomorrow around 10 AM
 * where Rosa is, to …", services/outreach/call-retry-offer.ts) names its own time, so that time
 * is this action, never "another time".
 */
const RETRY = 'retryMissedCall';
export const isRetry = (pending: Pick<PendingAction, 'toolId'>): boolean =>
  pending.toolId === RETRY;
/** The action's own time: "tomorrow" said to a retry agrees with it, never defers it. */
export const ownTime = (pending: Pick<PendingAction, 'toolId'>): ReadonlySet<string> =>
  new Set(isRetry(pending) ? ['tomorrow'] : []);
const PLACES_A_CALL = new Set(['callOnBehalf', 'callAndConverse', 'callUser', RETRY]);
export function channelOf(pending: Pick<PendingAction, 'toolId' | 'args'>): Channel {
  const family = familyOf(pending.toolId, pending.args);
  if (PLACES_A_CALL.has(pending.toolId) || family === 'call') return 'call';
  return family === 'text' || pending.toolId === 'quickText' ? 'text' : 'other';
}

/** Whom it reaches, in words: the names asked for and the name read back ("a call to Dad at …"). */
const NAME_KEYS = ['contactQuery', 'contactName', 'contact', 'friendName', 'recipientName'];
export function targetWords(pending: PendingAction): string[] {
  const asked = NAME_KEYS.flatMap((k) => words(String(pending.args[k] ?? '')));
  return [...asked, ...words(personOf(pending))];
}

/** The person in the read-back ("a call to Dad at 555…" → "Dad"), else the name asked for. */
export function personOf(
  pending: Pick<PendingAction, 'readBack' | 'args'> & { toolId?: string }
): string {
  // A retry's errand may hold " to " ("…, to ask whether she can…"): its person comes first.
  const shape =
    pending.toolId === RETRY ? /^one more try at (.+?) tomorrow\b/ : / to (.+?)(?: at |, |$)/;
  const named = shape.exec(pending.readBack)?.[1]?.trim();
  const asked = NAME_KEYS.map((k) => pending.args[k]).find(
    (a) => typeof a === 'string' && a.trim()
  );
  return named || (asked as string | undefined) || 'them';
}

export const numberOf = (pending: Pick<PendingAction, 'args'>): string => {
  const raw = ['phoneNumber', 'to', 'contactPhone'].map((k) => pending.args[k]);
  return String(raw.find((v) => typeof v === 'string') ?? '').replace(/\D/g, '');
};
export const STOP = new Set(words('my the a your his her their'));
const VERB = { call: 'call', text: 'text', other: 'send that to' } as const;

/** The one question the gate has Ferni ask when an answer isn't a plain yes (consent-loop.ts). */
export function askOnceLine(pending: Pick<PendingAction, 'toolId' | 'args' | 'readBack'>): string {
  if (isRetry(pending)) return `Just to be sure: try ${personOf(pending)} again tomorrow?`;
  return `Just to be sure: ${VERB[channelOf(pending)]} ${personOf(pending)} now?`;
}

/** What Ferni says when it won't go ahead (consent-loop.ts): "Okay, I won't call Dad." */
export function wontLine(pending: Pick<PendingAction, 'toolId' | 'args' | 'readBack'>): string {
  if (isRetry(pending)) return `Okay, I won't try ${personOf(pending)} again.`;
  return `Okay, I won't ${VERB[channelOf(pending)]} ${personOf(pending)}.`;
}
