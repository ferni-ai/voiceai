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
  RelationshipType,
  FamilyRelation,
  EntitySource,
  PersonCaptureInput,
} from './types.js';

const log = createLogger({ module: 'entity-store:resolver' });

// ============================================================================
// RELATIONSHIP MAPPING
// ============================================================================

/**
 * Map relationship terms to canonical types
 */
const RELATIONSHIP_ALIASES: Record<string, { type: RelationshipType; specific?: FamilyRelation }> = {
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
  type: RelationshipType;
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
        await updateEntity(userId, exactMatch.id, {
          contact: {
            ...exactMatch.contact,
            phone: phone || exactMatch.contact?.phone,
            email: email || exactMatch.contact?.email,
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

  // Strategy 2: Relationship match ("my brother" → find entity with specificRelation="brother")
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
          updates.contact = {
            ...existingByRelation.contact,
            phone: phone || existingByRelation.contact?.phone,
            email: email || existingByRelation.contact?.email,
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

  const newEntity = await createEntity(userId, {
    userId,
    type: 'person',
    canonicalName: name || normalizedRel?.specific || relationship || 'Unknown Person',
    aliases: buildAliases(name, relationship),
    relationship: normalizedRel?.type || 'other',
    specificRelation: normalizedRel?.specific || relationship,
    contact: phone || email ? { phone, email } : undefined,
    source: 'conversation',
    confidence: name ? 0.8 : 0.6, // Lower confidence if we only have relationship
    createdAt: new Date(),
    updatedAt: new Date(),
    firstMentionedAt: new Date(),
    lastMentionedAt: new Date(),
    mentionCount: 1,
    salience: 0.5,
    emotionalWeight: 0.5,
    topics: [],
  });

  log.info(
    { entityId: newEntity.id, name: newEntity.canonicalName, relationship: newEntity.specificRelation },
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
  const entities = await getAllEntities(userId, { types: ['person'], limit: 100 });

  for (const entity of entities) {
    if (entity.specificRelation?.toLowerCase() === specificRelation.toLowerCase()) {
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
  const entities = await getAllEntities(userId, { types: ['person'], limit: 100 });

  for (const entity of entities) {
    if (entity.contact?.phone && normalizePhone(entity.contact.phone) === normalizedPhone) {
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
    secondary.aliases?.forEach((a) => allAliases.add(a));
    // Also add canonical name as alias
    if (secondary.canonicalName) {
      allAliases.add(secondary.canonicalName.toLowerCase());
    }
  }

  // Merge topics
  const allTopics = new Set(primary.topics);
  for (const secondary of secondaries) {
    secondary.topics?.forEach((t) => allTopics.add(t));
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

  // Merge contact info
  const mergedContact = {
    phone: primary.contact?.phone || secondaries.find((s) => s.contact?.phone)?.contact?.phone,
    email: primary.contact?.email || secondaries.find((s) => s.contact?.email)?.contact?.email,
    address: primary.contact?.address || secondaries.find((s) => s.contact?.address)?.contact?.address,
    birthday: primary.contact?.birthday || secondaries.find((s) => s.contact?.birthday)?.contact?.birthday,
  };

  // Sum mention counts
  const totalMentions = primary.mentionCount + secondaries.reduce((sum, s) => sum + s.mentionCount, 0);

  // Take highest salience and emotional weight
  const maxSalience = Math.max(primary.salience, ...secondaries.map((s) => s.salience));
  const maxEmotionalWeight = Math.max(
    primary.emotionalWeight,
    ...secondaries.map((s) => s.emotionalWeight)
  );

  // Track legacy IDs from merged entities
  const mergedLegacyIds = {
    ...primary.legacyIds,
  };
  for (const secondary of secondaries) {
    if (secondary.legacyIds) {
      Object.assign(mergedLegacyIds, secondary.legacyIds);
    }
  }

  // Update primary entity
  const updated = await updateEntity(userId, primaryEntityId, {
    canonicalName: bestName,
    aliases: [...allAliases],
    topics: [...allTopics],
    contact: mergedContact,
    mentionCount: totalMentions,
    salience: maxSalience,
    emotionalWeight: maxEmotionalWeight,
    mergedFrom: [...(primary.mergedFrom || []), ...secondaryEntityIds],
    legacyIds: mergedLegacyIds,
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
  facts: import('./types.js').ExtractedFact[];
  relationships: import('./types.js').EntityRelationship[];
  relatedEntities: Entity[];
}> {
  const { getMentionsForEntity, getRelationshipsForEntity } = await import('./storage.js');

  // Find entity
  let entity = await findEntityByAlias(userId, query, 'person');

  if (!entity) {
    // Try search
    const results = await searchEntities(userId, query, { types: ['person'], limit: 1 });
    entity = results[0] || null;
  }

  if (!entity) {
    return {
      entity: null,
      mentions: [],
      facts: [],
      relationships: [],
      relatedEntities: [],
    };
  }

  // Get all mentions
  const mentions = await getMentionsForEntity(userId, entity.id, 100);

  // Extract all facts from mentions
  const facts: import('./types.js').ExtractedFact[] = [];
  for (const mention of mentions) {
    if (mention.facts) {
      facts.push(...mention.facts);
    }
  }

  // Get relationships
  const relationships = await getRelationshipsForEntity(userId, entity.id);

  // Get related entities
  const relatedEntityIds = new Set<string>();
  for (const rel of relationships) {
    if (rel.fromEntityId !== entity.id) relatedEntityIds.add(rel.fromEntityId);
    if (rel.toEntityId !== entity.id) relatedEntityIds.add(rel.toEntityId);
  }

  const relatedEntities: Entity[] = [];
  for (const id of relatedEntityIds) {
    const related = await getEntity(userId, id);
    if (related) relatedEntities.push(related);
  }

  return {
    entity,
    mentions,
    facts,
    relationships,
    relatedEntities,
  };
}
