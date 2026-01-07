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
import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { onContactChange, onContactInteractionChange } from '../data-layer/hooks/contacts-hooks.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface ContactRelationship {
  id: string;
  userId: string;
  contactId: string; // Email or phone as identifier

  // Basic info
  name: string;
  email?: string;
  phone?: string;
  relationship?: 'family' | 'friend' | 'colleague' | 'acquaintance' | 'professional' | 'other';
  notes?: string;

  // Relationship tracking
  firstInteraction: Date;
  lastInteraction: Date;
  interactionCount: number;
  strengthScore: number; // 0-100

  // Communication patterns
  avgResponseTimeHours?: number;
  preferredChannel?: 'email' | 'phone' | 'text' | 'in-person';
  bestTimeToReach?: string; // e.g., "mornings", "weekdays"

  // Topics and context
  topics: ContactTopic[];
  recentContext: string[]; // Last 5 interaction summaries

  // Important dates (birthdays, anniversaries, etc.)
  importantDates?: Array<{
    date: string; // MM-DD or YYYY-MM-DD
    type: 'birthday' | 'anniversary' | 'memorial' | 'custom';
    label?: string;
  }>;

  // Follow-up tracking
  pendingFollowUp?: FollowUpReminder;
  lastFollowUpDate?: Date;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactTopic {
  topic: string;
  firstMentioned: Date;
  lastMentioned: Date;
  mentionCount: number;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface FollowUpReminder {
  reason: string;
  dueDate: Date;
  priority: 'high' | 'medium' | 'low';
  completed: boolean;
}

/**
 * Comprehensive interaction types for "Better Than Human" tracking
 *
 * We track EVERYTHING - no human can remember all this!
 */
export type InteractionType =
  // Digital Communication
  | 'email'
  | 'call'
  | 'text'
  | 'video_call' // Zoom, FaceTime, Google Meet
  | 'voice_message'
  | 'instant_message' // WhatsApp, Messenger, etc.

  // Social Media
  | 'social_like'
  | 'social_comment'
  | 'social_dm'
  | 'social_tag'
  | 'social_share'

  // In-Person
  | 'meeting'
  | 'hangout' // Coffee, lunch, casual
  | 'dinner'
  | 'party'
  | 'activity' // Sports, concert, movie
  | 'trip' // Travel together
  | 'visit' // Visited their home or they visited

  // Gifts & Cards
  | 'gift_given'
  | 'gift_received'
  | 'card_sent'
  | 'card_received'
  | 'thank_you_sent'
  | 'thank_you_received'

  // Financial
  | 'money_lent'
  | 'money_borrowed'
  | 'money_repaid'
  | 'split_bill'

  // Life Events
  | 'attended_event' // Their wedding, graduation, etc.
  | 'milestone_shared' // They shared a milestone with you

  // Other
  | 'photo_shared'
  | 'recommendation' // Recommended something to them
  | 'introduction' // Introduced them to someone
  | 'favor_done'
  | 'favor_received'
  | 'other';

export interface InteractionRecord {
  id: string;
  contactId: string;
  userId: string;
  date: Date;
  type: InteractionType;
  direction: 'inbound' | 'outbound' | 'mutual'; // Added 'mutual' for activities together
  summary?: string;
  topics?: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
  responseTimeHours?: number;

  // Extended fields for richer tracking
  duration?: number; // Duration in minutes (for calls, meetings, hangouts)
  location?: string; // Where it happened
  platform?: string; // Which app/platform (Zoom, Instagram, etc.)
  mediaUrl?: string; // Photo or voice message URL
  amount?: number; // For financial interactions
  linkedGiftId?: string; // Link to gift if this is a gift interaction
  participantNames?: string[]; // Other people involved (for group activities)
  isStreak?: boolean; // Part of a streak (e.g., weekly call)
  streakCount?: number; // How many in a row
}

export interface ContactInsight {
  contactId: string;
  contactName: string;
  insightType: 'overdue' | 'strengthening' | 'weakening' | 'follow-up' | 'pattern';
  message: string;
  priority: 'high' | 'medium' | 'low';
  suggestedAction?: string;
}

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

const CONTACTS_COLLECTION = 'contact_relationships';
const INTERACTIONS_COLLECTION = 'contact_interactions';

let db: FirestoreType | null = null;
// FIX: Promise-based singleton to prevent race condition
let dbInitPromise: Promise<FirestoreType | null> | null = null;

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = initializeFirestore();
  return dbInitPromise;
}

