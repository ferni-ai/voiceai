/**
 * What a call can vouch for when Ferni speaks a web address, email or phone number
 * (house-facts.ts is the guard that asks): the house facts and every helpline the app
 * carries, the caller's profile and turns, the injected context, and the output of a tool on
 * FIRST_PARTY_TOOLS. Everything else a tool returns is untrusted, and is kept apart only to
 * pick the wording of the reply.
 *
 * @module agents/personas/grounded-addresses
 */
import { type HouseFacts } from '../../config/house-facts.js';
import { SAFETY_CRISIS_RESOURCES } from '../../services/safety/index.js';
import { CRISIS_RESOURCES as TOOL_CRISIS_RESOURCES } from '../../tools/domains/crisis/index.js';
import {
  COACHING_HELPLINES,
  NATIONAL_HELPLINES,
  CRISIS_RESOURCES as COACHING_CRISIS_RESOURCES,
} from '../../tools/domains/life-coaching-shared/index.js';
import {
  collectAddresses,
  factAddresses,
  noAddresses,
  type Addresses,
} from './spoken-addresses.js';

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
 * not recallFromMemory (it returns the session's keyMoments verbatim, and rememberAboutUser
 * writes the model's own text there: two injected calls would get an address spoken),
 * not the coaching tools, not the human-transfer tools, and not callStatus (the callee's own
 * words). Any other tool is untrusted, and so is a new one until someone adds it here.
 */
const FIRST_PARTY_TOOLS = new Set([
  'getContactInsights',
  'getContactsNeedingAttention',
  'getContactReminders',
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
/** Every number, text code and site in the helpline tables the app carries (five of them). */
function helplineLines(): string[] {
  const fields = (r: { phone?: string; text?: string; chat?: string; website?: string }) =>
    [r.phone, r.text, r.chat, r.website].filter((v): v is string => Boolean(v));
  // provideCrisisResources hands out these contact lines. A vanity number written with its
  // digits after it ("...-NAMI (6264)") is also read as the digits it is dialled with.
  const toolLines = Object.values(TOOL_CRISIS_RESOURCES).flatMap((r) =>
    [
      r.primary.contact,
      r.secondary?.contact,
      ...(r.additional ?? []).flatMap((a) => [a.contact, a.url]),
    ]
      .filter((v): v is string => Boolean(v))
      .flatMap((line) => {
        const dialled = line.replace(/-[A-Z]{3,}\s*\((\d{4})\)/gu, '-$1');
        return dialled === line ? [line] : [line, dialled];
      })
  );
  return [
    ...toolLines, // tools/domains/crisis
    ...Object.values(SAFETY_CRISIS_RESOURCES).flat().flatMap(fields), // services/safety/crisis-response
    ...Object.values(COACHING_CRISIS_RESOURCES).flatMap(fields), // life-coaching-shared/safety-guards
    ...Object.values(COACHING_HELPLINES).flatMap(fields), // numbers coaching tools print
    ...Object.values(NATIONAL_HELPLINES).flatMap(fields), // helplines named in no other table
  ];
}

/**
 * The house facts plus every crisis and helpline number out of those tables: a crisis
 * resource is never blocked, whatever the context holds, and a hotline added to any of them
 * is covered without touching this file.
 */
export function houseAddresses(facts: HouseFacts): Addresses {
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
export function groundedAddresses(
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
