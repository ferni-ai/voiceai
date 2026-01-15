/**
 * Ripple Effect Embedding Space
 *
 * Maps life domains in embedding space to predict cascade paths and
 * find non-obvious domain connections.
 *
 * Example: Work stress → Sleep quality → Energy → Relationships
 * The embedding space reveals which domains are semantically close
 * and therefore likely to influence each other.
 *
 * @module intelligence/predictive/embeddings/ripple-embedding-space
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { embed, embedBatch, cosineSimilarity } from '../../../memory/embeddings.js';
import type { LifeDomain, EventType } from '../ripple-effect-prediction.js';

const log = createLogger({ module: 'RippleEmbeddingSpace' });

// ============================================================================
// TYPES
// ============================================================================

export interface DomainEmbedding {
  domain: LifeDomain;

  // Semantic position
  coreEmbedding: number[]; // Base domain meaning
  currentStateEmbedding: number[]; // Current user's state in this domain
  healthyStateEmbedding: number[]; // What healthy looks like

  // User's relationship with this domain
  personalMeaning: string; // How user relates to this domain
  recentTopics: string[]; // Recent conversation topics
  emotionalAssociation: number; // -1 to 1
}

export interface InfluenceVector {
  from: LifeDomain;
  to: LifeDomain;

  // Semantic nature of influence
  influenceEmbedding: number[]; // What the influence looks like
  strength: number; // 0-1
  direction: 'positive' | 'negative' | 'amplifying';

  // Evidence
  observationCount: number;
  exampleDescriptions: string[];
}

export interface DomainEmbeddingSpace {
  userId: string;

  // Domain positions
  domains: Map<LifeDomain, DomainEmbedding>;

  // Learned influence vectors
  influenceVectors: InfluenceVector[];

  // Last updated
  lastUpdated: number;
}

export interface RipplePathPrediction {
  event: { domain: LifeDomain; eventType: EventType; magnitude: number };
  predictedPath: Array<{
    domain: LifeDomain;
    order: number;
    expectedImpact: number;
    semanticConnection: string;
  }>;
  totalRisk: number;
  leveragePoints: Array<{
    domain: LifeDomain;
    action: string;
    expectedBenefit: number;
  }>;
}

export interface DomainCluster {
  name: string;
  domains: LifeDomain[];
  centroid: number[];
  cohesion: number;
  vulnerabilityScore: number;
}

// ============================================================================
// STORAGE
// ============================================================================

const userDomainSpaces = new Map<string, DomainEmbeddingSpace>();

// Domain definitions for embedding
const DOMAIN_DESCRIPTIONS: Record<LifeDomain, string> = {
  work: 'career, job, professional life, work stress, colleagues, deadlines',
  relationships: 'romantic partner, dating, marriage, intimacy, connection',
  health: 'physical health, exercise, body, illness, medical',
  physical_health: 'exercise, fitness, body, illness, medical, physical wellbeing',
  finances: 'money, budget, savings, debt, financial security',
  family: 'parents, siblings, children, relatives, family dynamics',
  mental_health: 'anxiety, depression, emotional wellbeing, therapy, mental state',
  sleep: 'rest, insomnia, fatigue, sleep quality, tiredness',
  energy: 'vitality, motivation, enthusiasm, burnout, exhaustion',
  habits: 'routines, habits, daily practices, consistency, behavior patterns',
  self_care: 'hobbies, relaxation, personal time, boundaries, self-compassion',
  social: 'friends, social life, community, belonging, isolation',
  creativity: 'creative expression, art, writing, innovation, imagination',
  spirituality: 'meaning, purpose, faith, existential, transcendence',
  personal_growth: 'self-improvement, learning, development, skills, growth mindset',
  growth: 'personal development, learning, goals, aspirations, becoming',
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Initialize domain embedding space for a user
 */
