/**
 * Which of Ferni's tracked "commitments" are promises and which are invitations.
 *
 * "Let me know how it goes", "keep me posted", "can't wait to hear" invite the
 * user to share; Ferni isn't committing to anything. A friend who said that
 * and later apologised for "breaking" it would be strange. So an invitation is
 * remembered while it's open (it shows in the prompt's pending follow-ups, and
 * Ferni may ask about it), but it never ends 'missed', never counts in Trust's
 * "I follow through", and never prompts an apology. When it lapses it is
 * settled 'unknown': nobody broke anything.
 *
 * The types are the ferni-commitments.ts CommitmentType values detected from
 * those phrases (follow_up, celebrate).
 *
 * @module services/superhuman/semantic-intelligence/promise-kinds
 */

const INVITATION_TYPES: ReadonlySet<string> = new Set(['follow_up', 'celebrate']);

/** An invitation for the user to share, not something Ferni promised to do. */
export function isInvitation(type: unknown): boolean {
  return typeof type === 'string' && INVITATION_TYPES.has(type);
}
