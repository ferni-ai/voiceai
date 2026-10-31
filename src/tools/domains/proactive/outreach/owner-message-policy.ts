/**
 * The one decision for every tool that sends the account owner a message the
 * model wrote (a text, an email or a call, now or scheduled): may this run
 * send it, and how.
 *
 * The destination is never in question: these tools reach only the verified
 * phone or email on the account, and ignore any number or address in their
 * arguments. The content is. A session matched to a member by caller ID alone,
 * which can be spoofed, could have Ferni deliver words of the caller's
 * choosing to the real member, under Ferni's name.
 *
 * With UNVERIFIED_OWNER_MESSAGE_FILTER on, a caller the server did not verify
 * on this call (verifiedCallerId) may still have Ferni message the owner, but:
 * - nothing a phishing text needs (owner-message-content.ts): no link, number,
 *   address, or ask for a login, code or bank details;
 * - a text or email carries the footer "From your call with Ferni.";
 * - at most UNVERIFIED_SESSION_LIMIT sends per call, on top of the daily caps
 *   (a slot is spent when a send is allowed; one the tool then does not
 *   deliver is logged as delivery_failed);
 * - no account (anon:, onbehalf:, a placeholder) or no call session: nothing.
 * A refusal sends nothing, reads no store, and is logged with ids and a reason
 * code, never the text. A verified caller, and everyone with the flag off, is
 * unchanged. Requiring verification outright instead is a change to
 * `unverifiedDecision` alone.
 *
 * @module tools/domains/proactive/outreach/owner-message-policy
 */

import { flagOn } from '../../../../config/env-flag.js';
import { isMemberIdentity } from '../../../../services/identity/member-identity.js';
import { verifiedCallerId } from '../../../../services/identity/verified-caller.js';
import { getLogger } from '../../../../utils/safe-logger.js';
import type { Tool, ToolContext, ToolDefinition } from '../../../registry/types.js';
import { callSessionData } from '../../../utils/call-session-data.js';
import { CONTENT_BLOCKS, blockedContent, type ContentBlock } from './owner-message-content.js';

/** UNVERIFIED_OWNER_MESSAGE_FILTER=on: unverified calls message the owner under this policy (default off). */
function unverifiedOwnerMessageFilterOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return flagOn('UNVERIFIED_OWNER_MESSAGE_FILTER', env);
}

const UNVERIFIED_SESSION_LIMIT = 2;
export const UNVERIFIED_FOOTER = 'From your call with Ferni.';
/** What Ferni says when the content was refused (fe's words, 2026-10-31). */
export const UNVERIFIED_CONTENT_REFUSAL =
  "I can't text that from this call, but I can once you're in the app.";
/** What Ferni says when this call has used its sends (fe's words, 2026-10-31). */
export const UNVERIFIED_CAP_REFUSAL =
  "That's all I can send from this call. I can send more once you're in the app.";
/** What Ferni says when this call can send nothing at all (no account, no call session). */
export const UNVERIFIED_NOTHING_SENT_REFUSAL =
  "I can't send that from this call, but I can once you're in the app.";

type OwnerMessageRefusal = ContentBlock | 'session_limit' | 'no_account' | 'no_session';
/** An allowed send the tool then did not deliver: the slot stays spent (fail closed). */
type OwnerMessageLogReason = OwnerMessageRefusal | 'delivery_failed';

export type OwnerMessageDecision =
  | { outcome: 'unchanged' } // a verified caller, or the flag off: exactly as before
  | { outcome: 'unverified_allowed'; footer: string | null }
  | { outcome: 'refused'; reason: OwnerMessageRefusal; line: string };

export interface OwnerMessage {
  /** The tool, for the log */
  tool: string;
  /** The account the message goes to (the tool's ctx.userId) */
  ownerId: string;
  /** The run's options, carrying the call session (opts.ctx.userData) */
  opts: unknown;
  /** Every model-written field that is sent or stored: message, subject, contact name */
  texts: readonly unknown[];
  /** Spoken on a call rather than sent as text: no footer */
  spoken: boolean;
}

const log = getLogger();
/**
 * Sends allowed to each unverified call, by its voice session id: tool paths
 * that build their own options (the semantic-router executor) share the count.
 * By a live session's own userData (it has services) only when it carries no
 * id; a routed run with no id has nothing stable to count against (no_session).
 */
const sentBySessionId = new Map<string, number>();
const sentBySessionData = new WeakMap<object, number>();
const MAX_COUNTED_SESSIONS = 5000;

/** The call's voice session id: from session-manager's services, or set by a routed tool path. */
function sessionIdOf(call: object | undefined): string | undefined {
  const data = call as { services?: { sessionId?: unknown }; sessionId?: unknown } | undefined;
  const id = data?.services?.sessionId ?? data?.sessionId;
  return typeof id === 'string' && id ? id : undefined;
}

/** What this call's sends are counted by, or undefined when nothing stable identifies it. */
function countKey(call: object | undefined): string | object | undefined {
  const live = (call as { services?: unknown } | undefined)?.services;
  return sessionIdOf(call) ?? (live && typeof live === 'object' ? call : undefined);
}

