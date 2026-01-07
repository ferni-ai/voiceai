/**
 * Entity Resolver - Resolves mentions to canonical entities
 *
 * This is the brain of entity management. When someone says "my brother" or "Mike"
 * or "my bro", this service figures out which entity they're referring to,
 * handling ambiguity, creating new entities, and merging duplicates.
 *
 * @module memory/entity-store/entity-resolver
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  createEntity,
  getEntity,
  updateEntity,
  findEntityByAlias,
  searchEntities,
  getAllEntities,
} from './storage.js';
import type {
  Entity,
  EntityType,
  SimpleRelationshipType,
  FamilyRelation,
  EntitySource,
  PersonCaptureInput,
  PersonAttributes,
  EntityAttributes,
  ExtractedFact,
} from './types.js';

const log = createLogger({ module: 'entity-store:resolver' });

// ============================================================================
// HELPER FUNCTIONS FOR NEW SCHEMA
// ============================================================================

/**
 * Type guard for PersonAttributes
 */
function isPersonAttributes(attrs: EntityAttributes): attrs is PersonAttributes {
  return attrs._type === 'person';
}

/**
 * Get phone from entity (handles new schema)
 */
function getPhone(entity: Entity): string | undefined {
  if (isPersonAttributes(entity.attributes)) {
    return entity.attributes.phone;
  }
  return undefined;
}

/**
 * Get email from entity (handles new schema)
 */
function getEmail(entity: Entity): string | undefined {
  if (isPersonAttributes(entity.attributes)) {
    return entity.attributes.email;
  }
  return undefined;
}

/**
 * Get specific relationship from entity (e.g., "brother", "mother")
 */
function getSpecificRelation(entity: Entity): string | undefined {
  if (isPersonAttributes(entity.attributes)) {
    return entity.attributes.relationship;
  }
  return undefined;
}

/**
 * Get relationship category from entity (e.g., "family", "colleague")
 */
function getRelationshipCategory(entity: Entity): SimpleRelationshipType | undefined {
  if (isPersonAttributes(entity.attributes)) {
    return entity.attributes.relationshipCategory;
  }
  return undefined;
}

/**
 * Create PersonAttributes for a new entity
 */
function createPersonAttributes(options: {
  relationship?: string;
  relationshipCategory?: SimpleRelationshipType;
  phone?: string;
  email?: string;
}): PersonAttributes {
  return {
    _type: 'person',
    relationship: options.relationship || 'unknown',
    relationshipCategory: options.relationshipCategory || 'other',
    phone: options.phone,
    email: options.email,
    sentiment: 0,
  };
}

// ============================================================================
// RELATIONSHIP MAPPING
// ============================================================================

/**
 * Map relationship terms to canonical types
 */
