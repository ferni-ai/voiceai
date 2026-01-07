/**
 * Unified Entity Store - Type Definitions
 *
 * This is the SINGLE SOURCE OF TRUTH for people, places, events, and concepts
 * in a user's life. All other collections (contacts, relationship_network, etc.)
 * are legacy and will be deprecated.
 *
 * @module memory/entity-store/types
 */

// ============================================================================
// ENTITY TYPES
// ============================================================================

/**
 * What kind of entity is this?
 */
export type EntityType =
  | 'person' // Someone in user's life
  | 'place' // Location (home, office, vacation spot)
  | 'event' // Past or future event (wedding, surgery, meeting)
  | 'concept' // Abstract idea (career, relationship, health)
  | 'goal' // Something user wants to achieve
  | 'commitment' // Promise or intention
  | 'dream' // Long-term aspiration
  | 'value' // Core value (family, honesty, growth)
  | 'pattern' // Behavioral pattern
  | 'memory'; // Significant memory/moment

/**
 * How was this entity created?
 */
export type EntitySource =
  | 'conversation' // Extracted from conversation
  | 'explicit' // User explicitly created
  | 'calendar' // From calendar integration
  | 'contacts' // From contacts import
  | 'migration' // Migrated from legacy collection
  | 'inferred'; // Inferred from context

/**
 * Relationship type for people
 */
export type RelationshipType =
  | 'family'
  | 'friend'
  | 'colleague'
  | 'romantic'
  | 'professional'
  | 'acquaintance'
  | 'other';

/**
 * Specific family relationships
 */
export type FamilyRelation =
  | 'mother'
  | 'father'
  | 'brother'
  | 'sister'
  | 'son'
  | 'daughter'
  | 'wife'
  | 'husband'
  | 'partner'
  | 'grandmother'
  | 'grandfather'
  | 'aunt'
  | 'uncle'
  | 'cousin'
  | 'niece'
  | 'nephew';

// ============================================================================
// CORE ENTITY INTERFACE
// ============================================================================

/**
 * Entity - A node in the knowledge graph
 *
 * This is the unified representation of any person, place, event, or concept
 * that exists in the user's life and conversations.
 */
export interface Entity {
  id: string; // Unique identifier
  userId: string; // Owner

  type: EntityType; // What kind of entity

  // Identity
  canonicalName: string; // Primary name ("Mike")
  aliases: string[]; // Other names ("Michael", "brother", "my bro")
  description?: string; // Brief description

  // Classification (for people)
  relationship?: RelationshipType; // family, friend, colleague, etc.
  specificRelation?: string; // "brother", "boss", "therapist"

  // Contact info (for people)
  contact?: ContactInfo;

  // Temporal
  createdAt: Date; // When entity was created in system
  updatedAt: Date; // Last updated
  firstMentionedAt: Date; // When user first mentioned them
  lastMentionedAt: Date; // Most recent mention
  mentionCount: number; // How often mentioned

  // Importance
  salience: number; // 0-1, how important to user
  emotionalWeight: number; // 0-1, emotional significance

  // Semantic
  embedding?: number[]; // Vector embedding for similarity
  topics: string[]; // Associated topics

  // Metadata
  source: EntitySource; // How was this entity created
  confidence: number; // 0-1, how confident in entity existence
  mergedFrom?: string[]; // If consolidated from multiple entities

  // Legacy linking (for migration)
  legacyIds?: {
    userContactId?: string; // From user_contacts collection
    relationshipNetworkId?: string; // From relationship_network collection
    contactRelationshipId?: string; // From contact_relationships collection
    guestProfileId?: string; // From guest_profiles collection
  };
}

export interface ContactInfo {
  phone?: string;
  email?: string;
  address?: string;
  birthday?: string; // ISO date string
  notes?: string;
}

// ============================================================================
// MENTION INTERFACE
// ============================================================================

/**
 * Mention - A reference to an entity in conversation
 */
export interface Mention {
  id: string;
  userId: string;
  entityId: string; // Which entity was mentioned

  // Context
  transcript: string; // The actual text
  sessionId: string; // Which conversation
  turnNumber?: number; // Which turn in conversation
  personaId: string; // Which persona was active

  // Temporal
  timestamp: Date; // When mentioned

  // Semantic
  topics: string[]; // Topics in this mention
  sentiment: number; // -1 to 1, how they felt about entity
  emotionalIntensity: number; // 0-1, how emotional the mention

  // Classification
  mentionType: MentionType; // What kind of mention

