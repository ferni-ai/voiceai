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
import { onPlacedCall, verifiedCallerId } from '../../../../services/identity/verified-caller.js';
import { getLogger } from '../../../../utils/safe-logger.js';
import type { Tool, ToolContext, ToolDefinition } from '../../../registry/types.js';
import { callSessionData } from '../../../utils/call-session-data.js';
import {
  CONTENT_BLOCKS,
  blockedContent,
  destinationIn,
  digitsIn,
  foldToAscii,
  ruleForm,
  type ContentBlock,
} from './owner-message-content.js';

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

/** An allowed send the tool then did not deliver: logged (delivery_failed); the slot stays spent. */
export const ownerMessageNotDelivered = (message: OwnerMessage): void =>
  logOutcome(message, 'delivery_failed');

/**
 * OWNER_OUTREACH_STORED_TEXT_SCREEN=on (default off): text stored from calls (what a
 * caller said, or what was saved from it) is screened before the outreach jobs put it
 * in a message to the owner: proactive check-ins, pondered notes, the morning brief,
 * commitment pushes. Those jobs can't tell a verified owner's row from an unverified
 * caller's, so every stored text is screened. Read where those jobs run (the UI
 * server); UNVERIFIED_OWNER_MESSAGE_FILTER belongs to live calls and is not read here.
 */
export function storedTextScreenOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return flagOn('OWNER_OUTREACH_STORED_TEXT_SCREEN', env);
}

/** Where stored text is about to go to the owner: the job's site, and whose message it is. */
export interface StoredTextSite {
  site: 'proactive' | 'morning-brief' | 'commitment-push';
  userId: string;
}

/** Why stored text was kept out; logged as the reason code, never with the text. */
export type StoredTextBlock =
  | 'code_handover'
  | 'money_destination'
  | 'callback_scam'
  | 'not_text'
  | 'too_long'
  | 'screen_error';

/** Longer than any line these jobs send; past it, refuse rather than scan. */
export const STORED_TEXT_MAX_CHARS = 10_000;

const CODE_WORD = /\b(?:pass)?codes?\b|\bpasswords?\b|\bpins?\b|\bone[\s-]?time\b|\botps?\b|\bverification\b/i; // prettier-ignore
const HAND_OVER = /\b(?:send|text|tell|give|read|share|reply|forward)(?:s|ed|ing)?\b|\bsent\b|\btold\b|\bgave\b/i; // prettier-ignore
const MONEY_WORD = /\b(?:wir(?:e|es|ed|ing)|pay(?:s|ing|ment|ments)?|paid|send(?:s|ing)?|sent|transfer\w*|refund\w*|deposit\w*|gift\s?cards?|venmo|zelle|paypal|cash\s?app|bitcoin|crypto)\b|[$\u20AC\u00A3]\s?\d|\b\d+\s?(?:dollars?|bucks|usd)\b/i; // prettier-ignore
const CALLBACK = /\b(?:call|text|contact|reach|ring|dial)(?:s|ed|ing)?\b|\brang\b/i;
const ACCOUNT_CUE = /\b(?:accounts?|banks?|banking|cards?|fraud\w*|suspend\w*|lock(?:s|ed)?|security|verif\w*|irs|warrants?|overdue|arrest\w*)\b/i; // prettier-ignore
/** destinationIn's phone-shaped results, as against an address or a mail provider. */
const PHONE_SHAPED: ReadonlySet<ContentBlock> = new Set(['digits', 'short_code', 'vanity_number', 'spaced_chars']); // prettier-ignore
/** A bare date a job wrote ("on 2026-10-19") with no other digit next to it: not a number to call. */
const LONE_ISO_DATE = /(?<!\d[\s().-]*)\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b(?![\s().-]*\d)/g; // prettier-ignore

/** A price's digits ("1,200", "500.00"): at most six, never a phone-length run. */
const AMOUNT = String.raw`(?:\d{1,3}(?:,\d{3})?|\d{1,6})(?:\.\d{2})?(?![\d,])`;
/** An amount ("$500", "500 dollars") with no other digit next to it: a price, not a number to call. */
/** The rules a price's own digits can trip: the only ones the amount mask may lift. */
const DIGIT_RULES: ReadonlySet<ContentBlock> = new Set(['digits', 'short_code']);
/**
 * The text cut where a reader would see separate amounts: before a currency sign only once a
 * word (two letters or more) stands since the last one. "$1200 and $350" is two; "$555/$1234" one.
 */
