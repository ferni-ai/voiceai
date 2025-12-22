/**
 * Advanced Memory Retrieval System
 *
 * "Better than human" memory that uses semantic understanding, temporal decay,
 * emotional salience, and relationship context to retrieve the most relevant
 * memories at the right time.
 *
 * Philosophy: A great friend remembers what matters - not everything, but the
 * things that shaped you, the commitments made, and the context needed to
 * continue where you left off.
 *
 * Features:
 * - Semantic similarity (meaning, not just keywords)
 * - Temporal decay (recent = more relevant, unless emotionally significant)
 * - Emotional salience (heavy moments persist longer)
 * - Relationship-aware (what this persona should remember)
 * - Contextual priming (conversation context influences recall)
 *
 * @module AdvancedRetrieval
 */

import { getLogger } from '../utils/safe-logger.js';
import { embed, cosineSimilarity } from './embeddings.js';
import type { UserProfile, ConversationSummary, KeyMoment } from '../types/user-profile.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * A memory item that can be retrieved
 */
export interface MemoryItem {
  id: string;
  type: 'summary' | 'moment' | 'topic' | 'commitment' | 'preference' | 'person' | 'event';
  content: string;
  timestamp: Date;

  // Scoring factors
  emotionalWeight: number; // 0-1, how emotionally significant
  relevanceDecay: number; // 0-1, how much time has decayed relevance
  baseImportance: number; // 0-1, inherent importance

  // Context
  topics?: string[];
  relatedPersonas?: string[];
  personMentioned?: string; // Family member, friend mentioned
  commitment?: boolean; // Was this a commitment/promise?

  // Embedding for semantic search (lazy loaded)
  embedding?: number[];

  // Source reference
  source: {
    collection: string;
    documentId: string;
  };
}

/**
 * Retrieved memory with relevance score
 */
export interface RetrievedMemory {
  item: MemoryItem;
  score: number;
  scoreBreakdown: {
    semantic: number;
    temporal: number;
    emotional: number;
    contextual: number;
  };
  reason: string; // Natural language explanation
}

/**
 * Query context for retrieval
 */
export interface RetrievalContext {
  query: string;
  currentTopic?: string;
  currentEmotion?: string;
  personaId?: string;
  conversationTurn?: number;
  recentTopics?: string[];
  userMood?: string;
}

/**
 * Configuration for retrieval scoring
 */
export interface RetrievalConfig {
  // Weight factors (should sum to ~1.0)
  semanticWeight: number;
  temporalWeight: number;
  emotionalWeight: number;
  contextualWeight: number;

  // Decay parameters
  temporalDecayHalfLifeDays: number;
  emotionalDecayResistance: number; // Higher = emotional memories decay slower

  // Limits
  maxResults: number;
  minScore: number;

