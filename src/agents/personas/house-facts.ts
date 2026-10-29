/**
 * Ferni never makes up his own website or the address his texts and emails come from.
 *
 * Prod calls 2026-10-29 (#3001): asked which website verifies their number and which
 * address texts come from, Ferni gave one caller seven confident, invented answers
 * (made-up ".com" and ".ai" sites, a "notification at ..." sender). The prompt never
 * carried the real values (config/house-facts.ts), and nothing stopped an invented one.
 *
 * HOUSE_FACTS=on (off by default) does two things:
 * - the prompt (ai-honesty.ts withHonesty) states the true facts and that any other
 *   address is not his to give;
 * - every reply is checked a sentence at a time (withActionClaimCheck, before the
 *   claim check re-splits "SITE.AI" at the capital). Provenance, failing closed: any
 *   web address, email or phone number in a sentence (and a 5-6 digit sender in a
 *   sentence about texts) must be a house fact or appear in this call's grounding:
 *   the caller's words, tool results, or the context injected into the session.
 *   Otherwise the sentence is replaced, once per reply, with "I don't have that in
 *   front of me." A contact's number from a tool passes, an invented one fails
 *   wherever it appears.
 * - One veto, in one direction, decided for the whole reply: once any fragment presents
 *   an address as Ferni's OWN ("our new website", "the Ferni app", "Ferni's site", "text
 *   me at"), or the caller just asked for his, every later address in that reply must be a
 *   house fact or the caller's own (their turns this call, their profile's phone and
 *   email), never a tool result: a web page or inbound email can say "Ferni's website is
 *   ...". An address relayed with no self-reference ("the pharmacy's number is ...") is
 *   still grounded as above: that is relaying, and call-on-behalf needs it (#3032 rounds 4-4b).
 *
 * Matching is spoken-addresses.ts. Grounding is read only when a sentence holds an
 * address that isn't a house fact, and each chat item is read once per call.
 * Sentences are held until they end, across Gemini's usage-only chunks; with the
 * action-claim defaults they already are, so this adds no wait (TURN_RECEIPT carries
 * the flag). Logs never carry the words.
 *
 * @module agents/personas/house-facts
 */
import { ReadableStream } from 'node:stream/web';

import { flagOn, type Env } from '../../config/env-flag.js';
import { houseFacts, type HouseFacts } from '../../config/house-facts.js';
import { WHERE_TO_ADD_NUMBER } from '../../tools/shared/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { NO_NEW_WORDS_NOTE, TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';
import { contentOf, hasToolCall, type ReplyChunk } from './reply-chunks.js';
import { recentSpoken } from './spoken-words.js';
import {
  collectAddresses,
  factAddresses,
  asksForOwn,
  inventsAddress,
  noAddresses,
  presentsAsOwn,
  piecesOf,
  type Addresses,
} from './spoken-addresses.js';

const log = createLogger({ module: 'HouseFacts' });

export const NOT_IN_FRONT_OF_ME = "I don't have that in front of me.";
/** A run with no sentence end is decided in pieces of this size, so the buffer stays small. */
const MAX_HELD = 300;

function houseFactsEnabled(env: Env = process.env): boolean {
  return flagOn('HOUSE_FACTS', env);
}

/** "+18885550142" as said: "888-555-0142"; any other number as configured. */
const sayNumber = (e164: string): string =>
  /^\+1\d{10}$/.test(e164) ? `${e164.slice(2, 5)}-${e164.slice(5, 8)}-${e164.slice(8)}` : e164;

