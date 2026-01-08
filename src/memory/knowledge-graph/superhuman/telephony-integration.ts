/**
 * Telephony Integration - Knowledge Graph for Contact Resolution
 *
 * Uses the knowledge graph to enhance telephony features:
 * - Resolve phone numbers to known entities
 * - Provide context before/during calls
 * - Track call history as relationship data
 * - Suggest contacts based on conversation context
 * - Identify who might be calling from unknown numbers
 *
 * @module memory/knowledge-graph/superhuman/telephony-integration
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { Entity, Mention, Relationship } from '../types.js';

const log = createLogger({ module: 'TelephonyIntegration' });

// ============================================================================
// TYPES
// ============================================================================

export interface ContactResolution {
  /** Resolved entity if found */
  entity?: {
    id: string;
    name: string;
    type: string;
  };
  /** Phone number provided */
  phoneNumber: string;
  /** Confidence of resolution (0-1) */
  confidence: number;
  /** How we resolved it */
  method: 'exact_match' | 'name_match' | 'relationship_inference' | 'recent_mention' | 'not_found';
  /** Alternative matches if uncertain */
  alternatives?: Array<{
    entityId: string;
    entityName: string;
    confidence: number;
    reason: string;
  }>;
}

export interface PhoneContext {
  /** Resolved contact (if found) */
  contact?: {
    id: string;
    name: string;
    relationship?: string;
  };
  /** Recent conversation context */
  recentContext: {
    lastMentioned?: Date;
    recentTopics: string[];
    emotionalTone: 'positive' | 'negative' | 'neutral' | 'mixed';
    openItems: string[];
  };
  /** Suggested talking points */
  suggestedTopics: string[];
  /** Commitments involving this person */
  activeCommitments: string[];
  /** Upcoming events/milestones */
  upcomingEvents: string[];
  /** Quick summary */
  briefing: string;
}

export interface CallRecord {
  id: string;
  userId: string;
  entityId?: string;
  phoneNumber: string;
  direction: 'incoming' | 'outgoing';
  timestamp: Date;
  duration?: number; // seconds
  outcome?: 'answered' | 'missed' | 'voicemail' | 'busy' | 'declined';
  notes?: string;
  emotionalContext?: string;
  topics?: string[];
}

export interface ContactSuggestion {
  entityId: string;
  entityName: string;
  phoneNumber?: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  lastContact?: Date;
  urgency?: string;
}

// ============================================================================
// TELEPHONY INTEGRATION
// ============================================================================

export class TelephonyIntegration {
  /**
   * Resolve a phone number to a known entity
   */
  async resolveContact(
    userId: string,
    phoneNumber: string
  ): Promise<ContactResolution> {
    const normalized = this.normalizePhoneNumber(phoneNumber);

    try {
      const { getAllEntities, searchEntities } = await import('../../entity-store/storage.js');

      // 1. Try exact phone number match in entity facts
      const entities = await getAllEntities(userId, { types: ['person'], limit: 200 });

      for (const entity of entities) {
        const phoneNumbers = this.extractPhoneNumbers(entity);
        if (phoneNumbers.some((p) => this.normalizePhoneNumber(p) === normalized)) {
          return {
            entity: {
              id: entity.id,
              name: entity.canonicalName,
              type: entity.type,
            },
            phoneNumber,
            confidence: 1.0,
            method: 'exact_match',
          };
        }
      }

      // 2. Try to infer from recent mentions
      const recentMatch = await this.inferFromRecentMentions(userId, phoneNumber);
      if (recentMatch) {
        return recentMatch;
      }

      // 3. Not found
      return {
        phoneNumber,
        confidence: 0,
        method: 'not_found',
      };
    } catch (error) {
      log.error({ error: String(error) }, 'Contact resolution failed');
      return {
        phoneNumber,
        confidence: 0,
        method: 'not_found',
      };
    }
  }

