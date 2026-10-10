/**
 * The "relationship" card of GET /api/insights/:userId: how long we've known each other and
 * how many conversations we've had, from the user's profile (first contact date and
 * conversation counter), never estimated from other activity.
 *
 * @module api/insights-relationship
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RelationshipCard {
  daysTogether: number;
  conversations: number;
  milestone?: string;
}

/** The slice of the memory-store UserProfile this card reads */
export interface RelationshipProfile {
  firstContact?: Date | string | number | null;
  totalConversations?: number | null;
}

/** Undefined when the profile doesn't say, or there is no milestone worth marking yet */
export function buildRelationship(
  profile: RelationshipProfile | null | undefined,
  now = Date.now()
): RelationshipCard | undefined {
  const first = profile?.firstContact;
  const firstContact = first == null ? NaN : new Date(first).getTime();
  const conversations = profile?.totalConversations;
  if (!Number.isFinite(firstContact) || typeof conversations !== 'number') return undefined;

  const daysTogether = Math.max(0, Math.floor((now - firstContact) / DAY_MS));
  if (daysTogether < 7 && conversations < 10) return undefined;

  let milestone: string | undefined;
  if (conversations >= 100) {
    milestone = "100+ conversations! We've built something meaningful.";
  } else if (daysTogether >= 30) {
    milestone = "It's been a month since we first talked. Thank you for trusting me.";
  } else if (conversations >= 50) {
    milestone = "50+ conversations. I see how far you've come.";
  } else if (daysTogether >= 7) {
    milestone = "It's been a week since we first talked.";
  }
  return milestone ? { daysTogether, conversations, milestone } : undefined;
}
