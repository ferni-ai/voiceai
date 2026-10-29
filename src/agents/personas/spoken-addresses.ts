/**
 * Web addresses, emails and phone numbers in what Ferni says, matched by provenance:
 * each must be a house fact or appear in the call's grounding (the caller's words,
 * tool results, injected context). Used by the house facts guard (house-facts.ts).
 *
 * Text is first put in one reading, so the same address written differently matches:
 * the shared contact-data fold (digits in any script, digits said as words), a said
 * dot (" dot ", "-dot-") written ".", letters spelled after a dot joined ("dot a i"),
 * lower case. Then whole addresses are compared, never parts: "verify.ferni.ai" is
 * not "ferni.ai", and "notifications@ferni.ai" is not "hello@ferni.ai".
 *
 * Ferni's OWN address is a separate question (presentsAsOwn, asksForOwn): grounding
 * can't vouch for it, because tool results (web pages, inbound email) are untrusted and
 * can say "Ferni's website is ..." (#3032 security review, round 4).
 *
 * Every pattern is linear: a label is alphanumerics joined by single hyphens, so no
 * input has two readings (a label that could also take "-dot-" backtracked for
 * minutes, #3032 review), and each checked piece is at most MAX_PIECE characters.
 *
 * @module agents/personas/spoken-addresses
 */
import type { HouseFacts } from '../../config/house-facts.js';
import { containsContactData, contactNumberRuns, foldContactText } from '../../memory/index.js';

/** The addresses a sentence may give: lower case, numbers as national digits. */
export interface Addresses {
  hosts: Set<string>;
  emails: Set<string>;
  numbers: Set<string>;
}

const MAX_PIECE = 300;
/** Grounding is read in bigger pieces: it is long, and only extraction runs on it. */
const MAX_GROUNDING_PIECE = 2000;

const LABEL = '[\\p{L}\\p{N}]+(?:-[\\p{L}\\p{N}]+)*';
const HOST = `${LABEL}(?:\\.${LABEL})+`;
const EMAIL_G = new RegExp(
  `(?<![\\p{L}\\p{N}._%+-])([\\p{L}\\p{N}._%+-]{1,64})(\\s{0,3}@\\s{0,3}|\\s{1,3}at\\s{1,3})(${HOST})(?![\\p{L}\\p{N}-])`,
  'gu'
);
const HOST_G = new RegExp(`(?<![\\p{L}\\p{N}.@-])(?:https?://)?(${HOST})(?![\\p{L}\\p{N}-])`, 'gu');
const TLDS = new Set(
  'com net org ai am io co app us me info biz dev xyz tv ly fm gg online site tech health care life chat link edu gov uk ca'.split(
    ' '
  )
);
/**
 * "it at site.com" or "the app is at site.com" names a website, not a mailbox: before a
 * grounded host, these words are no mailbox. Any other word is ("help at site.com").
 */
const SITE_WORDS = new Set(
  'it this that them you us me one there here home is are was were be live online up out find visit'.split(
    ' '
  )
);
/** A 5 or 6 digit number counts in a sentence about texts (a short code sender). */
const SENDER_WORD = /\b(?:short ?codes?|codes?|texts?|texting|messages?|sms)\b/u;

/** The text in one reading (see the module note). */
function normalise(text: string): string {
  return foldContactText(text)
    .replace(/\s{1,3}dot\s{1,3}/giu, '.')
    .replace(/-dot-/giu, '.')
    .replace(
      /\.((?:\p{L} ){1,3}\p{L})(?![\p{L}\p{N}])/gu,
      (_m, letters: string) => `.${letters.replace(/ /g, '')}`
    )
    .toLowerCase();
}

/** A host that is a website: some label after the first is a known ending ("3.5" is not). */
const isSite = (host: string): boolean =>
  host
    .split('.')
    .slice(1)
    .some((l) => TLDS.has(l));
