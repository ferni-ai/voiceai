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
 *   claim check re-splits "SITE.AI" at the capital). Provenance from TRUSTED sources
 *   only, failing closed: any web address, email or phone number in a sentence (and a
 *   5-6 digit sender in a sentence about texts) must be a house fact or appear in
 *   - the caller's own turns, or their profile's phone and email;
 *   - the context the server injected (instructions, memory, call sheet, notes);
 *   - the output of a first-party tool that returns the user's own data (FIRST_PARTY_TOOLS).
 *   Everything else is untrusted and never grounds an address: web search and fetch,
 *   inbound email and texts, calendar invites, and any tool not on that list. There is no
 *   parsing of whose address it is (#3032 rounds 2-4 patched that three times): a web page
 *   saying "Ferni's website is evil.com" simply cannot make evil.com sayable.
 *   A sentence with an address found only in untrusted output is replaced, once per
 *   reply, with CANT_VOUCH; one found nowhere, with "I don't have that in front of me."
 *   The cost, accepted: a pharmacy number from a web search is not read out.
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
import { SAFETY_CRISIS_RESOURCES } from '../../services/safety/index.js';
import { crisisContactLines } from '../../tools/domains/crisis/index.js';
import {
  COACHING_HELPLINES,
  CRISIS_RESOURCES as COACHING_CRISIS_RESOURCES,
} from '../../tools/domains/life-coaching-shared/index.js';
import { WHERE_TO_ADD_NUMBER } from '../../tools/shared/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { contentOf, hasToolCall, type ReplyChunk } from './reply-chunks.js';
import {
  collectAddresses,
  factAddresses,
  judgeAddresses,
  noAddresses,
  safeCut,
  type Addresses,
  type Verdict,
} from './spoken-addresses.js';

const log = createLogger({ module: 'HouseFacts' });

export const NOT_IN_FRONT_OF_ME = "I don't have that in front of me.";
export const CANT_VOUCH = "I found one online, but I can't vouch for it, so I won't read it out.";
/** A run with no safe place to cut is decided whole at this size (hostile input; no address is this long). */
const MAX_UNCUT = 2400;
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

/** The text of one chat item; Ferni's own words never ground anything. */
interface GroundingItem {
  type?: string;
  role?: string;
  name?: string;
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

/**
 * Tools whose output can ground an address: the user's own stored data (contact lists, what
 * they told Ferni to remember) and fixed crisis lines. Only a tool whose output does NOT
 * echo the model's own arguments qualifies, since an injected argument ("my sponsor's site
 * is evil.ru") would come straight back as trusted text. So not getContactInfo,
 * getContactInteractionHistory or recallPreviousConversation ("I don't have ... "<argument>""),
 * not the coaching tools, not the human-transfer tools, and not callStatus (the callee's own
 * words). Any other tool is untrusted, and so is a new one until someone adds it here.
 */
const FIRST_PARTY_TOOLS = new Set([
  'getContactInsights',
  'getContactsNeedingAttention',
  'getContactReminders',
  'recallFromMemory',
  'getRelationshipSummary',
  // Crisis tools whose arguments are enums only, so their output is fixed helpline text.
  // Not the coaching tools (they echo the model's arguments) and not the human-transfer
  // tools evaluateHumanTransfer / connectToHumanExpert (they echo statements and topics):
  // their helplines come from the static tables below instead.
  'provideCrisisResources',
  'findSafeResources',
  'createSafetyPlan',
  'quickCrisisResources',
]);
/** A tool result from a tool that is not on the list: web pages, inbound mail, invites, anything new. */
const isUntrusted = (item: GroundingItem): boolean =>
  item.type === 'function_call_output' && !FIRST_PARTY_TOOLS.has(item.name ?? '');

/** Each chat item's addresses, read once: items are the same objects turn after turn. */
const itemAddresses = new WeakMap<object, Addresses>();

/** Who is speaking, as the session knows it: the persona, and the caller's own profile contact. */
export interface HouseFactsWho {
  personaId?: string;
  userProfile?: { contactInfo?: { phone?: string; email?: string } } | null;
}

let crisisLines: Addresses | undefined;
/** Every number, text code and site in the helpline tables the app carries (four of them). */
function helplineLines(): string[] {
  const fields = (r: { phone?: string; text?: string; chat?: string; website?: string }) =>
    [r.phone, r.text, r.chat, r.website].filter((v): v is string => Boolean(v));
  return [
    ...crisisContactLines(), // tools/domains/crisis: what provideCrisisResources hands out
    ...Object.values(SAFETY_CRISIS_RESOURCES).flat().flatMap(fields), // services/safety/crisis-response
    ...Object.values(COACHING_CRISIS_RESOURCES).flatMap(fields), // life-coaching-shared/safety-guards
    ...Object.values(COACHING_HELPLINES).flatMap(fields), // numbers coaching tools print
  ];
}

/**
 * The house facts plus every crisis and helpline number out of those tables: a crisis
 * resource is never blocked, whatever the context holds, and a hotline added to any of them
 * is covered without touching this file.
 */
function houseAddresses(facts: HouseFacts): Addresses {
  const known = factAddresses(facts);
  if (!crisisLines) {
    crisisLines = noAddresses();
    for (const line of helplineLines()) collectAddresses(line, crisisLines);
  }
  for (const key of ['hosts', 'emails', 'numbers'] as const) {
    for (const value of crisisLines[key]) known[key].add(value);
  }
  return known;
}

/**
 * What this call can vouch for (`trusted`: the house facts, the caller's profile, their
 * turns, the injected context, first-party tool output) and what only untrusted output
 * held (`online`, used only to pick the wording).
 */
function groundedAddresses(
  chatCtx: { items: readonly unknown[] },
  facts: HouseFacts,
  who: HouseFactsWho
): { trusted: Addresses; online: Addresses } {
  const contact = who.userProfile?.contactInfo;
  const trusted = collectAddresses(
    `${contact?.phone ?? ''}\n${contact?.email ?? ''}`,
    houseAddresses(facts)
  );
  const online = noAddresses();
  for (const item of chatCtx.items) {
    if (typeof item !== 'object' || item === null) continue;
    let found = itemAddresses.get(item);
    if (!found) {
      found = collectAddresses(groundingText(item as GroundingItem), noAddresses());
      itemAddresses.set(item, found);
    }
    const into = isUntrusted(item as GroundingItem) ? online : trusted;
    for (const key of ['hosts', 'emails', 'numbers'] as const) {
      for (const value of found[key]) into[key].add(value);
    }
  }
  return { trusted, online };
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
  who: HouseFactsWho = {}
): Promise<T> {
  const stream = await reply;
  if (!isReplyStream(stream) || !houseFactsEnabled(env)) return stream;
  const facts = houseAddresses(houseFacts(env));
  // Read only when a sentence holds an address that isn't a house fact (most replies hold none).
  let grounded: ReturnType<typeof groundedAddresses> | undefined;
  const verdict = (sentence: string): Verdict => {
    if (judgeAddresses(sentence, facts) === 'ok') return 'ok';
    grounded ??= groundedAddresses(chatCtx, houseFacts(env), who);
    return judgeAddresses(sentence, grounded.trusted, grounded.online);
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
        const found = verdict(sentence);
        if (found === 'ok') return emit(sentence);
        log.warn({ reason: found }, 'HOUSE_FACT_INVENTED');
        const line = found === 'online' ? CANT_VOUCH : NOT_IN_FRONT_OF_ME;
        if (!replaced) emit(`${line}${/\s$/.test(sentence) ? ' ' : ''}`);
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
          // A run with no sentence end is decided in pieces, never cut inside an address
          // (" dot ", " at ", digits): with no safe place it waits, up to MAX_UNCUT.
          while (pending.length > 2 * MAX_HELD) {
            const cut = safeCut(pending, MAX_HELD);
            if (cut === 0 && pending.length <= MAX_UNCUT) break;
            decide(pending.slice(0, cut || pending.length));
            pending = pending.slice(cut || pending.length);
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
