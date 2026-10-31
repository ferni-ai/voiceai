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
 * - at most UNVERIFIED_SESSION_LIMIT sends per call, on top of the daily caps;
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
import { blockedContent, type ContentBlock } from './owner-message-content.js';

/** UNVERIFIED_OWNER_MESSAGE_FILTER=on: unverified calls message the owner under this policy (default off). */
export function unverifiedOwnerMessageFilterOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return flagOn('UNVERIFIED_OWNER_MESSAGE_FILTER', env);
}

export const UNVERIFIED_SESSION_LIMIT = 2;
export const UNVERIFIED_FOOTER = 'From your call with Ferni.';
/** What Ferni says when the content was refused (fe's words, 2026-10-31). */
export const UNVERIFIED_CONTENT_REFUSAL =
  "I can't text that from this call, but I can once you're in the app.";
/** What Ferni says when this call may send nothing more. */
export const UNVERIFIED_SEND_REFUSAL =
  "I can't send anything else from this call, but I can once you're in the app.";

export type OwnerMessageRefusal = ContentBlock | 'session_limit' | 'no_account' | 'no_session';

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
  /** The model-written parts: message, subject */
  texts: ReadonlyArray<unknown>;
  /** Spoken on a call rather than sent as text: no footer */
  spoken: boolean;
}

const log = getLogger();
/** Sends allowed to each unverified call, keyed by its session's userData. */
const sentThisCall = new WeakMap<object, number>();

const CONTENT_REFUSALS: ReadonlySet<OwnerMessageRefusal> = new Set<ContentBlock>([
  'email',
  'url',
  'phone_number',
  'credential_ask',
]);
const refuse = (reason: OwnerMessageRefusal): OwnerMessageDecision => {
  const line = CONTENT_REFUSALS.has(reason) ? UNVERIFIED_CONTENT_REFUSAL : UNVERIFIED_SEND_REFUSAL;
  return { outcome: 'refused', reason, line };
};

/** An unverified call's message: allowed with the footer, or why not. Counts it when allowed. */
function unverifiedDecision(message: OwnerMessage, call: object | undefined): OwnerMessageDecision {
  if (!call) return refuse('no_session'); // nothing to count against: fail closed
  for (const text of message.texts) {
    const blocked = typeof text === 'string' ? blockedContent(text) : null;
    if (blocked) return refuse(blocked);
  }
  const sent = sentThisCall.get(call) ?? 0;
  if (sent >= UNVERIFIED_SESSION_LIMIT) return refuse('session_limit');
  sentThisCall.set(call, sent + 1);
  return { outcome: 'unverified_allowed', footer: message.spoken ? null : UNVERIFIED_FOOTER };
}

/** Whether, and how, this run may send the owner a message the model wrote. */
export function ownerMessagePolicy(message: OwnerMessage): OwnerMessageDecision {
  if (!unverifiedOwnerMessageFilterOn()) return { outcome: 'unchanged' };
  const call = callSessionData(message.opts);
  const member = isMemberIdentity(message.ownerId);
  if (member && call && verifiedCallerId(call) === message.ownerId) return { outcome: 'unchanged' };
  const decision = member ? unverifiedDecision(message, call) : refuse('no_account');
  if (decision.outcome === 'refused') {
    const sessionId = (call as { services?: { sessionId?: unknown } } | undefined)?.services?.sessionId; // prettier-ignore
    log.info(
      { tool: message.tool, userId: message.ownerId, sessionId, reason: decision.reason },
      'Owner message refused for an unverified call'
    );
  }
  return decision;
}

type Args = Record<string, unknown>;
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
        const texts = [given.message, given.subject];
        const decision = ownerMessagePolicy({ tool: def.id, ownerId: ctx.userId, opts, texts, spoken }); // prettier-ignore
        if (decision.outcome === 'refused') return decision.line;
        if (decision.outcome === 'unchanged' || !decision.footer) return execute(args, opts);
        const message = typeof given.message === 'string' ? given.message : '';
        return execute({ ...given, message: `${message}\n\n${decision.footer}` }, opts);
      };
      return { ...tool, execute: run } as Tool;
    },
  };
}
