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
 * "chat at 988lifeline.org", "sign in at ferni.ai", "verify your number at ferni.ai" name a
 * place, not a mailbox. A spoken "at" builds word@host only when the word before it is a
 * typical mailbox name (or has a digit, dot or underscore in it) and what comes before that
 * word isn't "get", "find", "need", "for" ("get help at ferni.ai"). Everything else is the
 * host alone, which must be allowed. A written "@" is always a mailbox.
 */
const MAILBOX =
  /^(?:hello|hi|hey|help|support|info|contact|admin|sales|billing|accounts?|noreply|no-reply|donotreply|notifications?|alerts?|team|care|service|feedback|press|jobs|hr|security|privacy|abuse|webmaster|postmaster|mail|email|office|reply)$|[\d._+%-]/u;
const PROSE_BEFORE =
  /\b(?:get|find|need|needs|ask|for|with|some|more|any|free|online|live|instant|want|seek)$/u;
const mailboxAt = (local: string, before: string): boolean =>
  MAILBOX.test(local) && !PROSE_BEFORE.test(before.trimEnd());
/**
 * A 5 or 6 digit number counts only where a sender is claimed ("texts come from 55512",
 * "the short code is ..."). "Your zip code is 33701" or "the verification code is 482913" is
 * ordinary speech, not an address.
 */
const SENDER_CLAIM =
  /\b(?:come|comes|coming|came|sent|sends?|sending) from\b|\b(?:texts?|messages?|sms) from\b|\bshort ?codes?\b|\bsenders?\b/u;

/**
 * Said "dot" is a dot only where it reads as a web address. After a common ending
 * ("evil dot com", "dot ru") it always is. After an ordinary English word that is also an
 * ending ("polka dot is fun", "a dot in the map") it never is. Otherwise the word before must
 * be a plausible host label (two or more characters, not a function word). Simple on purpose.
 */
const COMMON_ENDINGS = new Set(
  'com net org edu gov mil io ai co app dev me us uk ru cn de info biz xyz online site tech store shop help'.split(
    ' '
  )
);
const ORDINARY_WORDS = new Set(
  'is in it at as no so to be by do or an if my up we he are was for the of and but not you your this that with from have has had were'.split(
    ' '
  )
);
const NOT_A_HOST = new Set(
  'a an the this that these those one two my your our his her their its some any each no not and or but so if as at by for from in of on to with is are was be it i we you he she they there here then than also just very really'.split(
    ' '
  )
);
const wordOf = (token: string): string => token.toLowerCase().replace(/[^\p{L}\p{N}-]/gu, '');
function dotIsSaid(before: string, after: string): boolean {
  const ending = wordOf(after.split(/[^\p{L}\p{N}-]/u)[0] ?? '');
  if (COMMON_ENDINGS.has(ending)) return true;
  if (ORDINARY_WORDS.has(ending)) return false;
  const label = wordOf(before.split(/[^\p{L}\p{N}-]/u).pop() ?? '');
  return label.length >= 2 && !NOT_A_HOST.has(label);
}

/** Phone keypad letters: "HELP" is 4357. */
const KEYPAD = 'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => {
  const groups = ['abc', 'def', 'ghi', 'jkl', 'mno', 'pqrs', 'tuv', 'wxyz'];
  return String(groups.findIndex((g) => g.includes(c)) + 2);
});
/**
 * A toll-free vanity number as it is dialled: "1-800-662-HELP" is 1-800-662-4357, and a
 * repeat of the same digits in brackets ("1-800-662-HELP (4357)") is dropped. A bare "800 "
 * needs a hyphen or dot ("800 dollars" is money); with a leading "1 " a space does too, but
 * only for capital letters ("1 800 950 NAMI").
 */
