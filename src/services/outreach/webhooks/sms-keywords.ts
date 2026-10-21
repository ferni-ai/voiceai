/**
 * The CTIA keywords Ferni's number answers, and the one reply each gets.
 *
 * The opt-out words are the ones checkin-replies.ts also records as an opt-out
 * (and START the one it clears), so a confirmation never promises something the
 * guarded sender wouldn't honour. If Twilio's own opt-out handling is on for the
 * sending number, Twilio answers these itself and drops our TwiML, so the member
 * still gets exactly one confirmation.
 *
 * @module services/outreach/webhooks/sms-keywords
 */

export type SmsKeyword = 'stop' | 'start' | 'help';

const KEYWORDS = new Map<string, SmsKeyword>([
  ...['stop', 'stopall', 'unsubscribe', 'cancel', 'quit', 'end'].map((w) => [w, 'stop'] as const),
  ['start', 'start'],
  ['help', 'help'],
  ['info', 'help'],
]);

export const SMS_KEYWORD_REPLIES: Record<SmsKeyword, string> = {
  stop: "You're unsubscribed from Ferni texts. Reply START to resubscribe.",
  start:
    "Welcome back! You're resubscribed to Ferni texts. Msg & data rates may apply. Reply STOP to cancel, HELP for help.",
  help: 'Ferni: reminders and check-ins you turned on, up to 3 msgs/day. Msg & data rates may apply. Reply STOP to cancel. Help: support@ferni.ai or ferni.ai/sms-consent',
};

/** Which keyword a whole inbound text is ("STOP", " help "), or undefined for anything else. */
export function smsKeyword(body: string): SmsKeyword | undefined {
  return KEYWORDS.get(body.toLowerCase().trim());
}