/** The facts as the prompt states them; an unset one is named as unknown. */
export function houseFactsPrompt(facts: HouseFacts): string {
  const site = facts.website
    ? `Ferni's website is ${facts.website}${facts.webApp ? `, and the app on the web is at ${facts.webApp}` : ''}.`
    : "You don't know Ferni's website.";
  const texts = facts.textsFrom
    ? `Texts from Ferni come from ${sayNumber(facts.textsFrom)}.`
    : "You don't know which number Ferni's texts come from.";
  const email = facts.emailFrom
    ? `Email from Ferni comes from ${facts.emailFrom}.`
    : "You don't know which address Ferni's email comes from.";
  return `Facts about Ferni itself. The app and the company are called Ferni. ${site} To add or verify a phone number: ${WHERE_TO_ADD_NUMBER} ${texts} ${email} Never make up a web address, email address, phone number or company name for Ferni, its texts or its emails: if it isn't here, say you don't have it in front of you.`;
}

/** The honesty rule, with the house facts after it when the flag is on. */
export function withHouseFacts(rule: string, env: Env = process.env): string {
  return houseFactsEnabled(env)
    ? `${rule.trimEnd()}\n\n${houseFactsPrompt(houseFacts(env))}`
    : rule;
}

/** The text of one chat item that can ground an address; Ferni's own words never do. */
interface GroundingItem {
  type?: string;
  role?: string;
  content?: unknown;
  textContent?: string;
  output?: unknown;
}
function groundingText(item: GroundingItem): string {
  if (item.type === 'function_call_output')
    return typeof item.output === 'string' ? item.output : '';
  if (item.type !== 'message' || item.role === 'assistant') return '';
  if (typeof item.textContent === 'string') return item.textContent;
  const parts = Array.isArray(item.content) ? item.content : [item.content];
  return parts.filter((part): part is string => typeof part === 'string').join('\n');
}

/** Each chat item's addresses, read once: items are the same objects turn after turn. */
const itemAddresses = new WeakMap<object, Addresses>();

/** Adds each chat item's addresses (read once per item) to `into`, for the items `keep` picks. */
function addItemAddresses(
  chatCtx: { items: readonly unknown[] },
  into: Addresses,
  keep: (item: GroundingItem) => boolean
): Addresses {
  for (const item of chatCtx.items) {
    if (typeof item !== 'object' || item === null || !keep(item as GroundingItem)) continue;
    let found = itemAddresses.get(item);
    if (!found) {
      found = collectAddresses(groundingText(item as GroundingItem), noAddresses());
      itemAddresses.set(item, found);
    }
    for (const key of ['hosts', 'emails', 'numbers'] as const) {
      for (const value of found[key]) into[key].add(value);
    }
  }
  return into;
}

/**
 * The addresses this call has grounded, plus the house facts: everything the caller
 * said, every tool result, and the context injected into the session (system notes,
 * the instructions with memory and the call sheet).
 */
const allowedAddresses = (chatCtx: { items: readonly unknown[] }, facts: HouseFacts): Addresses =>
  addItemAddresses(chatCtx, factAddresses(facts), () => true);

/** What the caller's own profile holds that they could give out (their phone and email). */
export interface CallerContact {
  phone?: string;
  email?: string;
}

/** A caller turn: a user message that is not a note the turn machinery pushed as one. */
const isCallerTurn = (item: GroundingItem): boolean => {
  if (item.type !== 'message' || item.role !== 'user') return false;
  const text = groundingText(item).trimStart();
  return !text.startsWith(TURN_CONTEXT_HEADER) && text !== NO_NEW_WORDS_NOTE;
};

/**
 * The addresses a caller may have given out as their own: the house facts, their own
 * turns this call, and their own profile's phone and email. Never a tool result or an
 * inbound email or text, which anyone can write.
 */
function callerOwnedAddresses(
  chatCtx: { items: readonly unknown[] },
  facts: HouseFacts,
  contact?: CallerContact
): Addresses {
  const owned = addItemAddresses(chatCtx, factAddresses(facts), isCallerTurn);
  return collectAddresses(`${contact?.phone ?? ''}\n${contact?.email ?? ''}`, owned);
}

/**
 * Length of the first whole sentence in the text, with its trailing space; 0 if none
 * yet. A mark at the very end waits for what follows: "mindgrape." may go on "com".
 */