async function initializeFirestore(): Promise<FirestoreType | null> {
  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    log.info('Contact relationship Firestore initialized');
    return db;
  } catch (error) {
    log.warn({ error }, 'Firestore not available for contact relationships');
    dbInitPromise = null; // Allow retry
    return null;
  }
}

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

const contactCache = new Map<string, ContactRelationship[]>();
const loadedUsers = new Set<string>();

// ============================================================================
// CORE OPERATIONS
// ============================================================================

/**
 * Get all contacts for a user
 */
export async function getContacts(userId: string): Promise<ContactRelationship[]> {
  await ensureUserLoaded(userId);
  return contactCache.get(userId) || [];
}

/**
 * Get a specific contact by ID or email
 */
export async function getContact(
  userId: string,
  identifier: string
): Promise<ContactRelationship | null> {
  const contacts = await getContacts(userId);
  return (
    contacts.find(
      (c) =>
        c.id === identifier ||
        c.email?.toLowerCase() === identifier.toLowerCase() ||
        c.contactId === identifier
    ) || null
  );
}

/**
 * Create or update a contact
 */
export async function upsertContact(
  userId: string,
  contact: Partial<ContactRelationship> & { name: string; contactId: string }
): Promise<ContactRelationship> {
  await ensureUserLoaded(userId);

  const contacts = contactCache.get(userId) || [];
  const existingIndex = contacts.findIndex(
    (c) => c.contactId === contact.contactId || c.id === contact.id
  );

  const now = new Date();
  let saved: ContactRelationship;

  if (existingIndex >= 0) {
    // Update existing
    saved = {
      ...contacts[existingIndex],
      ...contact,
      updatedAt: now,
    };
    contacts[existingIndex] = saved;
  } else {
    // Create new
    saved = {
      id: `contact_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId,
      contactId: contact.contactId,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      relationship: contact.relationship || 'other',
      notes: contact.notes,
      firstInteraction: contact.firstInteraction || now,
      lastInteraction: contact.lastInteraction || now,
      interactionCount: contact.interactionCount || 0,
      strengthScore: contact.strengthScore || 50,
      preferredChannel: contact.preferredChannel,
      bestTimeToReach: contact.bestTimeToReach,
      avgResponseTimeHours: contact.avgResponseTimeHours,
      importantDates: contact.importantDates || [],
      topics: contact.topics || [],
      recentContext: contact.recentContext || [],
      createdAt: now,
      updatedAt: now,
    };
    contacts.push(saved);
  }

  contactCache.set(userId, contacts);
  await persistContact(saved);

  log.info({ userId, contactId: saved.contactId, name: saved.name }, 'Contact saved');
  return saved;
}

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

// ============================================================================
// INSIGHTS & INTELLIGENCE
// ============================================================================

/**
 * Get relationship insights for a user
 */
export async function getRelationshipInsights(userId: string): Promise<ContactInsight[]> {
  const contacts = await getContacts(userId);
  const insights: ContactInsight[] = [];
  const now = new Date();

  for (const contact of contacts) {
    // Check for overdue follow-ups
    if (contact.pendingFollowUp && !contact.pendingFollowUp.completed) {
      if (contact.pendingFollowUp.dueDate < now) {
        insights.push({
          contactId: contact.contactId,
          contactName: contact.name,
          insightType: 'follow-up',
          message: `Follow-up with ${contact.name} is overdue: "${contact.pendingFollowUp.reason}"`,
          priority: contact.pendingFollowUp.priority,
          suggestedAction: `Reach out to ${contact.name}`,
        });
      }
    }

    // Check for weakening relationships
    const daysSinceContact = Math.floor(
      (now.getTime() - contact.lastInteraction.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceContact > 30 && contact.strengthScore > 30) {
      insights.push({
        contactId: contact.contactId,
        contactName: contact.name,
        insightType: 'weakening',
        message: `You haven't connected with ${contact.name} in ${daysSinceContact} days`,
        priority: daysSinceContact > 60 ? 'high' : 'medium',
        suggestedAction: `Send ${contact.name} a quick message to check in`,
      });
    }

    // Check relationship strength decay
    if (contact.relationship === 'family' || contact.relationship === 'friend') {
      if (daysSinceContact > 14) {
        insights.push({
          contactId: contact.contactId,
          contactName: contact.name,
          insightType: 'overdue',
          message: `It's been ${daysSinceContact} days since you last talked to ${contact.name}`,
          priority: 'medium',
        });
      }
    }
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return insights;
}

