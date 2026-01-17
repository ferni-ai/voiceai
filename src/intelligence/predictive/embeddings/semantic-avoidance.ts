/**
 * Semantic Avoidance Detection - Embedding-Powered
 *
 * Goes beyond exact topic matching to find semantically similar avoided topics.
 *
 * Example: User avoids "relationship:parent_father"
 * Embeddings detect they're ALSO avoiding semantically similar:
 *   - "authority figures"
 *   - "disappointment from men"
 *   - "being judged by dad"
 *
 * This enables detecting avoidance of abstract themes, not just explicit topics.
 *
 * @module intelligence/predictive/embeddings/semantic-avoidance
 */

import { cosineSimilarity, embed } from '../../../memory/embeddings.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'SemanticAvoidance' });

// ============================================================================
// TYPES
// ============================================================================

export interface AvoidanceEmbedding {
  topic: string;
  embedding: number[];
  deflectionPatterns: string[];
  emotionalSignature: string;
  frequency: number;
  lastDeflection: number;
}

export interface SemanticAvoidanceCluster {
  id: string;
  label: string;
  themes: string[];
  topics: string[];
  centroidEmbedding: number[];
  cohesion: number;
  emotionalWeight: number;
}

export interface RelatedAvoidance {
  topic: string;
  similarity: number;
  sharedThemes: string[];
  emotionalSimilarity: number;
}

export interface SemanticApproachStrategy {
  avoidedCluster: SemanticAvoidanceCluster;
  approachTopics: Array<{
    topic: string;
    distance: number;
    safetyScore: number;
  }>;
  semanticBridges: string[];
  recommendedTiming: 'now' | 'after_trust' | 'when_ready';
}

// ============================================================================
// STORAGE
// ============================================================================

const userAvoidanceEmbeddings = new Map<string, AvoidanceEmbedding[]>();
const userAvoidanceClusters = new Map<string, SemanticAvoidanceCluster[]>();
const themeEmbeddingCache = new Map<string, number[]>();

// Pre-defined abstract themes for clustering
const ABSTRACT_THEMES = [
  'authority_figures',
  'abandonment_fear',
  'self_worth',
  'control_loss',
  'vulnerability',
  'rejection',
  'failure',
  'intimacy',
  'trust_betrayal',
  'identity_confusion',
  'grief_loss',
  'shame_guilt',
  'anger_resentment',
  'dependency',
  'perfectionism',
];

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Record an avoided topic with its embedding
 */
export async function recordAvoidanceWithEmbedding(
  userId: string,
  topic: string,
  context: {
    deflectionStyle: string;
    emotionalState?: string;
    triggerContext?: string;
  }
): Promise<void> {
  const embeddings = userAvoidanceEmbeddings.get(userId) || [];

  // Check if we already have this topic
  const existing = embeddings.find((e) => e.topic === topic);

  if (existing) {
    existing.frequency++;
    existing.lastDeflection = Date.now();
    if (!existing.deflectionPatterns.includes(context.deflectionStyle)) {
      existing.deflectionPatterns.push(context.deflectionStyle);
    }
  } else {
    // Generate embedding for the topic + context
    const textToEmbed = buildAvoidanceText(topic, context);
    const embedding = await embed(textToEmbed);

    embeddings.push({
      topic,
      embedding,
      deflectionPatterns: [context.deflectionStyle],
      emotionalSignature: context.emotionalState || 'unknown',
      frequency: 1,
      lastDeflection: Date.now(),
    });

    log.debug({ userId, topic }, '📍 Recorded avoidance embedding');
  }

  userAvoidanceEmbeddings.set(userId, embeddings);

  // Update clusters periodically
  if (embeddings.length % 5 === 0) {
    await updateAvoidanceClusters(userId);
  }
}

/**
 * Find semantically related avoided topics
 */