const TOLL = '8(?:00|33|44|55|66|77|88)';
const VANITY_PLAIN = new RegExp(
  `\\b(${TOLL}[-.](?:\\d{3}[-.])?)([A-Za-z]{3,10})\\b(\\s*\\(\\d{3,10}\\))?`,
  'gu'
);
const VANITY_SPACED = new RegExp(
  `\\b(1[-\\s.]${TOLL}[-\\s.](?:\\d{3}[-\\s.])?)([A-Z]{3,10})\\b(\\s*\\(\\d{3,10}\\))?`,
  'gu'
);
const dialWord = (word: string): string =>
  [...word.toLowerCase()].map((c) => KEYPAD[c.charCodeAt(0) - 97]).join('');
const vanity = (_m: string, prefix: string, word: string, repeat?: string): string => {
  const digits = dialWord(word);
  return prefix + digits + (repeat && repeat.replace(/\D/g, '') !== digits ? repeat : '');
};
/** "one eight hundred ..." is 1 800 ...: a digit word before "hundred". */
const HUNDRED = /\b(one|two|three|four|five|six|seven|eight|nine)\s+hundred\b/giu;
const DIGIT_WORD = 'zero one two three four five six seven eight nine'.split(' ');
const dialled = (text: string): string =>
  text
    .replace(HUNDRED, (_m, w: string) => `${DIGIT_WORD.indexOf(w.toLowerCase())}00`)
    .replace(VANITY_SPACED, vanity)
    .replace(VANITY_PLAIN, vanity);
/** "nine eight eight lifeline dot org": digits said before a label are part of it (988lifeline). */
const DIGITS_THEN_LABEL = /(?<![\p{L}\p{N}])((?:\d ){1,6}\d) ([a-z][a-z0-9-]*\.[a-z])/giu;

/** The text in one reading (see the module note). */
function normalise(text: string): string {
  return foldContactText(dialled(text))
    .replace(/\b24\s*\/\s*7\b(?:,\s*365 days)?/giu, ' ') // "1-800-799-7233 (24/7)": hours, not digits of the number
    .replace(/(\S{1,63})\s{1,3}dot\s{1,3}(?=(\S{1,24}))/giu, (m, before: string, after: string) =>
      dotIsSaid(before, after) ? `${before}.` : `${before} `
    )
    .replace(/-dot-/giu, '.')
    .replace(
      DIGITS_THEN_LABEL,
      (_m, digits: string, label: string) => `${digits.replace(/ /g, '')}${label}`
    )
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
    /[^\p{ASCII}]/u.test(last)
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
    const rest = normalise(piece).replace(
      EMAIL_G,
      (_m, local: string, at: string, host: string) => {
        if (!at.includes('@') && !isSite(host)) return `${local} ${host}`; // "was at 98.6": no email
        into.emails.add(`${local}@${host}`);
        into.hosts.add(hostKey(host));
        return ' ';
      }
    );
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
  let rest = normalise(piece).replace(
    EMAIL_G,
    (_m, local: string, at: string, host: string, offset: number, whole: string) => {
      const written = at.includes('@');
      if (!written && !isSite(host)) return `${local} ${host}`; // "was at 98.6", "look at node.js"
      if (!written && !mailboxAt(local, whole.slice(0, offset))) {
        if (!trusted.hosts.has(hostKey(host))) miss('hosts', hostKey(host)); // "sign in at ferni.ai"
        return ' ';
      }
      if (!trusted.emails.has(`${local}@${host}`)) miss('emails', `${local}@${host}`);
      return ' ';
    }
  );
  rest = rest.replace(HOST_G, (m: string, host: string) => {
    if (!isSite(host)) return m;
    if (!trusted.hosts.has(hostKey(host))) miss('hosts', hostKey(host));
    return ' ';
  });
  // No digit, "@", "at" or "dot" left: no number or email can be (skips three folds).
  if (!/[@%&\d]|\b(?:at|dot)\b/u.test(rest)) return verdict;
  for (const run of contactNumberRuns(rest, SENDER_CLAIM.test(rest) ? 5 : 7)) {
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