const hostKey = (host: string): string => host.replace(/^www\./u, '');
/** National digits: "+1 (727) 555-0142" and "727.555.0142" are both "7275550142". */
function numberKey(run: string): string {
  const digits = run.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

function cutAt(text: string, max: number): number {
  const space = text.lastIndexOf(' ', max);
  return space > max / 2 ? space + 1 : max;
}

/** The text in pieces of at most `max` characters, cut at spaces where it can be. */
export function piecesOf(text: string, max = MAX_PIECE): string[] {
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const cut = cutAt(rest, max);
    pieces.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  return [...pieces, rest];
}

export const noAddresses = (): Addresses => ({
  hosts: new Set(),
  emails: new Set(),
  numbers: new Set(),
});

/** Adds every address in the text (numbers of 5+ digits) to `into`. */
export function collectAddresses(text: string, into: Addresses): Addresses {
  for (const piece of piecesOf(text, MAX_GROUNDING_PIECE)) {
    const rest = normalise(piece).replace(EMAIL_G, (_m, local: string, _at, host: string) => {
      into.emails.add(`${local}@${host}`);
      into.hosts.add(hostKey(host));
      return ' ';
    });
    for (const [, host = ''] of rest.matchAll(HOST_G)) {
      if (isSite(host)) into.hosts.add(hostKey(host));
    }
    for (const run of contactNumberRuns(rest, 5)) into.numbers.add(numberKey(run));
  }
  return into;
}

/** The house facts as addresses. */
export function factAddresses(facts: HouseFacts): Addresses {
  const known = noAddresses();
  for (const host of [facts.website, facts.webApp]) if (host) known.hosts.add(host.toLowerCase());
  if (facts.emailFrom) known.emails.add(facts.emailFrom.toLowerCase());
  if (facts.textsFrom) known.numbers.add(numberKey(facts.textsFrom));
  return known;
}

/** True when one piece gives an address that `allowed` doesn't hold. */
function inventsIn(piece: string, allowed: Addresses): boolean {
  let invented = false;
  let rest = normalise(piece).replace(EMAIL_G, (_m, local: string, at: string, host: string) => {
    const site = at.trim() === 'at' && SITE_WORDS.has(local) && allowed.hosts.has(hostKey(host));
    if (!site && !allowed.emails.has(`${local}@${host}`)) invented = true;
    return ' ';
  });
  rest = rest.replace(HOST_G, (m: string, host: string) => {
    if (!isSite(host)) return m;
    if (!allowed.hosts.has(hostKey(host))) invented = true;
    return ' ';
  });
  if (invented) return true;
  // No digit, "@", "at" or "dot" left: no number or email can be (skips three folds).
  if (!/[@%&\d]|\b(?:at|dot)\b/u.test(rest)) return false;
  for (const run of contactNumberRuns(rest, SENDER_WORD.test(rest) ? 5 : 7)) {
    if (!allowed.numbers.has(numberKey(run))) return true;
    rest = rest.replace(run, ' ');
  }
  // A shape the extraction above can't take apart ("jo (at) acme", "at gmail") fails closed.
  return containsContactData(rest);
}

/** True when the sentence gives a web address, email or number that `allowed` doesn't hold. */
export function inventsAddress(sentence: string, allowed: Addresses): boolean {
  return piecesOf(sentence).some((piece) => inventsIn(piece, allowed));
}

/** The things Ferni has an address for. */
const THING =
  '(?:web ?site|site|web address|url|link|app|(?:phone |cell )?number|e-?mail(?: address)?|address|line|short ?code)';
const SENT = '(?:texts?|calls?|e-?mails?|messages?)';
/**
 * The shapes that present an address as Ferni's own, in the one table both sides read:
 * `said` is Ferni speaking in the first person, `asked` the caller asking for his.
 * Short and bounded on purpose: this is a veto that only tightens, so a miss falls back
 * to provenance and a false hit only gives the honest line.
 */
const OWN_SHAPES = {
  said: new RegExp(
    `\\b(?:our|my|ferni'?s)(?: own)? ${THING}\\b` +
      `|\\b(?:text|call|e-?mail|message|reach|contact)(?: me| us) at\\b` +
      `|\\b${SENT} from (?:me|us)\\b` +
      `|\\bI(?:'m| am) at\\b|\\bfind (?:me|us) at\\b`,
    'iu'
  ),
  asked: new RegExp(
    `\\b(?:your|ferni'?s)(?: own)? (?:${THING}|${SENT})\\b` + `|\\b${SENT} (?:from|by) you\\b`,
    'iu'
  ),
};

/** True when the sentence gives an address as Ferni's own ("our website", "text me at"). */
export const presentsAsOwn = (sentence: string): boolean =>
  piecesOf(sentence).some((piece) => OWN_SHAPES.said.test(piece));

/** True when the caller's words ask for Ferni's own website, number, email or sender. */
export const asksForOwn = (callerWords: string): boolean =>
  OWN_SHAPES.asked.test(callerWords.slice(-MAX_PIECE));