  // Extracted facts
  facts: ExtractedFact[]; // New information learned

  // Embedding for semantic search
  embedding?: number[];
}

export type MentionType =
  | 'reference' // Simple reference ("I saw Mike")
  | 'story' // Story about entity ("Mike did something funny")
  | 'emotion' // Emotional content ("I'm worried about Mike")
  | 'fact' // New fact ("Mike lives in Chicago")
  | 'update' // Status update ("Mike got promoted")
  | 'planning' // Future planning ("Meeting Mike tomorrow")
  | 'reflection'; // Reflecting on relationship

export interface ExtractedFact {
  type: 'attribute' | 'event' | 'relationship' | 'state';
  key: string; // What kind of fact
  value: string; // The fact itself
  confidence: number; // 0-1
  validFrom?: Date; // When this became true
  validUntil?: Date; // When this stopped being true (if known)
}

// ============================================================================
// RELATIONSHIP (EDGE) INTERFACE
// ============================================================================

/**
 * EntityRelationship - An edge in the knowledge graph
 */
export interface EntityRelationship {
  id: string;
  userId: string;

  // The connection
  fromEntityId: string; // Source entity
  toEntityId: string; // Target entity
  relationshipType: EdgeType; // How they're connected

  // Details
  label?: string; // Human-readable label
  strength: number; // 0-1, how strong the connection
  sentiment: number; // -1 to 1, positive/negative

  // Temporal
  createdAt: Date;
  updatedAt: Date;
  lastMentionedAt: Date;

  // Evidence
  mentionIds: string[]; // Mentions that support this edge
}

export type EdgeType =
  // Person-to-person
  | 'knows' // Generic connection
  | 'family_of' // Family relationship
  | 'friend_of' // Friendship
  | 'works_with' // Professional
  | 'reports_to' // Hierarchy
  | 'romantic_with' // Romantic

  // Person-to-thing
  | 'interested_in' // Interest/hobby
  | 'worried_about' // Concern
  | 'wants' // Desire/goal
  | 'committed_to' // Commitment
  | 'values' // Core value

  // Thing-to-thing
  | 'related_to' // Generic relation
  | 'causes' // Causal relationship
  | 'part_of' // Hierarchical
  | 'blocks' // Conflict
  | 'enables'; // Dependency

// ============================================================================
// QUERY TYPES
// ============================================================================

export interface EntityQuery {
  entityId?: string;
  name?: string;
  type?: EntityType;
  relationship?: RelationshipType;
  includeRelated?: boolean;
  includeMentions?: boolean;
  timeRange?: { start: Date; end: Date };
  limit?: number;
}

export interface EntityQueryResult {
  entity: Entity;
  mentions: Mention[];
  facts: ExtractedFact[];
  relationships: EntityRelationship[];
  relatedEntities: Entity[];
}

export interface EntitySearchOptions {
  types?: EntityType[];
  relationships?: RelationshipType[];
  minSalience?: number;
  limit?: number;
  includeArchived?: boolean;
}

// ============================================================================
// CAPTURE TYPES
// ============================================================================

export interface PersonCaptureInput {
  name?: string;
  relationship?: string; // "brother", "boss", etc.
  phone?: string;
  email?: string;
  context?: string; // Additional context from conversation
}

export interface CaptureContext {
  conversationId: string;
  sessionId: string;
  personaId: string;
  transcript: string;
  emotion?: {
    primary: string;
    intensity: number;
  };
}

export interface CaptureResult {
  entity: Entity;
  isNew: boolean;
  merged: boolean;
  confidence: number;
}

// ============================================================================
// MIGRATION TYPES
// ============================================================================

export interface LegacyContact {
  id: string;
  userId: string;
  displayName?: string;
  name?: string;
  phone?: string;
  phones?: Array<{ number: string; type: string }>;
  email?: string;
  emails?: Array<{ address: string; type: string }>;
  relationship?: string;
  notes?: string;
  nicknames?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface LegacyRelationshipPerson {
  id: string;
  userId: string;
  name: string;
  type: string;
  importance: number;
  sentiment: number;
  mentionCount: number;
  firstMentioned?: Date;
  lastMentioned?: Date;
  context?: string[];
}

export interface MigrationResult {
  userId: string;
  entitiesCreated: number;
  entitiesMerged: number;
  mentionsCreated: number;
  legacyCollections: {
    userContacts: number;
    relationshipNetwork: number;
    contactRelationships: number;
    guestProfiles: number;
    relationshipNodes: number;
  };
  errors: string[];
  duration: number;
}
