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

export interface InteractionRecord {
  id: string;
  contactId: string;
  userId: string;
  date: Date;
  type: 'email' | 'call' | 'text' | 'meeting' | 'other';
  direction: 'inbound' | 'outbound';
  summary?: string;
  topics?: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
  responseTimeHours?: number;
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

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;

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
  return contacts.find(
    (c) => c.id === identifier ||
      c.email?.toLowerCase() === identifier.toLowerCase() ||
      c.contactId === identifier
  ) || null;
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
 * Record an interaction with a contact
 */
export async function recordInteraction(
  userId: string,
  interaction: Omit<InteractionRecord, 'id'>
): Promise<void> {
  const contact = await getContact(userId, interaction.contactId);

  if (contact) {
    // Update contact stats
    const now = new Date();
    contact.lastInteraction = now;
    contact.interactionCount++;

    // Update strength score (decay over time, boost on interaction)
    contact.strengthScore = Math.min(100, contact.strengthScore + 5);

    // Add to recent context
    if (interaction.summary) {
      contact.recentContext = [
        interaction.summary,
        ...contact.recentContext.slice(0, 4)
      ];
    }

    // Track topics
    if (interaction.topics) {
      for (const topic of interaction.topics) {
        const existingTopic = contact.topics.find(
          (t) => t.topic.toLowerCase() === topic.toLowerCase()
        );
        if (existingTopic) {
          existingTopic.lastMentioned = now;
          existingTopic.mentionCount++;
        } else {
          contact.topics.push({
            topic,
            firstMentioned: now,
            lastMentioned: now,
            mentionCount: 1,
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

  // Also persist the interaction record
  await persistInteraction({ ...interaction, id: `int_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` });

  log.debug({ userId, contactId: interaction.contactId }, 'Interaction recorded');
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
 * Search contacts by name or topic
 */
export async function searchContacts(
  userId: string,
  query: string
): Promise<ContactRelationship[]> {
  const contacts = await getContacts(userId);
  const queryLower = query.toLowerCase();

  return contacts.filter((contact) => {
    // Search name
    if (contact.name.toLowerCase().includes(queryLower)) return true;

    // Search email
    if (contact.email?.toLowerCase().includes(queryLower)) return true;

    // Search topics
    if (contact.topics.some((t) => t.topic.toLowerCase().includes(queryLower))) return true;

    // Search recent context
    if (contact.recentContext.some((c) => c.toLowerCase().includes(queryLower))) return true;

    return false;
  });
}

/**
 * Get context for a contact (for LLM)
 */
export async function getContactContext(
  userId: string,
  contactId: string
): Promise<string | null> {
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
        pendingFollowUp: data.pendingFollowUp ? {
          ...data.pendingFollowUp,
          dueDate: data.pendingFollowUp.dueDate?.toDate() || new Date(),
        } : undefined,
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
    await firestore.collection(CONTACTS_COLLECTION).doc(contact.id).set({
      ...contact,
    });
  } catch (error) {
    log.error({ error: String(error), contactId: contact.id }, 'Failed to persist contact');
  }
}

async function persistInteraction(interaction: InteractionRecord): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    await firestore.collection(INTERACTIONS_COLLECTION).doc(interaction.id).set(interaction);
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
  clearCache,
};

