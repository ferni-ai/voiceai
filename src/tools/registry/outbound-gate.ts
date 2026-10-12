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
 * owner's own saved number or address (callUser, sendImmediateOutreach,
 * sendMessageNow, schedule*).
 *
 * @module tools/registry/outbound-gate
 */

import { isSyntheticUserId } from '../../utils/synthetic-user.js';
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
};

/** Gate a tool built without a ToolDefinition (legacy persona tool sets). */
export function gateLegacyTool(id: string, tool: unknown, ctx: ToolContext): unknown {
  const def: ToolDefinition = {
    id,
    name: id,
    description: id,
    domain: 'communication',
    create: () => tool as Tool,
  };
  return gateOutboundTool(def).create(ctx);
}

/** The definition, wrapped to wait for the caller's yes if it reaches a third party. */
export function gateOutboundTool(def: ToolDefinition): ToolDefinition {
  const spec = Object.hasOwn(OUTBOUND_TOOLS, def.id) ? OUTBOUND_TOOLS[def.id] : undefined;
  return spec ? withOutreachConfirmation(def, spec) : def;
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
export function outboundDispatchRefusal(fn: string, userId: string | undefined): string | null {
  if (!DISPATCH_OUTBOUND.has(fn.toLowerCase())) return null;
  if (isSyntheticUserId(userId)) return testAccountReply(fn);
  if (!isOutreachConfirmOn()) return null;
  return 'Nothing was sent: I can only call, text or email someone after the caller says yes on a live call.';
}