const sendsSoFar = (key: string | object): number =>
  (typeof key === 'string' ? sentBySessionId.get(key) : sentBySessionData.get(key)) ?? 0;

function countSend(key: string | object): void {
  if (typeof key !== 'string') return void sentBySessionData.set(key, sendsSoFar(key) + 1);
  if (!sentBySessionId.has(key) && sentBySessionId.size >= MAX_COUNTED_SESSIONS) {
    sentBySessionId.delete(sentBySessionId.keys().next().value as string); // the oldest call
  }
  sentBySessionId.set(key, sendsSoFar(key) + 1);
}

const CONTENT_REFUSALS: ReadonlySet<string> = new Set(CONTENT_BLOCKS);
const refuse = (reason: OwnerMessageRefusal): OwnerMessageDecision => {
  if (CONTENT_REFUSALS.has(reason)) return { outcome: 'refused', reason, line: UNVERIFIED_CONTENT_REFUSAL }; // prettier-ignore
  const line =
    reason === 'session_limit' ? UNVERIFIED_CAP_REFUSAL : UNVERIFIED_NOTHING_SENT_REFUSAL;
  return { outcome: 'refused', reason, line };
};

/** One log line per refusal or undelivered send: ids and a reason code, never the text. */
function logOutcome(message: OwnerMessage, reason: OwnerMessageLogReason): void {
  const sessionId = sessionIdOf(callSessionData(message.opts));
  const what = reason === 'delivery_failed' ? 'allowed but not delivered' : 'refused';
  log.info(
    { tool: message.tool, userId: message.ownerId, sessionId, reason },
    `Owner message ${what} for an unverified call`
  );
}

/** An unverified call's message: allowed with the footer, or why not. Counts it when allowed. */
function unverifiedDecision(message: OwnerMessage, call: object | undefined): OwnerMessageDecision {
  for (const text of message.texts) {
    const blocked = typeof text === 'string' ? blockedContent(text) : null;
    if (blocked) return refuse(blocked);
  }
  const key = countKey(call);
  if (!key) return refuse('no_session'); // nothing to count against: fail closed
  if (sendsSoFar(key) >= UNVERIFIED_SESSION_LIMIT) return refuse('session_limit');
  countSend(key);
  return { outcome: 'unverified_allowed', footer: message.spoken ? null : UNVERIFIED_FOOTER };
}

/** Whether, and how, this run may send the owner a message the model wrote. */
export function ownerMessagePolicy(message: OwnerMessage): OwnerMessageDecision {
  if (!unverifiedOwnerMessageFilterOn()) return { outcome: 'unchanged' };
  const call = callSessionData(message.opts);
  const member = isMemberIdentity(message.ownerId);
  // A routed run (semantic-router executor) carries no verified bit: unverified, fail closed
  if (member && verifiedCallerId(call) === message.ownerId) return { outcome: 'unchanged' };
  const decision = member ? unverifiedDecision(message, call) : refuse('no_account');
  if (decision.outcome === 'refused') logOutcome(message, decision.reason);
  return decision;
}

type Args = Record<string, unknown>;
/** How these tools' replies begin when nothing went out (no verified phone, quiet hours, a failure). */
const NOT_SENT_REPLY = /^(?:I can't|I couldn't|I didn't|Couldn't|Something went wrong|I need)/;
/** Which runs speak their message on a call (no footer); every other run sends text. */
const SPOKEN: Readonly<Record<string, (args: Args) => boolean>> = {
  callUser: () => true,
  scheduleCall: () => true,
  sendImmediateOutreach: (args) => args.method === 'call',
  scheduleProactiveReminder: (args) => args.method === 'voice',
  scheduleAtBestTime: (args) => args.channel === 'call',
};

/** The definition, wrapped so each run goes through ownerMessagePolicy first. */
export function ownerMessageTool(def: ToolDefinition): ToolDefinition {
  return {
    ...def,
    create: (ctx: ToolContext): Tool => {
      const tool = def.create(ctx);
      type Execute = (args: unknown, opts?: unknown) => Promise<unknown>;
      const execute = (tool as { execute: Execute }).execute.bind(tool);
      const run = async (args: unknown, opts?: unknown): Promise<unknown> => {
        const given = (args ?? {}) as Args;
        const spoken = SPOKEN[def.id]?.(given) ?? false;
        const texts = [given.message, given.subject, given.contactName]; // every model-written field
        const message: OwnerMessage = { tool: def.id, ownerId: ctx.userId, opts, texts, spoken };
        const decision = ownerMessagePolicy(message);
        if (decision.outcome === 'refused') return decision.line;
        if (decision.outcome === 'unchanged') return execute(args, opts);
        const body = typeof given.message === 'string' ? given.message : '';
        const sent = decision.footer
          ? { ...given, message: `${body}\n\n${decision.footer}` }
          : args;
        try {
          const reply = await execute(sent, opts);
          if (typeof reply === 'string' && NOT_SENT_REPLY.test(reply)) logOutcome(message, 'delivery_failed'); // prettier-ignore
          return reply;
        } catch (error) {
          logOutcome(message, 'delivery_failed');
          throw error;
        }
      };
      return { ...tool, execute: run } as Tool;
    },
  };
}