function amountRuns(text: string): string[] {
  const runs: string[] = [];
  for (const piece of text.split(/(?=[$\u20AC\u00A3])/)) {
    if (runs.length > 0 && !/\p{L}{2}/u.test(runs[runs.length - 1])) runs[runs.length - 1] += piece;
    else runs.push(piece);
  }
  return runs;
}
const LONE_AMOUNT = new RegExp(String.raw`(?<!\d[\s().-]*)(?:[$\u20AC\u00A3]\s?${AMOUNT}|\b${AMOUNT}\s?(?:dollars?|bucks|usd)\b)(?![\s().-]*\d)`, 'gi'); // prettier-ignore

function hostileIn(text: string): StoredTextBlock | null {
  const form = foldToAscii(text);
  if (CODE_WORD.test(form) && HAND_OVER.test(form)) return 'code_handover';
  // Each becomes a word, not a gap: a gap before a full stop would read as a spaced-out dot.
  const dated = form.replace(LONE_ISO_DATE, 'date');
  // On the rules' own form, so / & " and emoji are separators to the mask as they are to destinationIn
  const ruled = ruleForm(dated);
  const masked = destinationIn(ruled.replace(LONE_AMOUNT, 'amount'));
  const unmasked = destinationIn(ruled);
  // The stricter of the two: the mask only lifts a price's own digits. Seven digits stay a number
  // unless a word stands between the amounts that hold them.
  const longRun = amountRuns(ruled).some((run) => digitsIn(run) === 'digits');
  const destination = longRun ? 'digits' : unmasked && !DIGIT_RULES.has(unmasked) ? unmasked : masked; // prettier-ignore
  if (!destination) return null;
  if (MONEY_WORD.test(form)) return 'money_destination';
  const callback = PHONE_SHAPED.has(destination) && CALLBACK.test(form);
  return callback && ACCOUNT_CUE.test(form) ? 'callback_scam' : null;
}

/**
 * Why stored call text may not go into a message to the owner, or null when it may.
 * The jobs can't tell the owner's rows from a caller's, and the owner's rows carry
 * numbers, prices, links and phone numbers all the time ("Call Dr. Lee at 555-0123",
 * "Pay rent $1200", "Order from amazon.com"). So nothing is refused for its characters,
 * only for an instruction a scam needs, read on foldToAscii's form:
 * - code_handover: a code word (code, password, PIN, one-time, OTP, verification) with
 *   a hand-over verb (send, text, tell, give, read, share, reply, forward);
 * - money_destination: a money word (wire, pay, send, transfer, refund, deposit, gift
 *   card, a payment app, crypto, a currency amount) with somewhere to send it;
 * - callback_scam: a call or text verb with a phone-shaped number and an account or
 *   alarm word (account, bank, card, fraud, locked, security, IRS, warrant...).
 * "Somewhere to send it" is destinationIn: blockedContent's own number, address and
 * mail rules. Anything that is not a string, is over STORED_TEXT_MAX_CHARS, or can't
 * be read is refused (fail closed).
 */
export function hostileStoredText(text: unknown): StoredTextBlock | null {
  if (typeof text !== 'string') return 'not_text';
  if (text.length > STORED_TEXT_MAX_CHARS) return 'too_long';
  try {
    return hostileIn(text);
  } catch {
    return 'screen_error';
  }
}

/**
 * Whether stored texts may go into a message to the owner: yes unless the screen is on
 * and one carries a scam's instruction (hostileStoredText); a non-string, or a text
 * that can't be read, is refused. A refusal is logged with the site, user and reason
 * code, never the text.
 */
export function storedTextForOwner(
  texts: readonly unknown[],
  where: StoredTextSite,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!storedTextScreenOn(env)) return true;
  for (const text of texts) {
    const reason = hostileStoredText(text);
    if (!reason) continue;
    log.info(
      { site: where.site, userId: where.userId, reason },
      'Stored text kept out of a message to the owner'
    );
    return false;
  }
  return true;
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
  // A routed run (semantic-router executor) carries no verified bit: unverified, fail closed.
  // A call we placed to their number can be answered by anyone (onPlacedCall): unverified too.
  const verified = verifiedCallerId(call) === message.ownerId && !onPlacedCall(call);
  if (member && verified) return { outcome: 'unchanged' };
  const decision = member ? unverifiedDecision(message, call) : refuse('no_account');
  if (decision.outcome === 'refused') logOutcome(message, decision.reason);
  return decision;
}

