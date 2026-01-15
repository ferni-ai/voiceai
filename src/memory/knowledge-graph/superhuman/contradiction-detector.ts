/**
 * Contradiction Detector - Notice When Facts Conflict
 *
 * Humans forget what they said before. Ferni doesn't.
 * This service detects when new information contradicts
 * previously stored facts, enabling:
 *
 * - Fact verification ("Last time you said Mike lives in Chicago...")
 * - Gentle clarification ("You mentioned Sarah was your sister, but now...")
 * - Story consistency tracking
 * - Self-awareness support ("You said you'd quit, but...")
 *
 * Key principle: Surface contradictions GENTLY. People don't like
 * being called out. Frame as curiosity, not accusation.
 *
 * @module memory/knowledge-graph/superhuman/contradiction-detector
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { Entity, ExtractedFact, Mention } from '../types.js';

const log = createLogger({ module: 'ContradictionDetector' });

// ============================================================================
// TYPES
// ============================================================================

export interface Contradiction {
  id: string;
  userId: string;
  /** Type of contradiction */
  type: ContradictionType;
  /** Entity this is about */
  entityId?: string;
  entityName?: string;
  /** The original fact */
  originalFact: {
    content: string;
    learnedAt: Date;
    source: string;
  };
  /** The contradicting new information */
  newFact: {
    content: string;
    detectedAt: Date;
    source: string;
  };
  /** Confidence that this is a real contradiction (vs misunderstanding) */
  confidence: number;
  /** Severity: how important is this contradiction? */
  severity: 'minor' | 'moderate' | 'significant';
  /** Status of resolution */
  status: 'detected' | 'surfaced' | 'resolved' | 'dismissed';
  /** How it was resolved */
  resolution?: string;
  /** Suggested phrasing for surfacing */
  suggestedPhrase: string;
}

export interface FactConflict {
  factKey: string;
  originalValue: string;
  newValue: string;
  entityId?: string;
  confidence: number;
}

export type ContradictionType =
  | 'attribute_change' // "Lives in Chicago" vs "Lives in NYC"
  | 'relationship_change' // "My friend" vs "My ex"
  | 'status_change' // "Married" vs "Divorced"
  | 'behavior_change' // "I never drink" vs "I had wine"
  | 'timeline_inconsistency' // "Started in 2020" vs "Started in 2019"
  | 'emotional_inconsistency' // "I love my job" vs "I hate my job"
  | 'commitment_violation' // "I'll quit smoking" vs "Had a cigarette"
  | 'self_perception'; // "I'm a patient person" vs "I snapped at them"

// ============================================================================
// CONTRADICTION DETECTOR
// ============================================================================

export class ContradictionDetector {
  /**
   * Check new facts against existing knowledge for contradictions
   */
  async checkForContradictions(
    userId: string,
    newFacts: ExtractedFact[],
    context: { sessionId: string; transcript: string }
  ): Promise<Contradiction[]> {
    const contradictions: Contradiction[] = [];

    try {
      for (const newFact of newFacts) {
        if (!newFact.entityId) continue;

        const conflicts = await this.findConflicts(userId, newFact);

        for (const conflict of conflicts) {
          const contradiction = this.buildContradiction(userId, newFact, conflict, context);
          if (contradiction) {
            contradictions.push(contradiction);
          }
        }
      }

      return contradictions;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Contradiction detection failed');
      return [];
    }
  }