export async function initializeDomainSpace(userId: string): Promise<DomainEmbeddingSpace> {
  const domains = new Map<LifeDomain, DomainEmbedding>();

  // Generate base embeddings for all domains
  const domainNames = Object.keys(DOMAIN_DESCRIPTIONS) as LifeDomain[];
  const descriptions = domainNames.map((d) => DOMAIN_DESCRIPTIONS[d]);
  const healthyDescriptions = domainNames.map((d) => `healthy ${DOMAIN_DESCRIPTIONS[d]}`);

  const [coreEmbeddings, healthyEmbeddings] = await Promise.all([
    embedBatch(descriptions),
    embedBatch(healthyDescriptions),
  ]);

  for (let i = 0; i < domainNames.length; i++) {
    domains.set(domainNames[i], {
      domain: domainNames[i],
      coreEmbedding: coreEmbeddings[i],
      currentStateEmbedding: coreEmbeddings[i], // Start at baseline
      healthyStateEmbedding: healthyEmbeddings[i],
      personalMeaning: '',
      recentTopics: [],
      emotionalAssociation: 0,
    });
  }

  const space: DomainEmbeddingSpace = {
    userId,
    domains,
    influenceVectors: [],
    lastUpdated: Date.now(),
  };

  userDomainSpaces.set(userId, space);
  log.debug({ userId }, '🌐 Initialized domain embedding space');

  return space;
}

/**
 * Update a domain's current state embedding
 */
export async function updateDomainState(
  userId: string,
  domain: LifeDomain,
  update: {
    recentTopics?: string[];
    personalMeaning?: string;
    emotionalAssociation?: number;
    currentDescription?: string;
  }
): Promise<void> {
  let space = userDomainSpaces.get(userId);
  if (!space) {
    space = await initializeDomainSpace(userId);
  }

  const domainData = space.domains.get(domain);
  if (!domainData) return;

  // Update metadata
  if (update.recentTopics) {
    domainData.recentTopics = [...update.recentTopics, ...domainData.recentTopics].slice(0, 10);
  }
  if (update.personalMeaning) {
    domainData.personalMeaning = update.personalMeaning;
  }
  if (update.emotionalAssociation !== undefined) {
    domainData.emotionalAssociation = update.emotionalAssociation;
  }

  // Update current state embedding
  if (update.currentDescription || update.recentTopics?.length) {
    const stateText = [
      DOMAIN_DESCRIPTIONS[domain],
      update.currentDescription || '',
      domainData.recentTopics.slice(0, 5).join(', '),
      domainData.personalMeaning,
    ]
      .filter(Boolean)
      .join('. ');

    domainData.currentStateEmbedding = await embed(stateText);
  }

  space.lastUpdated = Date.now();
}

/**
 * Record an observed influence between domains
 */
export async function recordDomainInfluence(
  userId: string,
  observation: {
    from: LifeDomain;
    to: LifeDomain;
    description: string;
    direction: 'positive' | 'negative' | 'amplifying';
    strength: number;
  }
): Promise<void> {
  let space = userDomainSpaces.get(userId);
  if (!space) {
    space = await initializeDomainSpace(userId);
  }

  // Find existing influence vector or create new
  let vector = space.influenceVectors.find(
    (v) => v.from === observation.from && v.to === observation.to
  );

  if (vector) {
    // Update existing
    vector.observationCount++;
    vector.exampleDescriptions.push(observation.description);
    vector.exampleDescriptions = vector.exampleDescriptions.slice(-10);

    // Update strength with exponential moving average
    vector.strength = vector.strength * 0.7 + observation.strength * 0.3;

    // Re-embed with new examples
    const influenceText = vector.exampleDescriptions.join('. ');
    vector.influenceEmbedding = await embed(influenceText);
  } else {
    // Create new
    const influenceEmbedding = await embed(observation.description);

    space.influenceVectors.push({
      from: observation.from,
      to: observation.to,
      influenceEmbedding,
      strength: observation.strength,
      direction: observation.direction,
      observationCount: 1,
      exampleDescriptions: [observation.description],
    });
  }

  space.lastUpdated = Date.now();
  log.debug({ userId, from: observation.from, to: observation.to }, '🔗 Recorded domain influence');
}

