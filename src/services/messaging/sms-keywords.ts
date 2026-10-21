/**
 * The one list of keywords an inbound text to Ferni's number can be, and the one
 * reply each gets. Every inbound handler reads it: the webhook's reply
 * (twilio-webhooks.ts), the opt-out stores (consent.ts recordInboundSmsConsent
 * writes consent/{phoneHash} and feature_checkin_optouts) and proactive check-ins
 * (proactive-channels/sms-replies.ts). So a text that opts someone out always gets
 * the same confirmation and is honoured by every sender that reads either store.
 *
 * Opt-out: the CTIA words (STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT) and the
 * FCC's per-se revocations (REVOKE, OPT OUT) as the whole message, in any case or
 * punctuation. Missing a real opt-out keeps texting someone who asked us to stop,
 * so it leans toward opting out: explicit asks count anywhere ("please don't text
 * me again"), and the opt-out words count in a short message ("please stop",
 * "cancel please"). A long reply that merely contains "end" stays a reply.
 * "Stop calling" and its kin, as the whole message, opt out of calls too.
 * Opt-in: START or UNSTOP (texts only; a do-not-call is undone by the owner).
 * HELP or INFO: the help line.
 *
 * If Twilio's own opt-out handling is on for the sending number, Twilio answers
 * these itself and drops our TwiML, so the member still gets one confirmation.
 *
 * @module services/messaging/sms-keywords
 */
import type { ConsentChannel } from './consent.js';

export type SmsKeyword = 'stop' | 'start' | 'help';

export interface InboundKeyword {
  readonly keyword: SmsKeyword;
  /** What a stop or start changes; empty for help. */
  readonly channels: readonly ConsentChannel[];
}

const STOP_WORDS: ReadonlySet<string> = new Set([
  ...['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit'],
  ...['revoke', 'optout', 'opt out'],
]);
const START_WORDS: ReadonlySet<string> = new Set(['start', 'unstop']);
const HELP_WORDS: ReadonlySet<string> = new Set(['help', 'info']);
// The whole message: "stop calling", "please stop calling me", "don't call me", "do not call".
const STOP_CALLING =
  /^(please )?(stop calling|don'?t call|do not call)( me)?( again| anymore)?( please)?$/;
const STOP_ANYWHERE =
  /\b(unsubscribe|stopall|optout|opt (me )?out)\b|\b(stop|quit) (texting|messaging)\b|\b(don'?t|do not) (text|message)\b|\bno more (texts|messages)\b/;
const STOP_SHORT = /\b(stop|cancel|quit|end|revoke)\b/;
const SHORT_WORDS = 4;

/** Lower case, curly quotes straightened, punctuation gone, spaces collapsed: "Stop ." is "stop". */
const normalize = (body: string): string =>
  body
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/'(?!\p{L})|(?<!\p{L})'/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Which keyword an inbound text is, or null for an ordinary message. */
export function inboundKeyword(body: string): InboundKeyword | null {
  const said = normalize(body);
  if (STOP_CALLING.test(said)) return { keyword: 'stop', channels: ['sms', 'call'] };
  const short = said.split(' ').length <= SHORT_WORDS;
  if (STOP_WORDS.has(said) || STOP_ANYWHERE.test(said) || (short && STOP_SHORT.test(said))) {
    return { keyword: 'stop', channels: ['sms'] };
  }
  if (START_WORDS.has(said)) return { keyword: 'start', channels: ['sms'] };
  if (HELP_WORDS.has(said)) return { keyword: 'help', channels: [] };
  return null;
}

export const SMS_KEYWORD_REPLIES: Record<SmsKeyword, string> = {
  stop: "You're unsubscribed from Ferni texts. Reply START to resubscribe.",
  start:
    "Welcome back! You're resubscribed to Ferni texts. Msg & data rates may apply. Reply STOP to cancel, HELP for help.",
  help: 'Ferni: reminders and check-ins you turned on, up to 3 msgs/day. Msg & data rates may apply. Reply STOP to cancel. Help: support@ferni.ai or ferni.ai/sms-consent',
};