export async function findRelatedAvoidances(
  userId: string,
  topic: string,
  minSimilarity = 0.6
): Promise<RelatedAvoidance[]> {
  const embeddings = userAvoidanceEmbeddings.get(userId) || [];
  if (embeddings.length === 0) return [];

  const topicEmbedding = await embed(topic);

  const related: RelatedAvoidance[] = [];

  for (const avoidance of embeddings) {
    if (avoidance.topic === topic) continue;

    const similarity = cosineSimilarity(topicEmbedding, avoidance.embedding);

    if (similarity >= minSimilarity) {
      const sharedThemes = await findSharedThemes(topicEmbedding, avoidance.embedding);

      related.push({
        topic: avoidance.topic,
        similarity,
        sharedThemes,
        emotionalSimilarity: await calculateEmotionalSimilarity(
          topic,
          avoidance.emotionalSignature
        ),
      });
    }
  }

  return related.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Check if current topic is semantically close to any avoided topics
 */
export async function isNearAvoidedTerritory(
  userId: string,
  currentTopic: string,
  currentContext: string,
  threshold = 0.65
): Promise<{
  isNear: boolean;
  nearestAvoided?: string;
  distance: number;
  approachAngle?: string;
}> {
  const embeddings = userAvoidanceEmbeddings.get(userId) || [];
  if (embeddings.length === 0) {
    return { isNear: false, distance: 1.0 };
  }

  const contextText = `${currentTopic}: ${currentContext}`;
  const currentEmbedding = await embed(contextText);

  let nearestDistance = 1.0;
  let nearestTopic: string | undefined;

  for (const avoidance of embeddings) {
    const similarity = cosineSimilarity(currentEmbedding, avoidance.embedding);
    const distance = 1 - similarity;

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestTopic = avoidance.topic;
    }
  }

  const isNear = nearestDistance < 1 - threshold;

  return {
    isNear,
    nearestAvoided: isNear ? nearestTopic : undefined,
    distance: nearestDistance,
    approachAngle: isNear ? await suggestApproachAngle(currentTopic, nearestTopic!) : undefined,
  };
}

/**
 * Get semantic approach strategy for avoided cluster
 */
export async function getSemanticApproachStrategy(
  userId: string,
  targetTopic: string
): Promise<SemanticApproachStrategy | null> {
  const clusters = userAvoidanceClusters.get(userId) || [];
  const embeddings = userAvoidanceEmbeddings.get(userId) || [];

  if (clusters.length === 0 && embeddings.length === 0) return null;

  const targetEmbedding = await embed(targetTopic);

  // Find which cluster this topic belongs to
  let nearestCluster: SemanticAvoidanceCluster | null = null;
  let nearestDistance = 1.0;

  for (const cluster of clusters) {
    const similarity = cosineSimilarity(targetEmbedding, cluster.centroidEmbedding);
    const distance = 1 - similarity;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestCluster = cluster;
    }
  }

  // If no cluster, check individual embeddings
  if (!nearestCluster) {
    for (const avoidance of embeddings) {
      const similarity = cosineSimilarity(targetEmbedding, avoidance.embedding);
      if (similarity > 0.6) {
        nearestCluster = {
          id: `single-${avoidance.topic}`,
          label: avoidance.topic,
          themes: [],
          topics: [avoidance.topic],
          centroidEmbedding: avoidance.embedding,
          cohesion: 1,
          emotionalWeight: avoidance.frequency * 0.1,
        };
        break;
      }
    }
  }

  if (!nearestCluster) return null;

  // Find safe approach topics (semantically adjacent but not avoided)
  const approachTopics = await findSafeApproachTopics(
    userId,
    nearestCluster.centroidEmbedding,
    embeddings.map((e) => e.embedding)
  );

  // Find semantic bridges (topics that connect safely to avoided territory)
  const semanticBridges = await findSemanticBridges(targetTopic, nearestCluster.topics);

  // Determine timing based on emotional weight
  const recommendedTiming =
    nearestCluster.emotionalWeight > 0.7
      ? 'when_ready'
      : nearestCluster.emotionalWeight > 0.4
        ? 'after_trust'
        : 'now';

  return {
    avoidedCluster: nearestCluster,
    approachTopics,
    semanticBridges,
    recommendedTiming,
  };
}

