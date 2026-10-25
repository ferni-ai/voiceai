/**
 * Where a call was started from, when it was started from something: the
 * `from` query parameter on /token (iOS sends it), checked against strict
 * allow-lists. No free text ever rides in `from`: every ref is an id of a
 * fixed shape or a word from PRACTICE_PARTNERS, so nothing a caller types can
 * reach a prompt. Anything else is ignored and the call goes ahead as normal.
 *
 * Read on both sides: /token parses it (CALL_LAUNCH_CONTEXT), and the agent
 * parses the room metadata copy again before trusting it.
 *
 * @module types/call-launch
 */

/** Who a practice run rehearses with; one list with the iOS AppEnum. */
export const PRACTICE_PARTNERS = [
  'boss',
  'coworker',
  'partner',
  'mom',
  'dad',
  'friend',
  'landlord',
  'someone',
] as const;
export type PracticePartner = (typeof PRACTICE_PARTNERS)[number];

export type CallLaunch =
  /** A note the call was started from (iOS `note:<16 hex>`). */
  | { kind: 'note'; ref: string }
  /** A Bookend's pep talk: the follow-up id, owned by the caller (checked on /token). */
  | { kind: 'bookend'; ref: string }
  /** A practice run with Alex. */
  | { kind: 'practice'; ref: PracticePartner };

/** Longer than any valid `from` by a margin; anything longer is refused unread. */
export const MAX_FROM_CHARS = 64;

const NOTE_REF = /^[0-9a-f]{16}$/;
/** followUpId() in services/stores/follow-through-store.ts: 24 hex. */
const BOOKEND_REF = /^[0-9a-f]{24}$/;
/** A plain word; one not on the list is read as `someone` and Alex asks who. */
const PARTNER_WORD = /^[a-z]{1,20}$/;

function partnerFor(word: string): PracticePartner | undefined {
  if (!PARTNER_WORD.test(word)) return undefined;
  return (PRACTICE_PARTNERS as readonly string[]).includes(word)
    ? (word as PracticePartner)
    : 'someone';
}

/** The launch `from` names, or undefined for anything not on the allow-lists. */
export function parseCallLaunch(from: unknown): CallLaunch | undefined {
  if (typeof from !== 'string' || from.length > MAX_FROM_CHARS) return undefined;
  const colon = from.indexOf(':');
  if (colon < 0) return undefined;
  const kind = from.slice(0, colon);
  const ref = from.slice(colon + 1);
  if (kind === 'note') return NOTE_REF.test(ref) ? { kind, ref } : undefined;
  if (kind === 'bookend') return BOOKEND_REF.test(ref) ? { kind, ref } : undefined;
  if (kind === 'practice') {
    const partner = partnerFor(ref);
    return partner ? { kind, ref: partner } : undefined;
  }
  return undefined;
}

/** The room metadata copy, checked again: the same allow-lists, the same shapes. */
export function callLaunchOf(value: unknown): CallLaunch | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { kind, ref } = value as Record<string, unknown>;
  if (typeof kind !== 'string' || typeof ref !== 'string') return undefined;
  const launch = parseCallLaunch(`${kind}:${ref}`);
  // A practice ref read as `someone` only counts when it said so: no rewriting on this side.
  return launch && launch.ref === ref ? launch : undefined;
}
