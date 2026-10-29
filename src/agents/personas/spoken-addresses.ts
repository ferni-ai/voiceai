/**
 * Web addresses, emails and phone numbers in what Ferni says, matched by provenance:
 * each must be a house fact or appear in TRUSTED grounding (see house-facts.ts for what
 * is trusted). Nothing here asks whose address it is: that kind of parsing never
 * converged (#3032 rounds 2-4), so provenance is the whole rule.
 *
 * Text is first put in one reading, so the same address written differently matches:
 * the shared contact-data fold (NFKC, digits in any script, digits said as words), a said
 * dot (" dot ", "-dot-") written ".", letters spelled after a dot joined, any number ("dot a
 * i", "dot o n l i n e"),
 * lower case. Then whole addresses are compared, never parts: "verify.ferni.ai" is
 * not "ferni.ai", and "notifications@ferni.ai" is not "hello@ferni.ai".
 *
 * A website is recognised by its last label: on the COMPLETE IANA root-zone list (iana-tlds.ts),
 * punycode, or non-ASCII. A partial list failed open (".help", ".ru", "xn--p1ai", a Greek
 * omicron in ".cοm" all passed); shape alone over-fired on "node.js" and "Okay.Great".
 *
 * Every pattern is linear: a label is alphanumerics joined by hyphens, so no input has
 * two readings (a label that could also take "-dot-" backtracked for minutes, #3032
 * review). Long text is checked in pieces that are never cut inside an address.
 *
 * @module agents/personas/spoken-addresses
 */
import type { HouseFacts } from '../../config/house-facts.js';
import { containsContactData, contactNumberRuns, foldContactText } from '../../memory/index.js';
import { ALT_ROOT_ENDINGS, TLDS } from './iana-tlds.js';

/** The addresses a sentence may give: lower case, numbers as national digits. */
export interface Addresses {
  hosts: Set<string>;
  emails: Set<string>;
  numbers: Set<string>;
}

const MAX_PIECE = 300;
/** Grounding is read in bigger pieces: it is long, and only extraction runs on it. */
const MAX_GROUNDING_PIECE = 2000;
/** Longer than any address (host 253, email 320), so a hard cut still leaves each whole in one piece. */
const OVERLAP = 340;

const LABEL = '[\\p{L}\\p{N}]+(?:-+[\\p{L}\\p{N}]+)*';
const HOST = `${LABEL}(?:\\.${LABEL})+`;
const EMAIL_G = new RegExp(
  `(?<![\\p{L}\\p{N}._%+-])([\\p{L}\\p{N}._%+-]{1,64})(\\s{0,3}@\\s{0,3}|\\s{1,3}at\\s{1,3})(${HOST})(?![\\p{L}\\p{N}-])`,
  'gu'
);
const HOST_G = new RegExp(`(?<![\\p{L}\\p{N}.@-])(?:https?://)?(${HOST})(?![\\p{L}\\p{N}-])`, 'gu');
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
      /\.((?:\p{L} )+\p{L})(?![\p{L}\p{N}])/gu,
      (_m, letters: string) => `.${letters.replace(/ /g, '')}`
    )
    .toLowerCase();
}

/**
 * A website: the last label is a root-zone ending (the complete IANA list), an alternate-root
 * one (ALT_ROOT_ENDINGS), punycode, or has a non-ASCII letter (an IDN ending or a lookalike
 * letter). Ordinary text with a dot in it ("node.js", "Okay.Great", "v2.0.1", "3.5") ends in
 * none of them, so it is left alone.
 */