/**
 * Predict ripple path for an event using embedding similarity
 */
export async function predictRipplePath(
  userId: string,
  event: { domain: LifeDomain; eventType: EventType; magnitude: number; description: string }
): Promise<RipplePathPrediction> {
  let space = userDomainSpaces.get(userId);
  if (!space) {
    space = await initializeDomainSpace(userId);
  }

  const eventEmbedding = await embed(event.description);
  const sourceDomain = space.domains.get(event.domain);

  if (!sourceDomain) {
    return {
      event,
      predictedPath: [],
      totalRisk: 0,
      leveragePoints: [],
    };
  }

  // Find semantically similar domains
  const domainSimilarities: Array<{
    domain: LifeDomain;
    similarity: number;
    hasInfluenceVector: boolean;
  }> = [];

  for (const [domain, data] of space.domains) {
    if (domain === event.domain) continue;

    // Semantic similarity to event
    const eventSimilarity = cosineSimilarity(eventEmbedding, data.currentStateEmbedding);

    // Check for known influence vector
    const influenceVector = space.influenceVectors.find(
      (v) => v.from === event.domain && v.to === domain
    );

    // Combine semantic similarity with known influence
    const combinedScore = influenceVector
      ? eventSimilarity * 0.4 + influenceVector.strength * 0.6
      : eventSimilarity;

    domainSimilarities.push({
      domain,
      similarity: combinedScore,
      hasInfluenceVector: !!influenceVector,
    });
  }

  // Sort by similarity
  domainSimilarities.sort((a, b) => b.similarity - a.similarity);

  // Build predicted path
  const predictedPath: RipplePathPrediction['predictedPath'] = [];
  let order = 1;
  let remainingMagnitude = Math.abs(event.magnitude);

  for (const ds of domainSimilarities) {
    if (ds.similarity < 0.3 || remainingMagnitude < 0.1) break;

    const expectedImpact = remainingMagnitude * ds.similarity;

    predictedPath.push({
      domain: ds.domain,
      order,
      expectedImpact: expectedImpact * Math.sign(event.magnitude),
      semanticConnection: ds.hasInfluenceVector
        ? 'Known influence pattern'
        : `Semantic proximity (${Math.round(ds.similarity * 100)}%)`,
    });

    remainingMagnitude *= 0.7; // Decay
    order++;
  }

  // Calculate total risk
  const totalRisk =
    predictedPath.reduce((sum, p) => sum + Math.abs(p.expectedImpact), 0) / predictedPath.length ||
    0;

  // Find leverage points
  const leveragePoints = findLeveragePoints(space, event.domain, predictedPath);

  return {
    event,
    predictedPath: predictedPath.slice(0, 5),
    totalRisk: Math.min(1, totalRisk),
    leveragePoints,
  };
}

/**
 * Find domain clusters that tend to move together
 */
