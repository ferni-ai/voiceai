/**
 * The voicemail Ferni leaves on someone's behalf when a Twilio call reaches a
 * machine (on-behalf-call-orchestrator.ts handleMachineDetection).
 *
 * It used to be written in the requester's own voice ("Hi Alex! It's Sam.
 * Just wanted to say hello...") and read out by a Polly voice: an AI speaking
 * as Sam. Now it always opens with the fixed AI-friend greeting
 * (opening-line.ts voicemailGreeting), and the rest talks about the requester
 * in the third person ("Sam wanted me to pass on a hello"). A model writes
 * that rest; whatever it writes is checked, and a line that speaks as the
 * requester is replaced by the fixed fallback.
 *
 * @module services/outreach/on-behalf-voicemail
 */

import { getLogger } from '../../utils/safe-logger.js';
import { callLLM } from '../llm-utils.js';
import { cleanLLMResponse, OUTREACH_LLM } from './message-enrichment.js';
import { partiesOf, voicemailGreeting, type OutboundParties } from './opening-line.js';

const log = getLogger().child({ service: 'on-behalf-voicemail' });

/** What a voicemail left on someone's behalf is made from: the request, nothing else. */
export interface OnBehalfVoicemailRequest {
  /** The contact as the requester saved them ("Alex", "Mom"). */
  recipientName: string;
  /** What the contact is to the requester ("mother", "doctor"). */
  relationship?: string;
  /** The requester's name as the request carries it ("Sam" or "Sam Lee"). */
  requesterName: string;
  /** What the requester asked Ferni to pass on. */
  purpose: string;
  callType: string;
}

/** Contacts whose fallback voicemail is the warmer one. */
const CLOSE_RELATIONS = new Set([
  'mother',
  'mom',
  'father',
  'dad',
  'spouse',
  'wife',
  'husband',
  'partner',
]);

/** Ways of naming yourself; "Hi, it's me" needs no name to be one. */
const SAYS_ITS_ME = /\b(?:it's|it is|this is)\s+me\b/i;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when `text` names itself as the requester: "It's Sam", "this is Sam
 * Lee", "Hey, Sam here", "I'm Sam", "it's me". Talking about them ("Sam
 * wanted me to say hi", "Sam's thinking of you") is fine, and so is the name
 * used as a word: for a requester called Hope, "Hope here" is caught but "I
 * hope you're well" is not.
 */
export function speaksAsRequester(text: string, requesterName: string): boolean {
  const said = text.replace(/[‘’ʼ]/g, "'");
  if (SAYS_ITS_ME.test(said)) return true;
  const fullName = requesterName.trim();
  if (!fullName) return false;
  const names = [...new Set([fullName, fullName.split(/\s+/)[0]])].map(escapeRegExp);
  // The name as a whole word, and not "Sam's"
  const name = `(?:${names.join('|')})(?![\\w'])`;
  const introducesSelf = new RegExp(
    `\\b(?:it's|it is|its|this is|i'm|i am|my name is)\\s+${name}`,
    'i'
  );
  const signsInAsSelf = new RegExp(
    `(?:^|[.!?,;:]\\s*|\\b(?:hey|hi|hello)\\s+)${name}\\s+here\\b`,
    'i'
  );
  return introducesSelf.test(said) || signsInAsSelf.test(said);
}

/** What follows the greeting when no model writes it: the request, in Ferni's words. */
function fallbackBody(parties: OutboundParties, request: OnBehalfVoicemailRequest): string {
  const who = parties.sponsorName ?? 'Someone';
  const close = CLOSE_RELATIONS.has((request.relationship ?? '').toLowerCase());
  const body = close
    ? `${who} wanted me to ${request.purpose}... Just know they're thinking of you. They love you. Bye.`
    : `${who} wanted me to ${request.purpose}. They wanted to make sure you got this message. Take care, and talk soon.`;
  if (!speaksAsRequester(body, request.requesterName)) return body;
  // The request itself names the requester as the speaker: pass on that there is a message, not its words
  log.warn('The fallback voicemail spoke as the requester: left one without the message');
  return `${who} asked me to pass on a message, and they'll be in touch soon. Take care.`;
}

function bodyPrompt(parties: OutboundParties, request: OnBehalfVoicemailRequest): string {
  const sponsor = parties.sponsorName ?? 'the person who asked you to call';
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

let selfIdentifiedBodies = 0;

/** What the model wrote after the greeting, or nothing when it failed or spoke as the requester. */
async function writtenBody(
  parties: OutboundParties,
  request: OnBehalfVoicemailRequest
): Promise<string | undefined> {
  try {
    const reply = await callLLM(bodyPrompt(parties, request), OUTREACH_LLM);
    const written = reply ? cleanLLMResponse(reply) : '';
    if (!written) return undefined;
    if (!speaksAsRequester(written, request.requesterName)) return written;
    selfIdentifiedBodies += 1;
    log.warn(
      { selfIdentifiedBodies },
      'A written voicemail spoke as the requester: used the fallback'
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
  const body = (await writtenBody(parties, request)) ?? fallbackBody(parties, request);
  return `${voicemailGreeting(parties)} ${body}`;
}
