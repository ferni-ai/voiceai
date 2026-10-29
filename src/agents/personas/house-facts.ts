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
 * - every reply (withActionClaimCheck in action-claim-guard.ts, before the claim check
 *   re-splits sentences) is checked a sentence at a time. A sentence that gives a web
 *   address, email address or phone number for Ferni himself (the caller just asked
 *   for his, or the sentence says "our website", "texts from me come from", "email us
 *   at") and holds one that is not a house fact is replaced, once per reply, with
 *   "I don't have that in front of me." Anyone else's address is left alone.
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

/**
 * Inputs are tokenised before any pattern runs, so no pattern has to choose between
 * readings: a said dot (" dot ", "-dot-") becomes "." by plain replacements, and a
 * label is alphanumerics joined by single hyphens. A label that could also swallow
 * "-dot-" backtracked for minutes on a long hyphen run (#3032 review). Each checked
 * piece is at most MAX_CHECK characters as well.
 */
const MAX_CHECK = 300;
const DIGIT_WORDS = 'zero one two three four five six seven eight nine'.split(' ');
/**
 * The piece as one reading: a said dot (" dot ", "-dot-") written as ".", letters
 * spelled after it joined ("dot a i" is ".ai"), and digits said as words written as
 * digits ("eight eight eight" is "888"), so a true number said aloud still matches.
 */
const tokenise = (text: string): string =>
  text
    .replace(/\s{1,3}dot\s{1,3}/giu, '.')
    .replace(/-dot-/giu, '.')
    .replace(
      /\.((?:\p{L} ){1,3}\p{L})(?![\p{L}\p{N}])/gu,
      (_m, letters: string) => `.${letters.replace(/ /g, '')}`
    )
    .replace(/\b(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/giu, (w) =>
      String(Math.max(0, DIGIT_WORDS.indexOf(w.toLowerCase())))
    );
const LABEL = '[\\p{L}\\p{N}]+(?:-[\\p{L}\\p{N}]+)*';
/** A website once dots are written: "site.com", "app.site.ai". Not a contact-data shape. */
const WEB_ADDRESS = new RegExp(
  `(?<![\\p{L}\\p{N}.-])${LABEL}(?:\\.${LABEL})*\\.(?:com|net|org|ai|am|io|co|app|us|me|info|biz|dev|xyz|tv|ly|fm|gg|online|site|tech|health|care|life|chat|link)(?![\\p{L}\\p{N}])`,
  'iu'
);
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A true host, never inside a longer name: nothing joined before ("verify."), nor after. */
const START = '(?<![\\p{L}\\p{N}.@-])';
const END = '(?![\\p{L}\\p{N}-]|\\.[\\p{L}\\p{N}])';

/** The (tokenised) piece with every true fact taken out, so only an untrue address is left. */
function withoutFacts(piece: string, facts: HouseFacts): string {
  let rest = piece;
  if (facts.emailFrom) {
    const [local, host] = facts.emailFrom.split('@');
    const said = `(?<![\\p{L}\\p{N}._%+-])${escape(local ?? '')}(?:\\s{0,3}@\\s{0,3}|\\s{1,3}at\\s{1,3})${escape(host ?? '')}${END}`;
    rest = rest.replace(new RegExp(said, 'giu'), ' ');
  }
  const hosts = [facts.webApp, facts.website].filter((h): h is string => Boolean(h));
  for (const host of hosts.sort((a, b) => b.length - a.length)) {
    const site = `${START}(?:https?://)?(?:www\\.)?${escape(host)}${END}`;
    rest = rest.replace(new RegExp(site, 'giu'), ' ');
  }
  const texts = facts.textsFrom && toE164(facts.textsFrom);
  return rest.replace(/\+?\d[\d\s().,-]{5,}\d/g, (run) =>
    texts && toE164(run.replace(/,/g, '')) === texts ? ' ' : run
  );
}

/** Where to cut text longer than `max`: after the last space in its second half, else at max. */
function cutAt(text: string, max: number): number {
  const space = text.lastIndexOf(' ', max);
  return space > max / 2 ? space + 1 : max;
}

/** The text in pieces of at most MAX_CHECK characters, cut at spaces where it can be. */
function piecesOf(text: string): string[] {
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > MAX_CHECK) {
    const cut = cutAt(rest, MAX_CHECK);
    pieces.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  return [...pieces, rest];
}

const OWN_THING =
  '(?:website|web ?site|site|web address|url|link|(?:phone |cell )?number|e-?mail(?: address)?|address|short ?code)';
const SENT = '(?:texts?|messages?|e-?mails?|notifications?|codes?)';
const SENT_FROM = '(?:come|comes|coming|came|be sent|get sent|are sent|is sent|go out) from';
/**
 * The caller asking for Ferni's own site, sender, number or email: "your website",
 * "texts from you", "what number do you text from", and two ownerless forms from
 * the prod calls that only Ferni's own texts fit ("what address do the texts come
 * from", "what website do I use to verify my number").
 */
const ASKS_OURS = new RegExp(
  `\\b(?:your|ferni'?s|the app'?s)(?: own| app'?s?)? ${OWN_THING}\\b` +
    `|\\b${SENT} (?:from|by) (?:you|ferni|the app)\\b` +
    `|\\b(?:do|does|did|will|would|can) (?:you|ferni) (?:text|e-?mail|message|send)\\b` +
    `|\\b(?:what|which|where)\\b[^.?!]{0,30}\\bthe ${SENT} ${SENT_FROM}\\b` +
    `|\\b(?:verify|confirm|add|register|update) (?:my )?(?:phone |cell )?number\\b`,
  'iu'
);
/** Someone or something else named: "texts from my mom", "for my insurance", "for the marathon". */
const SOMEONE_ELSE =
  /\b(?:from|for|with|at|by|to) (?:my|her|his|their|the|a|an) (?!(?:phone|cell|number|account|app|website|site|menu|settings)\b)\p{L}+|\b(?:from|for|with|at|by) (?!Ferni\b)\p{Lu}\p{L}+/u;
/**
 * Ferni giving an address as his own: "our website", "my email", "texts from me
 * come from", "I text you from", "reach us at". Another owner ("your email", "her
 * texts", "the latest email is from") is never his.
 */
const GIVES_OURS = new RegExp(
  `\\b(?:our|my|ferni'?s|the app'?s) (?:own )?${OWN_THING}\\b` +
    `|\\b(?:our|my) ${SENT}\\b[^.?!]{0,40}\\b${SENT_FROM}\\b` +
    `|\\b${SENT} (?:from|by) (?:me|us|ferni|the app)\\b[^.?!]{0,40}\\b${SENT_FROM}\\b` +
    `|\\bI(?:'ll| will)? (?:text|e-?mail|message) (?:you )?from\\b` +
    `|\\bwe(?:'re| are) (?:at|on)\\b` +
    `|\\b(?:reach|find|text|call|e-?mail|write to) (?:me|us|ferni) at\\b`,
  'iu'
);

/** An address left in tokenised text (said dots already written as "."). */
const hasAddress = (tokens: string): boolean =>
  containsContactData(tokens) || WEB_ADDRESS.test(tokens);

/**
 * True when the sentence gives Ferni's own address and one it gives is not a house
 * fact. `callerAsked`: the caller's latest words asked for one.
 */
export function inventsHouseFact(
  sentence: string,
  callerAsked: boolean,
  facts: HouseFacts
): boolean {
  return piecesOf(sentence).some(
    (piece) =>
      (callerAsked || GIVES_OURS.test(piece)) && hasAddress(withoutFacts(tokenise(piece), facts))
  );
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
  const callerAsked = recentSpoken(chatCtx, 'user', 1).some((t) => {
    const words = t.slice(-MAX_CHECK);
    return ASKS_OURS.test(words) && !SOMEONE_ELSE.test(words);
  });
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
          // A run with no sentence end is decided in pieces, so the buffer stays small.
          while (pending.length > 2 * MAX_CHECK) {
            const cut = cutAt(pending, MAX_CHECK);
            decide(pending.slice(0, cut));
            pending = pending.slice(cut);
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
