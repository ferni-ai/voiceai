/**
 * Contact Relationship Service
 *
 * Tracks relationship context for contacts:
 * - Last interaction date
 * - Relationship strength score
 * - Communication patterns
 * - Key topics/interests
 * - Follow-up reminders
 *
 * This enables Alex to provide intelligent relationship insights like:
 * - "You haven't talked to Sarah in 3 weeks"
 * - "John usually responds within 24 hours"
 * - "Last time you spoke with Mom, she mentioned her knee surgery"
 *
 * @module services/contacts
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  INTERACTIONS_COLLECTION,
  clearCache,
  deleteContact,
  getContact,
  getContacts,
  getFirestore,
  persistContact,
  persistInteraction,
  upsertContact,
} from './contact-relationship-store.js';
import {
  getContactContext,
  getContactsNeedingAttention,
  getRelationshipInsights,
  searchContacts,
} from './contact-relationship-insights.js';
import {
  getInteractionHistory,
  getInteractionStats,
  getTopicsToDiscuss,
} from './contact-relationship-history.js';
import type {
  FollowUpReminder,
  InteractionRecord,
  InteractionType,
} from './contact-relationship-types.js';

// Re-exports: moved to sibling modules, kept here for backward-compatible imports
export type * from './contact-relationship-types.js';
export {
  getContacts,
  getContact,
  upsertContact,
  deleteContact,
  clearCache,
} from './contact-relationship-store.js';
export {
  getRelationshipInsights,
  getContactsNeedingAttention,
  searchContacts,
  getContactContext,
} from './contact-relationship-insights.js';
export {
  getInteractionHistory,
  getInteractionStats,
  getTopicsToDiscuss,
} from './contact-relationship-history.js';

const log = getLogger();

// ============================================================================
// INTERACTIONS & FOLLOW-UPS
// ============================================================================

/**
 * Interaction type weights for relationship strength
 * Higher weight = bigger impact on relationship score
 */
const INTERACTION_WEIGHTS: Partial<Record<InteractionType, number>> = {
  // High impact - meaningful time together
  trip: 15,
  visit: 12,
  dinner: 10,
  hangout: 10,
  activity: 10,
  attended_event: 15,

  // Medium-high impact - direct communication
  video_call: 8,
  call: 7,
  meeting: 7,

  // Medium impact
  text: 5,
  voice_message: 5,
  instant_message: 4,
  email: 4,
  gift_given: 10,
  gift_received: 8,
  card_sent: 8,
  favor_done: 8,

  // Lower impact - still counts!
  social_comment: 3,
  social_dm: 3,
  social_like: 1,
  social_tag: 2,
  thank_you_sent: 5,
  introduction: 6,
  recommendation: 4,
  photo_shared: 3,

  // Default
  other: 3,
};

/**
 * Detect if this interaction is part of a streak
 */
async function detectStreak(
  userId: string,
  contactId: string,
  interactionType: InteractionType
): Promise<{ isStreak: boolean; streakCount: number }> {
  const firestore = await getFirestore();
  if (!firestore) return { isStreak: false, streakCount: 0 };

  try {
    // Get recent interactions of the same type
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);

    const snapshot = await firestore
      .collection(INTERACTIONS_COLLECTION)
      .where('userId', '==', userId)
      .where('contactId', '==', contactId)
      .where('type', '==', interactionType)
      .orderBy('date', 'desc')
      .limit(20)
      .get();

    if (snapshot.empty) return { isStreak: false, streakCount: 1 };

    const interactions = snapshot.docs.map((doc) => {
      const data = doc.data();
      return { date: data.date?.toDate?.() || new Date(data.date) };
    });

    // Check for weekly streak (interactions within 10 days of each other)
    let streakCount = 1;
    let lastDate = new Date();

    for (const int of interactions) {
      const daysDiff = Math.floor(
        (lastDate.getTime() - int.date.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysDiff <= 10) {
        streakCount++;
        lastDate = int.date;
      } else {
        break;
      }
    }

    return { isStreak: streakCount >= 3, streakCount };
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to detect streak');
    return { isStreak: false, streakCount: 0 };
  }
}

/**
 * Record an interaction with a contact
 *
 * "Better Than Human" - We track EVERYTHING and detect patterns
 */
