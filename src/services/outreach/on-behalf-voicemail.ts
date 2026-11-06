/**
 * The voicemail Ferni leaves on someone's behalf when a Twilio call reaches a
 * machine (on-behalf-call-orchestrator.ts handleMachineDetection).
 *
 * It opens with the fixed AI-friend greeting (opening-line.ts
 * voicemailGreeting) and talks about the requester in the third person: an AI
 * never speaks as Sam. A model writes the rest only when the request has the
 * requester's real name, and any speaker naming themselves in it means fixed
 * words instead: a wrong reject costs some warmth, a wrong keep a disclosure.
 *
 * @module services/outreach/on-behalf-voicemail
 */

import { getLogger } from '../../utils/safe-logger.js';
import { callLLM } from '../llm-utils.js';
import { cleanLLMResponse, OUTREACH_LLM } from './message-enrichment.js';
import {
  isRelation,
  partiesOf,
  realName,
  voicemailGreeting,
  type OutboundParties,
} from './opening-line.js';

const log = getLogger().child({ service: 'on-behalf-voicemail' });

/** What a voicemail left on someone's behalf is made from: the request, nothing else. */
export interface OnBehalfVoicemailRequest {
  /** The contact as the requester saved them ("Alex", "Mom"). */
  recipientName: string;
  /** What the contact is to the requester ("mother", "doctor"). */
  relationship?: string;
  /** The requester's name as the request carries it ("Sam", "Sam Lee", or a placeholder like "the user"). */
  requesterName?: string;
  /** What the requester asked Ferni to pass on. */
  purpose: string;
  callType: string;
}

/** Contacts whose fallback voicemail is the warmer one. */
const CLOSE_RELATIONS = new Set('mother mom father dad spouse wife husband partner'.split(' '));

