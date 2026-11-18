/**
 * What an outreach to a contact may say about the caller's past with them (unified-outreach.ts):
 * the contact's recent topics and the follow-up the caller left pending. With
 * FORGET_EVERY_READER on, none about a topic the caller asked Ferni to forget reaches the
 * message, the call's notes or the contact (forgottenCheck, read once per outreach; with no
 * topic source at all, none of them). Off, exactly as before: the first five topics.
 *
 * @module tools/domains/communication/outreach/remembered-contact-context
 */

import { forgottenCheck, remembered } from '../../../../memory/index.js';

const RECENT_TOPICS = 5;

export interface RememberedContactContext {
  recentTopics: string[];
  pendingFollowUp?: string;
}

/** The fields of a contact (contact-relationship-service.ts ContactRelationship) read here. */
interface ContactPast {
  topics?: ReadonlyArray<{ topic: string }>;
  pendingFollowUp?: { reason: string; completed: boolean };
}

export async function rememberedContactContext(
  userId: string,
  contact: ContactPast
): Promise<RememberedContactContext> {
  const forgotten = await forgottenCheck(userId, 'outreach-topics');
  const topics = (contact.topics ?? []).map((t) => t.topic);
  const pending = contact.pendingFollowUp;
  const reason = pending?.completed === false ? pending.reason : undefined;
  return {
    recentTopics: remembered(topics, forgotten, String).slice(0, RECENT_TOPICS),
    pendingFollowUp: reason !== undefined && forgotten?.(reason) ? undefined : reason,
  };
}