/**
 * Detect if conversation is circling an avoided topic semantically
 */
export async function detectSemanticCircling(
  userId: string,
  recentTurnEmbeddings: number[][]
): Promise<{
  circling: boolean;
  aroundTopic?: string;
  averageDistance: number;
  pattern: 'approaching' | 'orbiting' | 'retreating' | 'none';
}> {
  const embeddings = userAvoidanceEmbeddings.get(userId) || [];
  if (embeddings.length === 0 || recentTurnEmbeddings.length < 3) {
    return { circling: false, averageDistance: 1, pattern: 'none' };
  }

  // For each avoided topic, track distance over recent turns
  let minAvgDistance = 1;
  let circlingTopic: string | undefined;
  let pattern: 'approaching' | 'orbiting' | 'retreating' | 'none' = 'none';

  for (const avoidance of embeddings) {
    const distances = recentTurnEmbeddings.map(
      (turnEmb) => 1 - cosineSimilarity(turnEmb, avoidance.embedding)
    );

    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;

    if (avgDistance < minAvgDistance) {
      minAvgDistance = avgDistance;
      circlingTopic = avoidance.topic;

      // Analyze pattern
      const trend = calculateTrend(distances);
      if (trend < -0.05) pattern = 'approaching';
      else if (trend > 0.05) pattern = 'retreating';
      else if (avgDistance < 0.4) pattern = 'orbiting';
      else pattern = 'none';
    }
  }

  const isCircling = minAvgDistance < 0.5 && (pattern === 'orbiting' || pattern === 'approaching');

  return {
    circling: isCircling,
    aroundTopic: isCircling ? circlingTopic : undefined,
    averageDistance: minAvgDistance,
    pattern,
  };
}

// ============================================================================
// CLUSTERING
// ============================================================================

/**
 * Update avoidance clusters using semantic similarity
 */
async function updateAvoidanceClusters(userId: string): Promise<void> {
  const embeddings = userAvoidanceEmbeddings.get(userId) || [];
  if (embeddings.length < 2) return;

  // Simple clustering: group by similarity threshold
  const clusters: SemanticAvoidanceCluster[] = [];
  const assigned = new Set<string>();

  for (const avoidance of embeddings) {
    if (assigned.has(avoidance.topic)) continue;

    const clusterTopics = [avoidance.topic];
    const clusterEmbeddings = [avoidance.embedding];
    assigned.add(avoidance.topic);

    // Find similar topics
    for (const other of embeddings) {
      if (assigned.has(other.topic)) continue;

      const similarity = cosineSimilarity(avoidance.embedding, other.embedding);
      if (similarity > 0.65) {
        clusterTopics.push(other.topic);
        clusterEmbeddings.push(other.embedding);
        assigned.add(other.topic);
      }
    }

    if (clusterTopics.length >= 1) {
      // Calculate centroid
      const centroid = calculateCentroid(clusterEmbeddings);

      // Find matching themes
      const themes = await matchAbstractThemes(centroid);

      // Calculate cohesion
      const cohesion =
        clusterEmbeddings.length === 1 ? 1 : calculateCohesion(clusterEmbeddings, centroid);

      // Calculate emotional weight
      const emotionalWeight =
        clusterTopics.reduce((sum, topic) => {
          const emb = embeddings.find((e) => e.topic === topic);
          return sum + (emb?.frequency || 1) * 0.1;
        }, 0) / clusterTopics.length;

      clusters.push({
        id: `cluster-${clusters.length}`,
        label: themes[0] || clusterTopics[0],
        themes,
        topics: clusterTopics,
        centroidEmbedding: centroid,
        cohesion,
        emotionalWeight: Math.min(1, emotionalWeight),
      });
    }
  }

  userAvoidanceClusters.set(userId, clusters);
  log.debug({ userId, clusterCount: clusters.length }, '🔮 Updated avoidance clusters');
}

// ============================================================================
// HELPERS
// ============================================================================