const RELATIONSHIP_ALIASES: Record<string, { type: SimpleRelationshipType; specific?: FamilyRelation }> = {
  // Family
  mother: { type: 'family', specific: 'mother' },
  mom: { type: 'family', specific: 'mother' },
  mommy: { type: 'family', specific: 'mother' },
  mama: { type: 'family', specific: 'mother' },
  father: { type: 'family', specific: 'father' },
  dad: { type: 'family', specific: 'father' },
  daddy: { type: 'family', specific: 'father' },
  papa: { type: 'family', specific: 'father' },
  brother: { type: 'family', specific: 'brother' },
  bro: { type: 'family', specific: 'brother' },
  sister: { type: 'family', specific: 'sister' },
  sis: { type: 'family', specific: 'sister' },
  son: { type: 'family', specific: 'son' },
  daughter: { type: 'family', specific: 'daughter' },
  wife: { type: 'romantic', specific: 'wife' },
  husband: { type: 'romantic', specific: 'husband' },
  partner: { type: 'romantic', specific: 'partner' },
  spouse: { type: 'romantic' },
  grandmother: { type: 'family', specific: 'grandmother' },
  grandma: { type: 'family', specific: 'grandmother' },
  grandfather: { type: 'family', specific: 'grandfather' },
  grandpa: { type: 'family', specific: 'grandfather' },
  aunt: { type: 'family', specific: 'aunt' },
  uncle: { type: 'family', specific: 'uncle' },
  cousin: { type: 'family', specific: 'cousin' },
  niece: { type: 'family', specific: 'niece' },
  nephew: { type: 'family', specific: 'nephew' },

  // Professional
  boss: { type: 'colleague' },
  manager: { type: 'colleague' },
  coworker: { type: 'colleague' },
  colleague: { type: 'colleague' },
  employee: { type: 'colleague' },
  client: { type: 'professional' },
  customer: { type: 'professional' },
  mentor: { type: 'professional' },
  mentee: { type: 'professional' },
  therapist: { type: 'professional' },
  doctor: { type: 'professional' },
  coach: { type: 'professional' },

  // Friends
  friend: { type: 'friend' },
  bestfriend: { type: 'friend' },
  'best friend': { type: 'friend' },
  buddy: { type: 'friend' },
  pal: { type: 'friend' },

  // Other
  neighbor: { type: 'acquaintance' },
  acquaintance: { type: 'acquaintance' },
  roommate: { type: 'acquaintance' },
  ex: { type: 'other' },
  'ex-wife': { type: 'other' },
  'ex-husband': { type: 'other' },
  'ex-boyfriend': { type: 'other' },
  'ex-girlfriend': { type: 'other' },
};

/**
 * Normalize a relationship term to canonical form
 */
function normalizeRelationship(term: string): {
  type: SimpleRelationshipType;
  specific?: string;
} | null {
  const normalized = term.toLowerCase().trim().replace(/[^a-z\s-]/g, '');

  // Direct lookup
  if (RELATIONSHIP_ALIASES[normalized]) {
    return RELATIONSHIP_ALIASES[normalized];
  }

  // Check with "my " prefix removed
  const withoutMy = normalized.replace(/^my\s+/, '');
  if (RELATIONSHIP_ALIASES[withoutMy]) {
    return RELATIONSHIP_ALIASES[withoutMy];
  }

  return null;
}

// ============================================================================
// ENTITY RESOLUTION
// ============================================================================

export interface ResolvedEntity {
  entity: Entity;
  confidence: number;
  isNew: boolean;
  merged: boolean;
  resolvedFrom: 'exact_name' | 'alias' | 'relationship' | 'semantic' | 'created';
}

/**
 * Resolve a person mention to an entity
 *
 * Resolution strategy (in order):
 * 1. Exact canonical name match
 * 2. Alias match (nicknames, alternate names)
 * 3. Relationship match ("my brother" → find entity with specificRelation="brother")
 * 4. Semantic similarity (embedding-based)
 * 5. Create new entity
 */