export async function recordInteraction(
  userId: string,
  interaction: Omit<InteractionRecord, 'id'>
): Promise<InteractionRecord> {
  const contact = await getContact(userId, interaction.contactId);
  const now = new Date();

  // Detect streak before recording
  const streakInfo = await detectStreak(userId, interaction.contactId, interaction.type);

  if (contact) {
    // Update contact stats
    contact.lastInteraction = now;
    contact.interactionCount++;

    // Update strength score based on interaction type weight
    const weight = INTERACTION_WEIGHTS[interaction.type] || 3;
    contact.strengthScore = Math.min(100, contact.strengthScore + weight);

    // Decay prevention - recent interactions slow decay
    if (contact.strengthScore < 30) {
      contact.strengthScore = Math.min(50, contact.strengthScore + 5); // Boost weak relationships more
    }

    // Add to recent context with more detail
    if (interaction.summary) {
      const contextEntry = interaction.location
        ? `${interaction.summary} (at ${interaction.location})`
        : interaction.summary;
      contact.recentContext = [contextEntry, ...contact.recentContext.slice(0, 4)];
    }

    // Track topics with sentiment
    if (interaction.topics) {
      for (const topic of interaction.topics) {
        const existingTopic = contact.topics.find(
          (t) => t.topic.toLowerCase() === topic.toLowerCase()
        );
        if (existingTopic) {
          existingTopic.lastMentioned = now;
          existingTopic.mentionCount++;
          // Update sentiment if provided
          if (interaction.sentiment) {
            existingTopic.sentiment = interaction.sentiment;
          }
        } else {
          contact.topics.push({
            topic,
            firstMentioned: now,
            lastMentioned: now,
            mentionCount: 1,
            sentiment: interaction.sentiment,
          });
        }
      }
    }

    // Calculate average response time
    if (interaction.responseTimeHours !== undefined) {
      if (contact.avgResponseTimeHours === undefined) {
        contact.avgResponseTimeHours = interaction.responseTimeHours;
      } else {
        // Exponential moving average
        contact.avgResponseTimeHours =
          0.7 * contact.avgResponseTimeHours + 0.3 * interaction.responseTimeHours;
      }
    }

    contact.updatedAt = now;
    await persistContact(contact);
  }

  // Create the full interaction record with streak info
  const fullInteraction: InteractionRecord = {
    ...interaction,
    id: `int_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    isStreak: streakInfo.isStreak,
    streakCount: streakInfo.streakCount,
  };

  // Persist the interaction record
  await persistInteraction(fullInteraction);

  log.info(
    {
      userId,
      contactId: interaction.contactId,
      type: interaction.type,
      isStreak: streakInfo.isStreak,
      streakCount: streakInfo.streakCount,
    },
    '📝 Interaction recorded'
  );

  return fullInteraction;
}

/**
 * Set a follow-up reminder for a contact
 */
export async function setFollowUp(
  userId: string,
  contactId: string,
  followUp: Omit<FollowUpReminder, 'completed'>
): Promise<void> {
  const contact = await getContact(userId, contactId);
  if (!contact) {
    log.warn({ userId, contactId }, 'Contact not found for follow-up');
    return;
  }

  contact.pendingFollowUp = {
    ...followUp,
    completed: false,
  };
  contact.updatedAt = new Date();

  await persistContact(contact);
  log.info({ userId, contactId, dueDate: followUp.dueDate }, 'Follow-up reminder set');
}

/**
 * Complete a follow-up
 */
export async function completeFollowUp(userId: string, contactId: string): Promise<void> {
  const contact = await getContact(userId, contactId);
  if (!contact || !contact.pendingFollowUp) return;

  contact.pendingFollowUp.completed = true;
  contact.lastFollowUpDate = new Date();
  contact.updatedAt = new Date();

  await persistContact(contact);
}

export default {
  getContacts,
  getContact,
  upsertContact,
  deleteContact,
  recordInteraction,
  setFollowUp,
  completeFollowUp,
  getRelationshipInsights,
  getContactsNeedingAttention,
  searchContacts,
  getContactContext,
  getInteractionHistory,
  getInteractionStats,
  getTopicsToDiscuss,
  clearCache,
};