/**
 * Get contacts that need attention
 */
export async function getContactsNeedingAttention(
  userId: string,
  limit = 5
): Promise<ContactRelationship[]> {
  const contacts = await getContacts(userId);
  const now = new Date();

  // Score contacts by urgency
  const scored = contacts.map((contact) => {
    const daysSinceContact = Math.floor(
      (now.getTime() - contact.lastInteraction.getTime()) / (1000 * 60 * 60 * 24)
    );

    let score = 0;

    // Overdue follow-up = highest priority
    if (contact.pendingFollowUp && !contact.pendingFollowUp.completed) {
      if (contact.pendingFollowUp.dueDate < now) {
        score += 100;
      }
    }

    // Long time since contact
    score += Math.min(50, daysSinceContact);

    // Family/friends get priority
    if (contact.relationship === 'family') score += 20;
    if (contact.relationship === 'friend') score += 10;

    // High strength contacts get priority
    score += contact.strengthScore / 5;

    return { contact, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.contact);
}

/**
 * Relationship aliases for natural language matching
 * Maps common words to relationship types
 */
const RELATIONSHIP_ALIASES: Record<string, string[]> = {
  family: [
    'mom',
    'mother',
    'mama',
    'ma',
    'mommy',
    'dad',
    'father',
    'papa',
    'pa',
    'daddy',
    'brother',
    'bro',
    'sis',
    'sister',
    'grandma',
    'grandmother',
    'granny',
    'nana',
    'grandpa',
    'grandfather',
    'grandad',
    'gramps',
    'aunt',
    'auntie',
    'uncle',
    'cousin',
    'niece',
    'nephew',
    'son',
    'daughter',
    'kid',
    'child',
    'wife',
    'husband',
    'spouse',
    'partner',
  ],
  friend: ['friend', 'buddy', 'pal', 'bestie', 'bff'],
  colleague: ['colleague', 'coworker', 'boss', 'manager', 'teammate'],
  professional: ['doctor', 'dentist', 'lawyer', 'therapist', 'accountant'],
};

/**
 * Search contacts by name, topic, or relationship alias
 *
 * 🐛 FIX: Also searches the main contacts service (user_contacts collection)
 * as a fallback, since data capture saves contacts there but telephony
 * was only looking in contact_relationships.
 */
export async function searchContacts(
  userId: string,
  query: string
): Promise<ContactRelationship[]> {
  const contacts = await getContacts(userId);
  const queryLower = query.toLowerCase().trim();

  // Check if query is a relationship alias
  let matchingRelationshipType: string | null = null;
  for (const [relType, aliases] of Object.entries(RELATIONSHIP_ALIASES)) {
    if (aliases.includes(queryLower)) {
      matchingRelationshipType = relType;
      break;
    }
  }

  const results = contacts.filter((contact) => {
    // Search by relationship alias (e.g., "mom" matches family)
    if (matchingRelationshipType && contact.relationship === matchingRelationshipType) {
      // For family, also check if the specific alias matches the role
      // e.g., "mom" should match someone whose notes say "mom" or relationship is family
      const notesLower = contact.notes?.toLowerCase() || '';
      if (
        notesLower.includes(queryLower) ||
        notesLower.includes('mom') ||
        notesLower.includes('mother')
      ) {
        return true;
      }
      // If no specific match in notes, still return family members for "mom"
      // This is a fallback for cases where notes aren't set
      if (queryLower === 'mom' || queryLower === 'mother' || queryLower === 'mama') {
        return true; // Return any family member as a match
      }
    }

    // Search name
    if (contact.name.toLowerCase().includes(queryLower)) return true;

    // Search email
    if (contact.email?.toLowerCase().includes(queryLower)) return true;

    // Search phone (support partial matching)
    if (contact.phone?.includes(queryLower)) return true;

    // Search notes (for aliases like "my mom")
    if (contact.notes?.toLowerCase().includes(queryLower)) return true;

    // Search topics
    if (contact.topics.some((t) => t.topic.toLowerCase().includes(queryLower))) return true;

    // Search recent context
    if (contact.recentContext.some((c) => c.toLowerCase().includes(queryLower))) return true;

    return false;
  });

  // 🐛 FIX: If no results in contact_relationships, also search the main contacts service
  // Data capture saves to user_contacts, but telephony was only looking here
  if (results.length === 0) {
    try {
      const { searchContacts: searchMainContacts } = await import('../contacts.js');
      const mainResults = await searchMainContacts(userId, queryLower);

      // Convert main contacts to ContactRelationship format
      for (const result of mainResults) {
        const mainContact = result.contact;
        if (mainContact.phones?.[0]?.number || mainContact.emails?.[0]?.address) {
          const converted: ContactRelationship = {
            id: mainContact.id,
            userId: mainContact.userId,
            contactId: mainContact.id,
            name: mainContact.displayName,
            email: mainContact.emails?.[0]?.address,
            phone: mainContact.phones?.[0]?.number,
            relationship: (mainContact.relationship as ContactRelationship['relationship']) || 'other',
            notes: mainContact.notes || mainContact.nicknames?.join(', '),
            firstInteraction: mainContact.createdAt,
            lastInteraction: mainContact.lastContactedAt || mainContact.updatedAt,
            interactionCount: 1,
            strengthScore: 50,
            topics: [],
            recentContext: [],
            createdAt: mainContact.createdAt,
            updatedAt: mainContact.updatedAt,
          };
          results.push(converted);
          log.info(
            { userId, query, contactName: converted.name, phone: converted.phone },
            '📇 Found contact in main contacts service (fallback)'
          );
        }
      }
    } catch (fallbackErr) {
      log.debug({ error: String(fallbackErr) }, 'Fallback contact search failed (non-fatal)');
    }
  }

  return results;
}

/**
 * Get context for a contact (for LLM)
 */
export async function getContactContext(userId: string, contactId: string): Promise<string | null> {
  const contact = await getContact(userId, contactId);
  if (!contact) return null;

  const now = new Date();
  const daysSinceContact = Math.floor(
    (now.getTime() - contact.lastInteraction.getTime()) / (1000 * 60 * 60 * 24)
  );

  let context = `${contact.name}`;
  if (contact.relationship) {
    context += ` (${contact.relationship})`;
  }
  context += `:\n`;

  context += `- Last contact: ${daysSinceContact === 0 ? 'today' : daysSinceContact === 1 ? 'yesterday' : `${daysSinceContact} days ago`}\n`;
  context += `- Total interactions: ${contact.interactionCount}\n`;
  context += `- Relationship strength: ${contact.strengthScore}/100\n`;

  if (contact.preferredChannel) {
    context += `- Prefers: ${contact.preferredChannel}\n`;
  }

  if (contact.avgResponseTimeHours) {
    context += `- Usually responds within: ${Math.round(contact.avgResponseTimeHours)} hours\n`;
  }

  if (contact.topics.length > 0) {
    const topTopics = contact.topics
      .sort((a, b) => b.mentionCount - a.mentionCount)
      .slice(0, 3)
      .map((t) => t.topic);
    context += `- Common topics: ${topTopics.join(', ')}\n`;
  }

  if (contact.recentContext.length > 0) {
    context += `- Recent context:\n`;
    contact.recentContext.slice(0, 3).forEach((c) => {
      context += `  - ${c}\n`;
    });
  }

  if (contact.pendingFollowUp && !contact.pendingFollowUp.completed) {
    context += `- PENDING FOLLOW-UP: ${contact.pendingFollowUp.reason}\n`;
  }

  return context;
}

// ============================================================================
// INTERACTION HISTORY - "Better Than Human" Memory
// ============================================================================

/**
 * Get full interaction history for a contact
 */
export async function getInteractionHistory(
  userId: string,
  contactId: string,
  options: {
    limit?: number;
    type?: InteractionType;
    since?: Date;
  } = {}
): Promise<InteractionRecord[]> {
  const firestore = await getFirestore();
  if (!firestore) return [];

  try {
    let query = firestore
      .collection(INTERACTIONS_COLLECTION)
      .where('userId', '==', userId)
      .where('contactId', '==', contactId);

    if (options.type) {
      query = query.where('type', '==', options.type);
    }

    if (options.since) {
      query = query.where('date', '>=', options.since);
    }

    query = query.orderBy('date', 'desc');

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        date: data.date?.toDate?.() || new Date(data.date),
      } as InteractionRecord;
    });
  } catch (error) {
    log.warn({ error: String(error), userId, contactId }, 'Failed to get interaction history');
    return [];
  }
}