  /**
   * Check a single statement for contradictions
   */
  async checkStatement(
    userId: string,
    statement: string,
    entityId?: string
  ): Promise<Contradiction[]> {
    const contradictions: Contradiction[] = [];

    try {
      // Use LLM to extract facts from statement
      const { extractFacts } = await import('../extractors/index.js');
      const { getAllEntities } = await import('../../entity-store/storage.js');

      const entities = entityId
        ? [{ id: entityId, name: '', type: 'person' }]
        : (await getAllEntities(userId, { limit: 50 })).map((e) => ({
            id: e.id,
            name: e.canonicalName,
            type: e.type,
          }));

      const factResult = await extractFacts({
        transcript: statement,
        knownEntities: entities,
        userId,
        sessionId: 'contradiction-check',
      });

      for (const fact of factResult.facts) {
        if (!fact.entityId) continue;

        const conflicts = await this.findConflicts(userId, fact);

        for (const conflict of conflicts) {
          const contradiction = this.buildContradiction(userId, fact, conflict, {
            sessionId: 'contradiction-check',
            transcript: statement,
          });
          if (contradiction) {
            contradictions.push(contradiction);
          }
        }
      }

      return contradictions;
    } catch (error) {
      log.error({ error: String(error) }, 'Statement contradiction check failed');
      return [];
    }
  }

