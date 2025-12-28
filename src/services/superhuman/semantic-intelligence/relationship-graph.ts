/**
 * Relationship Graph - V3.3 Relational Network
 *
 * Builds a semantic graph of the user's relationships:
 * - Who they know and how (mom, friend Sarah, boss)
 * - Connections between people (Mom doesn't like Sarah)
 * - Emotional impact of each person
 * - Topics associated with each person
 * - Support patterns (who helps with what)
 *
 * @module services/superhuman/semantic-intelligence/relationship-graph
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../firestore-utils.js';
import { embed, cosineSimilarity } from '../../../memory/embeddings.js';

const log = createLogger({ module: 'relationship-graph' });

// ============================================================================
// TYPES
// ============================================================================

export type RelationshipType =
  | 'family'
  | 'friend'
  | 'romantic'
  | 'colleague'
  | 'professional' // doctor, therapist, etc.
  | 'acquaintance'
  | 'pet'
  | 'unknown';

export type ConnectionType =
  | 'positive' // Mom and Dad get along
  | 'negative' // Mom doesn't like Sarah
  | 'neutral'
  | 'complex' // It's complicated
  | 'supportive' // Sarah always supports Mom
  | 'conflicted'; // They're in conflict

export interface PersonNode {
  id: string;
  userId: string;

  // Identity
  name: string;
  aliases: string[]; // "mom", "mother", "Carol"
  relationship: RelationshipType;

  // Metrics
  mentionCount: number;
  emotionalImpact: number; // -1 (draining) to 1 (energizing)
  supportScore: number; // 0-1, how supportive

  // Topics
  associatedTopics: string[];
  recentTopics: string[]; // Last 5 topics

  // Temporal
  firstMentioned: Date;
  lastMentioned: Date;
  mentionFrequency: number; // Per week average

  // Embedding for semantic matching
  embedding?: number[];
}

export interface PersonConnection {
  id: string;
  userId: string;

  // The two people
  personA: string; // PersonNode ID
  personB: string; // PersonNode ID

  // Connection
  type: ConnectionType;
  description: string; // "Mom doesn't approve of Sarah"
  confidence: number;

  // Evidence
  evidence: Array<{
    text: string;
    timestamp: Date;
  }>;

  // Temporal
  created: Date;
  updated: Date;
}

export interface SupportPattern {
  personId: string;
  domain: string; // "work", "emotional", "practical"
  description: string;
  strength: number; // 0-1
}

export interface RelationshipGraphSummary {
  totalPeople: number;
  energizingCount: number;
  drainingCount: number;
  conflictCount: number;
  topSupporter?: string;
  mostMentioned?: string;
  recentlyMentioned: string[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MAX_PEOPLE: 100,
  MAX_CONNECTIONS: 200,
  ALIAS_SIMILARITY_THRESHOLD: 0.85,
  MIN_MENTIONS_FOR_GRAPH: 2,
  RECENT_WINDOW_DAYS: 30,
};

// ============================================================================
// CACHE
// ============================================================================

const nodeCache = new Map<string, PersonNode[]>();
const connectionCache = new Map<string, PersonConnection[]>();

// ============================================================================
// CORE NODE FUNCTIONS
// ============================================================================

/**
 * Add or update a person in the graph.
 */
