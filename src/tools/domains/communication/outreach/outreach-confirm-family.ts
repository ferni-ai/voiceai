/**
 * OUTREACH_SERVER_CONFIRM (off by default, cohort-settable): the caller's yes
 * places the read-back action itself, and sibling tools share one read-back.
 *
 * Prod 2026-10-18 (session-AJ_8skUJPtD63SG): the gate stored 14 read-backs in
 * two days and placed 1 call. Each send waited on the model calling the SAME
 * tool again right after the yes, and it often didn't: after "Yes, go ahead."
 * it called callAndConverse instead of callOnBehalf (a new read-back), and
 * after "Yes." it said "I'm on it" with no tool call at all.
 *
 * With the flag on (outreach-confirm.ts):
 * - A caller final that confirms the stored read-back is judged again once
 *   the caller has been quiet for SERVER_CONFIRM_SETTLE_MS, so a split answer
 *   ("Yes." then "Call Bob instead.") is heard whole. Still confirmed, the
 *   server sends exactly what was read back, once, and a note tells the model.
 * - Tools that reach the same person the same way are one family: a sibling
 *   for the same person keeps the stored read-back (and its yes) instead of
 *   replacing it, and once it went out, any of them returns "Already placed".
 *
 * Calls and texts are separate families; anything else stands alone, as before.
 *
 * @module tools/domains/communication/outreach/outreach-confirm-family
 */

import { flagOn, type Env } from '../../../../config/env-flag.js';

/** Read on each caller final and each gated tool call, so a cohort's value applies per call. */
export function serverConfirmOn(env: Env = process.env): boolean {
  return flagOn('OUTREACH_SERVER_CONFIRM', env);
}

/** How long the caller must be quiet after a yes before the server sends it. */
export const SERVER_CONFIRM_SETTLE_MS = 1500;

/** Every gated tool that rings someone's phone (registry/outbound-gate.ts). */
const CALL_TOOLS = new Set([
  'callOnBehalf',
  'callAndConverse',
  'backgroundCall',
  'inviteFriendByCall',
  'sendSupportCall',
  'makePhoneCall',
]);
const TEXT_TOOLS = new Set(['sendTextMessage']);

export type Family = 'call' | 'text';

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Which family a tool call belongs to; reachOut's depends on the channel it uses. */
export function familyOf(toolId: string, args: Record<string, unknown>): Family | undefined {
  if (CALL_TOOLS.has(toolId)) return 'call';
  if (TEXT_TOOLS.has(toolId)) return 'text';
  if (toolId !== 'reachOut') return undefined;
  const channel = str(args.preferredChannel);
  if (channel === 'text') return 'text';
  return channel === 'call' || channel === 'voicemail' ? 'call' : undefined;
}

/** Who an action reaches: the number or address it goes to, else the name it was asked for. */
export interface Target {
  address?: string;
  name?: string;
}

const ADDRESS_KEYS = ['phoneNumber', 'contactPhone', 'friendPhone', 'to', 'recipientEmail'];
const NAME_KEYS = ['contactQuery', 'contact', 'contactName', 'friendName', 'recipientName'];

const firstOf = (args: Record<string, unknown>, keys: string[]): string =>
  keys.map((k) => str(args[k])).find(Boolean) ?? '';

/** `plannedTo` is where reachOut fixed the send at its read-back (outreach-confirm's PLANNED). */
export function targetOf(args: Record<string, unknown>, plannedTo?: string): Target {
  const raw = str(plannedTo) || firstOf(args, ADDRESS_KEYS);
  const digits = raw.replace(/\D/g, '').slice(-10);
  const address = raw.includes('@') ? raw.toLowerCase() : digits || undefined;
  const name = firstOf(args, NAME_KEYS).toLowerCase() || undefined;
  return { address, name };
}

/** Two numbers or addresses must match; only without one on either side do names decide. */
export function sameTarget(a: Target, b: Target): boolean {
  if (a.address && b.address) return a.address === b.address;
  return a.name !== undefined && a.name === b.name;
}

/** What the gate remembers about a stored or sent action, to recognise its siblings. */
export interface Kin {
  toolId: string;
  family?: Family;
  target: Target;
}

/** The same tool, or a sibling of its family, for the same person. */
export function isKin(
  kin: Kin,
  toolId: string,
  family: Family | undefined,
  target: Target
): boolean {
  const related = kin.toolId === toolId || (family !== undefined && kin.family === family);
  return related && sameTarget(kin.target, target);
}

/** What a sibling call gets while the stored read-back still waits on the caller. */
export function stillWaitingReply(readBack: string, toolId: string): string {
  return (
    `NOT SENT YET, still waiting for the caller's yes. Read this to them word for word and ask ` +
    `if you should go ahead: ${readBack}. Call ${toolId} again only after the caller says yes.`
  );
}

/** What any call in the family gets once the action went out on the caller's yes. */
export function alreadyPlacedReply(readBack: string): string {
  return `Already placed: ${readBack}. It went out on the caller's yes. Don't send it again.`;
}

/** The note the model gets when the server sent the action on the caller's yes. */
export function underwayNote(toolId: string, readBack: string): string {
  return (
    `The caller said yes, so ${readBack} is going out now (${toolId}, placed for you). ` +
    `Don't call a tool for it again. If you haven't yet, tell them in a few words that it's underway.`
  );
}

const said = (result: unknown): string =>
  (result instanceof Error
    ? result.message
    : typeof result === 'string'
      ? result
      : JSON.stringify(result ?? null)
  ).slice(0, 300);

/** The note the model gets with what the server-sent action reported. */
export function resultNote(toolId: string, result: unknown): string {
  return `${toolId}, sent on the caller's yes, reported: ${said(result)}`;
}

/** The note the model gets when the server-sent action failed: nothing went out. */
export function failedNote(toolId: string, readBack: string, result: unknown): string {
  return (
    `${readBack} did not go through: ${toolId} reported ${said(result)}. Nothing was sent. ` +
    `Tell them it didn't go through, and ask if they want to try again.`
  );
}