  // Boost factors
  commitmentBoost: number;
  personMentionBoost: number;
  recentTopicBoost: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: RetrievalConfig = {
  // Weights
  semanticWeight: 0.4,
  temporalWeight: 0.2,
  emotionalWeight: 0.25,
  contextualWeight: 0.15,

  // Decay
  temporalDecayHalfLifeDays: 30, // Memories half-forgotten after 30 days
  emotionalDecayResistance: 3.0, // Emotional memories decay 3x slower

  // Limits
  maxResults: 10,
  minScore: 0.3,

  // Boosts
  commitmentBoost: 1.5,
  personMentionBoost: 1.3,
  recentTopicBoost: 1.2,
};

// ============================================================================
// MEMORY INDEX (in-memory for fast retrieval)
// ============================================================================

const memoryIndex = new Map<string, MemoryItem[]>(); // userId -> memories

// ============================================================================
// MEMORY ITEM BUILDERS (helpers for buildMemoryIndex)
// ============================================================================

function buildFollowUpMemories(
  userId: string,
  followUps: NonNullable<UserProfile['pendingFollowUps']>
): MemoryItem[] {
  return followUps.map((followUp) => ({
    id: `followup_${followUp.topic}_${followUp.targetDate.getTime()}`,
    type: 'commitment' as const,
    content: `Follow up about: ${followUp.topic}. Reason: ${followUp.reason}`,
    timestamp: followUp.targetDate,
    emotionalWeight: 0.6,
    relevanceDecay: 0,
    baseImportance: 0.8,
    topics: [followUp.topic],
    commitment: true,
    source: { collection: 'profile', documentId: `${userId}/followups` },
  }));
}

function buildFamilyMemories(userId: string, profile: UserProfile): MemoryItem[] {
  const familyMembers = profile.familyMembers ?? [];
  return familyMembers.map((member) => ({
    id: `family_${member.relationship}_${member.name ?? 'unnamed'}`,
    type: 'person' as const,
    content: `${profile.name ?? 'User'}'s ${member.relationship}${member.name ? ` named ${member.name}` : ''}${member.mentionedTopics && member.mentionedTopics.length > 0 ? `. Mentioned in: ${member.mentionedTopics.join(', ')}` : ''}`,
    timestamp: member.lastMentioned ?? profile.firstContact,
    emotionalWeight: 0.7,
    relevanceDecay: 0,
    baseImportance: 0.8,
    personMentioned: member.name ?? member.relationship,
    source: { collection: 'profile', documentId: `${userId}/family` },
  }));
}

function buildTopicMemories(userId: string, profile: UserProfile): MemoryItem[] {
  const topics = profile.preferredTopics ?? [];
  return topics.map((topic) => ({
    id: `topic_${topic}`,
    type: 'topic' as const,
    content: `${profile.name ?? 'User'} frequently discusses: ${topic}`,
    timestamp: profile.lastContact,
    emotionalWeight: 0.3,
    relevanceDecay: 0,
    baseImportance: 0.5,
    topics: [topic],
    source: { collection: 'profile', documentId: `${userId}/topics` },
  }));
}

function buildThreadMemories(
  userId: string,
  threads: NonNullable<UserProfile['openThreads']>
): MemoryItem[] {
  return threads.map((thread) => ({
    id: thread.id,
    type: 'commitment' as const,
    content: `Open topic to revisit: ${thread.topic}. ${thread.reason}. Resume with: "${thread.suggestedResumption}"`,
    timestamp: thread.createdAt,
    emotionalWeight: 0.5,
    relevanceDecay: 0,
    baseImportance: thread.priority === 'high' ? 0.9 : 0.7,
    topics: [thread.topic],
    commitment: true,
    source: { collection: 'profile', documentId: `${userId}/threads` },
  }));
}

function getEmotionalWeight(significance: string | undefined): number {
  switch (significance) {
    case 'life_changing':
      return 1.0;
    case 'major':
      return 0.8;
    case 'meaningful':
      return 0.6;
    default:
      return 0.3;
  }
}

function buildLifeEventMemories(
  userId: string,
  events: NonNullable<UserProfile['lifeEvents']>
): MemoryItem[] {
  return events.map((event) => ({
    id: event.id,
    type: 'event' as const,
    content: `Life event: ${event.title}${event.description ? `. ${event.description}` : ''}. Status: ${event.status}`,
    timestamp: event.date ?? event.createdAt,
    emotionalWeight: getEmotionalWeight(event.emotionalSignificance),
    relevanceDecay: 0,
    baseImportance: 0.85,
    source: { collection: 'profile', documentId: `${userId}/events` },
  }));
}

// ============================================================================
// CORE RETRIEVAL FUNCTIONS
// ============================================================================

/**
 * Build memory index from user profile
 * Call this when profile is loaded or updated
 */
export function buildMemoryIndex(userId: string, profile: UserProfile): number {
  const memories: MemoryItem[] = [];

  // Index conversation summaries
  const summaries = profile.conversationSummaries ?? [];
  for (const summary of summaries) {
    memories.push(summaryToMemoryItem(summary));
  }

  // Index key moments
  const moments = profile.keyMoments ?? [];
  for (const moment of moments) {
    memories.push(momentToMemoryItem(moment));
  }

  // Index pending follow-ups as commitments
  if (profile.pendingFollowUps && profile.pendingFollowUps.length > 0) {
    memories.push(...buildFollowUpMemories(userId, profile.pendingFollowUps));
  }

  // Index family members
  memories.push(...buildFamilyMemories(userId, profile));

  // Index preferred topics
  memories.push(...buildTopicMemories(userId, profile));

  // Index open threads (cross-session continuity)
  if (profile.openThreads) {
    memories.push(...buildThreadMemories(userId, profile.openThreads));
  }

  // Index life events
  if (profile.lifeEvents) {
    memories.push(...buildLifeEventMemories(userId, profile.lifeEvents));
  }

  // Store in index
  memoryIndex.set(userId, memories);

  log.debug({ userId, count: memories.length }, 'Built memory index');
  return memories.length;
}

/**
 * Retrieve relevant memories for a query
 */
export async function retrieveMemories(
  userId: string,
  context: RetrievalContext,
  config: Partial<RetrievalConfig> = {}
): Promise<RetrievedMemory[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const memories = memoryIndex.get(userId);

  if (!memories || memories.length === 0) {
    log.debug({ userId }, 'No memories indexed');
    return [];
  }

  // Generate query embedding
  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = await embed(context.query);
  } catch (error) {
    log.warn({ error }, 'Failed to generate query embedding, falling back to keyword matching');
  }

