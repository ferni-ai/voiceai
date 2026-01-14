/**
 * Spanner Graph Schema
 *
 * Defines the property graph schema for L3 Long-Term Memory.
 * Uses Google Cloud Spanner's native graph capabilities (ISO GQL).
 *
 * This schema supports:
 * - Entity nodes (people, places, events, concepts)
 * - Fact nodes (things we know about entities)
 * - Relationship edges (how entities relate to each other)
 * - Entity-fact edges (which facts belong to which entities)
 *
 * @see https://cloud.google.com/spanner/docs/graph/overview
 * @module memory/spanner-graph/schema
 */

// ============================================================================
// SPANNER CONFIGURATION
// ============================================================================

export const SPANNER_CONFIG = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025',
  instanceId: 'ferni-memory',
  databaseId: 'knowledge_graph',
};

// ============================================================================
// TABLE DDL (Relational tables that back the graph)
// ============================================================================

/**
 * DDL statements to create the underlying tables for the property graph.
 * Spanner Graph requires relational tables as the source of truth.
 */
export const TABLE_DDL = `
-- Entity table: People, places, events, concepts
CREATE TABLE IF NOT EXISTS entities (
  entity_id STRING(36) NOT NULL,
  user_id STRING(36) NOT NULL,
  name STRING(255) NOT NULL,
  entity_type STRING(50) NOT NULL,
  attributes JSON,
  importance FLOAT64 DEFAULT 0.5,
  first_mentioned TIMESTAMP NOT NULL,
  last_mentioned TIMESTAMP NOT NULL,
  mention_count INT64 DEFAULT 1,
  created_at TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
  updated_at TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (user_id, entity_id);

-- Facts table: Things we know about entities
CREATE TABLE IF NOT EXISTS facts (
  fact_id STRING(36) NOT NULL,
  user_id STRING(36) NOT NULL,
  fact_type STRING(50) NOT NULL,
  key STRING(255) NOT NULL,
  value STRING(1024),
  confidence FLOAT64 DEFAULT 0.5,
  source_session STRING(36),
  extracted_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (user_id, fact_id);

-- Relationships table: How entities relate to each other
CREATE TABLE IF NOT EXISTS relationships (
  relationship_id STRING(36) NOT NULL,
  user_id STRING(36) NOT NULL,
  source_entity_id STRING(36) NOT NULL,
  target_entity_id STRING(36) NOT NULL,
  relationship_type STRING(50) NOT NULL,
  strength FLOAT64 DEFAULT 0.5,
  bidirectional BOOL DEFAULT false,
  created_at TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (user_id, relationship_id);

-- Entity-Fact junction table: Links facts to entities
CREATE TABLE IF NOT EXISTS entity_facts (
  entity_fact_id STRING(36) NOT NULL,
  user_id STRING(36) NOT NULL,
  entity_id STRING(36) NOT NULL,
  fact_id STRING(36) NOT NULL,
  created_at TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (user_id, entity_fact_id);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_entities_user_type ON entities(user_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_user_name ON entities(user_id, name);
CREATE INDEX IF NOT EXISTS idx_entities_last_mentioned ON entities(user_id, last_mentioned DESC);
CREATE INDEX IF NOT EXISTS idx_facts_user_type ON facts(user_id, fact_type);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(user_id, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(user_id, target_entity_id);
`;

// ============================================================================
// PROPERTY GRAPH DDL
// ============================================================================

/**
 * DDL statement to create the property graph.
 * This defines how the relational tables map to graph nodes and edges.
 */
export const GRAPH_DDL = `
CREATE OR REPLACE PROPERTY GRAPH FerniMemory
  NODE TABLES (
    -- Entity nodes
    entities AS Entity
      KEY (entity_id)
      PROPERTIES (
        entity_id,
        user_id,
        name,
        entity_type,
        attributes,
        importance,
        first_mentioned,
        last_mentioned,
        mention_count,
        created_at,
        updated_at
      ),
    
    -- Fact nodes
    facts AS Fact
      KEY (fact_id)
      PROPERTIES (
        fact_id,
        user_id,
        fact_type,
        key,
        value,
        confidence,
        source_session,
        extracted_at,
        created_at
      )
  )
  EDGE TABLES (
    -- Relationships between entities
    relationships AS Relationship
      KEY (relationship_id)
      SOURCE KEY (source_entity_id) REFERENCES entities (entity_id)
      DESTINATION KEY (target_entity_id) REFERENCES entities (entity_id)
      PROPERTIES (
        relationship_id,
        user_id,
        relationship_type,
        strength,
        bidirectional,
        created_at
      ),
    
    -- Facts about entities
    entity_facts AS EntityFact
      KEY (entity_fact_id)
      SOURCE KEY (entity_id) REFERENCES entities (entity_id)
      DESTINATION KEY (fact_id) REFERENCES facts (fact_id)
      PROPERTIES (
        entity_fact_id,
        created_at
      )
  );
`;

// ============================================================================
// TYPESCRIPT TYPES
// ============================================================================

export interface GraphEntity {
  entityId: string;
  userId: string;
  name: string;
  entityType: 'person' | 'place' | 'organization' | 'event' | 'concept' | 'thing';
  attributes: Record<string, unknown>;
  importance: number;
  firstMentioned: Date;
  lastMentioned: Date;
  mentionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GraphFact {
  factId: string;
  userId: string;
  factType: 'attribute' | 'event' | 'relationship' | 'state' | 'preference';
  key: string;
  value: string;
  confidence: number;
  sourceSession?: string;
  extractedAt: Date;
  createdAt: Date;
}

export interface GraphRelationship {
  relationshipId: string;
  userId: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: string;
  strength: number;
  bidirectional: boolean;
  createdAt: Date;
}

export interface EntityWithFacts extends GraphEntity {
  facts: GraphFact[];
}

export interface RelationshipResult {
  source: GraphEntity;
  relationship: GraphRelationship;
  target: GraphEntity;
}
