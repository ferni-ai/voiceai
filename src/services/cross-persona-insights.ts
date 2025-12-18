/**
 * Cross-Persona Insight Sharing
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * When Maya notices you're stressed about work, Ferni should know.
 * When Peter discovers you're interested in investing, Alex should factor that in.
 * This is how real teams work - they share context.
 *
 * This service enables seamless insight sharing between personas while
 * respecting boundaries and attribution.
 *
 * Philosophy:
 * - Insights are shared, not siloed
 * - Each persona still has their own perspective
 * - Users benefit from collective intelligence
 * - Attribution matters - "Maya mentioned you've been stressed"
 */

import { createLogger } from '../utils/safe-logger.js';
import { removeUndefined } from '../utils/firestore-utils.js';
import { getGlobalServices } from './global-services.js';

// Get Firestore client from global services
async function getFirestore(): Promise<FirebaseFirestore.Firestore | null> {
  try {
    const services = await getGlobalServices();
    return (services as unknown as { firestore?: FirebaseFirestore.Firestore }).firestore ?? null;
  } catch {
    return null;
  }
}

const log = createLogger({ module: 'CrossPersonaInsights' });

// ============================================================================
// TYPES
// ============================================================================

export type PersonaId = 'ferni' | 'maya' | 'peter' | 'alex' | 'jordan' | 'nayan' | 'jack';

export type InsightCategory =
  | 'emotional_state' // User's emotional state
  | 'life_event' // Significant life event
  | 'preference' // User preference discovered
  | 'concern' // Something worrying the user
  | 'goal' // User's goal or aspiration
  | 'struggle' // Area where user is struggling
  | 'win' // Achievement or success
  | 'boundary' // Topic to avoid
  | 'relationship' // Relationship insight
  | 'health' // Health-related
  | 'work' // Work/career related
  | 'financial' // Financial situation
  | 'habit'; // Habit or routine

export type InsightPriority = 'critical' | 'high' | 'normal' | 'low';

export interface SharedInsight {
  id: string;
  userId: string;

  /** Which persona discovered this */
  sourcePersona: PersonaId;

  /** When it was discovered */
  discoveredAt: Date;

  /** Category of insight */
  category: InsightCategory;

  /** Priority for sharing */
  priority: InsightPriority;

  /** The actual insight content */
  content: string;

  /** Brief summary for context injection */
  summary: string;

  /** How confident we are (0-1) */
  confidence: number;

  /** Evidence that led to this insight */
  evidence?: string;

  /** How long this insight is relevant */
  expiresAt?: Date;

  /** Which personas have acknowledged this */
  acknowledgedBy: PersonaId[];

  /** Which personas this is particularly relevant for */
  relevantFor?: PersonaId[];

  /** Should this be surfaced in next conversation? */
  surfaceInNextConversation: boolean;

  /** Has this been surfaced to the user? */
  surfaced: boolean;

  /** User's reaction when surfaced */
  userReaction?: 'positive' | 'neutral' | 'negative' | 'dismissed';
}

export interface InsightForPersona {
  insight: SharedInsight;
  relevanceScore: number;
  suggestedApproach: string;
}

// ============================================================================
// PERSONA RELEVANCE MAPPING
// ============================================================================

/**
 * Which categories are most relevant to which personas
 */
const PERSONA_CATEGORY_RELEVANCE: Record<PersonaId, InsightCategory[]> = {
  ferni: ['emotional_state', 'life_event', 'goal', 'struggle', 'win', 'boundary', 'relationship'],
  maya: ['habit', 'health', 'goal', 'struggle', 'win', 'emotional_state'],
  peter: ['preference', 'goal', 'work', 'financial', 'life_event'],
  alex: ['work', 'relationship', 'concern', 'goal', 'preference'],
  jordan: ['life_event', 'goal', 'win', 'relationship', 'preference'],
  nayan: ['emotional_state', 'relationship', 'life_event', 'goal', 'struggle', 'boundary'],
  jack: ['goal', 'financial', 'life_event', 'preference', 'work'],
};

/**
 * How each persona might reference insights from others
 */
const PERSONA_REFERENCE_STYLES: Record<PersonaId, string> = {
  ferni: 'I noticed from a previous conversation that',
  maya: "From what you've shared before,",
  peter: 'Based on what I understand,',
  alex: 'I recall you mentioning',
  jordan: 'I remember you saying',
  nayan: 'I sense that',
  jack: 'From what I gather,',
};

