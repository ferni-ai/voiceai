/**
 * Every registered tool that calls, texts or emails someone other than the
 * account owner acts only on the caller's spoken yes to a read-back
 * (outreach-confirm.ts). ToolRegistry.register() runs every definition through
 * gateOutboundTool, so all live tool paths (orchestrator, semantic router,
 * registry builds) share the gate. createDomainExport gates every exported
 * definition too, so code that builds tools straight from a domain's
 * definitions (persona agents, the shortcut hand-off) gets the gated tool. Wrapping is idempotent, so outreach's
 * own wrapping is not applied twice.
 *
 * Not listed on purpose: quickCall/quickText/quickEmail hand off to
 * callOnBehalf/reachOut, which are gated; tools that only reach the account
 * owner, at the verified phone or email on the account and never a saved or
 * model-supplied one, texts through the guarded sender (callUser,
 * sendImmediateOutreach, sendMessageNow, schedule*; see call-user-port.ts).
 *
 * @module tools/registry/outbound-gate
 */

import { isSyntheticUserId, namesNoAccount } from '../../utils/synthetic-user.js';
import {
  isOutreachConfirmOn,
  testAccountReply,
  withOutreachConfirmation,
  type ConfirmSpec,
} from '../domains/communication/outreach/outreach-confirm.js';
import {
  argsConfirm,
  multiOutreachConfirm,
  postConfirm,
  reminderConfirm,
  reachOutConfirm,
  sendBatchConfirm,
} from '../domains/communication/outreach/outreach-confirm-specs.js';
import { callConfirm } from '../domains/telephony/call-confirm.js';
import type { Tool, ToolContext, ToolDefinition } from './types.js';

/** Tool id → what it reads back before acting. */
export const OUTBOUND_TOOLS: Readonly<Record<string, ConfirmSpec>> = {
  callOnBehalf: callConfirm,
  callAndConverse: callConfirm,
  reachOut: reachOutConfirm,
  multiOutreach: multiOutreachConfirm,
  sendBatchMessages: sendBatchConfirm,
  backgroundCall: argsConfirm('a call'),
  inviteFriendByCall: argsConfirm('a call'),
  sendSupportCall: argsConfirm('a call'),
  backgroundFollowUp: argsConfirm('an email'),
  postToTwitter: postConfirm('Twitter'),
  postToLinkedIn: postConfirm('LinkedIn'),
  // Legacy tool set (communication-tools.ts) that the Alex persona agent builds directly
  sendTextMessage: argsConfirm('a text'),
  makePhoneCall: argsConfirm('a call'),
  sendVoiceMessage: argsConfirm('a voice message'),
  sendApprovedEmail: argsConfirm('an email'),
  // A reminder sent to an address the model names (setReminder is gated in productivity/reminders.ts)
  scheduleReminder: reminderConfirm,
};

/**
 * Gate a tool built without a ToolDefinition (legacy persona tool sets). The
 * user is read from each run's session (ctx.userData.userId), never a fixed
 * placeholder, so test accounts and the owner check apply to the real caller.
 */
export function gateLegacyTool(
  id: string,
  tool: unknown,
  ctx: Omit<ToolContext, 'userId'>
): unknown {
  const def: ToolDefinition = {
    id,
    name: id,
    description: id,
    domain: 'communication',
    create: () => tool as Tool,
  };
  const gated = gateOutboundTool(def);
  if (gated === def) return tool;
  type Run = { ctx?: { userData?: { userId?: unknown } } } | undefined;
  const execute = (args: Record<string, unknown>, opts?: unknown): Promise<unknown> => {
    const userId = (opts as Run)?.ctx?.userData?.userId;
    const user = typeof userId === 'string' ? userId : ''; // no session user: the gate sends nothing
    return gated.create({ ...ctx, userId: user }).execute(args, opts) as Promise<unknown>;
  };
  return { ...(tool as Tool), execute };
}

/**
 * Tools that call, text or email someone other than the account owner: the
 * gated ones above plus the shortcuts that hand off to them. Never offered to
 * a caller who isn't a verified account owner (agents/shared/third-party-tools.ts).
 */
export const THIRD_PARTY_TOOLS: ReadonlySet<string> = new Set([
  ...Object.keys(OUTBOUND_TOOLS),
  ...['quickCall', 'quickText', 'quickEmail'],
]);

/** What an outbound tool says to a caller with no account (an anon: session, no id). */
export const NO_ACCOUNT_REFUSAL =
  "Nothing was sent: I can only reach out to people for you once I know it's you.";

/** The refusal for a caller with no account, or null when `userIds` all name one. */
export function noAccountRefusal(...userIds: Array<string | undefined>): string | null {
  const ids = userIds.filter((id) => id !== undefined);
  return ids.length === 0 || ids.some(namesNoAccount) ? NO_ACCOUNT_REFUSAL : null;
}

/** Arguments that name who a tool reaches, and those that give an address for them. */
const TARGET_ARGS = ['contactQuery', 'contact', 'contactName', 'recipientName', 'friendName'];
const ADDRESS_ARGS = ['phoneNumber', 'phone', 'email', 'to'];
const textArg = (args: Record<string, unknown>, k: string): string => {
  const v = args[k];
  return typeof v === 'string' ? v.trim() : '';
};

