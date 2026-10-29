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
 * - every reply (withActionClaimCheck in action-claim-guard.ts) is checked a sentence
 *   at a time: a sentence that gives a web address, email address or phone number
 *   for Ferni itself (the caller just asked for one, or the sentence says "our
 *   website", "the texts come from", "email us at") and holds one that is not a
 *   house fact is replaced, once per reply, with "I don't have that in front of me."
 *
 * Emails and numbers are found by the shared contact-data rule
 * (memory/domain/contact-data.ts). That rule does not cover a bare website, so
 * WEB_ADDRESS below finds one ("site.com", "site dot ai", "call-dot-com"). True
 * facts are taken out of the sentence first, so only what is left can trip it.
 *
 * Sentences are held until they end; with the action-claim defaults they already are,
 * so this adds no wait (TURN_RECEIPT carries the flag). Logs never carry the words.
 *
 * @module agents/personas/house-facts
 */
import { ReadableStream } from 'node:stream/web';

import { flagOn, type Env } from '../../config/env-flag.js';
import { houseFacts, type HouseFacts } from '../../config/house-facts.js';
import { containsContactData, toE164 } from '../../memory/index.js';
import { WHERE_TO_ADD_NUMBER } from '../../tools/shared/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { contentOf, type ReplyChunk } from './reply-chunks.js';
import { recentSpoken } from './spoken-words.js';

const log = createLogger({ module: 'HouseFacts' });

export const NOT_IN_FRONT_OF_ME = "I don't have that in front of me.";

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

const DOT = '(?:\\.|\\s+dot\\s+|-dot-)';
/** A website, written or said: "site.com", "site dot ai", "call-dot-com". Not a contact-data shape. */
const WEB_ADDRESS = new RegExp(
  `(?<![\\p{L}\\p{N}])[\\p{L}\\p{N}][\\p{L}\\p{N}-]*(?:${DOT}[\\p{L}\\p{N}-]+)*${DOT}(?:com|net|org|ai|am|io|co|app|us|me|info|biz|dev|xyz|tv|ly|fm|gg|online|site|tech|health|care|life|chat|link)(?![\\p{L}\\p{N}])`,
  'iu'
);
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Never inside a longer name: nothing joined before ("verify.", "verify dot "), nor after. */
const START = '(?<![\\p{L}\\p{N}.@-])(?<!dot\\s{1,3})';
const END = `(?![\\p{L}\\p{N}-]|${DOT}[\\p{L}\\p{N}])`;
/** A host as written or said: "app.ferni.ai", "app dot ferni dot ai". */
const hostForms = (host: string): string => `${host.split('.').map(escape).join(DOT)}${END}`;

/** The sentence with every true fact taken out, so only an untrue address is left. */
function withoutFacts(sentence: string, facts: HouseFacts): string {
  let rest = sentence;
  if (facts.emailFrom) {
    const [local, host] = facts.emailFrom.split('@');
    const said = `(?<![\\p{L}\\p{N}._%+-])${escape(local ?? '')}(?:\\s*@\\s*|\\s+at\\s+)${hostForms(host ?? '')}`;
    rest = rest.replace(new RegExp(said, 'giu'), ' ');
  }
  const hosts = [facts.webApp, facts.website].filter((h): h is string => Boolean(h));
  for (const host of hosts.sort((a, b) => b.length - a.length)) {
    const site = `${START}(?:https?://)?(?:www${DOT})?${hostForms(host)}`;
    rest = rest.replace(new RegExp(site, 'giu'), ' ');
  }
  const texts = facts.textsFrom && toE164(facts.textsFrom);
  return rest.replace(/\+?\d[\d\s().-]{5,}\d/g, (run) =>
    texts && toE164(run) === texts ? ' ' : run
  );
}

/** The caller asking for Ferni's own site, sender, number or email. */
const ASKS_OURS =
  /\b(?:what|which|where)\b[^.?!]*\b(?:website|web ?site|site|web address|url|link)\b[^.?!]*\b(?:verify|verif\w+|sign(?:ing)? up|log ?in|my (?:number|account|phone)|your|you guys|y'all|ferni|the app)\b|\b(?:texts?|messages?|e-?mails?|notifications?|codes?)\b[^.?!]*\b(?:come|comes|coming|came|be|sent)\b[^.?!]*\bfrom\b|\b(?:your|ferni'?s|the app'?s) (?:own )?(?:website|web ?site|site|web address|url|link|(?:phone )?number|e-?mail(?: address)?|address|short ?code)\b/i;
/** Ferni's sentence giving an address as his own: "our website", "texts come from", "email us at". */
const GIVES_OURS =
  /\b(?:our|my|ferni'?s|the app'?s) (?:own )?(?:website|web ?site|site|web address|url|link|(?:phone )?number|e-?mail(?: address)?|address|short ?code)\b|\b(?:texts?|messages?|e-?mails?|notifications?|codes?)\b[^.?!]*\b(?:come|comes|coming|will be|are|is) (?:sent )?from\b|\bwe(?:'re| are) (?:at|on)\b|\b(?:reach|find|text|call|e-?mail|write to) (?:me|us) at\b/i;

const hasAddress = (text: string): boolean => containsContactData(text) || WEB_ADDRESS.test(text);

/**
 * True when the sentence gives Ferni's own address and one it gives is not a house
 * fact. `callerAsked`: the caller's latest words asked for one.
 */
export function inventsHouseFact(
  sentence: string,
  callerAsked: boolean,
  facts: HouseFacts
): boolean {
  if (!callerAsked && !GIVES_OURS.test(sentence)) return false;
  return hasAddress(withoutFacts(sentence, facts));
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
  env: Env = process.env
): Promise<T> {
  const stream = await reply;
  if (!isReplyStream(stream) || !houseFactsEnabled(env)) return stream;
  const facts = houseFacts(env);
  const callerAsked = recentSpoken(chatCtx, 'user', 1).some((t) => ASKS_OURS.test(t));
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
        if (!inventsHouseFact(sentence, callerAsked, facts)) return emit(sentence);
        log.warn({ reason: callerAsked ? 'caller_asked' : 'gives_ours' }, 'HOUSE_FACT_INVENTED');
        if (!replaced) emit(`${NOT_IN_FRONT_OF_ME}${/\s$/.test(sentence) ? ' ' : ''}`);
        replaced = true;
      };
      let pending = '';
      try {
        for (let next = await reader.read(); !next.done; next = await reader.read()) {
          const content = contentOf(next.value);
          if (content === undefined) {
            if (pending) decide(pending);
            pending = '';
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