// ============================================================================
// IN-MEMORY STORAGE (with Firestore persistence)
// ============================================================================

const insightStore = new Map<string, SharedInsight[]>();
const lastSyncTime = new Map<string, Date>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Record a new insight discovered by a persona
 */
export async function recordInsight(
  userId: string,
  sourcePersona: PersonaId,
  insight: {
    category: InsightCategory;
    content: string;
    summary: string;
    confidence: number;
    priority?: InsightPriority;
    evidence?: string;
    expiresInDays?: number;
    relevantFor?: PersonaId[];
    surfaceInNextConversation?: boolean;
  }
): Promise<SharedInsight> {
  const id = `insight_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const newInsight: SharedInsight = {
    id,
    userId,
    sourcePersona,
    discoveredAt: new Date(),
    category: insight.category,
    priority: insight.priority || determinePriority(insight.category, insight.confidence),
    content: insight.content,
    summary: insight.summary,
    confidence: insight.confidence,
    evidence: insight.evidence,
    expiresAt: insight.expiresInDays
      ? new Date(Date.now() + insight.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined,
    acknowledgedBy: [sourcePersona], // Source persona already knows
    relevantFor: insight.relevantFor,
    surfaceInNextConversation:
      insight.surfaceInNextConversation ??
      (insight.priority === 'high' || insight.priority === 'critical'),
    surfaced: false,
  };

  // Store in memory
  const userInsights = insightStore.get(userId) || [];
  userInsights.push(newInsight);
  insightStore.set(userId, userInsights);

  // Persist to Firestore
  await persistInsight(userId, newInsight);

  log.info(
    {
      userId,
      sourcePersona,
      category: insight.category,
      priority: newInsight.priority,
      summary: insight.summary.slice(0, 50),
    },
    '💡 New cross-persona insight recorded'
  );

  return newInsight;
}

/**
 * Get insights relevant to a specific persona
 */
export function getInsightsForPersona(
  userId: string,
  personaId: PersonaId,
  options: {
    includeAcknowledged?: boolean;
    maxAge?: number; // days
    minConfidence?: number;
    categories?: InsightCategory[];
  } = {}
): InsightForPersona[] {
  const { includeAcknowledged = false, maxAge = 30, minConfidence = 0.4, categories } = options;

  const userInsights = insightStore.get(userId) || [];
  const now = Date.now();
  const maxAgeMs = maxAge * 24 * 60 * 60 * 1000;

  // Filter insights
  const relevantInsights = userInsights.filter((insight) => {
    // Skip if already acknowledged (unless requested)
    if (!includeAcknowledged && insight.acknowledgedBy.includes(personaId)) {
      return false;
    }

    // Skip if expired
    if (insight.expiresAt && insight.expiresAt.getTime() < now) {
      return false;
    }

    // Skip if too old
    if (now - insight.discoveredAt.getTime() > maxAgeMs) {
      return false;
    }

    // Skip if below confidence threshold
    if (insight.confidence < minConfidence) {
      return false;
    }

    // Filter by category if specified
    if (categories && !categories.includes(insight.category)) {
      return false;
    }

    return true;
  });

  // Score and format for the persona
  return relevantInsights
    .map((insight) => ({
      insight,
      relevanceScore: calculateRelevance(insight, personaId),
      suggestedApproach: generateApproach(insight, personaId),
    }))
    .filter((r) => r.relevanceScore > 0.3)
    .sort((a, b) => {
      // Sort by priority first, then relevance
      const priorityOrder = { critical: 4, high: 3, normal: 2, low: 1 };
      const aPriority = priorityOrder[a.insight.priority];
      const bPriority = priorityOrder[b.insight.priority];
      if (aPriority !== bPriority) return bPriority - aPriority;
      return b.relevanceScore - a.relevanceScore;
    });
}

/**
 * Get insights that should be surfaced in the next conversation
 */
export function getInsightsToSurface(
  userId: string,
  personaId: PersonaId,
  limit = 3
): InsightForPersona[] {
  const insights = getInsightsForPersona(userId, personaId, {
    includeAcknowledged: false,
    minConfidence: 0.5,
  });

  return insights
    .filter((i) => i.insight.surfaceInNextConversation && !i.insight.surfaced)
    .slice(0, limit);
}

/**
 * Build context string for LLM prompt injection
 */
export function buildInsightContext(
  userId: string,
  personaId: PersonaId,
  options: {
    maxInsights?: number;
    includeEvidence?: boolean;
  } = {}
): string | null {
  const { maxInsights = 3, includeEvidence = false } = options;

  const insights = getInsightsForPersona(userId, personaId, {
    includeAcknowledged: false,
    minConfidence: 0.5,
  });

  if (insights.length === 0) {
    return null;
  }

  const topInsights = insights.slice(0, maxInsights);
  const referenceStyle = PERSONA_REFERENCE_STYLES[personaId];

  const contextParts = topInsights.map(({ insight, suggestedApproach }) => {
    let line = `- ${referenceStyle} ${insight.summary}`;
    if (includeEvidence && insight.evidence) {
      line += ` (${insight.evidence})`;
    }
    if (suggestedApproach && insight.sourcePersona !== personaId) {
      line += ` [${suggestedApproach}]`;
    }
    return line;
  });

  return `[Team Insights - Information shared by other team members]\n${contextParts.join('\n')}`;
}

/**
 * Acknowledge that a persona has seen an insight
 */
export async function acknowledgeInsight(
  userId: string,
  insightId: string,
  personaId: PersonaId
): Promise<void> {
  const userInsights = insightStore.get(userId);
  if (!userInsights) return;

  const insight = userInsights.find((i) => i.id === insightId);
  if (!insight) return;

  if (!insight.acknowledgedBy.includes(personaId)) {
    insight.acknowledgedBy.push(personaId);
    await persistInsight(userId, insight);
  }
}

/**
 * Mark an insight as surfaced to the user
 */
export async function markInsightSurfaced(
  userId: string,
  insightId: string,
  reaction?: SharedInsight['userReaction']
): Promise<void> {
  const userInsights = insightStore.get(userId);
  if (!userInsights) return;

  const insight = userInsights.find((i) => i.id === insightId);
  if (!insight) return;

  insight.surfaced = true;
  if (reaction) {
    insight.userReaction = reaction;
  }

  await persistInsight(userId, insight);

  log.info({ userId, insightId, reaction }, '💬 Insight surfaced to user');
}

/**
 * Record user's reaction to a surfaced insight
 */
export async function recordInsightReaction(
  userId: string,
  insightId: string,
  reaction: SharedInsight['userReaction']
): Promise<void> {
  await markInsightSurfaced(userId, insightId, reaction);

  // If negative, maybe we should be more careful with similar insights
  if (reaction === 'negative' || reaction === 'dismissed') {
    log.warn(
      { userId, insightId, reaction },
      '⚠️ User reacted negatively to insight - adjusting approach'
    );
    // Could implement learning here to avoid similar surfaces
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function determinePriority(category: InsightCategory, confidence: number): InsightPriority {
  // Critical insights
  if (category === 'boundary' || category === 'concern') {
    return confidence > 0.7 ? 'critical' : 'high';
  }

  // High priority insights
  if (category === 'emotional_state' || category === 'struggle' || category === 'life_event') {
    return confidence > 0.6 ? 'high' : 'normal';
  }

  // Normal priority
  if (confidence > 0.8) return 'high';
  if (confidence > 0.5) return 'normal';
  return 'low';
}

function calculateRelevance(insight: SharedInsight, personaId: PersonaId): number {
  let score = insight.confidence;

  // Boost if explicitly relevant for this persona
  if (insight.relevantFor?.includes(personaId)) {
    score += 0.3;
  }

  // Boost if category is relevant to persona's domain
  const relevantCategories = PERSONA_CATEGORY_RELEVANCE[personaId] || [];
  if (relevantCategories.includes(insight.category)) {
    score += 0.2;
  }

  // Boost for high priority
  const priorityBoost = { critical: 0.3, high: 0.2, normal: 0.1, low: 0 };
  score += priorityBoost[insight.priority];

  // Decay based on age (insights become less relevant over time)
  const ageHours = (Date.now() - insight.discoveredAt.getTime()) / (1000 * 60 * 60);
  if (ageHours > 24) {
    score *= Math.max(0.5, 1 - (ageHours - 24) / 720); // Decay after 24h
  }

  return Math.min(1, score);
}

function generateApproach(insight: SharedInsight, personaId: PersonaId): string {
  const { category, sourcePersona } = insight;

  // Different personas have different approaches
  const approachMap: Record<PersonaId, Partial<Record<InsightCategory | 'default', string>>> = {
    ferni: {
      emotional_state: 'Acknowledge gently, offer support',
      struggle: 'Express understanding, ask how you can help',
      win: 'Celebrate genuinely',
      boundary: 'Respect completely - do not probe',
      default: 'Weave naturally into conversation',
    },
    maya: {
      habit: 'Connect to their existing routines',
      health: 'Approach with care and sensitivity',
      struggle: 'Offer practical, gentle suggestions',
      default: 'Encourage without pressure',
    },
    peter: {
      goal: 'Offer relevant research or insights',
      work: 'Share relevant information',
      financial: 'Provide educational context',
      default: 'Be curious and helpful',
    },
    alex: {
      work: 'Be professional and constructive',
      relationship: 'Help with communication strategies',
      default: 'Be clear and supportive',
    },
    jordan: {
      life_event: 'Help with planning and celebration',
      goal: 'Get excited, offer to help plan',
      default: 'Be enthusiastic and helpful',
    },
    nayan: {
      emotional_state: 'Listen deeply, offer wisdom gently',
      relationship: 'Provide perspective with compassion',
      struggle: 'Reframe with broader perspective',
      default: 'Be present and wise',
    },
    jack: {
      financial: 'Stay-the-course philosophy',
      goal: 'Long-term perspective',
      default: 'Simple, grounded wisdom',
    },
  };

  const personaApproaches = approachMap[personaId] || {};
  const approach =
    personaApproaches[category] || personaApproaches['default'] || 'Integrate naturally';

  // Add attribution if from another persona
  if (sourcePersona !== personaId) {
    return `${approach} (via ${sourcePersona})`;
  }

  return approach;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function persistInsight(userId: string, insight: SharedInsight): Promise<void> {
  try {
    const firestore = await getFirestore();
    if (!firestore) return;

    await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('cross_persona_insights')
      .doc(insight.id)
      .set(
        removeUndefined({
          ...insight,
          discoveredAt: insight.discoveredAt.toISOString(),
          expiresAt: insight.expiresAt?.toISOString(),
        })
      );
  } catch (error) {
    log.warn({ error, userId }, 'Failed to persist insight to Firestore');
  }
}

/**
 * Load insights from Firestore
 */
export async function loadInsights(userId: string): Promise<void> {
  try {
    const firestore = await getFirestore();
    if (!firestore) return;

    const snapshot = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('cross_persona_insights')
      .orderBy('discoveredAt', 'desc')
      .limit(100)
      .get();

    const insights: SharedInsight[] = snapshot.docs.map(
      (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
        const data = doc.data();
        return {
          ...data,
          discoveredAt: new Date(data.discoveredAt),
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        } as SharedInsight;
      }
    );

    insightStore.set(userId, insights);
    lastSyncTime.set(userId, new Date());

    log.debug({ userId, count: insights.length }, 'Loaded cross-persona insights');
  } catch (error) {
    log.warn({ error, userId }, 'Failed to load insights from Firestore');
  }
}

/**
 * Clear old/expired insights
 */
export async function cleanupInsights(userId: string): Promise<number> {
  const userInsights = insightStore.get(userId);
  if (!userInsights) return 0;

  const now = Date.now();
  const originalCount = userInsights.length;

  const validInsights = userInsights.filter((insight) => {
    // Remove expired insights
    if (insight.expiresAt && insight.expiresAt.getTime() < now) {
      return false;
    }
    // Remove very old insights (90 days)
    if (now - insight.discoveredAt.getTime() > 90 * 24 * 60 * 60 * 1000) {
      return false;
    }
    return true;
  });

  insightStore.set(userId, validInsights);
  const removed = originalCount - validInsights.length;

  if (removed > 0) {
    log.info({ userId, removed }, 'Cleaned up old insights');
  }

  return removed;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  recordInsight,
  getInsightsForPersona,
  getInsightsToSurface,
  buildInsightContext,
  acknowledgeInsight,
  markInsightSurfaced,
  recordInsightReaction,
  loadInsights,
  cleanupInsights,
};