export function findDomainClusters(userId: string): DomainCluster[] {
  const space = userDomainSpaces.get(userId);
  if (!space) return [];

  const clusters: DomainCluster[] = [];
  const assigned = new Set<LifeDomain>();

  // Simple clustering based on embedding similarity
  for (const [domain, data] of space.domains) {
    if (assigned.has(domain)) continue;

    const clusterDomains: LifeDomain[] = [domain];
    const clusterEmbeddings: number[][] = [data.currentStateEmbedding];
    assigned.add(domain);

    // Find similar domains
    for (const [otherDomain, otherData] of space.domains) {
      if (assigned.has(otherDomain)) continue;

      const similarity = cosineSimilarity(
        data.currentStateEmbedding,
        otherData.currentStateEmbedding
      );

      if (similarity > 0.7) {
        clusterDomains.push(otherDomain);
        clusterEmbeddings.push(otherData.currentStateEmbedding);
        assigned.add(otherDomain);
      }
    }

    if (clusterDomains.length > 1) {
      const centroid = calculateCentroid(clusterEmbeddings);
      const cohesion =
        clusterEmbeddings.reduce((sum, emb) => sum + cosineSimilarity(emb, centroid), 0) /
        clusterEmbeddings.length;

      // Calculate vulnerability (how negative the emotional associations are)
      const vulnerability =
        clusterDomains.reduce((sum, d) => {
          const domainData = space.domains.get(d);
          return sum + (domainData ? (1 - domainData.emotionalAssociation) / 2 : 0.5);
        }, 0) / clusterDomains.length;

      clusters.push({
        name: clusterDomains.slice(0, 2).join('-'),
        domains: clusterDomains,
        centroid,
        cohesion,
        vulnerabilityScore: vulnerability,
      });
    }
  }

  return clusters.sort((a, b) => b.vulnerabilityScore - a.vulnerabilityScore);
}

/**
 * Get semantic distance between two domains for this user
 */
export function getDomainDistance(
  userId: string,
  domainA: LifeDomain,
  domainB: LifeDomain
): number | null {
  const space = userDomainSpaces.get(userId);
  if (!space) return null;

  const dataA = space.domains.get(domainA);
  const dataB = space.domains.get(domainB);

  if (!dataA || !dataB) return null;

  return 1 - cosineSimilarity(dataA.currentStateEmbedding, dataB.currentStateEmbedding);
}

/**
 * Find domains that are semantically close to a topic
 */
export async function findRelatedDomains(
  userId: string,
  topic: string,
  k = 3
): Promise<Array<{ domain: LifeDomain; similarity: number }>> {
  const space = userDomainSpaces.get(userId);
  if (!space) return [];

  const topicEmbedding = await embed(topic);

  const similarities: Array<{ domain: LifeDomain; similarity: number }> = [];

  for (const [domain, data] of space.domains) {
    const similarity = cosineSimilarity(topicEmbedding, data.currentStateEmbedding);
    similarities.push({ domain, similarity });
  }

  return similarities.sort((a, b) => b.similarity - a.similarity).slice(0, k);
}

// ============================================================================
// HELPERS
// ============================================================================

