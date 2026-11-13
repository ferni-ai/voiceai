/**
 * SB 243: a minor under care who texts Ferni is told it is an AI, on the first reply and
 * again once 3 hours have passed since the last reminder. The cadence lives here, keyed by
 * the member's id (or, for a held number with no account, its hold id: a keyed hash, never
 * the number), so other SMS reply paths can share it rather than keep their own.
 *
 * The route's crisis screen starts startHeldMinorLookup when the screen reads a crisis, then
 * passes its answer to withHeldMinorAiReminder: the crisis reply goes out whole, in its order,
 * and the reminder follows it at the end of the last message.
 *
 * @module services/outreach/sms-ai-reminder
 */
import { isMemberIdentity } from '../identity/member-identity.js';
import { heldSenderStrict, phoneHoldId } from './checkin-replies.js';
import { sharedHoldOn } from './minor-care-shared-hold.js';
import { escapeXml } from './twilio-ssml.js';
import { findAccountByVerifiedPhone } from './webhooks/sms-sender-account.js';

const SMS_AI_REMINDER = "(just a reminder, I'm an AI)";
const AI_REMINDER_EVERY_MS = 3 * 3_600_000;
/** Past this, counted from the screen's crisis read, the reply goes out without the reminder. */
const AI_REMINDER_DECIDE_MS = 2_000;

const LAST_MESSAGE_END = '</Message></Response>';
const remindedAt = new Map<string, number>();

/** True when `key` has had no reminder in the last 3 hours. */
function aiReminderDue(key: string, now: number): boolean {
  for (const [k, at] of remindedAt) if (now - at >= AI_REMINDER_EVERY_MS) remindedAt.delete(k);
  return !remindedAt.has(key);
}

function markAiReminded(key: string, at: number): void {
  remindedAt.set(key, at);
}

/**
 * Starts the held-minor lookup for a text the screen read as a crisis. The route starts it
 * before the handler and awaits it after, so its reads overlap the handler's instead of
 * following them. Settles within 2 s of the start and never rejects: undefined for a sender
 * not held, or not known in time. Hold flags off: nothing is read.
 */
export async function startHeldMinorLookup(from: string): Promise<string | undefined> {
  return heldReminderKey(from).catch(() => undefined);
}

/**
 * The crisis-screen TwiML, then the reminder at the end of its last message when `heldKey`
 * (from startHeldMinorLookup) names a held sender due one. The crisis text is never replaced,
 * reordered or cut. No key: the TwiML comes back as given.
 */
export function withHeldMinorAiReminder(
  twiml: string,
  heldKey: string | undefined,
  now = Date.now()
): string {
  if (!heldKey || !twiml.endsWith(LAST_MESSAGE_END) || !aiReminderDue(heldKey, now)) return twiml;
  markAiReminded(heldKey, now);
  const reminder = ` ${escapeXml(SMS_AI_REMINDER)}${LAST_MESSAGE_END}`;
  return `${twiml.slice(0, -LAST_MESSAGE_END.length)}${reminder}`;
}

/** The reminder key of a held sender; undefined for one not held, or not known in time. */
async function heldReminderKey(from: string): Promise<string | undefined> {
  if (!sharedHoldOn()) return undefined;
  const decided = (async () => {
    const account = await findAccountByVerifiedPhone(from);
    const userId = isMemberIdentity(account) ? account : undefined;
    if (!(await heldSenderStrict(userId, from))) return undefined;
    return userId ?? phoneHoldId(from);
  })().catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(resolve, AI_REMINDER_DECIDE_MS, undefined);
  });
  try {
    return await Promise.race([decided, late]);
  } finally {
    clearTimeout(timer);
  }
}