  // Score each memory
  const scored: RetrievedMemory[] = [];
  const now = Date.now();

  for (const memory of memories) {
    const breakdown = {
      semantic: 0,
      temporal: 0,
      emotional: 0,
      contextual: 0,
    };

    // 1. Semantic similarity (most important)
    if (queryEmbedding && memory.embedding) {
      breakdown.semantic = cosineSimilarity(queryEmbedding, memory.embedding);
    } else {
      // Keyword fallback
      breakdown.semantic = keywordSimilarity(context.query, memory.content);
    }

    // 2. Temporal relevance (exponential decay)
    const daysSince = (now - memory.timestamp.getTime()) / (1000 * 60 * 60 * 24);
    const halfLife =
      cfg.temporalDecayHalfLifeDays * (1 + memory.emotionalWeight * cfg.emotionalDecayResistance);
    breakdown.temporal = Math.pow(0.5, daysSince / halfLife);

    // 3. Emotional salience
    breakdown.emotional = memory.emotionalWeight * memory.baseImportance;

    // 4. Contextual relevance (topic overlap, persona match)
    let contextScore = 0;

    // Topic overlap with recent conversation
    const { recentTopics } = context;
    const memoryTopics = memory.topics;
    if (recentTopics && recentTopics.length > 0 && memoryTopics && memoryTopics.length > 0) {
      const overlap = memoryTopics.filter((t) =>
        recentTopics.some(
          (rt) =>
            rt.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(rt.toLowerCase())
        )
      ).length;
      contextScore += overlap * 0.3;
    }

    // Current topic match
    const { currentTopic } = context;
    if (currentTopic && memoryTopics && memoryTopics.length > 0) {
      if (
        memoryTopics.some(
          (t) =>
            t.toLowerCase().includes(currentTopic.toLowerCase()) ||
            currentTopic.toLowerCase().includes(t.toLowerCase())
        )
      ) {
        contextScore += 0.4;
      }
    }

    // Persona relevance
    if (context.personaId && memory.relatedPersonas?.includes(context.personaId)) {
      contextScore += 0.3;
    }

    breakdown.contextual = Math.min(1, contextScore);

    // Calculate weighted score
    let score =
      breakdown.semantic * cfg.semanticWeight +
      breakdown.temporal * cfg.temporalWeight +
      breakdown.emotional * cfg.emotionalWeight +
      breakdown.contextual * cfg.contextualWeight;

    // Apply boosts
    if (memory.commitment) {
      score *= cfg.commitmentBoost;
    }

    if (memory.personMentioned) {
      score *= cfg.personMentionBoost;
    }

    // Generate reason
    const reason = generateRetrievalReason(memory, breakdown, context);

    scored.push({
      item: memory,
      score,
      scoreBreakdown: breakdown,
      reason,
    });
  }

  // Sort by score, filter by minimum, limit results
  return scored
    .filter((m) => m.score >= cfg.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.maxResults);
}