function findLeveragePoints(
  space: DomainEmbeddingSpace,
  sourceDomain: LifeDomain,
  predictedPath: RipplePathPrediction['predictedPath']
): RipplePathPrediction['leveragePoints'] {
  const leveragePoints: RipplePathPrediction['leveragePoints'] = [];

  // Find domains that could break the cascade
  for (const pathItem of predictedPath.slice(0, 3)) {
    const domainData = space.domains.get(pathItem.domain);
    if (!domainData) continue;

    // Distance to healthy state
    const healthDistance =
      1 - cosineSimilarity(domainData.currentStateEmbedding, domainData.healthyStateEmbedding);

    // If far from healthy, it's a leverage point
    if (healthDistance > 0.3) {
      leveragePoints.push({
        domain: pathItem.domain,
        action: `Strengthen ${pathItem.domain} to buffer cascade`,
        expectedBenefit: healthDistance * pathItem.expectedImpact,
      });
    }
  }

  return leveragePoints.sort((a, b) => b.expectedBenefit - a.expectedBenefit).slice(0, 3);
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

  const magnitude = Math.sqrt(centroid.reduce((sum, v) => sum + v * v, 0));
  return centroid.map((v) => v / magnitude);
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build ripple embedding space context for LLM
 */
export async function buildRippleSpaceContext(
  userId: string,
  currentTopic?: string
): Promise<string> {
  const space = userDomainSpaces.get(userId);
  if (!space) return '';

  const sections: string[] = ['[RIPPLE EMBEDDING SPACE]'];

  // Domain clusters
  const clusters = findDomainClusters(userId);
  if (clusters.length > 0) {
    sections.push('\nDomain clusters (tend to move together):');
    for (const cluster of clusters.slice(0, 2)) {
      sections.push(
        `• ${cluster.domains.join(' ↔ ')} (cohesion: ${Math.round(cluster.cohesion * 100)}%)`
      );
    }
  }

  // Related domains to current topic
  if (currentTopic) {
    const related = await findRelatedDomains(userId, currentTopic, 3);
    if (related.length > 0) {
      sections.push('\nLife domains related to current topic:');
      for (const r of related) {
        sections.push(`• ${r.domain} (${Math.round(r.similarity * 100)}% related)`);
      }
    }
  }

  // Known influence patterns
  const strongInfluences = space.influenceVectors.filter((v) => v.strength > 0.5).slice(0, 3);

  if (strongInfluences.length > 0) {
    sections.push('\nKnown influence patterns:');
    for (const inf of strongInfluences) {
      sections.push(`• ${inf.from} → ${inf.to} (${inf.direction})`);
    }
  }

  return sections.join('\n');
}

// ============================================================================
// PERSISTENCE (Hydration & Export)
// ============================================================================

export interface RippleSpacePersistenceData {
  domains: Array<{
    domain: LifeDomain;
    coreEmbedding: number[];
    currentStateEmbedding: number[];
    healthyStateEmbedding: number[];
    personalMeaning: string;
    recentTopics: string[];
    emotionalAssociation: number;
  }>;
  influenceVectors: InfluenceVector[];
  lastUpdated: number;
}

/**
 * Get current state for persistence
 */
export function getStateForPersistence(userId: string): RippleSpacePersistenceData | null {
  const space = userDomainSpaces.get(userId);
  if (!space) return null;

  const domainsArray: RippleSpacePersistenceData['domains'] = [];
  for (const [domain, data] of space.domains) {
    domainsArray.push({
      domain,
      coreEmbedding: data.coreEmbedding,
      currentStateEmbedding: data.currentStateEmbedding,
      healthyStateEmbedding: data.healthyStateEmbedding,
      personalMeaning: data.personalMeaning,
      recentTopics: data.recentTopics,
      emotionalAssociation: data.emotionalAssociation,
    });
  }

  return {
    domains: domainsArray,
    influenceVectors: space.influenceVectors,
    lastUpdated: space.lastUpdated,
  };
}

/**
 * Hydrate from persisted data
 */
export function hydrateFromPersistence(userId: string, data: RippleSpacePersistenceData): void {
  if (!data.domains || data.domains.length === 0) return;

  const domains = new Map<LifeDomain, DomainEmbedding>();
  for (const d of data.domains) {
    domains.set(d.domain, {
      domain: d.domain,
      coreEmbedding: d.coreEmbedding,
      currentStateEmbedding: d.currentStateEmbedding,
      healthyStateEmbedding: d.healthyStateEmbedding,
      personalMeaning: d.personalMeaning,
      recentTopics: d.recentTopics,
      emotionalAssociation: d.emotionalAssociation,
    });
  }

  userDomainSpaces.set(userId, {
    userId,
    domains,
    influenceVectors: data.influenceVectors || [],
    lastUpdated: data.lastUpdated || Date.now(),
  });

  log.debug({ userId, domainCount: domains.size }, '💧 Hydrated ripple embedding space');
}

/**
 * Clear user data (for cleanup)
 */
export function clearUserData(userId: string): void {
  userDomainSpaces.delete(userId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const rippleEmbeddingSpace = {
  initializeDomainSpace,
  updateDomainState,
  recordDomainInfluence,
  predictRipplePath,
  findDomainClusters,
  getDomainDistance,
  findRelatedDomains,
  buildRippleSpaceContext,
  // Persistence
  getStateForPersistence,
  hydrateFromPersistence,
  clearUserData,
};

export default rippleEmbeddingSpace;