function buildAvoidanceText(
  topic: string,
  context: {
    deflectionStyle: string;
    emotionalState?: string;
    triggerContext?: string;
  }
): string {
  const parts = [topic];
  if (context.emotionalState) parts.push(`emotional state: ${context.emotionalState}`);
  if (context.triggerContext) parts.push(`context: ${context.triggerContext}`);
  parts.push(`deflection: ${context.deflectionStyle}`);
  return parts.join(' | ');
}

async function findSharedThemes(embedding1: number[], embedding2: number[]): Promise<string[]> {
  const shared: string[] = [];

  for (const theme of ABSTRACT_THEMES) {
    const themeEmb = await getThemeEmbedding(theme);
    const sim1 = cosineSimilarity(embedding1, themeEmb);
    const sim2 = cosineSimilarity(embedding2, themeEmb);

    if (sim1 > 0.5 && sim2 > 0.5) {
      shared.push(theme);
    }
  }

  return shared;
}

async function getThemeEmbedding(theme: string): Promise<number[]> {
  if (!themeEmbeddingCache.has(theme)) {
    const embedding = await embed(theme.replace(/_/g, ' '));
    themeEmbeddingCache.set(theme, embedding);
  }
  return themeEmbeddingCache.get(theme)!;
}

async function calculateEmotionalSimilarity(
  topic: string,
  emotionalState: string
): Promise<number> {
  const topicEmb = await embed(topic);
  const emotionEmb = await embed(emotionalState);
  return cosineSimilarity(topicEmb, emotionEmb);
}

async function suggestApproachAngle(currentTopic: string, avoidedTopic: string): Promise<string> {
  // Find the semantic direction from current to avoided
  // Suggest approaching from a different angle
  const angles = [
    'through shared values',
    'via recent positive experiences',
    'from a strength-based perspective',
    'through curiosity about patterns',
    'from a future-focused lens',
  ];

  // Simple selection based on topics (could be more sophisticated)
  return angles[Math.floor(Math.random() * angles.length)];
}

async function findSafeApproachTopics(
  userId: string,
  targetCentroid: number[],
  avoidedEmbeddings: number[][]
): Promise<Array<{ topic: string; distance: number; safetyScore: number }>> {
  // Generate potential approach topics
  const potentialTopics = [
    'growth and learning',
    'what matters most',
    'how you want to feel',
    'what gives you energy',
    'your strengths',
    'future possibilities',
    'recent wins',
    'support systems',
  ];

  const approaches: Array<{ topic: string; distance: number; safetyScore: number }> = [];

  for (const topic of potentialTopics) {
    const topicEmb = await embed(topic);

    // Distance to target (closer is better)
    const distanceToTarget = 1 - cosineSimilarity(topicEmb, targetCentroid);

    // Distance from all avoided topics (further is safer)
    const minAvoidedDistance = Math.min(
      ...avoidedEmbeddings.map((emb) => 1 - cosineSimilarity(topicEmb, emb))
    );

    // Safety score: want to be close to target but far from direct avoided topics
    const safetyScore = minAvoidedDistance;

    approaches.push({
      topic,
      distance: distanceToTarget,
      safetyScore,
    });
  }

  // Sort by safety, then by distance
  return approaches
    .filter((a) => a.safetyScore > 0.3)
    .sort((a, b) => {
      const safeDiff = b.safetyScore - a.safetyScore;
      if (Math.abs(safeDiff) > 0.1) return safeDiff;
      return a.distance - b.distance;
    })
    .slice(0, 5);
}

async function findSemanticBridges(
  targetTopic: string,
  avoidedTopics: string[]
): Promise<string[]> {
  const bridges = [
    'strengths that help you navigate challenges',
    'past experiences of growth',
    'what you have learned about yourself',
    'support you appreciate',
    'values that guide you',
  ];

  return bridges.slice(0, 3);
}

async function matchAbstractThemes(centroid: number[]): Promise<string[]> {
  const matches: Array<{ theme: string; similarity: number }> = [];

  for (const theme of ABSTRACT_THEMES) {
    const themeEmb = await getThemeEmbedding(theme);
    const similarity = cosineSimilarity(centroid, themeEmb);
    if (similarity > 0.4) {
      matches.push({ theme, similarity });
    }
  }

  return matches
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3)
    .map((m) => m.theme);
}