const isSite = (host: string): boolean => {
  const last = host.slice(host.lastIndexOf('.') + 1);
  // Only "3.x" / "2.0.x" (a version) is ordinary text; every other alternate-root ending is a site.
  const version = last === 'x' && /^(?:\d{1,3}\.){1,3}$/u.test(host.slice(0, host.length - 1));
  return (
    TLDS.has(last) ||
    (ALT_ROOT_ENDINGS.has(last) && !version) ||
    last.startsWith('xn--') ||
    /[^\x00-\x7f]/u.test(last)
  );
};
const hostKey = (host: string): string => host.replace(/^www\./u, '');
/** National digits: "+1 (727) 555-0142" and "727.555.0142" are both "7275550142". */
function numberKey(run: string): string {
  const digits = run.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

/** A token that may be part of an address: the words "dot"/"at", digits said or written, one letter, @ . - + ( . */
const JOINS =
  /^(?:dot|at|zero|oh|one|two|three|four|five|six|seven|eight|nine|\p{L})$|[\d@]|[\p{L}\p{N}][.-]+[\p{L}\p{N}]|^[.\-+(]|[.\-+(]$/u;
const joins = (token: string | undefined): boolean =>
  token !== undefined && JOINS.test(token.toLowerCase().replace(/[,;:!?"')\]]+$/u, ''));

/**
 * Where to cut `text` near `max`: just after a space that has no part of an address on
 * either side (not beside " dot ", " at ", a digit run, spelled letters), or 0 if none.
 */
export function safeCut(text: string, max: number): number {
  for (let i = Math.min(max, text.length - 1); i > 0; i -= 1) {
    if (text[i] !== ' ') continue;
    const before = /(\S+)$/u.exec(text.slice(Math.max(0, i - 60), i))?.[1];
    const after = /^\s*(\S+)/u.exec(text.slice(i, i + 60))?.[1];
    if (!joins(before) && !joins(after)) return i + 1;
  }
  return 0;
}

/**
 * The text in pieces of about `max` characters, cut at safe spaces. With no safe space the
 * cut is hard but the next piece starts OVERLAP earlier, so any address is whole in one.
 */
function piecesOf(text: string, max: number): string[] {
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const cut = safeCut(rest, max);
    pieces.push(rest.slice(0, cut || max + OVERLAP));
    rest = rest.slice(cut || max);
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

/** What a sentence's addresses come to: all fine, found only in untrusted text, or found nowhere. */
export type Verdict = 'ok' | 'online' | 'nowhere';

/** The verdict for one piece; `online` is what untrusted text held (for the wording only). */
function verdictIn(piece: string, trusted: Addresses, online: Addresses): Verdict {
  let verdict: Verdict = 'ok';
  const miss = (kind: keyof Addresses, key: string): void => {
    if (verdict !== 'nowhere') verdict = online[kind].has(key) ? 'online' : 'nowhere';
  };
  let rest = normalise(piece).replace(EMAIL_G, (_m, local: string, at: string, host: string) => {
    const site = at.trim() === 'at' && SITE_WORDS.has(local) && trusted.hosts.has(hostKey(host));
    if (!site && !trusted.emails.has(`${local}@${host}`)) miss('emails', `${local}@${host}`);
    return ' ';
  });
  rest = rest.replace(HOST_G, (m: string, host: string) => {
    if (!isSite(host)) return m;
    if (!trusted.hosts.has(hostKey(host))) miss('hosts', hostKey(host));
    return ' ';
  });
  // No digit, "@", "at" or "dot" left: no number or email can be (skips three folds).
  if (!/[@%&\d]|\b(?:at|dot)\b/u.test(rest)) return verdict;
  for (const run of contactNumberRuns(rest, SENDER_WORD.test(rest) ? 5 : 7)) {
    if (!trusted.numbers.has(numberKey(run))) miss('numbers', numberKey(run));
    rest = rest.replace(run, ' ');
  }
  // A shape the extraction above can't take apart ("jo (at) acme", "at gmail") fails closed.
  return containsContactData(rest) ? 'nowhere' : verdict;
}

/** Whether the sentence's web addresses, emails and numbers are all in `trusted`. */
export function judgeAddresses(
  sentence: string,
  trusted: Addresses,
  online: Addresses = noAddresses()
): Verdict {
  let verdict: Verdict = 'ok';
  for (const piece of piecesOf(sentence, MAX_PIECE)) {
    const v = verdictIn(piece, trusted, online);
    if (v === 'nowhere') return v;
    if (v === 'online') verdict = v;
  }
  return verdict;
}