export async function resolvePerson(
  userId: string,
  input: PersonCaptureInput
): Promise<ResolvedEntity> {
  const { name, relationship, phone, email } = input;

  log.debug({ userId, name, relationship }, 'Resolving person entity');

  // Strategy 1: Exact name match
  if (name) {
    const exactMatch = await findEntityByAlias(userId, name, 'person');
    if (exactMatch) {
      log.debug({ entityId: exactMatch.id, name }, 'Found by exact name');

      // Update with new contact info if provided
      if (phone || email) {
        const currentAttrs = exactMatch.attributes as PersonAttributes;
        await updateEntity(userId, exactMatch.id, {
          attributes: {
            ...currentAttrs,
            phone: phone || currentAttrs.phone,
            email: email || currentAttrs.email,
          },
        });
      }

      return {
        entity: exactMatch,
        confidence: 0.95,
        isNew: false,
        merged: false,
        resolvedFrom: 'exact_name',
      };
    }
  }

  // Strategy 2: Relationship match ("my brother" → find entity with relationship="brother")
  if (relationship) {
    const normalizedRel = normalizeRelationship(relationship);
    if (normalizedRel?.specific) {
      // Look for existing entity with this specific relation
      const existingByRelation = await findBySpecificRelation(userId, normalizedRel.specific);
      if (existingByRelation) {
        log.debug(
          { entityId: existingByRelation.id, relation: normalizedRel.specific },
          'Found by relationship'
        );

        // Update with new info
        const updates: Partial<Entity> = {};
        if (name && !existingByRelation.canonicalName.includes(name)) {
          // Add name as alias if it's new info
          updates.aliases = [...(existingByRelation.aliases || []), name.toLowerCase()];
          // If we now have a real name, update canonical name
          if (existingByRelation.canonicalName === normalizedRel.specific) {
            updates.canonicalName = name;
          }
        }
        if (phone || email) {
          const currentAttrs = existingByRelation.attributes as PersonAttributes;
          updates.attributes = {
            ...currentAttrs,
            phone: phone || currentAttrs.phone,
            email: email || currentAttrs.email,
          };
        }

        if (Object.keys(updates).length > 0) {
          await updateEntity(userId, existingByRelation.id, updates);
        }

        return {
          entity: { ...existingByRelation, ...updates },
          confidence: 0.9,
          isNew: false,
          merged: false,
          resolvedFrom: 'relationship',
        };
      }
    }
  }

  // Strategy 3: Check if name exists as an alias of another entity
  if (name) {
    const aliasMatch = await findEntityByAlias(userId, name.toLowerCase(), 'person');
    if (aliasMatch) {
      log.debug({ entityId: aliasMatch.id, alias: name }, 'Found by alias');
      return {
        entity: aliasMatch,
        confidence: 0.85,
        isNew: false,
        merged: false,
        resolvedFrom: 'alias',
      };
    }
  }

  // Strategy 4: Phone number match (if provided)
  if (phone) {
    const phoneMatch = await findByPhone(userId, phone);
    if (phoneMatch) {
      log.debug({ entityId: phoneMatch.id, phone }, 'Found by phone');

      // Update with name if we now have it
      if (name && !phoneMatch.canonicalName) {
        await updateEntity(userId, phoneMatch.id, {
          canonicalName: name,
          aliases: [...(phoneMatch.aliases || []), name.toLowerCase()],
        });
      }

      return {
        entity: phoneMatch,
        confidence: 0.9,
        isNew: false,
        merged: false,
        resolvedFrom: 'exact_name',
      };
    }
  }

  // Strategy 5: Create new entity
  const normalizedRel = relationship ? normalizeRelationship(relationship) : null;
  const canonicalName = name || normalizedRel?.specific || relationship || 'Unknown Person';
  
  const personAttrs = createPersonAttributes({
    relationship: normalizedRel?.specific || relationship,
    relationshipCategory: normalizedRel?.type || 'other',
    phone,
    email,
  });

  const now = new Date();
  const salienceScore = 0.5;
  const emotionalWeight = 0.5;

  const newEntity = await createEntity(userId, {
    userId,
    type: 'person',
    canonicalName,
    aliases: buildAliases(name, relationship),
    searchTokens: [canonicalName.toLowerCase(), ...(name ? [name.toLowerCase()] : [])],
    attributes: personAttrs,
    sourceConversations: [],
    sourcePersonas: [],
    confidence: name ? 0.8 : 0.6, // Lower confidence if we only have relationship
    createdAt: now,
    updatedAt: now,
    firstSeen: now,
    lastSeen: now,
    // Compatibility aliases (required)
    firstMentioned: now,
    lastMentioned: now,
    mentionCount: 1,
    salienceScore,
    emotionalWeight,
    // Compatibility aliases (required)
    importance: salienceScore,
    emotionalSalience: emotionalWeight,
    recencyBoost: 1.0,
    temporalContext: {
      peakMoments: [],
      emotionalDecayResistance: 1.0,
    },
    // Compatibility (required)
    properties: {},
    embedding: [],
  });

  log.info(
    { entityId: newEntity.id, name: newEntity.canonicalName, relationship: getSpecificRelation(newEntity) },
    '✨ Created new person entity'
  );

  return {
    entity: newEntity,
    confidence: newEntity.confidence,
    isNew: true,
    merged: false,
    resolvedFrom: 'created',
  };
}