  /**
   * Get all unresolved contradictions for a user
   */
  async getUnresolvedContradictions(userId: string): Promise<Contradiction[]> {
    try {
      const { Firestore } = await import('@google-cloud/firestore');
      const db = new Firestore();

      const snapshot = await db
        .collection('knowledge_graph')
        .doc(userId)
        .collection('contradictions')
        .where('status', 'in', ['detected', 'surfaced'])
        .orderBy('detectedAt', 'desc')
        .limit(20)
        .get();

      return snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => ({
        id: doc.id,
        ...doc.data(),
        originalFact: {
          ...doc.data().originalFact,
          learnedAt: doc.data().originalFact.learnedAt?.toDate?.(),
        },
        newFact: {
          ...doc.data().newFact,
          detectedAt: doc.data().newFact.detectedAt?.toDate?.(),
        },
      })) as Contradiction[];
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to get unresolved contradictions');
      return [];
    }
  }

  /**
   * Resolve a contradiction
   */
  async resolveContradiction(
    userId: string,
    contradictionId: string,
    resolution: 'new_is_correct' | 'original_is_correct' | 'both_true' | 'dismiss'
  ): Promise<void> {
    try {
      const { Firestore } = await import('@google-cloud/firestore');
      const db = new Firestore();

      const resolutionText = {
        new_is_correct: 'Updated to new information',
        original_is_correct: 'Kept original information',
        both_true: 'Both are valid in different contexts',
        dismiss: 'Not a real contradiction',
      }[resolution];

      await db
        .collection('knowledge_graph')
        .doc(userId)
        .collection('contradictions')
        .doc(contradictionId)
        .update({
          status: resolution === 'dismiss' ? 'dismissed' : 'resolved',
          resolution: resolutionText,
          resolvedAt: new Date(),
        });

      // If new is correct, update the entity fact
      if (resolution === 'new_is_correct') {
        const doc = await db
          .collection('knowledge_graph')
          .doc(userId)
          .collection('contradictions')
          .doc(contradictionId)
          .get();

        const contradiction = doc.data();
        if (contradiction?.entityId && contradiction?.newFact) {
          // Mark old fact as superseded
          // This would update the entity store
        }
      }
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to resolve contradiction');
    }
  }

  /**
   * Generate a gentle surfacing phrase for a contradiction
   */
  generateSurfacingPhrase(contradiction: Contradiction): string {
    const templates: Record<ContradictionType, string[]> = {
      attribute_change: [
        `I remember you mentioning that ${contradiction.originalFact.content}. Did something change?`,
        `I thought ${contradiction.originalFact.content}. Is ${contradiction.newFact.content} more accurate now?`,
        `Help me update my memory - ${contradiction.originalFact.content} or ${contradiction.newFact.content}?`,
      ],
      relationship_change: [
        `I want to make sure I understand - how would you describe your relationship with ${contradiction.entityName} now?`,
        `Last time we talked, you mentioned ${contradiction.entityName} as ${contradiction.originalFact.content}. Has that changed?`,
      ],
      status_change: [
        `I noticed a change - ${contradiction.originalFact.content} to ${contradiction.newFact.content}. Is that right?`,
        `Things have changed with ${contradiction.entityName}? Before it was ${contradiction.originalFact.content}.`,
      ],
      behavior_change: [
        `I remember you saying ${contradiction.originalFact.content}. I'm not judging, just curious about the change.`,
        `You mentioned before that ${contradiction.originalFact.content}. How are you feeling about ${contradiction.newFact.content}?`,
      ],
      timeline_inconsistency: [
        `I want to get the timeline right - was it ${contradiction.originalFact.content} or ${contradiction.newFact.content}?`,
        `My memory might be off - help me with the timing?`,
      ],
      emotional_inconsistency: [
        `Your feelings about ${contradiction.entityName || 'this'} seem to have shifted. Want to talk about that?`,
        `I noticed a change in how you feel. What's been going on?`,
      ],
      commitment_violation: [
        `No judgment at all - you mentioned ${contradiction.originalFact.content}. How are you feeling about ${contradiction.newFact.content}?`,
        `I remember you wanting to ${contradiction.originalFact.content}. Setbacks happen. Want to talk about it?`,
      ],
      self_perception: [
        `Interesting - you described yourself as ${contradiction.originalFact.content}, but just now ${contradiction.newFact.content}. Which feels more true?`,
        `I'm curious about that - how do you see yourself?`,
      ],
    };

    const options = templates[contradiction.type] || templates.attribute_change;
    return options[Math.floor(Math.random() * options.length)];
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async findConflicts(userId: string, newFact: ExtractedFact): Promise<FactConflict[]> {
    const conflicts: FactConflict[] = [];

    try {
      const { getMentionsForEntity } = await import('../../entity-store/storage.js');

      if (!newFact.entityId) return conflicts;

      // Get existing facts for this entity
      const mentions = await getMentionsForEntity(userId, newFact.entityId, 50);

      for (const mention of mentions) {
        for (const existingFact of mention.facts || []) {
          // Check if facts are about the same attribute
          if (this.factsConflict(existingFact, newFact)) {
            conflicts.push({
              factKey: existingFact.key || existingFact.type,
              originalValue: existingFact.value?.toString() || existingFact.content || '',
              newValue: newFact.value?.toString() || newFact.content || '',
              entityId: newFact.entityId,
              confidence: this.calculateConflictConfidence(existingFact, newFact),
            });
          }
        }
      }

      return conflicts;
    } catch (error) {
      log.debug({ error: String(error) }, 'Conflict search failed');
      return [];
    }
  }

  private factsConflict(existing: ExtractedFact, newFact: ExtractedFact): boolean {
    // Same key, different value
    if (existing.key && newFact.key && existing.key === newFact.key) {
      const existingValue = (existing.value?.toString() || '').toLowerCase().trim();
      const newValue = (newFact.value?.toString() || '').toLowerCase().trim();

      if (existingValue && newValue && existingValue !== newValue) {
        // Check if they're just different phrasings of same thing
        if (this.areEquivalent(existingValue, newValue)) {
          return false;
        }
        return true;
      }
    }

    // Same type of fact, contradictory content
    if (existing.type === newFact.type) {
      const existingContent = (existing.content || existing.value?.toString() || '').toLowerCase();
      const newContent = (newFact.content || newFact.value?.toString() || '').toLowerCase();

      // Check for negation patterns
      if (this.containsNegation(existingContent, newContent)) {
        return true;
      }
    }

    return false;
  }

  private areEquivalent(value1: string, value2: string): boolean {
    // Common equivalences
    const equivalences: Record<string, string[]> = {
      mom: ['mother', 'mama', 'mommy'],
      dad: ['father', 'papa', 'daddy'],
      wife: ['spouse', 'partner'],
      husband: ['spouse', 'partner'],
      nyc: ['new york', 'new york city'],
      la: ['los angeles'],
    };

    const v1 = value1.toLowerCase();
    const v2 = value2.toLowerCase();

    for (const [key, synonyms] of Object.entries(equivalences)) {
      const all = [key, ...synonyms];
      if (all.includes(v1) && all.includes(v2)) {
        return true;
      }
    }

    return false;
  }

  private containsNegation(text1: string, text2: string): boolean {
    const negationPairs = [
      ['yes', 'no'],
      ['true', 'false'],
      ['like', 'hate'],
      ['love', 'hate'],
      ['happy', 'unhappy'],
      ['married', 'divorced'],
      ['employed', 'unemployed'],
      ['alive', 'dead'],
      ['together', 'separated'],
    ];

    for (const [pos, neg] of negationPairs) {
      if (
        (text1.includes(pos) && text2.includes(neg)) ||
        (text1.includes(neg) && text2.includes(pos))
      ) {
        return true;
      }
    }

    // Check for "not" negation
    if (text1.includes('not') !== text2.includes('not')) {
      // One has "not", one doesn't
      const withoutNot1 = text1.replace(/\bnot\b/g, '').trim();
      const withoutNot2 = text2.replace(/\bnot\b/g, '').trim();
      if (
        withoutNot1 === withoutNot2 ||
        withoutNot1.includes(withoutNot2) ||
        withoutNot2.includes(withoutNot1)
      ) {
        return true;
      }
    }

    return false;
  }

  private calculateConflictConfidence(existing: ExtractedFact, newFact: ExtractedFact): number {
    let confidence = 0.5;

    // Higher confidence if both facts have high individual confidence
    confidence += ((existing.confidence || 0.5) + (newFact.confidence || 0.5)) / 4;

    // Higher confidence if they're about the same specific key
    if (existing.key === newFact.key) {
      confidence += 0.2;
    }

    // Cap at 0.95
    return Math.min(0.95, confidence);
  }

  private buildContradiction(
    userId: string,
    newFact: ExtractedFact,
    conflict: FactConflict,
    context: { sessionId: string; transcript: string }
  ): Contradiction | null {
    // Determine contradiction type
    const type = this.inferContradictionType(conflict);

    // Determine severity
    const severity = this.inferSeverity(type, conflict);

    // Build suggested phrase
    const contradiction: Contradiction = {
      id: `contradiction-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      type,
      entityId: conflict.entityId,
      entityName: undefined, // Would need to look up
      originalFact: {
        content: conflict.originalValue,
        learnedAt: new Date(), // Would need actual date
        source: 'previous_conversation',
      },
      newFact: {
        content: conflict.newValue,
        detectedAt: new Date(),
        source: context.transcript.slice(0, 100),
      },
      confidence: conflict.confidence,
      severity,
      status: 'detected',
      suggestedPhrase: '', // Will be set below
    };

    contradiction.suggestedPhrase = this.generateSurfacingPhrase(contradiction);

    return contradiction;
  }

  private inferContradictionType(conflict: FactConflict): ContradictionType {
    const key = conflict.factKey.toLowerCase();

    if (['location', 'address', 'city', 'lives'].some((k) => key.includes(k))) {
      return 'attribute_change';
    }
    if (['relationship', 'friend', 'family'].some((k) => key.includes(k))) {
      return 'relationship_change';
    }
    if (['married', 'status', 'job', 'employed'].some((k) => key.includes(k))) {
      return 'status_change';
    }
    if (['date', 'year', 'when', 'started'].some((k) => key.includes(k))) {
      return 'timeline_inconsistency';
    }
    if (['feel', 'love', 'hate', 'like'].some((k) => key.includes(k))) {
      return 'emotional_inconsistency';
    }
    if (['quit', 'stop', 'promise', 'commit'].some((k) => key.includes(k))) {
      return 'commitment_violation';
    }

    return 'attribute_change';
  }

  private inferSeverity(
    type: ContradictionType,
    conflict: FactConflict
  ): Contradiction['severity'] {
    // Commitment violations are significant
    if (type === 'commitment_violation') return 'significant';

    // High confidence conflicts are more significant
    if (conflict.confidence > 0.8) return 'significant';
    if (conflict.confidence > 0.6) return 'moderate';

    return 'minor';
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let contradictionDetector: ContradictionDetector | null = null;

export function getContradictionDetector(): ContradictionDetector {
  if (!contradictionDetector) {
    contradictionDetector = new ContradictionDetector();
  }
  return contradictionDetector;
}

export default ContradictionDetector;