/**
 * Get memories specifically for conversation priming
 * Returns memories the persona should "naturally" reference
 */
export function getConversationPrimingMemories(
  userId: string,
  _personaId: string,
  options: {
    maxMemories?: number;
    includeCommitments?: boolean;
    includeRecentTopics?: boolean;
    sessionCount?: number;
  } = {}
): MemoryItem[] {
  const memories = memoryIndex.get(userId);
  if (!memories) return [];

  const {
    maxMemories = 5,
    includeCommitments = true,
    includeRecentTopics = true,
    sessionCount = 0,
  } = options;

  const result: MemoryItem[] = [];

  // 1. Always include unfulfilled commitments
  if (includeCommitments) {
    const commitments = memories.filter((m) => m.commitment && m.type === 'commitment');
    result.push(...commitments.slice(0, 2));
  }

  // 2. Include emotionally significant recent memories
  const emotionalMemories = memories
    .filter((m) => m.emotionalWeight > 0.6)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 2);
  result.push(...emotionalMemories);

  // 3. For returning users, include a random "connection point"
  if (sessionCount > 2 && includeRecentTopics) {
    const topics = memories.filter((m) => m.type === 'topic' || m.type === 'person');
    if (topics.length > 0) {
      const randomTopic = topics[Math.floor(Math.random() * topics.length)];
      result.push(randomTopic);
    }
  }

  // Dedupe and limit
  const seen = new Set<string>();
  return result
    .filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    })
    .slice(0, maxMemories);
}

/**
 * Get memories related to a specific person
 */