/**
 * Build aliases array from name and relationship
 */
function buildAliases(name?: string, relationship?: string): string[] {
  const aliases: string[] = [];

  if (name) {
    aliases.push(name.toLowerCase());
    // Add common variations
    const parts = name.split(' ');
    if (parts.length > 1) {
      aliases.push(parts[0].toLowerCase()); // First name
    }
  }

  if (relationship) {
    const normalized = relationship.toLowerCase().trim();
    aliases.push(normalized);
    aliases.push(`my ${normalized}`);

    // Add common variations
    const normalizedRel = normalizeRelationship(relationship);
    if (normalizedRel?.specific && normalizedRel.specific !== normalized) {
      aliases.push(normalizedRel.specific);
      aliases.push(`my ${normalizedRel.specific}`);
    }
  }

  return [...new Set(aliases)]; // Deduplicate
}

/**
 * Find entity by specific relation (brother, mother, etc.)
 */
async function findBySpecificRelation(userId: string, specificRelation: string): Promise<Entity | null> {
  const entities = await getAllEntities(userId, { types: ['person'], topK: 100 });

  for (const entity of entities) {
    const relation = getSpecificRelation(entity);
    if (relation?.toLowerCase() === specificRelation.toLowerCase()) {
      return entity;
    }
  }

  return null;
}

/**
 * Find entity by phone number
 */
async function findByPhone(userId: string, phone: string): Promise<Entity | null> {
  const normalizedPhone = normalizePhone(phone);
  const entities = await getAllEntities(userId, { types: ['person'], topK: 100 });

  for (const entity of entities) {
    const entityPhone = getPhone(entity);
    if (entityPhone && normalizePhone(entityPhone) === normalizedPhone) {
      return entity;
    }
  }

  return null;
}

/**
 * Normalize phone number for comparison
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10); // Last 10 digits
}

// ============================================================================
// ENTITY MERGING
// ============================================================================

/**
 * Merge multiple entities into one
 *
 * Used when we discover that two entities are actually the same person.
 * For example: "my brother" entity and "Mike" entity turn out to be the same.
 */