/**
 * A person from a persona's own life (Hollis, Ferni's friend) asked for by name,
 * with no number or address given and none of the owner's contacts by that
 * name: the refusal, or null. The owner's own Hollis (saved, or given with a
 * number) is reached as before.
 */
async function canonTargetRefusal(
  args: Record<string, unknown>,
  userId: string
): Promise<string | null> {
  if (ADDRESS_ARGS.some((k) => textArg(args, k))) return null;
  const target = TARGET_ARGS.map((k) => textArg(args, k)).find(Boolean);
  if (!target) return null;
  const { canonPeople, canonPersonIn } = await import('../../personas/index.js');
  const canon = canonPersonIn(target, await canonPeople());
  if (!canon) return null;
  const { findContact } = await import('../domains/telephony/call-on-behalf.js');
  if (await findContact(target, userId).catch(() => null)) return null; // one, or a choice
  const name = canon[0].toUpperCase() + canon.slice(1);
  return (
    `Nothing was sent: ${name} is someone from my own life, and you have no saved number for ` +
    `anyone by that name. If you mean someone you know, I'll need their number.`
  );
}

/** Marks a definition already wrapped by withCallerChecks. */
const CHECKED = Symbol.for('ferni.outbound-caller-checks');

/**
 * Before the confirm gate: a caller with no account reaches nobody, and no one
 * is reached for a name from a persona's own life. Nothing runs (no contact is
 * looked up or saved, no read-back) when either refuses.
 */
function withCallerChecks(def: ToolDefinition): ToolDefinition {
  const checked: ToolDefinition = {
    ...def,
    create: (ctx: ToolContext): Tool => {
      const tool = def.create(ctx);
      type Execute = (a: unknown, o?: unknown) => Promise<unknown>;
      const execute = (tool as { execute: Execute }).execute.bind(tool);
      const run = async (args: Record<string, unknown>, opts?: unknown): Promise<unknown> => {
        const spec = OUTBOUND_TOOLS[def.id];
        if (spec?.applies && !spec.applies(args)) return execute(args, opts); // e.g. to the owner
        if (isSyntheticUserId(ctx.userId)) return execute(args, opts); // the confirm gate answers
        type Run = { ctx?: { userData?: { userId?: unknown } } } | undefined;
        const caller = (opts as Run)?.ctx?.userData?.userId;
        const refusal =
          noAccountRefusal(
            ctx.userId || undefined,
            typeof caller === 'string' ? caller : undefined
          ) ?? (await canonTargetRefusal(args ?? {}, ctx.userId));
        if (refusal) return refusal;
        return execute(args, opts);
      };
      return { ...tool, execute: run } as Tool;
    },
  };
  (checked as unknown as Record<symbol, unknown>)[CHECKED] = true;
  return checked;
}

/** The definition, wrapped to wait for the caller's yes if it reaches a third party. */
export function gateOutboundTool(def: ToolDefinition): ToolDefinition {
  if ((def as unknown as Record<symbol, unknown>)[CHECKED]) return def;
  const spec = Object.hasOwn(OUTBOUND_TOOLS, def.id) ? OUTBOUND_TOOLS[def.id] : undefined;
  return spec ? withCallerChecks(withOutreachConfirmation(def, spec)) : def;
}

/** Names the executor path (agents/shared/tool-executors) runs that reach a third party. */
const DISPATCH_OUTBOUND = new Set([
  ...Object.keys(OUTBOUND_TOOLS).map((id) => id.toLowerCase()),
  ...['call_make', 'telephony_call', 'makephonecall', 'callcontact', 'havefernicall'],
  ...['callforconversation', 'sendvoicemessage', 'sendmessage', 'sendtext', 'sendsms'],
  ...['sendemail', 'sms_send', 'message_send', 'sendwhatsapp', 'sendtelegram', 'senddiscord'],
  ...['sendslack', 'sendmessagechannel', 'requesthotelquotes', 'makerestaurantreservation'],
  ...['schedulehealthcareappointment', 'getservicequotes'],
]);

/**
 * For the executor path (chat API, text dispatch), which has no live call to
 * hear a yes: why an outbound tool sent nothing, or null to run it.
 */
export function outboundDispatchRefusal(
  fn: string,
  userId: string | undefined,
  args: Record<string, unknown> = {}
): string | null {
  if (!DISPATCH_OUTBOUND.has(fn.toLowerCase())) return null;
  const spec = Object.entries(OUTBOUND_TOOLS).find(([id]) => id.toLowerCase() === fn.toLowerCase());
  if (spec?.[1].applies && !spec[1].applies(args)) return null; // e.g. a reminder to the owner
  if (isSyntheticUserId(userId)) return testAccountReply(fn);
  const noAccount = noAccountRefusal(userId); // with or without the confirm gate
  if (noAccount) return noAccount;
  if (!isOutreachConfirmOn()) return null;
  return 'Nothing was sent: I can only call, text or email someone after the caller says yes on a live call.';
}
