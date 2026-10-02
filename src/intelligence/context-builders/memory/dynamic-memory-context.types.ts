/**
 * Dynamic Memory Context Builder - types
 *
 * Shapes of the Firestore documents (dynamic entities, facts, relationships,
 * human signals) and STM promotion records read by dynamic-memory-context.ts.
 *
 * @module intelligence/context-builders/memory/dynamic-memory-context.types
 */

// ============================================================================
// FIRESTORE TYPES
// ============================================================================

export interface DynamicEntity {
  id: string;
  name: string;
  type: 'person' | 'place' | 'organization' | 'event' | 'concept' | 'thing';
  attributes: Record<string, string>;
  importance: number;
  mentionCount: number;
  lastMentioned: Date;
  createdAt: Date;
}

export interface DynamicFact {
  id: string;
  entityName: string;
  factType: 'attribute' | 'event' | 'relationship' | 'state' | 'preference';
  key: string;
  value: string;
  confidence: number;
  temporalContext?: string;
  extractedAt: Date;
}

export interface DynamicRelationship {
  id: string;
  source: string;
  target: string;
  type: string;
  strength: number;
  bidirectional: boolean;
  createdAt: Date;
}

/**
 * Human signals from LLM extraction (Jan 2026)
 * "Better Than Human" - things a human friend would forget
 */
export interface HumanSignal {
  id: string;
  type: string;
  value: string;
  context?: string;
  confidence: number;
  extractedAt: Date;
}

export interface HumanMemoryProfile {
  importantDates: HumanSignal[];
  values: HumanSignal[];
  dreams: HumanSignal[];
  fears: HumanSignal[];
  growthMarkers: HumanSignal[];
  comfortPatterns: HumanSignal[];
  challenges: HumanSignal[];
  stressTriggers: HumanSignal[];
  importantPeople: HumanSignal[];
}

// ============================================================================
// PROMOTED ENTITY / TOPIC PATTERN TYPES (from STM promotion)
// ============================================================================

export interface PromotedEntity {
  id: string;
  name: string;
  type: string;
  mentionCount: number;
  importance: number;
  lastContext: string;
  promotedAt: Date;
}

export interface TopicPattern {
  id: string;
  sessionId: string;
  topics: string[];
  transitions: string[];
  dominantTopic: string;
  promotedAt: Date;
}