/**
 * Get interaction statistics for a contact
 *
 * "Better Than Human" - Perfect pattern recognition
 */
export async function getInteractionStats(
  userId: string,
  contactId: string
): Promise<{
  totalInteractions: number;
  byType: Record<string, number>;
  avgPerMonth: number;
  longestStreak: { type: InteractionType; count: number } | null;
  lastByType: Record<string, Date>;
  sentimentTrend: 'improving' | 'stable' | 'declining' | 'unknown';
  suggestedNextInteraction: InteractionType;
}> {
  const history = await getInteractionHistory(userId, contactId, { limit: 100 });

  if (history.length === 0) {
    return {
      totalInteractions: 0,
      byType: {},
      avgPerMonth: 0,
      longestStreak: null,
      lastByType: {},
      sentimentTrend: 'unknown',
      suggestedNextInteraction: 'text',
    };
  }

  // Count by type
  const byType: Record<string, number> = {};
  const lastByType: Record<string, Date> = {};
  let longestStreak: { type: InteractionType; count: number } | null = null;

  for (const int of history) {
    byType[int.type] = (byType[int.type] || 0) + 1;

    if (!lastByType[int.type] || int.date > lastByType[int.type]) {
      lastByType[int.type] = int.date;
    }

    if (int.isStreak && int.streakCount) {
      if (!longestStreak || int.streakCount > longestStreak.count) {
        longestStreak = { type: int.type, count: int.streakCount };
      }
    }
  }

  // Calculate avg per month
  const firstInteraction = history[history.length - 1]?.date || new Date();
  const monthsSpan = Math.max(
    1,
    Math.ceil((Date.now() - firstInteraction.getTime()) / (1000 * 60 * 60 * 24 * 30))
  );
  const avgPerMonth = Math.round((history.length / monthsSpan) * 10) / 10;

  // Sentiment trend (last 10 vs previous 10)
  const recent = history.slice(0, 10);
  const previous = history.slice(10, 20);
  const recentPositive = recent.filter((i) => i.sentiment === 'positive').length;
  const previousPositive = previous.filter((i) => i.sentiment === 'positive').length;

  let sentimentTrend: 'improving' | 'stable' | 'declining' | 'unknown' = 'unknown';
  if (previous.length >= 5) {
    if (recentPositive > previousPositive + 2) sentimentTrend = 'improving';
    else if (recentPositive < previousPositive - 2) sentimentTrend = 'declining';
    else sentimentTrend = 'stable';
  }

  // Suggest next interaction based on patterns
  const mostCommon = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];
  let suggestedNextInteraction: InteractionType = 'text';

  // If they mostly text, suggest a call for variety
  if (mostCommon?.[0] === 'text' && byType['call'] < byType['text'] / 3) {
    suggestedNextInteraction = 'call';
  } else if (mostCommon?.[0] === 'call' && !byType['hangout']) {
    suggestedNextInteraction = 'hangout';
  } else {
    suggestedNextInteraction = (mostCommon?.[0] as InteractionType) || 'text';
  }

  return {
    totalInteractions: history.length,
    byType,
    avgPerMonth,
    longestStreak,
    lastByType,
    sentimentTrend,
    suggestedNextInteraction,
  };
}