export async function mergeEntities(
  userId: string,
  primaryEntityId: string,
  secondaryEntityIds: string[]
): Promise<Entity | null> {
  const primary = await getEntity(userId, primaryEntityId);
  if (!primary) {
    log.error({ primaryEntityId }, 'Primary entity not found for merge');
    return null;
  }

  const secondaries: Entity[] = [];
  for (const id of secondaryEntityIds) {
    const entity = await getEntity(userId, id);
    if (entity) secondaries.push(entity);
  }

  if (secondaries.length === 0) {
    log.warn({ primaryEntityId, secondaryEntityIds }, 'No secondary entities found for merge');
    return primary;
  }

  // Merge aliases
  const allAliases = new Set(primary.aliases);
  for (const secondary of secondaries) {
    secondary.aliases?.forEach((a: string) => allAliases.add(a));
    // Also add canonical name as alias
    if (secondary.canonicalName) {
      allAliases.add(secondary.canonicalName.toLowerCase());
    }
  }

  // Pick best canonical name (prefer actual names over relationship terms)
  let bestName = primary.canonicalName;
  for (const secondary of secondaries) {
    if (
      secondary.canonicalName &&
      !RELATIONSHIP_ALIASES[secondary.canonicalName.toLowerCase()] &&
      RELATIONSHIP_ALIASES[bestName.toLowerCase()]
    ) {
      bestName = secondary.canonicalName;
    }
  }

  // Merge contact info (from PersonAttributes)
  const primaryAttrs = primary.attributes as PersonAttributes;
  const mergedPhone = primaryAttrs.phone || secondaries.find((s) => getPhone(s))?.attributes && getPhone(secondaries.find((s) => getPhone(s))!);
  const mergedEmail = primaryAttrs.email || secondaries.find((s) => getEmail(s))?.attributes && getEmail(secondaries.find((s) => getEmail(s))!);

  // Sum mention counts
  const totalMentions = primary.mentionCount + secondaries.reduce((sum, s) => sum + s.mentionCount, 0);

  // Take highest salience and emotional weight
  const maxSalience = Math.max(primary.salienceScore, ...secondaries.map((s) => s.salienceScore));
  const maxEmotionalWeight = Math.max(
    primary.emotionalWeight,
    ...secondaries.map((s) => s.emotionalWeight)
  );

  // Merge source conversations
  const allSourceConversations = new Set(primary.sourceConversations);
  for (const secondary of secondaries) {
    secondary.sourceConversations?.forEach((c: string) => allSourceConversations.add(c));
  }

  // Update primary entity
  const mergedAttributes: PersonAttributes = {
    ...primaryAttrs,
    phone: mergedPhone,
    email: mergedEmail,
  };

  const updated = await updateEntity(userId, primaryEntityId, {
    canonicalName: bestName,
    aliases: [...allAliases],
    attributes: mergedAttributes,
    mentionCount: totalMentions,
    salienceScore: maxSalience,
    emotionalWeight: maxEmotionalWeight,
    sourceConversations: [...allSourceConversations],
  });

  // Delete secondary entities
  const { deleteEntity } = await import('./storage.js');
  for (const secondary of secondaries) {
    await deleteEntity(userId, secondary.id);
    log.info({ deletedId: secondary.id, mergedInto: primaryEntityId }, 'Deleted merged entity');
  }

  log.info(
    {
      primaryEntityId,
      secondaryCount: secondaries.length,
      newName: bestName,
      totalMentions,
    },
    '🔗 Merged entities'
  );

  return updated;
}

// ============================================================================
// ENTITY QUERY
// ============================================================================

/**
 * Get everything we know about an entity
 */
export async function whatDoWeKnowAbout(
  userId: string,
  query: string
): Promise<{
  entity: Entity | null;
  mentions: import('./types.js').Mention[];
  relationships: import('./types.js').EntityRelationship[];
  relatedEntities: Entity[];
}> {
  const { getMentionsForEntity, getRelationshipsForEntity } = await import('./storage.js');

  // Find entity
  let entity = await findEntityByAlias(userId, query, 'person');

  if (!entity) {
    // Try search
    const results = await searchEntities(userId, query, { types: ['person'], topK: 1 });
    entity = results[0] || null;
  }

  if (!entity) {
    return {
      entity: null,
      mentions: [],
      relationships: [],
      relatedEntities: [],
    };
  }

  // Get all mentions
  const mentions = await getMentionsForEntity(userId, entity.id, 100);

  // Get relationships
  const relationships = await getRelationshipsForEntity(userId, entity.id);

  // Get related entities
  const relatedEntityIds = new Set<string>();
  for (const rel of relationships) {
    if (rel.fromEntity !== entity.id) relatedEntityIds.add(rel.fromEntity);
    if (rel.toEntity !== entity.id) relatedEntityIds.add(rel.toEntity);
  }

  const relatedEntities: Entity[] = [];
  for (const id of relatedEntityIds) {
    const related = await getEntity(userId, id);
    if (related) relatedEntities.push(related);
  }

  return {
    entity,
    mentions,
    relationships,
    relatedEntities,
  };
}

// ============================================================================
// ENTITY RESOLVER SINGLETON
// ============================================================================

