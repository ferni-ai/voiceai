/**
 * GROUP_CALL: the name Ferni uses for a guest, in system notes and turn labels.
 *
 * A participant's display name is set by whoever joined, so it is text from outside
 * going into the model's context. Only a plain name gets through: letters, spaces,
 * hyphens and apostrophes, at most 24 characters. Anything else is "the guest". A name
 * that would read as the owner's label, or as one of our own labels, gets " (guest)".
 *
 * @module agents/group-conversation/guest-display-name
 */

const FALLBACK = 'the guest';
const MAX_LENGTH = 24;
/** Letters in any script, spaces, hyphens and apostrophes; nothing else. */
const PLAIN_NAME = /^[\p{L} '’-]+$/u;
/** Our own labels: a guest named one of these must not read as it. */
const RESERVED = new Set(['unclear', 'the caller']);

export function guestDisplayName(raw: string | undefined, ownerFirstName: string): string {
  const trimmed = (raw ?? '').normalize('NFC').trim();
  if (!trimmed || !PLAIN_NAME.test(trimmed)) return FALLBACK;
  const name = trimmed.slice(0, MAX_LENGTH).trimEnd();
  const lower = name.toLowerCase();
  if (lower === ownerFirstName.toLowerCase() || RESERVED.has(lower)) return `${name} (guest)`;
  return name;
}