export function getPersonRelatedMemories(userId: string, personName: string): RetrievedMemory[] {
  const memories = memoryIndex.get(userId);
  if (!memories) return [];

  const personLower = personName.toLowerCase();

  return memories
    .filter(
      (m) =>
        m.personMentioned?.toLowerCase() === personLower ||
        m.content.toLowerCase().includes(personLower)
    )
    .map((m) => ({
      item: m,
      score: m.personMentioned?.toLowerCase() === personLower ? 1.0 : 0.7,
      scoreBreakdown: { semantic: 0.8, temporal: 0.5, emotional: 0.5, contextual: 0.8 },
      reason: `Related to ${personName}`,
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Search memories by topic/theme
 */
export async function searchMemoriesByTopic(
  userId: string,
  topic: string
): Promise<RetrievedMemory[]> {
  return retrieveMemories(userId, {
    query: topic,
    currentTopic: topic,
  });
}

// ============================================================================
// MEMORY MAINTENANCE
// ============================================================================

/**
 * Pre-compute embeddings for all memories
 * Call this periodically or on profile save
 */
export async function computeMemoryEmbeddings(userId: string): Promise<number> {
  const memories = memoryIndex.get(userId);
  if (!memories) return 0;

  let computed = 0;
  for (const memory of memories) {
    if (!memory.embedding) {
      try {
        memory.embedding = await embed(memory.content);
        computed++;
      } catch (error) {
        log.debug({ error, memoryId: memory.id }, 'Failed to embed memory');
      }
    }
  }

  return computed;
}

/**
 * Clear memory index for a user
 */
export function clearMemoryIndex(userId: string): void {
  memoryIndex.delete(userId);
}

/**
 * Get memory index stats
 */
export function getIndexStats(): {
  userCount: number;
  totalMemories: number;
  memoriesWithEmbeddings: number;
} {
  let totalMemories = 0;
  let memoriesWithEmbeddings = 0;

  for (const memories of memoryIndex.values()) {
    totalMemories += memories.length;
    memoriesWithEmbeddings += memories.filter((m) => m.embedding).length;
  }

  return {
    userCount: memoryIndex.size,
    totalMemories,
    memoriesWithEmbeddings,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert conversation summary to memory item
 */
function summaryToMemoryItem(summary: ConversationSummary): MemoryItem {
  const content = [
    `Conversation on ${summary.timestamp.toLocaleDateString()}:`,
    summary.mainTopics.length > 0 ? `Topics: ${summary.mainTopics.join(', ')}` : '',
    summary.keyPoints.length > 0 ? `Key points: ${summary.keyPoints.join('. ')}` : '',
    summary.emotionalArc ? `Emotional arc: ${summary.emotionalArc}` : '',
    summary.decisionsReached && summary.decisionsReached.length > 0
      ? `Decisions: ${summary.decisionsReached.join(', ')}`
      : '',
    summary.followUpItems && summary.followUpItems.length > 0
      ? `Follow-up: ${summary.followUpItems.join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Emotional weight based on arc
  function getEmotionalWeightFromArc(arc: string | undefined): number {
    if (!arc) return 0.4;
    if (arc.includes('heavy')) return 0.8;
    if (arc.includes('vulnerable')) return 0.7;
    if (arc.includes('emotional')) return 0.6;
    return 0.4;
  }

  const emotionalWeight = getEmotionalWeightFromArc(summary.emotionalArc);
  const hasFollowUpItems = summary.followUpItems && summary.followUpItems.length > 0;

  return {
    id: summary.id,
    type: 'summary',
    content,
    timestamp: summary.timestamp,
    emotionalWeight,
    relevanceDecay: 0,
    baseImportance: 0.6,
    topics: summary.mainTopics,
    commitment: hasFollowUpItems,
    embedding: summary.embedding,
    source: { collection: 'summaries', documentId: summary.id },
  };
}

/**
 * Convert key moment to memory item
 */
function momentToMemoryItem(moment: KeyMoment): MemoryItem {
  const emotionalWeightMap: Record<KeyMoment['emotionalWeight'], number> = {
    light: 0.3,
    medium: 0.6,
    heavy: 0.9,
  };

  const importanceMap: Record<KeyMoment['type'], number> = {
    shared_vulnerability: 0.95,
    breakthrough: 0.9,
    milestone: 0.85,
    celebration: 0.7,
    concern: 0.8,
    decision: 0.75,
  };

  const momentType = moment.type;
  const baseImportance = momentType in importanceMap ? importanceMap[momentType] : 0.7;

  return {
    id: moment.id,
    type: 'moment',
    content: `${moment.type}: ${moment.summary}`,
    timestamp: moment.timestamp,
    emotionalWeight: emotionalWeightMap[moment.emotionalWeight],
    relevanceDecay: 0,
    baseImportance,
    topics: moment.topics,
    commitment: moment.followUpNeeded,
    source: { collection: 'moments', documentId: moment.id },
  };
}

/**
 * Simple keyword similarity (fallback when embeddings unavailable)
 */
function keywordSimilarity(query: string, content: string): number {
  const queryWords = query.toLowerCase().split(/\s+/);
  const contentLower = content.toLowerCase();

  let matches = 0;
  for (const word of queryWords) {
    if (word.length > 3 && contentLower.includes(word)) {
      matches++;
    }
  }

  return Math.min(1, matches / Math.max(1, queryWords.length));
}

/**
 * Generate human-readable reason for retrieval
 */
function generateRetrievalReason(
  memory: MemoryItem,
  breakdown: RetrievedMemory['scoreBreakdown'],
  _context: RetrievalContext
): string {
  const reasons: string[] = [];

  if (breakdown.semantic > 0.6) {
    reasons.push('closely related to your question');
  }

  if (breakdown.temporal > 0.7) {
    reasons.push('recent');
  }

  if (breakdown.emotional > 0.6) {
    reasons.push('emotionally significant');
  }

  if (breakdown.contextual > 0.5) {
    reasons.push('relevant to current conversation');
  }

  if (memory.commitment) {
    reasons.push('involves a commitment');
  }

  if (memory.personMentioned) {
    reasons.push(`mentions ${memory.personMentioned}`);
  }

  if (reasons.length === 0) {
    return 'potentially relevant';
  }

  return reasons.join(', ');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  buildMemoryIndex,
  retrieveMemories,
  getConversationPrimingMemories,
  getPersonRelatedMemories,
  searchMemoriesByTopic,
  computeMemoryEmbeddings,
  clearMemoryIndex,
  getIndexStats,
};