/**
 * Get conversation topics to bring up
 *
 * "Better Than Human" - Perfect recall of what they care about
 */
export async function getTopicsToDiscuss(
  userId: string,
  contactId: string
): Promise<
  Array<{
    topic: string;
    lastDiscussed: Date;
    sentiment: string;
    suggestion: string;
  }>
> {
  const contact = await getContact(userId, contactId);
  if (!contact || contact.topics.length === 0) return [];

  const now = new Date();

  return contact.topics
    .filter((t) => t.mentionCount >= 2) // Topics they've mentioned multiple times
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, 5)
    .map((topic) => {
      const daysSince = Math.floor(
        (now.getTime() - topic.lastMentioned.getTime()) / (1000 * 60 * 60 * 24)
      );

      let suggestion = '';
      if (daysSince > 30) {
        suggestion = `It's been a while since you discussed ${topic.topic}. Ask how it's going!`;
      } else if (topic.sentiment === 'negative') {
        suggestion = `Check in on ${topic.topic} - they seemed stressed about it.`;
      } else if (topic.sentiment === 'positive') {
        suggestion = `They were excited about ${topic.topic} - celebrate their progress!`;
      } else {
        suggestion = `${topic.topic} comes up often. Show you remember!`;
      }

      return {
        topic: topic.topic,
        lastDiscussed: topic.lastMentioned,
        sentiment: topic.sentiment || 'neutral',
        suggestion,
      };
    });
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function ensureUserLoaded(userId: string): Promise<void> {
  if (loadedUsers.has(userId)) return;

  const firestore = await getFirestore();
  if (!firestore) {
    loadedUsers.add(userId);
    return;
  }

  try {
    const snapshot = await firestore
      .collection(CONTACTS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('lastInteraction', 'desc')
      .get();

    const contacts: ContactRelationship[] = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      contacts.push({
        ...data,
        firstInteraction: data.firstInteraction?.toDate() || new Date(),
        lastInteraction: data.lastInteraction?.toDate() || new Date(),
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        topics: (data.topics || []).map((t: Record<string, unknown>) => ({
          ...t,
          firstMentioned: (t.firstMentioned as { toDate: () => Date })?.toDate?.() || new Date(),
          lastMentioned: (t.lastMentioned as { toDate: () => Date })?.toDate?.() || new Date(),
        })),
        pendingFollowUp: data.pendingFollowUp
          ? {
              ...data.pendingFollowUp,
              dueDate: data.pendingFollowUp.dueDate?.toDate() || new Date(),
            }
          : undefined,
        lastFollowUpDate: data.lastFollowUpDate?.toDate(),
      } as ContactRelationship);
    }

    contactCache.set(userId, contacts);
    loadedUsers.add(userId);
    log.debug({ userId, count: contacts.length }, 'Loaded contact relationships');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load contacts');
    loadedUsers.add(userId);
  }
}