type Args = Record<string, unknown>;
/** How these tools' replies begin when nothing went out (no verified phone, quiet hours, a failure). */
const NOT_SENT_REPLY = /^(?:I can't|I couldn't|I didn't|Couldn't|Something went wrong|I need)/;

/** How a tool's run reaches the owner: what the model wrote, and how it is delivered. */
export interface OwnerMessageSpec {
  /** Every model-written argument that is sent or stored */
  texts: readonly string[];
  /** The argument the footer is added to */
  footerOn: string;
  /** Spoken on a call rather than texted: no footer */
  spoken?: (args: Args) => boolean;
  /** False for runs that send the owner nothing (a calendar event): those skip the policy */
  applies?: (args: Args) => boolean;
}

const MESSAGE: OwnerMessageSpec = { texts: ['message', 'subject', 'contactName'], footerOn: 'message' }; // prettier-ignore
const REMINDER: OwnerMessageSpec = { texts: ['message'], footerOn: 'message' };
/** By tool id; any other id sends `message` (with `subject` and `contactName`) as text. */
const SPECS: Readonly<Record<string, OwnerMessageSpec>> = {
  callUser: { ...MESSAGE, spoken: () => true },
  scheduleCall: { ...MESSAGE, spoken: () => true },
  sendImmediateOutreach: { ...MESSAGE, spoken: (args) => args.method === 'call' },
  scheduleProactiveReminder: { ...MESSAGE, spoken: (args) => args.method === 'voice' },
  scheduleAtBestTime: { ...MESSAGE, spoken: (args) => args.channel === 'call' },
  // Reminders: any of them may be texted to the owner (reminder-text-guard.ts)
  setReminder: { ...REMINDER, spoken: (args) => args.deliveryMethod === 'call' },
  recurringReminder: REMINDER,
  scheduleReminder: { texts: ['title'], footerOn: 'title', applies: (args) => args.type !== 'event' }, // prettier-ignore
};
/** Alex's scheduleCall (communication-tools.ts): texts the owner "Call with {contact}... Purpose: {purpose}". */
export const CALL_REMINDER_SPEC: OwnerMessageSpec = { texts: ['contact', 'purpose'], footerOn: 'purpose' }; // prettier-ignore

/** Every spec in use, by name: the default, each tool's, and Alex's call reminder. */
export const ownerMessageSpecs = (): ReadonlyArray<[string, OwnerMessageSpec]> => [
  ['default', MESSAGE],
  ...Object.entries(SPECS),
  ['CALL_REMINDER_SPEC', CALL_REMINDER_SPEC],
];

/** The definition, wrapped so each run goes through ownerMessagePolicy first. */
export function ownerMessageTool(
  def: ToolDefinition,
  spec: OwnerMessageSpec = SPECS[def.id] ?? MESSAGE
): ToolDefinition {
  return {
    ...def,
    create: (ctx: ToolContext): Tool => {
      const tool = def.create(ctx);
      type Execute = (args: unknown, opts?: unknown) => Promise<unknown>;
      const execute = (tool as { execute: Execute }).execute.bind(tool);
      const run = async (args: unknown, opts?: unknown): Promise<unknown> => {
        const given = (args ?? {}) as Args;
        if (spec.applies && !spec.applies(given)) return execute(args, opts);
        const spoken = spec.spoken?.(given) ?? false;
        const texts = spec.texts.map((name) => given[name]);
        const message: OwnerMessage = { tool: def.id, ownerId: ctx.userId, opts, texts, spoken };
        const decision = ownerMessagePolicy(message);
        if (decision.outcome === 'refused') return decision.line;
        if (decision.outcome === 'unchanged') return execute(args, opts);
        const raw = given[spec.footerOn];
        const body = typeof raw === 'string' ? raw : '';
        const sent = decision.footer
          ? { ...given, [spec.footerOn]: `${body}\n\n${decision.footer}` }
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