function sentenceEnd(text: string): number {
  const m = text.match(/(?:[!?]+|\.)(?:\s+|$)/u);
  if (m?.index === undefined) return 0;
  const end = m.index + m[0].length;
  return end >= text.length && !/\s$/u.test(text) ? 0 : end;
}

const isReplyStream = (s: unknown): s is ReadableStream<ReplyChunk> =>
  typeof (s as { getReader?: unknown } | null)?.getReader === 'function';

/** The model's reply with any invented house fact replaced by the honest line. */
export async function withHouseFactsGuard<T>(
  reply: Promise<T> | T,
  chatCtx: { items: readonly unknown[] },
  env: Env = process.env,
  who: { personaId?: string; contact?: CallerContact } = {}
): Promise<T> {
  const stream = await reply;
  if (!isReplyStream(stream) || !houseFactsEnabled(env)) return stream;
  const facts = factAddresses(houseFacts(env));
  // Ownership is decided for the whole reply, not a sentence at a time: once Ferni has
  // presented an address as his own (or the caller asked for his), every later address
  // must be a house fact or the caller's own. Tool results are untrusted (a web page or
  // inbound email can claim "our website is ..."), so grounding can't make one his.
  let own = recentSpoken(chatCtx, 'user', 2).some((words) => asksForOwn(words, who.personaId));
  let grounded: Addresses | undefined;
  let callerOwned: Addresses | undefined;
  // Read only when a sentence holds an address that isn't a house fact (most replies hold none).
  const invents = (sentence: string): boolean => {
    own ||= presentsAsOwn(sentence, who.personaId);
    return (
      inventsAddress(sentence, facts) &&
      inventsAddress(
        sentence,
        own
          ? (callerOwned ??= callerOwnedAddresses(chatCtx, houseFacts(env), who.contact))
          : (grounded ??= allowedAddresses(chatCtx, houseFacts(env)))
      )
    );
  };
  const reader = stream.getReader();
  let id = '';
  let stringChunks = true;
  let replaced = false;
  const guarded = new ReadableStream<ReplyChunk>({
    async start(controller) {
      const emit = (text: string): void => {
        if (text)
          controller.enqueue(
            stringChunks ? text : { id, delta: { role: 'assistant', content: text } }
          );
      };
      const decide = (sentence: string): void => {
        if (!invents(sentence)) return emit(sentence);
        log.warn({ reason: own ? 'not_a_house_fact' : 'not_grounded' }, 'HOUSE_FACT_INVENTED');
        if (!replaced) emit(`${NOT_IN_FRONT_OF_ME}${/\s$/.test(sentence) ? ' ' : ''}`);
        replaced = true;
      };
      let pending = '';
      try {
        for (let next = await reader.read(); !next.done; next = await reader.read()) {
          const content = contentOf(next.value);
          if (content === undefined) {
            // A tool call goes out after the words before it. Other chunks with no text
            // (Gemini's usage chunk after every piece) pass by without cutting the
            // sentence held, as in the claim guard (action-claim-guard-spacing.test.ts).
            if (hasToolCall(next.value) && pending) decide(pending);
            if (hasToolCall(next.value)) pending = '';
            controller.enqueue(next.value);
            continue;
          }
          if (typeof next.value !== 'string') {
            stringChunks = false;
            id = (next.value as { id?: string }).id ?? id;
          }
          pending += content;
          for (let end = sentenceEnd(pending); end > 0; end = sentenceEnd(pending)) {
            decide(pending.slice(0, end));
            pending = pending.slice(end);
          }
          // A run with no sentence end is decided in pieces, so the buffer stays small.
          if (pending.length > 2 * MAX_HELD) {
            own ||= presentsAsOwn(pending, who.personaId); // the whole buffer, before it is cut
            const pieces = piecesOf(pending, MAX_HELD);
            pending = pieces.pop() ?? '';
            pieces.forEach(decide);
          }
        }
        if (pending) decide(pending);
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch((error: unknown) => {
        log.debug({ error: String(error) }, 'reply cancel after the house facts guard failed');
      });
    },
  });
  return guarded as T;
}