function calculateCentroid(embeddings: number[][]): number[] {
  const dim = embeddings[0].length;
  const centroid = new Array(dim).fill(0);

  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += emb[i];
    }
  }

  for (let i = 0; i < dim; i++) {
    centroid[i] /= embeddings.length;
  }

  // Normalize
  const magnitude = Math.sqrt(centroid.reduce((sum, v) => sum + v * v, 0));
  return centroid.map((v) => v / magnitude);
}

function calculateCohesion(embeddings: number[][], centroid: number[]): number {
  const similarities = embeddings.map((emb) => cosineSimilarity(emb, centroid));
  return similarities.reduce((a, b) => a + b, 0) / similarities.length;
}

function calculateTrend(values: number[]): number {
  if (values.length < 2) return 0;

  // Simple linear regression slope
  const n = values.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }

  return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build semantic avoidance context for LLM
 */
export function buildSemanticAvoidanceContext(userId: string): string {
  const clusters = userAvoidanceClusters.get(userId) || [];
  const embeddings = userAvoidanceEmbeddings.get(userId) || [];

  if (clusters.length === 0 && embeddings.length === 0) return '';

  const sections: string[] = ['[SEMANTIC AVOIDANCE INTELLIGENCE]'];

  // Clusters
  if (clusters.length > 0) {
    sections.push('\nAvoidance clusters detected:');
    for (const cluster of clusters.slice(0, 3)) {
      sections.push(`• ${cluster.label}: ${cluster.topics.join(', ')}`);
      if (cluster.themes.length > 0) {
        sections.push(`  Underlying themes: ${cluster.themes.join(', ')}`);
      }
    }
  }

  // High-frequency avoidances
  const frequent = embeddings
    .filter((e) => e.frequency >= 3)
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 3);

  if (frequent.length > 0) {
    sections.push('\nFrequently avoided topics:');
    for (const avoidance of frequent) {
      sections.push(
        `• "${avoidance.topic}" (${avoidance.frequency}x, via ${avoidance.deflectionPatterns.join('/')})`
      );
    }
  }

  return sections.join('\n');
}

// ============================================================================
// PERSISTENCE (Hydration & Export)
// ============================================================================

export interface SemanticAvoidancePersistenceData {
  embeddings: AvoidanceEmbedding[];
  clusters: SemanticAvoidanceCluster[];
}

/**
 * Get current state for persistence
 */
export function getStateForPersistence(userId: string): SemanticAvoidancePersistenceData {
  return {
    embeddings: userAvoidanceEmbeddings.get(userId) || [],
    clusters: userAvoidanceClusters.get(userId) || [],
  };
}

/**
 * Hydrate from persisted data
 */
export function hydrateFromPersistence(
  userId: string,
  data: SemanticAvoidancePersistenceData
): void {
  if (data.embeddings && data.embeddings.length > 0) {
    userAvoidanceEmbeddings.set(userId, data.embeddings);
    log.debug({ userId, count: data.embeddings.length }, '💧 Hydrated avoidance embeddings');
  }
  if (data.clusters && data.clusters.length > 0) {
    userAvoidanceClusters.set(userId, data.clusters);
    log.debug({ userId, count: data.clusters.length }, '💧 Hydrated avoidance clusters');
  }
}

/**
 * Clear user data (for cleanup)
 */
export function clearUserData(userId: string): void {
  userAvoidanceEmbeddings.delete(userId);
  userAvoidanceClusters.delete(userId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const semanticAvoidance = {
  recordAvoidanceWithEmbedding,
  findRelatedAvoidances,
  isNearAvoidedTerritory,
  getSemanticApproachStrategy,
  detectSemanticCircling,
  buildSemanticAvoidanceContext,
  // Persistence
  getStateForPersistence,
  hydrateFromPersistence,
  clearUserData,
};

export default semanticAvoidance;