export async function upsertPerson(
  userId: string,
  person: {
    name: string;
    relationship?: RelationshipType;
    emotion?: string;
    sentiment?: number;
    topic?: string;
    context?: string;
  }
): Promise<PersonNode> {
  const nodes = await loadNodes(userId);
  const now = new Date();

  // Find existing node (by name or alias)
  let node = await findPersonByName(userId, person.name);

  if (node) {
    // Update existing
    node.mentionCount++;
    node.lastMentioned = now;

    // Update emotional impact (weighted average)
    if (person.sentiment !== undefined) {
      const weight = 0.2;
      node.emotionalImpact = node.emotionalImpact * (1 - weight) + person.sentiment * weight;
    }

    // Update relationship if provided and more specific
    if (person.relationship && person.relationship !== 'unknown') {
      node.relationship = person.relationship;
    }

    // Update topics
    if (person.topic) {
      if (!node.associatedTopics.includes(person.topic)) {
        node.associatedTopics.push(person.topic);
      }
      node.recentTopics = [
        person.topic,
        ...node.recentTopics.filter((t) => t !== person.topic),
      ].slice(0, 5);
    }

    // Recalculate mention frequency
    const daysSinceFirst = (now.getTime() - node.firstMentioned.getTime()) / (1000 * 60 * 60 * 24);
    node.mentionFrequency =
      daysSinceFirst > 0 ? (node.mentionCount / daysSinceFirst) * 7 : node.mentionCount;
  } else {
    // Create new node
    const id = `person_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    node = {
      id,
      userId,
      name: person.name,
      aliases: [person.name.toLowerCase()],
      relationship: person.relationship ?? 'unknown',
      mentionCount: 1,
      emotionalImpact: person.sentiment ?? 0,
      supportScore: 0.5,
      associatedTopics: person.topic ? [person.topic] : [],
      recentTopics: person.topic ? [person.topic] : [],
      firstMentioned: now,
      lastMentioned: now,
      mentionFrequency: 1,
    };

    // Generate embedding for semantic matching
    try {
      const embeddingText = `${person.name} ${person.relationship ?? ''} ${person.context ?? ''}`;
      node.embedding = await embed(embeddingText);
    } catch (e) {
      log.debug({ error: String(e) }, 'Failed to embed person');
    }

    nodes.push(node);
  }

  // Save and update cache
  await saveNode(userId, node);
  nodeCache.set(userId, nodes);

  log.debug({ userId, person: person.name, mentions: node.mentionCount }, '👤 Person upserted');

  return node;
}

/**
 * Find a person by name or alias.
 */
export async function findPersonByName(userId: string, name: string): Promise<PersonNode | null> {
  const nodes = await loadNodes(userId);
  const lowerName = name.toLowerCase();

  // Exact match on name or alias
  const exactMatch = nodes.find(
    (n) => n.name.toLowerCase() === lowerName || n.aliases.includes(lowerName)
  );

  if (exactMatch) return exactMatch;

  // Semantic similarity match
  try {
    const nameEmbedding = await embed(name);
    for (const node of nodes) {
      if (node.embedding) {
        const similarity = cosineSimilarity(nameEmbedding, node.embedding);
        if (similarity > CONFIG.ALIAS_SIMILARITY_THRESHOLD) {
          // Add as alias
          if (!node.aliases.includes(lowerName)) {
            node.aliases.push(lowerName);
            await saveNode(userId, node);
          }
          return node;
        }
      }
    }
  } catch (e) {
    log.debug({ error: String(e) }, 'Semantic person match failed');
  }

  return null;
}

/**
 * Get all people in the user's graph.
 */
export async function getAllPeople(userId: string): Promise<PersonNode[]> {
  return loadNodes(userId);
}

/**
 * Get people by relationship type.
 */
export async function getPeopleByRelationship(
  userId: string,
  relationship: RelationshipType
): Promise<PersonNode[]> {
  const nodes = await loadNodes(userId);
  return nodes.filter((n) => n.relationship === relationship);
}

/**
 * Get energizing vs draining people.
 */
export async function getPeopleByImpact(
  userId: string
): Promise<{ energizing: PersonNode[]; draining: PersonNode[]; neutral: PersonNode[] }> {
  const nodes = await loadNodes(userId);

  return {
    energizing: nodes
      .filter((n) => n.emotionalImpact > 0.2)
      .sort((a, b) => b.emotionalImpact - a.emotionalImpact),
    draining: nodes
      .filter((n) => n.emotionalImpact < -0.2)
      .sort((a, b) => a.emotionalImpact - b.emotionalImpact),
    neutral: nodes.filter((n) => n.emotionalImpact >= -0.2 && n.emotionalImpact <= 0.2),
  };
}

/**
 * Get most mentioned people.
 */
export async function getMostMentioned(userId: string, limit = 5): Promise<PersonNode[]> {
  const nodes = await loadNodes(userId);
  return nodes.sort((a, b) => b.mentionCount - a.mentionCount).slice(0, limit);
}

/**
 * Get recently mentioned people.
 */
export async function getRecentlyMentioned(userId: string, days = 7): Promise<PersonNode[]> {
  const nodes = await loadNodes(userId);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return nodes
    .filter((n) => n.lastMentioned > cutoff)
    .sort((a, b) => b.lastMentioned.getTime() - a.lastMentioned.getTime());
}

// ============================================================================
// CONNECTION FUNCTIONS
// ============================================================================

/**
 * Record a connection between two people.
 */
export async function recordConnection(
  userId: string,
  connection: {
    personA: string; // Name
    personB: string; // Name
    type: ConnectionType;
    description: string;
    evidence: string;
  }
): Promise<PersonConnection | null> {
  // Find or create both people
  const nodeA =
    (await findPersonByName(userId, connection.personA)) ??
    (await upsertPerson(userId, { name: connection.personA }));
  const nodeB =
    (await findPersonByName(userId, connection.personB)) ??
    (await upsertPerson(userId, { name: connection.personB }));

  const connections = await loadConnections(userId);
  const now = new Date();

  // Find existing connection
  let existing = connections.find(
    (c) =>
      (c.personA === nodeA.id && c.personB === nodeB.id) ||
      (c.personA === nodeB.id && c.personB === nodeA.id)
  );

  if (existing) {
    // Update
    existing.type = connection.type;
    existing.description = connection.description;
    existing.evidence.push({ text: connection.evidence, timestamp: now });
    existing.evidence = existing.evidence.slice(-10); // Keep last 10
    existing.updated = now;
    existing.confidence = Math.min(existing.confidence + 0.1, 1);
  } else {
    // Create
    existing = {
      id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      personA: nodeA.id,
      personB: nodeB.id,
      type: connection.type,
      description: connection.description,
      confidence: 0.6,
      evidence: [{ text: connection.evidence, timestamp: now }],
      created: now,
      updated: now,
    };
    connections.push(existing);
  }

  // Save
  await saveConnection(userId, existing);
  connectionCache.set(userId, connections);

  log.debug(
    {
      userId,
      personA: connection.personA,
      personB: connection.personB,
      type: connection.type,
    },
    '🔗 Connection recorded'
  );

  return existing;
}

/**
 * Get all connections for a person.
 */
export async function getConnectionsForPerson(
  userId: string,
  personName: string
): Promise<Array<{ person: PersonNode; connection: PersonConnection }>> {
  const person = await findPersonByName(userId, personName);
  if (!person) return [];

  const connections = await loadConnections(userId);
  const nodes = await loadNodes(userId);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return connections
    .filter((c) => c.personA === person.id || c.personB === person.id)
    .map((c) => ({
      person: nodeMap.get(c.personA === person.id ? c.personB : c.personA)!,
      connection: c,
    }))
    .filter((x) => x.person);
}

/**
 * Get conflicts in the user's network.
 */
export async function getConflicts(userId: string): Promise<PersonConnection[]> {
  const connections = await loadConnections(userId);
  return connections.filter((c) => c.type === 'negative' || c.type === 'conflicted');
}

// ============================================================================
// SUPPORT PATTERNS
// ============================================================================

/**
 * Update support score for a person.
 */
export async function updateSupportScore(
  userId: string,
  personName: string,
  domain: string,
  wasSupport: boolean
): Promise<void> {
  const node = await findPersonByName(userId, personName);
  if (!node) return;

  const adjustment = wasSupport ? 0.1 : -0.05;
  node.supportScore = Math.max(0, Math.min(1, node.supportScore + adjustment));

  await saveNode(userId, node);
}

/**
 * Get top supporters.
 */
export async function getTopSupporters(userId: string, limit = 5): Promise<PersonNode[]> {
  const nodes = await loadNodes(userId);
  return nodes
    .filter((n) => n.supportScore > 0.5)
    .sort((a, b) => b.supportScore - a.supportScore)
    .slice(0, limit);
}

// ============================================================================
// GRAPH SUMMARY
// ============================================================================

/**
 * Get a summary of the relationship graph.
 */
export async function getGraphSummary(userId: string): Promise<RelationshipGraphSummary> {
  const nodes = await loadNodes(userId);
  const connections = await loadConnections(userId);

  const impact = await getPeopleByImpact(userId);
  const topMentioned = await getMostMentioned(userId, 1);
  const topSupporter = (await getTopSupporters(userId, 1))[0];
  const recent = await getRecentlyMentioned(userId, 7);

  return {
    totalPeople: nodes.length,
    energizingCount: impact.energizing.length,
    drainingCount: impact.draining.length,
    conflictCount: connections.filter((c) => c.type === 'negative' || c.type === 'conflicted')
      .length,
    topSupporter: topSupporter?.name,
    mostMentioned: topMentioned[0]?.name,
    recentlyMentioned: recent.slice(0, 5).map((n) => n.name),
  };
}

// ============================================================================
// FORMAT FOR CONTEXT
// ============================================================================

/**
 * Format relationship graph for LLM context.
 */
export async function formatGraphForContext(
  userId: string,
  currentPerson?: string
): Promise<string> {
  const nodes = await loadNodes(userId);
  if (nodes.length === 0) return '';

  const impact = await getPeopleByImpact(userId);
  const conflicts = await getConflicts(userId);

  const lines = [
    '═══════════════════════════════════════════════════════════',
    'RELATIONSHIP NETWORK - People in their life',
    '═══════════════════════════════════════════════════════════',
    '',
  ];

  // Current person context
  if (currentPerson) {
    const node = await findPersonByName(userId, currentPerson);
    if (node) {
      lines.push(`TALKING ABOUT: ${node.name} (${node.relationship})`);
      lines.push(
        `  Impact: ${node.emotionalImpact > 0 ? '😊 Energizing' : node.emotionalImpact < 0 ? '😔 Draining' : '😐 Neutral'}`
      );
      lines.push(`  Mentioned ${node.mentionCount} times`);
      if (node.associatedTopics.length > 0) {
        lines.push(`  Topics: ${node.associatedTopics.slice(0, 5).join(', ')}`);
      }

      // Connections
      const personConnections = await getConnectionsForPerson(userId, currentPerson);
      if (personConnections.length > 0) {
        lines.push('  Connections:');
        for (const { person, connection } of personConnections.slice(0, 3)) {
          lines.push(`    - ${connection.description} (${person.name})`);
        }
      }
      lines.push('');
    }
  }

  // Key relationships
  if (impact.energizing.length > 0) {
    lines.push('ENERGIZING PEOPLE:');
    for (const p of impact.energizing.slice(0, 3)) {
      lines.push(`  - ${p.name} (${p.relationship})`);
    }
    lines.push('');
  }

  if (impact.draining.length > 0) {
    lines.push('DRAINING RELATIONSHIPS:');
    for (const p of impact.draining.slice(0, 3)) {
      lines.push(`  - ${p.name} (${p.relationship})`);
    }
    lines.push('');
  }

  // Active conflicts
  if (conflicts.length > 0) {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    lines.push('⚠️ KNOWN CONFLICTS:');
    for (const c of conflicts.slice(0, 3)) {
      const a = nodeMap.get(c.personA);
      const b = nodeMap.get(c.personB);
      if (a && b) {
        lines.push(`  - ${c.description}`);
      }
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════');

  return lines.join('\n');
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function loadNodes(userId: string): Promise<PersonNode[]> {
  const cached = nodeCache.get(userId);
  if (cached) return cached;

  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('relationship_nodes')
      .orderBy('lastMentioned', 'desc')
      .limit(CONFIG.MAX_PEOPLE)
      .get();

    const nodes = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        firstMentioned: data.firstMentioned?.toDate?.() ?? new Date(data.firstMentioned),
        lastMentioned: data.lastMentioned?.toDate?.() ?? new Date(data.lastMentioned),
      } as PersonNode;
    });

    nodeCache.set(userId, nodes);
    return nodes;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load relationship nodes');
    return [];
  }
}

async function saveNode(userId: string, node: PersonNode): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('relationship_nodes')
      .doc(node.id)
      .set(cleanForFirestore(node));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save relationship node');
  }
}

async function loadConnections(userId: string): Promise<PersonConnection[]> {
  const cached = connectionCache.get(userId);
  if (cached) return cached;

  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('relationship_connections')
      .orderBy('updated', 'desc')
      .limit(CONFIG.MAX_CONNECTIONS)
      .get();

    const connections = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        created: data.created?.toDate?.() ?? new Date(data.created),
        updated: data.updated?.toDate?.() ?? new Date(data.updated),
        evidence: (data.evidence ?? []).map((e: { text: string; timestamp: unknown }) => ({
          text: e.text,
          timestamp:
            typeof e.timestamp === 'object' && e.timestamp && 'toDate' in e.timestamp
              ? (e.timestamp as { toDate: () => Date }).toDate()
              : new Date(e.timestamp as string | number),
        })),
      } as PersonConnection;
    });

    connectionCache.set(userId, connections);
    return connections;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load connections');
    return [];
  }
}

async function saveConnection(userId: string, connection: PersonConnection): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('relationship_connections')
      .doc(connection.id)
      .set(cleanForFirestore(connection));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save connection');
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

export function clearGraphCache(userId?: string): void {
  if (userId) {
    nodeCache.delete(userId);
    connectionCache.delete(userId);
  } else {
    nodeCache.clear();
    connectionCache.clear();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const relationshipGraph = {
  // Nodes
  upsertPerson,
  findPerson: findPersonByName,
  getAllPeople,
  getByRelationship: getPeopleByRelationship,
  getByImpact: getPeopleByImpact,
  getMostMentioned,
  getRecentlyMentioned,

  // Connections
  recordConnection,
  getConnectionsFor: getConnectionsForPerson,
  getConflicts,

  // Support
  updateSupportScore,
  getTopSupporters,

  // Summary
  getSummary: getGraphSummary,
  format: formatGraphForContext,

  // Cache
  clearCache: clearGraphCache,
};

export default relationshipGraph;
