/**
 * The voicemail Ferni leaves on someone's behalf when a Twilio call reaches a
 * machine (on-behalf-call-orchestrator.ts handleMachineDetection).
 *
 * Fixed words only, no model: the AI-friend greeting (opening-line.ts
 * voicemailGreeting), one relay sentence about the requester, and the close.
 * The requester's own words are only ever said inside an attributed quote
 * ("Sam asked me to pass on a message, in their words: ..."), so Ferni never
 * speaks as them, whatever the request says. A few common English requests
 * ("say hi", "remind her to ...") get a plainer sentence instead.
 *
 * @module services/outreach/on-behalf-voicemail
 */

import { getLogger } from '../../utils/safe-logger.js';
import { partiesOf, voicemailGreeting } from './opening-line.js';

const log = getLogger().child({ service: 'on-behalf-voicemail' });

/** What a voicemail left on someone's behalf is made from: the request, nothing else. */
export interface OnBehalfVoicemailRequest {
  /** The contact as the requester saved them ("Alex", "Mom"). */
  recipientName?: string;
  /** The requester's name as the request carries it ("Sam", or a placeholder like "the user"). */
  requesterName?: string;
  /** What the requester asked Ferni to pass on. */
  purpose: string;
  callType: string;
}

const CLOSE = 'They wanted to make sure you got this message. Take care, and talk soon.';

/** Words that would make "remind you about Y" say the wrong person once Ferni says it. */
const PRONOUNS = new Set(
  'i me my mine we us our she her hers he him his they them their'.split(' ')
);

/** Greeting words after "happy" that read wrongly in "wishes you a happy ...". */
const NOT_OCCASION = new Set([...PRONOUNS, 'to', 'from', 'for', 'and', 'with', 'you', 'your']);

const WORD = /[\p{L}\p{M}\p{N}'’-]+/gu;

/** The words of `text`, lower case, with contractions cut back to the word ("she's" is "she"). */
function wordsOf(text: string): string[] {
  return (text.match(WORD) ?? []).map((word) => word.toLowerCase().split(/['’]/)[0] ?? '');
}

function hasPronoun(text: string): boolean {
  return wordsOf(text).some((word) => PRONOUNS.has(word));
}

/** The request as matched: one Unicode form, no invisible characters, plain single spaces. */
function normalised(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "her", "him", "them", "you", or the recipient's first or full name. */
function recipientPattern(recipientName: string | undefined): string {
  const names = recipientName ? [recipientName, recipientName.split(' ')[0] ?? ''] : [];
  return ['her', 'him', 'them', 'you', ...names.filter(Boolean).map(escaped)].join('|');
}

/** The request as it is quoted: trimmed, and ended with a period if it has no end. */
function quoted(purpose: string): string {
  const said = purpose.trim();
  return /[.!?…]$/u.test(said) ? said : `${said}.`;
}

type Relay = 'quote' | 'tell' | 'greet' | 'wish' | 'remind' | 'ask' | 'empty';

/** One sentence about the requester: a plain one for a few English requests, else their words quoted. */
function relayOf(
  sponsor: string,
  purpose: string,
  recipientName: string | undefined
): { relay: Relay; said: string } {
  const asked = normalised(purpose);
  if (!/[\p{L}\p{N}]/u.test(asked))
    return { relay: 'empty', said: `${sponsor} asked me to call you.` };
  const byQuote = (words: string): string =>
    `${sponsor} asked me to pass on a message, in their words: ${quoted(words)}`;
  // English requests only: any letter outside the Latin script is quoted as it is
  if (/[^\P{L}\p{Script=Latin}]/u.test(asked)) return { relay: 'quote', said: byQuote(purpose) };
  const to = `(?:${recipientPattern(recipientName)})`; // who the request is about
  const match = (pattern: string): RegExpExecArray | null =>
    new RegExp(`^${pattern}$`, 'iu').exec(asked);

  const tell = match(`(?:tell ${to}|let ${to} know),?(?: that)? (.+)`);
  if (tell?.[1]) return { relay: 'tell', said: byQuote(tell[1]) };
  const greet = match(`(?:say )?(hi|hello|hey)(?: to ${to})?(?: for me)?[.!]*`);
  if (greet?.[1]) return { relay: 'greet', said: `${sponsor} says ${greet[1].toLowerCase()}!` };
  const one = WORD.source;
  const wish = match(
    `(?:say |wish ${to} (?:a )?)?happy (${one}(?: ${one}){0,2}?)(?: to ${to})?(?: for me)?[.!]*`
  );
  const occasion = wish?.[1];
  if (occasion && !wordsOf(occasion).some((word) => NOT_OCCASION.has(word))) {
    return { relay: 'wish', said: `${sponsor} wishes you a happy ${occasion}!` };
  }
  for (const [relay, verb, joins] of [
    ['remind', 'remind', 'about|to|that'],
    ['ask', 'ask', 'to|if|about|whether'],
  ] as const) {
    const errand = match(`${verb} ${to} (${joins}) (.+?)[.!?]*`);
    if (errand?.[1] && errand[2] && !hasPronoun(errand[2])) {
      const said = `${sponsor} wanted to ${verb} you ${errand[1].toLowerCase()} ${errand[2]}.`;
      return { relay, said };
    }
  }
  return { relay: 'quote', said: byQuote(purpose) };
}

/** The words of a voicemail Ferni leaves on someone's behalf: the AI-friend greeting, the message, the close. */
export function onBehalfVoicemail(request: OnBehalfVoicemailRequest): string {
  const parties = partiesOf({
    recipientName: request.recipientName,
    userName: request.requesterName,
    callType: request.callType,
  });
  const { relay, said } = relayOf(
    parties.sponsorName ?? 'Someone',
    request.purpose,
    parties.recipientName
  );
  // Counts only: never the request, a name or the words said
  log.info(
    { relay, named: Boolean(parties.sponsorName), purposeChars: request.purpose.length },
    'On-behalf voicemail built'
  );
  return `${voicemailGreeting(parties)} ${said} ${CLOSE}`;
}
