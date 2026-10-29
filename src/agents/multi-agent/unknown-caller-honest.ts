/**
 * UNKNOWN_CALLER_HONEST=on (default off): honesty with a caller Ferni can't place.
 *
 * Prod, 10-26 to 10-29: five of five greeted phone calls from three unrecognised
 * callers opened like an old friend's ("speak of the devil", "I was just
 * thinking about you", #3007). The first-meeting hello (first-call-stranger.ts)
 * only fires for an account's first call, so an `anon:` caller got the friend's
 * hello, and with FERNI_PLAYFUL its tease. One of them then asked whether Ferni
 * would remember them if they called back, and was told six times that he
 * would (#3002). Every unrecognised call gets a fresh `anon:` id
 * (user-identification-handler.ts), and nothing is stored for a non-member
 * (member-identity.ts), so the next call started from nothing.
 *
 * - The hello: a caller with no account and no past calls is met, never
 *   greeted as a friend (greeting-direction.ts).
 * - The model's instructions: nothing from this call is kept, so no promise to
 *   remember them; if they ask, say so and how to be remembered.
 *
 * What is actually kept for such a caller: nothing, unless RETURNING_CALLER
 * looked their number up (returning-caller.ts: at most a first name and one
 * line, for 30 days). A signed-in account keeps its conversations.
 *
 * @module agents/multi-agent/unknown-caller-honest
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import { inReturningCallerFlow } from '../../services/identity/returning-caller.js';
import { impliesSharedPast } from './first-call-stranger.js';

function unknownCallerHonestEnabled(env: Env = process.env): boolean {
  return flagOn('UNKNOWN_CALLER_HONEST', env);
}

/** No account and no past calls: the hello is a first meeting's, never a friend's. */
export function isUnplacedCaller(
  userId: string | undefined,
  hasHistory: boolean,
  env: Env = process.env
): boolean {
  return unknownCallerHonestEnabled(env) && !hasHistory && !isMemberIdentity(userId);
}

/** What prod said to strangers (#3007), beside the shared-past words first calls already refuse. */
const FAMILIAR =
  /\b(?:speak of the devil|look who|(?:thinking|thought) (?:about|of) you|on my mind|there you are|hoping (?:you'd|i'd hear))\b/i;

/** True when a hello greets the caller as someone Ferni already knows. */
export function greetsAsFriend(line: string): boolean {
  return impliesSharedPast(line) || FAMILIAR.test(line);
}

const NOTHING_KEPT =
  "nothing from this call is kept after it ends: if they call again, you won't remember them or anything they said";
const ALMOST_NOTHING_KEPT =
  'almost nothing from this call is kept: at most their first name and one short line, for a month';

/**
 * The one way to be remembered that always holds. Not "call from your number":
 * a number counts only with CALLER_RECOGNITION and a signed carrier
 * attestation (caller-recognition.ts), which no caller can promise themselves.
 */
const HOW_TO_BE_KEPT = 'signing in to Ferni on the app or the website keeps your conversations';

/**
 * The model-instructions block for a caller nothing is kept for, or '' (flag
 * off, or a member). Not for a call Ferni placed: its third party has its own
 * block (outbound-opener.ts), which agent-setup.ts uses instead.
 */
export function unsavedCallerNote(
  userId: string | undefined,
  sessionId: string,
  env: Env = process.env
): string {
  if (!unknownCallerHonestEnabled(env) || isMemberIdentity(userId)) return '';
  const kept = inReturningCallerFlow(sessionId) ? ALMOST_NOTHING_KEPT : NOTHING_KEPT;
  return `
---

## What You Keep From This Call

They aren't signed in, so ${kept}. Never promise to remember them, to pick up where you left off, or to follow up. If they ask, or seem to expect you to remember, say so plainly in one sentence: ${HOW_TO_BE_KEPT}. Don't bring it up otherwise.
`;
}