async function persistContact(contact: ContactRelationship): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    // Remove undefined values before persisting to Firestore
    const cleanContact = Object.fromEntries(
      Object.entries(contact).filter(([_, v]) => v !== undefined)
    );

    await firestore
      .collection(CONTACTS_COLLECTION)
      .doc(contact.id)
      .set(cleanForFirestore(cleanContact));

    // Index to semantic memory for contact awareness
    void onContactChange(
      contact.userId,
      contact.id,
      {
        name: contact.name,
        relationship: contact.relationship || 'contact',
        notes: contact.topics?.map((t) => t.topic).join('; '),
        importantDates: undefined,
        communicationPreference: contact.preferredChannel,
      },
      'update'
    );
  } catch (error) {
    log.error({ error: String(error), contactId: contact.id }, 'Failed to persist contact');
  }
}

async function persistInteraction(interaction: InteractionRecord): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    await firestore
      .collection(INTERACTIONS_COLLECTION)
      .doc(interaction.id)
      .set(cleanForFirestore(interaction));

    // Index to semantic memory for relationship context
    void onContactInteractionChange(
      interaction.userId,
      interaction.id,
      {
        contactName: interaction.contactId, // Will be resolved from contact later
        interactionType: interaction.type as 'call' | 'message' | 'meeting' | 'email' | 'social',
        summary: interaction.summary || '',
        date: interaction.date.toISOString(),
        sentiment: interaction.sentiment as 'positive' | 'neutral' | 'negative' | undefined,
        followUpNeeded: false,
      },
      'create'
    );
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to persist interaction');
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

export function clearCache(userId?: string): void {
  if (userId) {
    contactCache.delete(userId);
    loadedUsers.delete(userId);
  } else {
    contactCache.clear();
    loadedUsers.clear();
  }
}

export default {
  getContacts,
  getContact,
  upsertContact,
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