/** Text as checked and said: one Unicode form, no invisible format characters, one apostrophe. */
function normalised(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\p{Cf}/gu, '')
    .replace(/[‘’´ʼ`]/g, "'");
}

const WORD = "[\\p{L}\\p{M}'-]+";
/** "it's", "this is", "I'm", "my name is": the words after say who is talking. */
const SELF_INTRO = /\b(?:it'?s|it is|this is|my name'?s|my name is|i'?m|i am)\s*/giu;
const NEXT_WORDS = new RegExp(`^(${WORD})(?:\\s+(${WORD}))?(?:\\s+(${WORD}))?`, 'u');
/** "Sam here", "Alex, Sam speaking.", "Sam calling to say hi": a sign-in, ended or carried on. */
const SIGN_IN = new RegExp(
  `(${WORD})\\s+(?:here|speaking|calling)(?=\\s*(?:$|[^\\p{L}\\p{N}\\s]|(?:just|and|to|with|for|again|back|now)\\b))`,
  'giu'
);
const SIGN_OFF_BEFORE = /(?:\b(?:love|from|cheers|hugs|yours|(?:xo)+),?|[-–—])$/iu;
const SOFTENERS = new Set(['just', 'only', 'still', 'again', 'really']);
const FRIENDS = new Set(['friend', 'buddy', 'pal', 'bestie']);
/** Capitalised words that are not someone naming themselves. */
const NOT_NAMES = new Set(['ferni', 'i', 'im', 'ok', 'okay', 'ai', 'the', 'a', 'an']);

/** A name: the requester's (any case), or any capitalised word that could be one. */
function isName(word: string, names: Set<string>): boolean {
  if (names.has(word.toLowerCase())) return true;
  return /^\p{Lu}[\p{L}\p{M}-]*$/u.test(word) && !NOT_NAMES.has(word.toLowerCase());
}

function isKin(word: string): boolean {
  return isRelation(word) || FRIENDS.has(word.toLowerCase());
}

/** After "it's": "me", "just me", "your son", "your friend Sam", or a name. */
function namesSpeaker(words: string[], names: Set<string>): boolean {
  const [first = '', ...rest] = SOFTENERS.has(words[0]?.toLowerCase() ?? '')
    ? words.slice(1)
    : words;
  const lower = first.toLowerCase();
  if (lower === 'me') return true;
  if (lower === 'your') return rest.some(isKin);
  return isName(first, names);
}

/** "Love, Sam", "From Sam", "- Mom", "Talk soon, Sam": a name signed at the end. */
function signsOff(said: string, names: Set<string>): boolean {
  const words = [...said.matchAll(new RegExp(WORD, 'gu'))];
  // The signed name is the last word, or the one before a surname
  return words.slice(-2).some((word) => {
    const before = said.slice(0, word.index ?? 0).trimEnd();
    const signed = isName(word[0], names) || isKin(word[0]);
    return (
      (signed && SIGN_OFF_BEFORE.test(before)) ||
      (names.has(word[0].toLowerCase()) && before.endsWith(','))
    );
  });
}

/**
 * True when `text` has someone naming themselves: "It's Sam", "its me",
 * "it's your son", "my name's Jo", "Alex — Sam here", "Sam speaking",
 * "Love, Sam". Any name counts, not only the requester's; the requester's
 * real name (placeholders like "the user" are not names) is matched in any
 * case. Talking about them is fine ("Sam wanted me to say hi", "Sam's
 * thinking of you"), and so is a name used as a word: for a requester called
 * Hope, "Hope here" is caught but "I hope you're well" is not.
 */
export function speaksAsRequester(text: string, requesterName?: string): boolean {
  const said = normalised(text);
  const requester = realName(normalised(requesterName ?? ''));
  const names = new Set((requester ?? '').toLowerCase().split(/\s+/).filter(Boolean));
  for (const intro of said.matchAll(SELF_INTRO)) {
    const next = said.slice((intro.index ?? 0) + intro[0].length).match(NEXT_WORDS);
    const words = next ? next.slice(1).filter((word): word is string => Boolean(word)) : [];
    if (namesSpeaker(words, names)) return true;
  }
  for (const signIn of said.matchAll(SIGN_IN)) {
    if (isName(signIn[1] ?? '', names)) return true;
  }
  return signsOff(said, names);
}

/** The requester's "I", as Ferni says it about them; longer forms first. */
const THIRD_PERSON = new Map(
  "i'm>they're|im>they're|i am>they are|i was>they were|i'll>they'll|i've>they've|i'd>they'd|i>they|me>them|my>their|mine>theirs|myself>themselves"
    .split('|')
    .map((pair) => pair.split('>') as [string, string])
);
const FIRST_PERSON = new RegExp(`\\b(?:${[...THIRD_PERSON.keys()].join('|')})\\b`, 'gi');
/** "we" might or might not take in the person Ferni is calling: too unsure to rewrite. */
const FIRST_PERSON_PLURAL = /\b(?:we|we're|we'll|we've|we'd|us|our|ours|ourselves)\b/i;

/**
 * The request in Ferni's words: "tell her I miss her" → "tell her they miss
 * her", "I'll call later" → "say they'll call later". Undefined when it can't
 * be relayed safely: it names a speaker ("its me", "say it's Sam") or says "we".
 */
function inFerniWords(purpose: string, requesterName: string | undefined): string | undefined {
  const asked = normalised(purpose).trim();
  if (speaksAsRequester(asked, requesterName) || FIRST_PERSON_PLURAL.test(asked)) return undefined;
  if (asked.search(FIRST_PERSON) < 0) return asked;
  const relayed = asked.replace(
    FIRST_PERSON,
    (said) => THIRD_PERSON.get(said.toLowerCase().replace(/\s+/g, ' ')) ?? said
  );
  // Their own words, not an errand: "I miss you" is said, not done
  return /^the(?:y|ir|m)/.test(relayed) ? `say ${relayed}` : relayed;
}

/** What follows the greeting when no model writes it: the request, in Ferni's words. */
function fallbackBody(parties: OutboundParties, request: OnBehalfVoicemailRequest): string {
  const who = parties.sponsorName ?? 'Someone';
  const purpose = inFerniWords(request.purpose, parties.sponsorName);
  if (!purpose) {
    log.warn('A voicemail request could not be passed on in Ferni words: left one without it');
    return `${who} asked me to pass on a message, and they'll be in touch soon. Take care.`;
  }
  return CLOSE_RELATIONS.has((request.relationship ?? '').toLowerCase())
    ? `${who} wanted me to ${purpose}... Just know they're thinking of you. They love you. Bye.`
    : `${who} wanted me to ${purpose}. They wanted to make sure you got this message. Take care, and talk soon.`;
}