/**
 * Entity Resolver - singleton accessor pattern
 *
 * This provides a facade for entity resolution operations used by
 * higher-level modules like knowledge-graph.
 */
/**
 * Input for resolving a mention
 */
export interface MentionInput {
  text?: string;
  name?: string;
  relationship?: string;
  type?: string;
  phone?: string;
  email?: string;
}

/**
 * Query for resolving an entity
 */
export interface EntityQuery {
  id?: string;
  name?: string;
  type?: string;
}

export interface EntityResolver {
  /** Resolve a person mention to a canonical entity */
  resolvePerson: typeof resolvePerson;
  /** Merge duplicate entities */
  mergeEntities: typeof mergeEntities;
  /** Get everything we know about an entity */
  whatDoWeKnowAbout: typeof whatDoWeKnowAbout;
  /** Check if resolver is ready */
  isReady: () => boolean;

  // Full implementations for knowledge-graph integration
  /** Resolve a mention (name/relationship) to a canonical entity */
  resolveMention: (userId: string, mention: MentionInput) => Promise<Entity | null>;
  /** Add a relationship between two entities */
  addRelationship: (userId: string, fromId: string, toId: string, type: string) => Promise<void>;
  /** Resolve an entity by ID or query */
  resolve: (userId: string, query: string | EntityQuery) => Promise<Entity | null>;
  /** Get all people entities for a user */
  getPeople: (userId: string, limit?: number) => Promise<Entity[]>;
  /** Get facts about an entity */
  getFacts: (userId: string, entityId: string) => Promise<ExtractedFact[]>;
  /** Get a specific entity by ID */
  getEntity: (userId: string, entityId: string) => Promise<Entity | null>;
  /** Get entities by type */
  getEntitiesByType: (userId: string, type: string, limit?: number) => Promise<Entity[]>;
}

let entityResolverInstance: EntityResolver | null = null;

// ============================================================================
// FULL IMPLEMENTATIONS (not stubs)
// ============================================================================

/**
 * Resolve a mention to an entity - FULL IMPLEMENTATION
 * This handles text mentions like "my brother" or "Mike" and resolves to canonical entities.
 */
async function resolveMentionImpl(
  userId: string,
  mention: unknown
): Promise<Entity | null> {
  const input = mention as {
    text?: string;
    name?: string;
    relationship?: string;
    type?: string;
    phone?: string;
    email?: string;
  };

  // Extract the name/text to resolve
  const nameOrText = input.name || input.text;
  
  if (!nameOrText && !input.relationship) {
    log.debug({ userId, mention }, 'Cannot resolve mention without name or relationship');
    return null;
  }

  // Use the existing resolvePerson which handles all resolution logic
  const result = await resolvePerson(userId, {
    name: nameOrText,
    relationship: input.relationship,
    phone: input.phone,
    email: input.email,
    context: input.text,
  });

  log.debug(
    { userId, input: nameOrText, entityId: result.entity.id, confidence: result.confidence },
    'Resolved mention to entity'
  );

  return result.entity;
}

/**
 * Add a relationship between two entities - FULL IMPLEMENTATION
 */
async function addRelationshipImpl(
  userId: string,
  fromEntityId: string,
  toEntityId: string,
  relationshipType: string
): Promise<void> {
  const { upsertRelationship } = await import('./storage.js');

  // Map string relationship type to EdgeType
  const edgeType = mapToEdgeType(relationshipType);

  await upsertRelationship(userId, {
    fromEntity: fromEntityId,
    toEntity: toEntityId,
    type: edgeType,
    strength: 0.5,
    firstLinked: new Date(),
    lastReinforced: new Date(),
    reinforcementCount: 1,
    bidirectional: false,
  });

  log.info(
    { userId, fromEntityId, toEntityId, relationshipType },
    'Added relationship between entities'
  );
}

/**
 * Map string to EdgeType (handles various relationship strings)
 */
