/**
 * Relational Semantics Graph - Better Than Human Service
 *
 * "Know which people bring joy vs. drain energy"
 *
 * Builds a semantic graph of how people in the user's life
 * correlate with emotional states:
 *   - Mentions of "mom" → 70% correlate with stress
 *   - Mentions of "Sarah" → 85% correlate with joy
 *   - "boss" appears before anxiety patterns 3x more than chance
 *
 * @module services/superhuman/semantic-intelligence/relational-semantics
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { embed, cosineSimilarity } from '../../../memory/embeddings.js';
import { getFirestoreDb, cleanForFirestore } from '../firestore-utils.js';
import type {
  RelationalNode,
  TopicAssociation,
  EmotionalSignature,
  RelationalEdge,
} from './types.js';

const log = createLogger({ module: 'relational-semantics' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MIN_MENTIONS_FOR_PROFILE: 3, // Minimum mentions to build profile
  MAX_NODES_PER_USER: 50,
  SENTIMENT_DECAY: 0.1, // How much old sentiment fades
  MAX_TOPIC_ASSOCIATIONS: 20,
  MAX_EMOTION_HISTORY: 30,
};

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

const nodeCache = new Map<string, RelationalNode[]>();
const edgeCache = new Map<string, RelationalEdge[]>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Record a mention of a person with emotional/topic context.
 *
 * Call this whenever someone is mentioned in conversation:
 * - Family members
 * - Friends
 * - Coworkers
 * - Anyone the user talks about
 */
export async function recordPersonMention(
  userId: string,
  mention: {
    name: string;
    relationship?: string; // "mom", "boss", "friend"
    context?: string; // What was being discussed
    emotion?: string; // Emotional context
    sentiment?: number; // -1 to 1
    topics?: string[]; // Topics mentioned alongside
  }
): Promise<RelationalNode | null> {
  const { name, relationship, context, emotion, sentiment, topics } = mention;
  const timestamp = Date.now();

  // Load existing nodes
  const nodes = nodeCache.get(userId) || (await loadNodes(userId));

  // Find or create node for this person
  let node = findNodeByName(nodes, name);

  if (node) {
    // Update existing node
    updateNode(node, {
      context,
      emotion,
      sentiment: sentiment ?? 0,
      topics,
      timestamp,
    });
  } else if (nodes.length < CONFIG.MAX_NODES_PER_USER) {
    // Create new node
    node = await createNode(userId, {
      name,
      relationship: relationship || 'unknown',
      context,
      emotion,
      sentiment: sentiment ?? 0,
      topics,
      timestamp,
    });
    nodes.push(node);
    nodeCache.set(userId, nodes);
  }

  if (node) {
    await saveNode(userId, node);
    log.debug({ userId, name, relationship: node.relationship }, '👤 Person mention recorded');
  }

  return node ?? null;
}

/**
 * Find a node by name (case-insensitive, alias-aware).
 */
function findNodeByName(nodes: RelationalNode[], name: string): RelationalNode | undefined {
  const nameLower = name.toLowerCase();
  return nodes.find(
    (n) =>
      n.name.toLowerCase() === nameLower || n.aliases.some((a) => a.toLowerCase() === nameLower)
  );
}

/**
 * Update an existing relational node.
 */
function updateNode(
  node: RelationalNode,
  data: {
    context?: string;
    emotion?: string;
    sentiment: number;
    topics?: string[];
    timestamp: number;
  }
): void {
  const { context, emotion, sentiment, topics, timestamp } = data;

  // Update mention stats
  node.mentionCount++;
  node.lastMentioned = timestamp;

  // Update running average valence
  const decayFactor = 1 - CONFIG.SENTIMENT_DECAY;
  node.averageValence = node.averageValence * decayFactor + sentiment * (1 - decayFactor);

  // Track valence variance
  const variance = Math.abs(sentiment - node.averageValence);
  node.valenceVariance = node.valenceVariance * decayFactor + variance * (1 - decayFactor);

  // Update emotional signature
  if (emotion) {
    updateEmotionalSignature(node.emotionalSignature, emotion, context);
  }

  // Update topic associations
  if (topics && topics.length > 0) {
    updateTopicAssociations(node.topicAssociations, topics, sentiment);
  }

  // Infer support level from accumulated data
  updateSupportLevel(node);

  // Generate insights if we have enough data
  if (node.mentionCount >= CONFIG.MIN_MENTIONS_FOR_PROFILE) {
    updateInsights(node);
  }
}