  /**
   * Get pre-call briefing context for a contact
   */
  async getPhoneContext(
    userId: string,
    entityId: string
  ): Promise<PhoneContext | null> {
    try {
      const { getEntity, getMentionsForEntity, getEntityRelationships } = await import(
        '../../entity-store/storage.js'
      );

      const entity = await getEntity(userId, entityId);
      if (!entity) return null;

      // Get recent mentions
      const mentions = await getMentionsForEntity(userId, entityId, 20);
      const relationships = await getEntityRelationships(userId, entityId);

      // Extract recent topics
      const recentTopics: Set<string> = new Set();
      let lastMentioned: Date | undefined;
      let positiveCount = 0;
      let negativeCount = 0;

      for (const mention of mentions) {
        if (!lastMentioned || new Date(mention.timestamp) > lastMentioned) {
          lastMentioned = new Date(mention.timestamp);
        }

        if (mention.context?.topic) {
          recentTopics.add(mention.context.topic);
        }

        if (this.isPositive(mention.emotion)) positiveCount++;
        if (this.isNegative(mention.emotion)) negativeCount++;
      }

      // Determine emotional tone
      let emotionalTone: 'positive' | 'negative' | 'neutral' | 'mixed' = 'neutral';
      if (positiveCount > negativeCount * 2) emotionalTone = 'positive';
      else if (negativeCount > positiveCount * 2) emotionalTone = 'negative';
      else if (positiveCount > 0 && negativeCount > 0) emotionalTone = 'mixed';

      // Get open items from threads
      const openItems = await this.getOpenItems(userId, entityId);

      // Get active commitments
      const commitments = await this.getCommitments(userId, entityId);

      // Get upcoming events (birthdays, anniversaries)
      const upcomingEvents = await this.getUpcomingEvents(userId, entityId);

      // Generate suggested topics
      const suggestedTopics = this.generateSuggestedTopics(
        Array.from(recentTopics),
        openItems,
        commitments
      );

      // Generate briefing
      const briefing = this.generateBriefing(
        entity.canonicalName,
        lastMentioned,
        emotionalTone,
        openItems,
        commitments,
        upcomingEvents
      );

      const primaryRelationship = relationships.find((r) => r.type === 'belongs_to' || r.label);

      return {
        contact: {
          id: entity.id,
          name: entity.canonicalName,
          relationship: primaryRelationship?.label,
        },
        recentContext: {
          lastMentioned,
          recentTopics: Array.from(recentTopics).slice(0, 5),
          emotionalTone,
          openItems,
        },
        suggestedTopics,
        activeCommitments: commitments,
        upcomingEvents,
        briefing,
      };
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get phone context');
      return null;
    }
  }