function bodyPrompt(
  parties: OutboundParties,
  sponsor: string,
  request: OnBehalfVoicemailRequest
): string {
  const recipient = parties.recipientName ?? 'them';
  const relation = request.relationship
    ? ` ${recipient} is ${sponsor}'s ${request.relationship}.`
    : '';
  return [
    `You are Ferni, an AI friend, leaving a voicemail for ${recipient} on behalf of ${sponsor}.${relation}`,
    `What ${sponsor} asked you to pass on: "${request.purpose}"`,
    `The greeting is said for you already: "${voicemailGreeting(parties)}" Write only what comes after it, in 2 or 3 short, warm sentences.`,
    `- Speak as Ferni, and talk about ${sponsor} in the third person: "${sponsor} wanted me to...", "${sponsor} says...".`,
    `- Never speak as ${sponsor}: never "it's ${sponsor}", "this is ${sponsor}", "${sponsor} here", "I'm ${sponsor}" or "it's me".`,
    '- Keep what the message means, and add nothing about anyone that it does not say.',
    '- No questions, no phone numbers, no em dashes.',
    '- End with a warm goodbye that does not ask for a call back.',
    'Return only the words to say.',
  ].join('\n');
}

const SPOKEN_WORD = /[\p{L}\p{N}']+/gu;

/**
 * The model's text without the greeting it repeated, so it is said once. It
 * cuts only where the greeting does: after "Hi Alex", after "it's Ferni", or
 * after all of it ("Hi Alex, it's been a while" keeps "it's been a while").
 */
function withoutGreeting(written: string, parties: OutboundParties): string {
  const greeting = voicemailGreeting(parties).toLowerCase().match(SPOKEN_WORD) ?? [];
  const hello = parties.recipientName ? `Hi ${parties.recipientName}`.split(/\s+/).length : 0;
  const words = [...written.matchAll(SPOKEN_WORD)];
  const differs = words.findIndex((word, i) => word[0].toLowerCase() !== greeting[i]);
  const same = differs < 0 ? words.length : differs;
  const cut = [greeting.length, hello + 2, hello].find((at) => at > 0 && at <= same);
  const repeated = cut === undefined ? undefined : words[cut - 1];
  if (repeated === undefined) return written;
  const rest = written.slice((repeated.index ?? 0) + repeated[0].length);
  return rest.replace(/^[^\p{L}\p{N}]+/u, '').replace(/^\p{Ll}/u, (letter) => letter.toUpperCase());
}

let selfIdentifiedBodies = 0;

/** What the model wrote after the greeting, or nothing when it failed or a speaker named themselves. */
async function writtenBody(
  parties: OutboundParties,
  sponsor: string,
  request: OnBehalfVoicemailRequest
): Promise<string | undefined> {
  try {
    const reply = await callLLM(bodyPrompt(parties, sponsor, request), OUTREACH_LLM);
    const written = reply ? normalised(cleanLLMResponse(reply)) : '';
    // Checked whole, before the repeated greeting comes off: "Hi Alex! It's Sam" stays caught
    const body = withoutGreeting(written, parties).trim();
    if (!body) return undefined;
    if (!speaksAsRequester(written, sponsor)) return body;
    selfIdentifiedBodies += 1;
    log.warn(
      { selfIdentifiedBodies },
      'A written voicemail had a speaker naming themselves: used the fallback'
    );
  } catch (error) {
    log.warn(
      { errorKind: error instanceof Error ? error.name : typeof error },
      'Voicemail writing failed: used the fallback'
    );
  }
  return undefined;
}

/** The words of a voicemail Ferni leaves on someone's behalf: the AI-friend greeting, then the message about them. */
export async function onBehalfVoicemail(request: OnBehalfVoicemailRequest): Promise<string> {
  const parties = partiesOf({
    recipientName: request.recipientName,
    userName: request.requesterName,
    callType: request.callType,
  });
  // No real name to talk about them by: the model writes nothing, the fixed words go out
  const sponsor = parties.sponsorName;
  const written = sponsor ? await writtenBody(parties, sponsor, request) : undefined;
  return `${voicemailGreeting(parties)} ${written ?? fallbackBody(parties, request)}`;
}