/**
 * Create a new relational node.
 */
async function createNode(
  userId: string,
  data: {
    name: string;
    relationship: string;
    context?: string;
    emotion?: string;
    sentiment: number;
    topics?: string[];
    timestamp: number;
  }
): Promise<RelationalNode> {
  const { name, relationship, context, emotion, sentiment, topics, timestamp } = data;

  const emotionalSignature: EmotionalSignature = {
    primaryEmotions: emotion ? [{ emotion, frequency: 1 }] : [],
    triggerPatterns: context ? [context] : [],
    recoveryPatterns: [],
  };

  const topicAssociations: TopicAssociation[] = topics
    ? topics.map((topic) => ({
        topic,
        frequency: 1,
        sentiment,
      }))
    : [];

  return {
    id: `rel_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    name,
    relationship,
    aliases: [],
    topicAssociations,
    emotionalSignature,
    mentionCount: 1,
    lastMentioned: timestamp,
    firstMentioned: timestamp,
    averageValence: sentiment,
    valenceVariance: 0,
    insights: [],
    supportLevel: 'neutral',
  };
}

/**
 * Update emotional signature with new emotion.
 */
function updateEmotionalSignature(
  signature: EmotionalSignature,
  emotion: string,
  context?: string
): void {
  // Update primary emotions
  const existing = signature.primaryEmotions.find(
    (e) => e.emotion.toLowerCase() === emotion.toLowerCase()
  );
  if (existing) {
    existing.frequency++;
  } else if (signature.primaryEmotions.length < 10) {
    signature.primaryEmotions.push({ emotion, frequency: 1 });
  }

  // Sort by frequency
  signature.primaryEmotions.sort((a, b) => b.frequency - a.frequency);

  // Track trigger patterns
  if (context) {
    if (!signature.triggerPatterns.includes(context)) {
      signature.triggerPatterns.push(context);
      if (signature.triggerPatterns.length > 10) {
        signature.triggerPatterns.shift();
      }
    }
  }
}

/**
 * Update topic associations.
 */
function updateTopicAssociations(
  associations: TopicAssociation[],
  topics: string[],
  sentiment: number
): void {
  for (const topic of topics) {
    const existing = associations.find((a) => a.topic.toLowerCase() === topic.toLowerCase());
    if (existing) {
      existing.frequency++;
      existing.sentiment = existing.sentiment * 0.8 + sentiment * 0.2; // Moving average
    } else if (associations.length < CONFIG.MAX_TOPIC_ASSOCIATIONS) {
      associations.push({ topic, frequency: 1, sentiment });
    }
  }

  // Sort by frequency
  associations.sort((a, b) => b.frequency - a.frequency);
}

/**
 * Infer support level from node data.
 */
function updateSupportLevel(node: RelationalNode): void {
  const { averageValence, valenceVariance, emotionalSignature } = node;

  // High positive valence with low variance = energizing
  if (averageValence > 0.4 && valenceVariance < 0.3) {
    node.supportLevel = 'energizing';
  }
  // Positive valence = supportive
  else if (averageValence > 0.1) {
    node.supportLevel = 'supportive';
  }
  // Negative valence = draining
  else if (averageValence < -0.2) {
    node.supportLevel = 'draining';
  }
  // Near zero or high variance = neutral
  else {
    node.supportLevel = 'neutral';
  }

  // Override if strong negative emotions dominate
  const negativeEmotions = ['stress', 'anxiety', 'frustration', 'anger', 'sadness'];
  const topEmotion = emotionalSignature.primaryEmotions[0];
  if (topEmotion && negativeEmotions.includes(topEmotion.emotion.toLowerCase())) {
    if (topEmotion.frequency > node.mentionCount * 0.6) {
      node.supportLevel = 'draining';
    }
  }
}

/**
 * Generate insights about this relationship.
 */
function updateInsights(node: RelationalNode): void {
  const insights: string[] = [];

  // Support level insight
  if (node.supportLevel === 'energizing') {
    insights.push(`${node.name} is a source of positive energy`);
  } else if (node.supportLevel === 'draining') {
    insights.push(`Interactions with ${node.name} tend to be emotionally taxing`);
  }

  // Emotional pattern insights
  const topEmotion = node.emotionalSignature.primaryEmotions[0];
  if (topEmotion && topEmotion.frequency >= 3) {
    insights.push(`When you talk about ${node.name}, you often feel ${topEmotion.emotion}`);
  }

  // Topic insights
  const topTopic = node.topicAssociations[0];
  if (topTopic && topTopic.frequency >= 3) {
    insights.push(`${node.name} is often connected to ${topTopic.topic} in your conversations`);
  }

  // Valence insight
  if (node.valenceVariance > 0.4) {
    insights.push(
      `Your feelings about ${node.name} tend to fluctuate - sometimes positive, sometimes difficult`
    );
  }

  node.insights = insights.slice(0, 5);
}

// ============================================================================
// RETRIEVAL FUNCTIONS
// ============================================================================

/**
 * Get all relational nodes for a user.
 */
export async function getRelationalGraph(userId: string): Promise<{
  nodes: RelationalNode[];
  edges: RelationalEdge[];
}> {
  const nodes = nodeCache.get(userId) || (await loadNodes(userId));
  const edges = edgeCache.get(userId) || (await loadEdges(userId));

  return { nodes, edges };
}

/**
 * Get insights about a specific person.
 */
export async function getPersonInsights(
  userId: string,
  personName: string
): Promise<RelationalNode | null> {
  const nodes = nodeCache.get(userId) || (await loadNodes(userId));
  return findNodeByName(nodes, personName) || null;
}

/**
 * Get people associated with a specific emotion or topic.
 */
export async function getPeopleByContext(
  userId: string,
  context: {
    emotion?: string;
    topic?: string;
  }
): Promise<RelationalNode[]> {
  const nodes = nodeCache.get(userId) || (await loadNodes(userId));
  const { emotion, topic } = context;

  return nodes.filter((node) => {
    if (emotion) {
      const hasEmotion = node.emotionalSignature.primaryEmotions.some(
        (e) => e.emotion.toLowerCase() === emotion.toLowerCase()
      );
      if (hasEmotion) return true;
    }

    if (topic) {
      const hasTopic = node.topicAssociations.some((t) =>
        t.topic.toLowerCase().includes(topic.toLowerCase())
      );
      if (hasTopic) return true;
    }

    return false;
  });
}

/**
 * Get the most impactful relationships (positive and negative).
 */
export async function getImpactfulRelationships(
  userId: string
): Promise<{ energizing: RelationalNode[]; draining: RelationalNode[] }> {
  const nodes = nodeCache.get(userId) || (await loadNodes(userId));

  // Only include nodes with enough data
  const significant = nodes.filter((n) => n.mentionCount >= CONFIG.MIN_MENTIONS_FOR_PROFILE);

  const energizing = significant
    .filter((n) => n.supportLevel === 'energizing' || n.supportLevel === 'supportive')
    .sort((a, b) => b.averageValence - a.averageValence)
    .slice(0, 5);

  const draining = significant
    .filter((n) => n.supportLevel === 'draining')
    .sort((a, b) => a.averageValence - b.averageValence)
    .slice(0, 5);

  return { energizing, draining };
}

/**
 * Build context string for LLM injection.
 */
export async function buildRelationalContext(
  userId: string,
  currentContext?: {
    mentionedPerson?: string;
    currentEmotion?: string;
    currentTopic?: string;
  }
): Promise<string> {
  const nodes = nodeCache.get(userId) || (await loadNodes(userId));
  const significantNodes = nodes.filter((n) => n.mentionCount >= CONFIG.MIN_MENTIONS_FOR_PROFILE);

  if (significantNodes.length === 0) {
    return '';
  }

  const sections: string[] = [
    '[RELATIONAL SEMANTICS - Understanding Their World]',
    'You know how different people affect them emotionally.',
    '',
  ];

  // If a specific person is mentioned, highlight their profile
  if (currentContext?.mentionedPerson) {
    const person = findNodeByName(nodes, currentContext.mentionedPerson);
    if (person && person.insights.length > 0) {
      sections.push(`**Currently discussing: ${person.name}** (${person.relationship})`);
      sections.push(`  Support level: ${person.supportLevel}`);
      sections.push(
        `  Average sentiment: ${person.averageValence > 0 ? '😊' : person.averageValence < 0 ? '😟' : '😐'}`
      );
      for (const insight of person.insights.slice(0, 2)) {
        sections.push(`  • ${insight}`);
      }
      sections.push('');
    }
  }

  // Show relationship landscape
  const { energizing, draining } = await getImpactfulRelationships(userId);

  if (energizing.length > 0) {
    sections.push('**Sources of energy:**');
    for (const node of energizing.slice(0, 3)) {
      sections.push(`  • ${node.name} (${node.relationship})`);
    }
    sections.push('');
  }

  if (draining.length > 0) {
    sections.push('**Relationships that can be draining:**');
    for (const node of draining.slice(0, 3)) {
      sections.push(`  • ${node.name} (${node.relationship})`);
    }
    sections.push('');
  }

  sections.push('Use this to understand context when people are mentioned.');

  return sections.join('\n');
}

// ============================================================================
// EDGE MANAGEMENT (RELATIONSHIPS BETWEEN PEOPLE)
// ============================================================================

/**
 * Record a connection between two people.
 */
export async function recordConnection(
  userId: string,
  connection: {
    person1: string;
    person2: string;
    connectionType?: 'family' | 'work' | 'friend' | 'romantic' | 'unknown';
    context?: string;
    sentiment?: number;
  }
): Promise<void> {
  const { person1, person2, connectionType = 'unknown', sentiment = 0 } = connection;

  const edges = edgeCache.get(userId) || (await loadEdges(userId));

  // Find or create edge
  let edge = edges.find(
    (e) =>
      (e.fromPerson === person1 && e.toPerson === person2) ||
      (e.fromPerson === person2 && e.toPerson === person1)
  );

  if (edge) {
    edge.interactionFrequency++;
    edge.jointSentiment = edge.jointSentiment * 0.8 + sentiment * 0.2;
    if (connectionType !== 'unknown') {
      edge.connectionType = connectionType;
    }
  } else {
    edge = {
      fromPerson: person1,
      toPerson: person2,
      connectionType,
      interactionFrequency: 1,
      jointSentiment: sentiment,
    };
    edges.push(edge);
  }

  edgeCache.set(userId, edges);
  await saveEdges(userId, edges);
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function loadNodes(userId: string): Promise<RelationalNode[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('relational_nodes')
      .orderBy('mentionCount', 'desc')
      .limit(CONFIG.MAX_NODES_PER_USER)
      .get();

    const nodes = snapshot.docs.map((doc) => doc.data() as RelationalNode);
    nodeCache.set(userId, nodes);
    return nodes;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load relational nodes');
    return [];
  }
}

async function saveNode(userId: string, node: RelationalNode): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('relational_nodes')
      .doc(node.id)
      .set(cleanForFirestore(node));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save relational node');
  }
}

async function loadEdges(userId: string): Promise<RelationalEdge[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('relational_graph')
      .doc('edges')
      .get();

    if (doc.exists) {
      const data = doc.data() as { edges: RelationalEdge[] };
      edgeCache.set(userId, data.edges || []);
      return data.edges || [];
    }
    return [];
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load relational edges');
    return [];
  }
}

async function saveEdges(userId: string, edges: RelationalEdge[]): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('relational_graph')
      .doc('edges')
      .set(cleanForFirestore({ edges, updatedAt: Date.now() }));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save relational edges');
  }
}

/**
 * Clear relational cache for a user.
 */
export function clearRelationalCache(userId?: string): void {
  if (userId) {
    nodeCache.delete(userId);
    edgeCache.delete(userId);
  } else {
    nodeCache.clear();
    edgeCache.clear();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const relationalSemantics = {
  recordMention: recordPersonMention,
  recordConnection,
  getGraph: getRelationalGraph,
  getPersonInsights,
  getPeopleByContext,
  getImpactfulRelationships,
  buildContext: buildRelationalContext,
  clearCache: clearRelationalCache,
};