  /**
   * Record a phone call in the knowledge graph
   */
  async recordCall(userId: string, call: Omit<CallRecord, 'id'>): Promise<void> {
    try {
      const { Firestore } = await import('@google-cloud/firestore');
      const db = new Firestore();

      const callId = `call-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      await db
        .collection('users')
        .doc(userId)
        .collection('call_records')
        .doc(callId)
        .set({
          ...call,
          id: callId,
          timestamp: call.timestamp.toISOString(),
        });

      // If we have an entity, record as a mention
      if (call.entityId) {
        const { recordMention } = await import('../../entity-store/storage.js');

        await recordMention(userId, call.entityId, {
          sentiment: call.emotionalContext === 'positive' ? 1 : call.emotionalContext === 'negative' ? -1 : 0,
          topics: call.topics || [],
        });

        log.info({
          callId,
          entityId: call.entityId,
          direction: call.direction,
        }, 'Call recorded');
      }
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to record call');
    }
  }

  /**
   * Suggest contacts to reach out to
   */
  async suggestContacts(
    userId: string,
    context?: { topic?: string; mood?: string }
  ): Promise<ContactSuggestion[]> {
    const suggestions: ContactSuggestion[] = [];

    try {
      const { getAllEntities, getMentionsForEntity } = await import('../../entity-store/storage.js');
      const entities = await getAllEntities(userId, { types: ['person'], limit: 50 });

      for (const entity of entities) {
        const phone = this.extractPhoneNumbers(entity)[0];
        const mentions = await getMentionsForEntity(userId, entity.id, 10);

        if (mentions.length === 0) continue;

        const lastMention = new Date(
          Math.max(...mentions.map((m) => new Date(m.timestamp).getTime()))
        );
        const daysSinceContact = (Date.now() - lastMention.getTime()) / (24 * 60 * 60 * 1000);

        // Suggest if not contacted recently
        if (daysSinceContact > 14) {
          let priority: 'high' | 'medium' | 'low' = 'low';
          let reason = "It's been a while since you connected.";

          if (daysSinceContact > 60) {
            priority = 'high';
            reason = `You haven't talked about ${entity.canonicalName} in over 2 months.`;
          } else if (daysSinceContact > 30) {
            priority = 'medium';
            reason = `It's been about a month since ${entity.canonicalName} came up.`;
          }

          // Check for open commitments
          const commitments = await this.getCommitments(userId, entity.id);
          if (commitments.length > 0) {
            priority = 'high';
            reason = `You have pending commitments: ${commitments[0]}`;
          }

          // Check for upcoming events
          const events = await this.getUpcomingEvents(userId, entity.id);
          if (events.length > 0) {
            priority = 'high';
            reason = events[0];
          }

          suggestions.push({
            entityId: entity.id,
            entityName: entity.canonicalName,
            phoneNumber: phone,
            reason,
            priority,
            lastContact: lastMention,
          });
        }
      }

      // Sort by priority then by days since contact
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return suggestions.sort((a, b) => {
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return (a.lastContact?.getTime() || 0) - (b.lastContact?.getTime() || 0);
      }).slice(0, 10);
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to suggest contacts');
      return [];
    }
  }

  /**
   * Resolve a name to a phone number
   */
  async resolveNameToPhone(
    userId: string,
    name: string
  ): Promise<{ entityId: string; name: string; phoneNumber: string } | null> {
    try {
      const { searchEntities } = await import('../../entity-store/storage.js');

      const matches = await searchEntities(userId, name, { types: ['person'], limit: 5 });

      for (const entity of matches) {
        const phones = this.extractPhoneNumbers(entity);
        if (phones.length > 0) {
          return {
            entityId: entity.id,
            name: entity.canonicalName,
            phoneNumber: phones[0],
          };
        }
      }

      return null;
    } catch (error) {
      log.error({ error: String(error) }, 'Name to phone resolution failed');
      return null;
    }
  }

  /**
   * Get call history for an entity
   */
  async getCallHistory(
    userId: string,
    entityId: string,
    limit: number = 20
  ): Promise<CallRecord[]> {
    try {
      const { Firestore } = await import('@google-cloud/firestore');
      const db = new Firestore();

      const snapshot = await db
        .collection('users')
        .doc(userId)
        .collection('call_records')
        .where('entityId', '==', entityId)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          timestamp: new Date(data.timestamp),
        } as CallRecord;
      });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get call history');
      return [];
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private normalizePhoneNumber(phone: string): string {
    return phone.replace(/[^0-9+]/g, '');
  }

  private extractPhoneNumbers(entity: Entity): string[] {
    const phones: string[] = [];

    // Check contact info
    if (entity.contact?.phone) {
      phones.push(entity.contact.phone);
    }

    return phones;
  }

  private async inferFromRecentMentions(
    userId: string,
    phoneNumber: string
  ): Promise<ContactResolution | null> {
    // This would use ML or heuristics to guess who might be associated
    // with an unknown number based on recent conversations
    // For now, return null (not implemented)
    return null;
  }

  private async getOpenItems(userId: string, entityId: string): Promise<string[]> {
    const items: string[] = [];

    try {
      const { getThreadsForEntity } = await import('../storage/index.js');
      const threads = await getThreadsForEntity(userId, entityId);

      for (const thread of threads) {
        if (thread.status === 'open' && thread.openQuestions) {
          for (const question of thread.openQuestions) {
            items.push(question);
          }
        }
      }
    } catch (error) {
      // Open items are optional
    }

    return items.slice(0, 5);
  }

  private async getCommitments(userId: string, entityId: string): Promise<string[]> {
    const commitments: string[] = [];

    try {
      const { getCommitmentLinker } = await import('./commitment-linker.js');
      const linker = getCommitmentLinker();
      const linkedCommitments = await linker.getCommitmentsForEntity(userId, entityId);

      for (const commitment of linkedCommitments) {
        if (commitment.status === 'active' || commitment.status === 'overdue') {
          let text = commitment.description;
          if (commitment.status === 'overdue') {
            text += ' (overdue)';
          }
          commitments.push(text);
        }
      }
    } catch (error) {
      // Commitments are optional
    }

    return commitments.slice(0, 3);
  }

  private async getUpcomingEvents(userId: string, entityId: string): Promise<string[]> {
    const events: string[] = [];

    try {
      const { getAnniversaryEngine } = await import('./anniversary-engine.js');
      const engine = getAnniversaryEngine();
      const anniversaries = await engine.getUpcomingAnniversaries(userId, 30);

      for (const anniversary of anniversaries) {
        if (anniversary.entityId === entityId) {
          const daysUntil = Math.ceil(
            (anniversary.date.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
          );
          events.push(`${anniversary.title} in ${daysUntil} days`);
        }
      }
    } catch (error) {
      // Events are optional
    }

    return events.slice(0, 3);
  }

  private generateSuggestedTopics(
    recentTopics: string[],
    openItems: string[],
    commitments: string[]
  ): string[] {
    const suggestions: string[] = [];

    // Prioritize open items and commitments
    for (const item of openItems.slice(0, 2)) {
      suggestions.push(`Follow up: ${item}`);
    }

    for (const commitment of commitments.slice(0, 2)) {
      suggestions.push(`Check on: ${commitment}`);
    }

    // Add recent topics as conversation starters
    for (const topic of recentTopics.slice(0, 3)) {
      if (!suggestions.some((s) => s.includes(topic))) {
        suggestions.push(`Continue discussing: ${topic}`);
      }
    }

    return suggestions.slice(0, 5);
  }

  private generateBriefing(
    name: string,
    lastMentioned: Date | undefined,
    emotionalTone: string,
    openItems: string[],
    commitments: string[],
    upcomingEvents: string[]
  ): string {
    const parts: string[] = [];

    // Time since last contact
    if (lastMentioned) {
      const daysSince = Math.round(
        (Date.now() - lastMentioned.getTime()) / (24 * 60 * 60 * 1000)
      );
      if (daysSince === 0) {
        parts.push(`You talked about ${name} today.`);
      } else if (daysSince === 1) {
        parts.push(`You mentioned ${name} yesterday.`);
      } else {
        parts.push(`Last mentioned ${name} ${daysSince} days ago.`);
      }
    }

    // Emotional context
    if (emotionalTone === 'positive') {
      parts.push('Recent conversations have been positive.');
    } else if (emotionalTone === 'negative') {
      parts.push('Recent conversations have been challenging.');
    } else if (emotionalTone === 'mixed') {
      parts.push('Your recent feelings about this relationship are mixed.');
    }

    // Key items
    if (commitments.length > 0) {
      parts.push(`Active commitments: ${commitments[0]}`);
    }

    if (upcomingEvents.length > 0) {
      parts.push(`Coming up: ${upcomingEvents[0]}`);
    }

    if (openItems.length > 0) {
      parts.push(`Open topic: ${openItems[0]}`);
    }

    return parts.join(' ');
  }

  private isPositive(emotion?: string): boolean {
    const positive = ['happy', 'excited', 'grateful', 'hopeful', 'calm', 'content', 'proud'];
    return positive.includes(emotion?.toLowerCase() || '');
  }

  private isNegative(emotion?: string): boolean {
    const negative = ['sad', 'angry', 'anxious', 'stressed', 'frustrated', 'hurt', 'worried'];
    return negative.includes(emotion?.toLowerCase() || '');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let telephonyIntegration: TelephonyIntegration | null = null;

export function getTelephonyIntegration(): TelephonyIntegration {
  if (!telephonyIntegration) {
    telephonyIntegration = new TelephonyIntegration();
  }
  return telephonyIntegration;
}

export default TelephonyIntegration;
