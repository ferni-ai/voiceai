/**
 * GROUP_CALL: the name Ferni uses for a guest, in system notes and turn labels.
 *
 * A participant's display name is set by whoever joined, so it is text from outside
 * going into the model's context. Only a plain name gets through: one or two words of
 * letters in a single script (after NFKC), with spaces, hyphens and apostrophes, at most
 * 24 characters. Anything else is "the guest". A name with a word that is, or starts
 * with, the owner's first name (case and accents aside), or that reads as one of our own
 * labels, gets " (guest)". A guest's turn label always carries the role (guestLabel), so
 * it can never read as the owner's.
 *
 * @module agents/group-conversation/guest-display-name
 */

const FALLBACK = 'the guest';
const ROLE = ' (guest)';
const MAX_LENGTH = 24;
const MAX_WORDS = 2;
/** Letters (with their combining marks) in any script, spaces, hyphens and apostrophes. */
const PLAIN_NAME = /^[\p{L}\p{M} '’-]+$/u;
/** The scripts a name may be written in; every letter of a name is in one of them. */
const SCRIPTS = [
  /^\p{Script=Latin}$/u,
  /^\p{Script=Cyrillic}$/u,
  /^\p{Script=Greek}$/u,
  /^\p{Script=Han}$/u,
  /^[\p{Script=Hiragana}\p{Script=Katakana}]$/u,
  /^\p{Script=Hangul}$/u,
  /^\p{Script=Arabic}$/u,
  /^\p{Script=Hebrew}$/u,
  /^\p{Script=Devanagari}$/u,
];
/** Our own labels: a guest named one of these must not read as it. */
const RESERVED = new Set(['unclear', 'the caller']);

/** Lower case with accents and other combining marks stripped, for comparing names. */
const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function oneScript(name: string): boolean {
  const letters = Array.from(name).filter((c) => /\p{L}/u.test(c));
  return SCRIPTS.some((script) => letters.every((c) => script.test(c)));
}

/** Whether the guest's name could pass for the owner's or for one of our labels. */
function readsAsOurs(name: string, ownerFirstName: string): boolean {
  const owner = fold(ownerFirstName);
  if (RESERVED.has(fold(name))) return true;
  return owner !== '' && name.split(' ').some((word) => fold(word).startsWith(owner));
}

export function guestDisplayName(raw: string | undefined, ownerFirstName: string): string {
  const trimmed = (raw ?? '').normalize('NFKC').trim();
  if (!trimmed || !PLAIN_NAME.test(trimmed) || !oneScript(trimmed)) return FALLBACK;
  const words = trimmed.split(/ +/);
  if (words.length > MAX_WORDS) return FALLBACK;
  const name = Array.from(words.join(' ')).slice(0, MAX_LENGTH).join('').trimEnd();
  return readsAsOurs(name, ownerFirstName) ? `${name}${ROLE}` : name;
}

/** The label on a guest's turns, `[Sarah (guest)] `: it always says she is the guest. */
export function guestLabel(name: string): string {
  const withRole = name === FALLBACK || name.endsWith(ROLE) ? name : `${name}${ROLE}`;
  return `[${withRole}] `;
}
