/**
 * The one reading of an inbound text to Ferni's number as a consent keyword,
 * used by every inbound handler: the webhook's reply (twilio-webhooks.ts), the
 * opt-out stores (consent.ts recordInboundSmsConsent) and proactive check-ins
 * (proactive-channels/sms-replies.ts).
 *
 * The FCC lets people revoke "by any reasonable means". An exact keyword or a
 * clear, explicit request is an opt-out; anything ambiguous is not, and gets a
 * clarifying question instead. So there are three outcomes:
 *
 * - opt-out: the whole message (after normalize) is a CTIA keyword (STOP,
 *   STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE, OPTOUT, OPT OUT), or a
 *   sentence of it is an explicit ask ("stop texting me", "take me off your
 *   list", "stop calling me"). "please stop" and "stop please" count whole.
 * - maybe: a short message whose only real word is an opt-out word ("please
 *   cancel", "Can you cancel?"), or "leave me alone". Not an opt-out and not
 *   confirmed, but it leans toward stopping: consent.ts pauses proactive and
 *   third-party texts to that phone for up to 7 days, and Ferni sees it
 *   flagged so he can ask. "yes, stop" then opts out; "keep texting me" or
 *   "no, don't stop" (resume) lifts the pause.
 * - null: an ordinary message ("cancel my 3pm", "don't stop", "end of day
 *   works"), routed as any other.
 *
 * START or UNSTOP opts back in to texts; HELP or INFO gets the help line. Both
 * count only as the exact keyword, so "help!" reaches Ferni.
 *
 * `twilioReplies`: Twilio answers its own standard keywords (the raw message is
 * exactly STOP, START, HELP...) and drops our TwiML for them, so the app sends
 * no second reply; any other opt-out or opt-in gets ours (keywordReply).
 *
 * @module services/messaging/sms-keywords
 */
import type { ConsentChannel } from './consent.js';

export type InboundKeyword =
  | { kind: 'opt-out' | 'opt-in'; channels: ConsentChannel[]; twilioReplies: boolean }
  | { kind: 'help'; twilioReplies: true }
  | { kind: 'maybe-opt-out' | 'resume' };

// Twilio's default keywords (REVOKE and OPTOUT added for the FCC's 2025 revocation rule).
const TWILIO_STOP = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'revoke', 'optout'];
const TWILIO: ReadonlyMap<string, 'opt-out' | 'opt-in' | 'help'> = new Map([
  ...TWILIO_STOP.map((w) => [w, 'opt-out'] as const),
  ...['start', 'unstop'].map((w) => [w, 'opt-in'] as const),
  ...['help', 'info'].map((w) => [w, 'help'] as const),
]);
const EXACT_STOP: ReadonlySet<string> = new Set([
  ...TWILIO_STOP,
  ...['opt out', 'stop all', 'please stop', 'stop please', 'yes stop', 'yes please stop'],
]);
const LEAD = String.raw`(?:(?:yes|yeah|please|pls|plz|ok|okay|hey|ferni|just|can you|could you|would you) )*`;
const TAIL = String.raw`(?: (?:please|pls|plz|thanks|thank you|thx|now|again|anymore|any more|ever|for good))*`;
const sentence = (ask: string): RegExp => new RegExp(`^${LEAD}(?:${ask})${TAIL}$`);
const STOP_TEXTS = sentence(
  [
    'stop (?:texting|messaging|sending (?:me )?(?:texts|messages))(?: me)?',
    "(?:don't|do not|never) (?:text|message) me",
    'no more (?:texts|messages|text messages)',
    'take me off (?:your|the|this|ur) (?:list|texting list)',
    'remove me(?: from (?:your|the|this) list)?',
    'unsubscribe me',
    'opt me out',
  ].join('|')
);
const STOP_CALLS = sentence("(?:stop calling|don't call|do not call|never call)(?: me)?");
const OPT_WORDS = /^(?:stop|stopall|unsubscribe|cancel|end|quit|revoke|optout)$/;
const FILLER: ReadonlySet<string> = new Set(
  [
    'please',
    'pls',
    'plz',
    'can',
    'could',
    'would',
    'will',
    'you',
    'u',
    'just',
    'ok',
    'okay',
  ].concat(
    ['now', 'it', 'this', 'that', 'these', 'them', 'all', 'ferni', 'hey', 'hi', 'i', 'me', 'want'],
    ['to', 'thanks', 'the', 'so', 'yes', 'yeah']
  )
);
const NEGATION = /\b(?:don't|dont|do not|never|not|no)\b/;
const SOFT =
  /^(?:please )?(?:leave me alone|go away|enough|too many (?:texts|messages))(?: please)?$/;
const RESUME =
  /^(?:no )?(?:please )?(?:keep (?:texting|messaging)(?: me)?|(?:don't|do not) stop(?: texting me)?)(?: please)?$/;

/** NFKC (fullwidth folded), lower case, punctuation and emoji gone, "S T O P" joined. */
export function normalizeSms(body: string): string {
  const s = body
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/'(?!\p{L})|(?<!\p{L})'/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /^(?:\p{L} )+\p{L}$/u.test(s) ? s.replace(/ /g, '') : s;
}

/** What an inbound text means for consent (see the module comment), or null. */
export function inboundKeyword(body: string): InboundKeyword | null {
  const raw = body.trim().toLowerCase();
  const said = normalizeSms(body);
  const twilio = TWILIO.get(raw);
  if (twilio === 'help') return { kind: 'help', twilioReplies: true };
  const twilioReplies = twilio !== undefined;
  const sentences = body.split(/[.!?;\n]+/).map(normalizeSms);
  if (sentences.some((x) => STOP_CALLS.test(x))) {
    return { kind: 'opt-out', channels: ['sms', 'call'], twilioReplies };
  }
  if (EXACT_STOP.has(said) || sentences.some((x) => STOP_TEXTS.test(x))) {
    return { kind: 'opt-out', channels: ['sms'], twilioReplies };
  }
  if (said === 'start' || said === 'unstop') {
    return { kind: 'opt-in', channels: ['sms'], twilioReplies };
  }
  if (RESUME.test(said)) return { kind: 'resume' };
  const words = said.split(' ').filter((w) => !FILLER.has(w));
  const lone = words.length === 1 && OPT_WORDS.test(words[0] ?? '');
  if (SOFT.test(said) || (lone && !NEGATION.test(said))) return { kind: 'maybe-opt-out' };
  return null;
}

const REPLIES = {
  sms: "You're unsubscribed from Ferni texts. Reply START to resubscribe.",
  call: "You're unsubscribed from Ferni texts and calls. Reply START to get texts again.",
  start:
    "Welcome back! You're resubscribed to Ferni texts. Msg & data rates may apply. Reply STOP to cancel, HELP for help.",
} as const;

/** The app's one confirmation, or undefined when Twilio answers it or nothing changed. */
export function keywordReply(k: InboundKeyword | null): string | undefined {
  if ((k?.kind !== 'opt-out' && k?.kind !== 'opt-in') || k.twilioReplies) return undefined;
  if (k.kind === 'opt-in') return REPLIES.start;
  return k.channels.includes('call') ? REPLIES.call : REPLIES.sms;
}
