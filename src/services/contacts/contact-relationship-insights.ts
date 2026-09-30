/**
 * Contact relationship insights: attention signals, search and context.
 * Extracted from contact-relationship-service.ts.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getContact, getContacts } from './contact-relationship-store.js';
import type { ContactInsight, ContactRelationship } from './contact-relationship-types.js';

const log = getLogger();

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
            relationship:
              (mainContact.relationship as ContactRelationship['relationship']) || 'other',
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