function mapToEdgeType(rel: string): import('./types.js').EdgeType {
  const mapping: Record<string, import('./types.js').EdgeType> = {
    // Person-to-person
    family: 'family_of',
    family_of: 'family_of',
    friend: 'friend_of',
    friend_of: 'friend_of',
    colleague: 'works_with',
    works_with: 'works_with',
    romantic: 'romantic_with',
    romantic_with: 'romantic_with',
    knows: 'knows',
    reports_to: 'reports_to',
    // Person-to-thing
    interested_in: 'interested_in',
    worried_about: 'worried_about',
    wants: 'wants',
    committed_to: 'committed_to',
    commitment: 'committed_to',
    values: 'values',
    // Generic
    related_to: 'related_to',
    involves: 'involves',
    about: 'about',
    affects: 'affects',
    causes: 'causes',
    supports: 'supports',
    blocks: 'blocks',
    helps: 'helps',
  };

  return mapping[rel.toLowerCase()] || 'related_to';
}

/**
 * Resolve an entity by ID or query - FULL IMPLEMENTATION
 */
async function resolveImpl(
  userId: string,
  query: unknown
): Promise<Entity | null> {
  // If query is a string, could be an ID or a name
  if (typeof query === 'string') {
    // First try as ID
    const byId = await getEntity(userId, query);
    if (byId) return byId;

    // Then try as name/alias
    const byName = await findEntityByAlias(userId, query);
    if (byName) return byName;

    return null;
  }

  // If query is an object, use it for resolution
  const queryObj = query as { id?: string; name?: string; type?: string };
  
  if (queryObj.id) {
    return getEntity(userId, queryObj.id);
  }

  if (queryObj.name) {
    return findEntityByAlias(userId, queryObj.name, queryObj.type as import('./types.js').EntityType);
  }

  return null;
}

/**
 * Get all people entities for a user - FULL IMPLEMENTATION
 */
async function getPeopleImpl(userId: string, limit: number = 500): Promise<Entity[]> {
  return getAllEntities(userId, { types: ['person'], topK: limit });
}

/**
 * Get facts about an entity - FULL IMPLEMENTATION
 */
async function getFactsImpl(
  userId: string,
  entityId: string
): Promise<import('./types.js').ExtractedFact[]> {
  const { getMentionsForEntity } = await import('./storage.js');

  // Get all mentions for this entity
  const mentions = await getMentionsForEntity(userId, entityId, 100);

  // Extract facts from mentions
  const facts: import('./types.js').ExtractedFact[] = [];
  for (const mention of mentions) {
    if (mention.facts && Array.isArray(mention.facts)) {
      facts.push(...mention.facts);
    }
  }

  return facts;
}

/**
 * Get a specific entity by ID - FULL IMPLEMENTATION
 */
async function getEntityImpl(
  userId: string,
  entityId: string
): Promise<Entity | null> {
  return getEntity(userId, entityId);
}

/**
 * Get entities by type - FULL IMPLEMENTATION
 */
async function getEntitiesByTypeImpl(
  userId: string,
  type: string,
  limit: number = 200
): Promise<Entity[]> {
  return getAllEntities(userId, { types: [type as import('./types.js').EntityType], topK: limit });
}

/**
 * Get the entity resolver singleton
 */
export function getEntityResolver(): EntityResolver {
  if (!entityResolverInstance) {
    entityResolverInstance = {
      resolvePerson,
      mergeEntities,
      whatDoWeKnowAbout,
      isReady: () => true,

      // Full implementations (not stubs!)
      resolveMention: resolveMentionImpl,
      addRelationship: addRelationshipImpl,
      resolve: resolveImpl,
      getPeople: getPeopleImpl,
      getFacts: getFactsImpl,
      getEntity: getEntityImpl,
      getEntitiesByType: getEntitiesByTypeImpl,
    };
  }
  return entityResolverInstance;
}
