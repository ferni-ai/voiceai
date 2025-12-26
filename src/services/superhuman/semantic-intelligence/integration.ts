/**
 * Semantic Intelligence Integration
 *
 * This file bridges the turn handler to all 6 "Better Than Human V3" semantic intelligence systems.
 * It extracts relevant data from each user turn and feeds it to the appropriate systems.
 *
 * CRITICAL: This is the missing piece that makes our semantic intelligence actually work!
 * Without this integration, the systems have no data flowing into them.
 *
 * @module services/superhuman/semantic-intelligence/integration
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { runBackground } from '../../../utils/background-task.js';

// Import all 6 semantic intelligence systems
import { recordObservation, correlationMining } from './correlation-mining.js';
import { recordEmotionalWaypoint, emotionalTrajectories } from './emotional-trajectories.js';
import { recordPersonMention, relationalSemantics } from './relational-semantics.js';
import { recordDecisionPoint, counterfactualMemory } from './counterfactual-memory.js';
import { recordConversationData, growthFingerprint } from './growth-fingerprint.js';
import { recordMoment, crossSessionThreading } from './cross-session-threading.js';

// Import existing extractors for reuse
import { extractPersonMentions } from '../../../intelligence/relational-network.js';
import { extractSmallDetails } from '../../../intelligence/conversation-quality.js';

// Import enhanced extraction/matching (V3.1 improvements)
import { extractPersons, getPrimaryPersonName } from './person-extractor.js';
import { findMatchingAdvice, precomputeAdviceEmbeddings, type PastAdvice } from './advice-matcher.js';

// V3.2 Proactive Intelligence
import { openLoops, processUserTextForLoops } from './open-loops.js';
import { ferniCommitments, trackCommitmentsInResponse } from './ferni-commitments.js';

// V3.3 Relational Network
import { relationshipGraph, upsertPerson } from './relationship-graph.js';

// V3.4 Temporal Intelligence
import { temporalPatterns, recordSnapshot as recordTemporalSnapshot } from './temporal-patterns.js';

// V3.5 Behavioral Intelligence
import { behavioralIntelligence, recordPotentialSabotage, updateBaseline } from './behavioral-intelligence.js';

// V3.6 Coaching Intelligence
import { coachingIntelligence, updateLearningStyle, recordDeflection } from './coaching-intelligence.js';

// V3.7 Self-Awareness
import { selfAwareness, recordDistortions, recordSelfPerception } from './self-awareness.js';

const log = createLogger({ module: 'SemanticIntelligenceIntegration' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Data extracted from a user turn for semantic intelligence
 */
export interface TurnSemanticData {
  userId: string;
  sessionId: string;
  personaId: string;
  turnNumber: number;

  // Text data
  userText: string;
  topic?: string;
  topics?: string[];

  // Emotional data
  textEmotion?: string;
  textEmotionIntensity?: number;
  voiceEmotion?: string;
  voiceEmotionConfidence?: number;
  voiceEmotionIntensity?: number;

  // Voice prosody
  speechRate?: number;
  pitch?: number;
  energy?: number;
  breathiness?: number;

  // Temporal context
  timestamp: Date;
  dayOfWeek: number;
  hourOfDay: number;

  // Relationship/conversation context
  turnsSinceStart: number;
  sessionCount?: number;
  relationshipStage?: string;

  // Person mentions (enhanced V3.1)
  mentionedPerson?: string;
}

/**
 * Context when agent gives advice (for counterfactual tracking)
 */
export interface AgentAdviceContext {
  userId: string;
  sessionId: string;
  personaId: string;
  timestamp: Date;

  // The advice given
  adviceText: string;
  topic: string;
  category: 'behavioral' | 'emotional' | 'relational' | 'practical' | 'philosophical';

  // User's situation when advice was given
  userSituation?: string;
  userEmotion?: string;
}

// ============================================================================
// MAIN INTEGRATION FUNCTION
// ============================================================================

/**
 * Process a user turn through all semantic intelligence systems.
 *
 * This is the main entry point called from turn-handler.ts.
 * It extracts relevant data and feeds it to each system in parallel.
 *
 * IMPORTANT: This runs as fire-and-forget to not block turn processing.
 */
export async function processSemanticIntelligence(data: TurnSemanticData): Promise<void> {
  const { userId, userText, topic, textEmotion, textEmotionIntensity } = data;

  if (!userId || userId === 'anonymous') {
    return; // Skip for anonymous users
  }

  // Run all integrations in parallel, catching errors individually
  await Promise.allSettled([
    // V3 Core Systems (1-6)
    
    // 1. Feed correlation mining with cross-domain signals
    recordCorrelationData(data).catch((e) =>
      log.warn({ error: String(e), userId }, 'Correlation mining error')
    ),

    // 2. Feed emotional trajectories with emotion data
    recordEmotionalTrajectoryData(data).catch((e) =>
      log.warn({ error: String(e), userId }, 'Emotional trajectory error')
    ),

    // 3. Feed relational semantics with person mentions
    recordRelationalData(data).catch((e) =>
      log.warn({ error: String(e), userId }, 'Relational semantics error')
    ),

    // 4. Feed growth fingerprint with linguistic patterns
    recordGrowthData(data).catch((e) =>
      log.warn({ error: String(e), userId }, 'Growth fingerprint error')
    ),

    // 5. Feed cross-session threading with topics
    recordThreadingData(data).catch((e) =>
      log.warn({ error: String(e), userId }, 'Cross-session threading error')
    ),

    // 6. Detect advice outcome (counterfactual memory)
    detectAdviceOutcome(userId, userText).catch((e) =>
      log.warn({ error: String(e), userId }, 'Advice outcome detection error')
    ),

    // V3.2 Proactive Intelligence
    
    // 7. Detect open loops (intentions, concerns, life events)
    processUserTextForLoops(userId, userText, {
      emotion: textEmotion,
      emotionIntensity: textEmotionIntensity,
      topic,
      person: data.mentionedPerson,
    }).catch((e) =>
      log.warn({ error: String(e), userId }, 'Open loops detection error')
    ),

    // V3.3 Relational Network
    
    // 8. Update relationship graph with person data
    recordRelationshipGraphData(data).catch((e) =>
      log.warn({ error: String(e), userId }, 'Relationship graph error')
    ),

    // V3.4 Temporal Intelligence
    
    // 9. Record temporal snapshot for pattern learning
    recordTemporalSnapshot(userId, {
      emotion: textEmotion,
      emotionIntensity: textEmotionIntensity,
      topic,
      energyLevel: data.energy,
    }).catch((e) =>
      log.warn({ error: String(e), userId }, 'Temporal patterns error')
    ),

    // V3.5 Behavioral Intelligence
    
    // 10. Update emotional baseline
    textEmotion && textEmotionIntensity !== undefined
      ? updateBaseline(userId, {
          emotion: textEmotion,
          intensity: textEmotionIntensity,
          valence: getEmotionValence(textEmotion),
        }).catch((e) =>
          log.warn({ error: String(e), userId }, 'Behavioral baseline error')
        )
      : Promise.resolve(),

    // 11. Detect self-sabotage patterns
    recordPotentialSabotage(userId, {
      context: userText,
    }).catch((e) =>
      log.warn({ error: String(e), userId }, 'Sabotage detection error')
    ),

    // V3.6 Coaching Intelligence
    
    // 12. Update learning style
    updateLearningStyle(userId, userText).catch((e) =>
      log.warn({ error: String(e), userId }, 'Learning style error')
    ),

    // V3.7 Self-Awareness
    
    // 13. Record cognitive distortions
    recordDistortions(userId, userText).catch((e) =>
      log.warn({ error: String(e), userId }, 'Distortion detection error')
    ),

    // 14. Record self-perception statements
    recordSelfPerception(userId, userText, userText.slice(0, 200)).catch((e) =>
      log.warn({ error: String(e), userId }, 'Self-perception error')
    ),
  ]);

  log.debug(
    { userId, topic, turnNumber: data.turnNumber },
    '🧠 Semantic intelligence V3.7 turn processed'
  );
}

/**
 * Helper to get emotion valence for baseline tracking
 */
function getEmotionValence(emotion: string): number {
  const positive = ['happy', 'excited', 'grateful', 'calm', 'content', 'hopeful', 'proud', 'relieved'];
  const negative = ['sad', 'anxious', 'angry', 'stressed', 'frustrated', 'worried', 'fearful', 'overwhelmed'];
  const lower = emotion.toLowerCase();
  if (positive.some(e => lower.includes(e))) return 1;
  if (negative.some(e => lower.includes(e))) return -1;
  return 0;
}

/**
 * Record data for relationship graph (V3.3)
 */
async function recordRelationshipGraphData(data: TurnSemanticData): Promise<void> {
  const { userId, userText, textEmotion, textEmotionIntensity, topic, mentionedPerson } = data;
  
  if (!mentionedPerson) {
    // Try to extract persons from text
    const persons = extractPersons(userText);
    if (persons.length > 0) {
      const person = persons[0];
      const sentiment = textEmotionIntensity !== undefined 
        ? getEmotionValence(textEmotion ?? '') * textEmotionIntensity 
        : undefined;
      
      await upsertPerson(userId, {
        name: person.name,
        relationship: person.relationship as 'family' | 'friend' | 'romantic' | 'colleague' | 'professional' | 'acquaintance' | 'pet' | 'unknown' | undefined,
        emotion: textEmotion,
        sentiment,
        topic,
        context: userText.slice(0, 200),
      });
    }
  } else {
    const sentiment = textEmotionIntensity !== undefined 
      ? getEmotionValence(textEmotion ?? '') * textEmotionIntensity 
      : undefined;
    
    await upsertPerson(userId, {
      name: mentionedPerson,
      emotion: textEmotion,
      sentiment,
      topic,
      context: userText.slice(0, 200),
    });
  }
}

// ============================================================================
// INDIVIDUAL SYSTEM INTEGRATIONS
// ============================================================================

/**
 * Record data for correlation mining
 * Looks for cross-domain patterns (e.g., work stress → sleep issues)
 */
async function recordCorrelationData(data: TurnSemanticData): Promise<void> {
  const { userId, userText, topic, textEmotion, textEmotionIntensity } = data;

  // Extract domain signals from text
  const domains = extractDomainSignals(userText);

  // Record each domain with its emotional context
  for (const domain of domains) {
    await recordObservation(userId, {
      domain: domain.domain as 'emotion' | 'topic' | 'person' | 'time' | 'energy' | 'behavior' | 'sleep' | 'work' | 'relationship' | 'health' | 'goal',
      pattern: domain.signal,
      context: `${topic ?? 'general'}: ${userText.slice(0, 100)}`,
    });
  }

  // Always record the emotional state for correlation
  if (textEmotion && textEmotionIntensity && textEmotionIntensity > 0.3) {
    await recordObservation(userId, {
      domain: 'emotion',
      pattern: textEmotion,
      context: `${topic ?? 'general'}: ${userText.slice(0, 100)}`,
    });
  }
}

/**
 * Record data for emotional trajectories
 * Tracks multi-week emotional arcs
 */
async function recordEmotionalTrajectoryData(data: TurnSemanticData): Promise<void> {
  const {
    userId,
    textEmotion,
    textEmotionIntensity,
    voiceEmotion,
    voiceEmotionConfidence,
    topic,
    userText,
  } = data;

  // Determine primary emotion (prefer voice if confident)
  const emotion = voiceEmotionConfidence && voiceEmotionConfidence > 0.6
    ? voiceEmotion
    : textEmotion;

  const intensity = voiceEmotionConfidence && voiceEmotionConfidence > 0.6
    ? voiceEmotionConfidence
    : textEmotionIntensity;

  if (!emotion || !intensity || intensity < 0.3) {
    return; // Skip weak emotional signals
  }

  // Check for trajectory catalysts (life events that shift emotional arcs)
  const catalyst = detectEmotionalCatalyst(userText);

  // Map emotion to valence (-1 to 1)
  const positiveEmotions = ['happy', 'excited', 'grateful', 'content', 'calm', 'hopeful', 'relieved', 'proud'];
  const negativeEmotions = ['sad', 'anxious', 'angry', 'frustrated', 'stressed', 'overwhelmed', 'worried', 'fearful'];
  let valence = 0;
  if (positiveEmotions.some(e => emotion.toLowerCase().includes(e))) {
    valence = intensity * 0.8;
  } else if (negativeEmotions.some(e => emotion.toLowerCase().includes(e))) {
    valence = -intensity * 0.8;
  }

  await recordEmotionalWaypoint(userId, {
    emotion,
    intensity,
    valence,
    context: topic ?? 'general',
    trigger: catalyst,
  });
}

/**
 * Record data for relational semantics
 * Builds graph of people in user's life
 *
 * V3.1: Now uses enhanced person extractor for better NER-like extraction
 */
async function recordRelationalData(data: TurnSemanticData): Promise<void> {
  const { userId, userText, textEmotion, textEmotionIntensity, topic } = data;

  // Map emotion to sentiment (-1 to 1)
  const positiveEmotions = ['happy', 'excited', 'grateful', 'content', 'calm', 'hopeful', 'relieved', 'proud'];
  const negativeEmotions = ['sad', 'anxious', 'angry', 'frustrated', 'stressed', 'overwhelmed', 'worried', 'fearful'];
  let sentiment = 0;
  if (textEmotion && positiveEmotions.some(e => textEmotion.toLowerCase().includes(e))) {
    sentiment = (textEmotionIntensity ?? 0.5) * 0.8;
  } else if (textEmotion && negativeEmotions.some(e => textEmotion.toLowerCase().includes(e))) {
    sentiment = -(textEmotionIntensity ?? 0.5) * 0.8;
  }

  // V3.1: Use enhanced person extractor (NER-like with proper names and relationships)
  const enhancedPersons = extractPersons(userText);
  
  // Also use existing extractors for compatibility
  const legacyMentions = extractPersonMentions(
    userText,
    textEmotion ?? 'neutral',
    textEmotionIntensity ?? 0.5
  );

  // Extract from small details (family members, pets)
  const details = extractSmallDetails(userText);
  const personDetails = details.filter(
    (d) => d.type === 'person_name' || d.type === 'pet_name'
  );

  // Track seen names to avoid duplicates
  const seenNames = new Set<string>();

  // Record enhanced person mentions first (higher quality)
  for (const person of enhancedPersons) {
    const normalizedName = person.name.toLowerCase();
    if (!seenNames.has(normalizedName) && person.confidence > 0.5) {
      seenNames.add(normalizedName);
      await recordPersonMention(userId, {
        name: person.name,
        relationship: person.relationship ?? 'other',
        context: person.contextSnippet,
        emotion: textEmotion ?? 'neutral',
        sentiment,
        topics: topic ? [topic] : undefined,
      });
    }
  }

  // Record legacy mentions (catch anything missed)
  for (const mention of legacyMentions) {
    const name = mention.name || mention.role;
    const normalizedName = name.toLowerCase();
    if (!seenNames.has(normalizedName)) {
      seenNames.add(normalizedName);
      await recordPersonMention(userId, {
        name,
        relationship: mention.role,
        context: mention.contextSnippet,
        emotion: textEmotion ?? 'neutral',
        sentiment,
        topics: topic ? [topic] : undefined,
      });
    }
  }

  // Record details-based person mentions
  for (const detail of personDetails) {
    const normalizedName = detail.value.toLowerCase();
    if (!seenNames.has(normalizedName)) {
      seenNames.add(normalizedName);
      await recordPersonMention(userId, {
        name: detail.value,
        relationship: detail.type === 'pet_name' ? 'pet' : 'other',
        context: detail.context,
        emotion: textEmotion ?? 'neutral',
        sentiment,
        topics: topic ? [topic] : undefined,
      });
    }
  }
}

/**
 * Record data for growth fingerprint
 * Tracks linguistic evolution and cognitive patterns
 */
async function recordGrowthData(data: TurnSemanticData): Promise<void> {
  const { userId, userText, topic, textEmotion } = data;

  // Detect cognitive patterns
  const cognitive = detectCognitivePatterns(userText);

  // Map to the expected cognitive pattern type
  let cognitivePattern: 'problem_solving' | 'catastrophizing' | 'growth' | 'self_compassion' | undefined;
  if (cognitive.includes('solution_seeking') || cognitive.includes('methodical')) {
    cognitivePattern = 'problem_solving';
  } else if (cognitive.includes('catastrophizing')) {
    cognitivePattern = 'catastrophizing';
  } else if (cognitive.includes('growth_mindset') || cognitive.includes('self_awareness')) {
    cognitivePattern = 'growth';
  } else if (cognitive.includes('balanced_thinking')) {
    cognitivePattern = 'self_compassion';
  }

  await recordConversationData(userId, {
    topics: topic ? [topic] : undefined,
    emotion: textEmotion,
    messageText: userText,
    cognitivePattern,
  });
}

/**
 * Record data for cross-session threading
 * Connects semantically related topics across sessions
 */
async function recordThreadingData(data: TurnSemanticData): Promise<void> {
  const { userId, topic, userText, textEmotion, textEmotionIntensity } = data;

  // Only record significant moments (not every turn)
  // Significant = has strong emotion OR mentions important topic
  const isSignificant = 
    (textEmotionIntensity && textEmotionIntensity > 0.6) ||
    topic !== undefined ||
    userText.length > 100;

  if (!isSignificant) {
    return;
  }

  // Determine significance level
  let significance: 'low' | 'medium' | 'high' = 'medium';
  if (textEmotionIntensity && textEmotionIntensity > 0.8) {
    significance = 'high';
  } else if (textEmotionIntensity && textEmotionIntensity < 0.4 && !topic) {
    significance = 'low';
  }

  await recordMoment(userId, {
    content: userText.slice(0, 200),
    emotion: textEmotion,
    topic,
    significance,
  });
}

// ============================================================================
// AGENT ADVICE TRACKING (for counterfactual memory)
// ============================================================================

/**
 * Record when the agent gives advice.
 * Called from response generation when advice is detected.
 *
 * This enables counterfactual memory: "Last time I suggested X, and it didn't work"
 */
export async function recordAgentAdvice(advice: AgentAdviceContext): Promise<void> {
  const { userId, adviceText, topic, userSituation } = advice;

  if (!userId || userId === 'anonymous') {
    return;
  }

  try {
    await recordDecisionPoint(userId, {
      advice: adviceText,
      context: userSituation || topic,
      domain: topic,
    });

    log.debug({ userId, topic }, '📝 Recorded agent advice for counterfactual tracking');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record agent advice');
  }
}

/**
 * Track Ferni's commitments in her response (V3.2).
 * Call this after generating an agent response.
 */
export async function trackFerniCommitments(
  userId: string,
  responseText: string,
  context: {
    topic?: string;
    person?: string;
    userMessage?: string;
  }
): Promise<void> {
  if (!userId || userId === 'anonymous') {
    return;
  }

  try {
    await trackCommitmentsInResponse(userId, responseText, context);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to track Ferni commitments');
  }
}

/**
 * Record when user follows through (or doesn't) on advice.
 * Called when we detect follow-up to previous advice.
 */
export async function recordAdviceOutcome(
  userId: string,
  adviceId: string,
  outcome: {
    followed: boolean;
    result: 'positive' | 'negative' | 'neutral' | 'mixed';
    userFeedback?: string;
  }
): Promise<void> {
  if (!userId || userId === 'anonymous') {
    return;
  }

  try {
    // For now, use the counterfactual memory module's exported function
    const { recordOutcome } = await import('./counterfactual-memory.js');
    await recordOutcome(userId, {
      decisionPointId: adviceId,
      result: outcome.result,
      description: outcome.followed ? 'User followed the advice' : 'User did not follow advice',
      userReflection: outcome.userFeedback,
    });
    log.debug({ userId, adviceId, outcome: outcome.result }, '✅ Recorded advice outcome');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record advice outcome');
  }
}

// ============================================================================
// ADVICE OUTCOME DETECTION (Auto-detect when user mentions advice results)
// ============================================================================

/**
 * Patterns that indicate user is talking about following advice.
 */
const FOLLOW_THROUGH_PATTERNS = [
  /\bi tried\b/i,
  /\bi did what you/i,
  /\byou suggested\b.*\bi\b/i,
  /\btook your advice\b/i,
  /\bfollowed your\b/i,
  /\bdid the thing\b/i,
  /\bactually did\b/i,
  /\bfinally did\b/i,
  /\bwent ahead and\b/i,
];

const NOT_FOLLOW_PATTERNS = [
  /\bdidn't try\b/i,
  /\bcouldn't do\b/i,
  /\bdidn't do\b/i,
  /\bnever got around\b/i,
  /\bforgot to\b/i,
  /\bdidn't follow\b/i,
  /\bignored your\b/i,
];

const POSITIVE_OUTCOME_PATTERNS = [
  /\bit worked\b/i,
  /\bhelped\b/i,
  /\bfeel(s|ing)? better\b/i,
  /\bmade a difference\b/i,
  /\bso glad\b/i,
  /\bthank(s| you)\b/i,
  /\bwas right\b/i,
  /\bgreat advice\b/i,
  /\bworked out\b/i,
];

const NEGATIVE_OUTCOME_PATTERNS = [
  /\bdidn't work\b/i,
  /\bdidn't help\b/i,
  /\bmade (it )?worse\b/i,
  /\bbackfired\b/i,
  /\bstill (feel|feeling)\b/i,
  /\bno difference\b/i,
  /\bwaste of time\b/i,
];

/**
 * Detect if user is reporting on advice outcome.
 * Call this on each turn to check for followup to previous advice.
 *
 * V3.1: Now uses semantic matching to find the most relevant advice,
 * not just the most recent one.
 */
export async function detectAdviceOutcome(
  userId: string,
  userText: string
): Promise<void> {
  if (!userId || userId === 'anonymous') {
    return;
  }

  const lowerText = userText.toLowerCase();

  // Check if user is talking about following through
  const mentionsFollowThrough = FOLLOW_THROUGH_PATTERNS.some((p) => p.test(lowerText));
  const mentionsNotFollowing = NOT_FOLLOW_PATTERNS.some((p) => p.test(lowerText));

  if (!mentionsFollowThrough && !mentionsNotFollowing) {
    return; // User isn't talking about advice
  }

  try {
    // Get pending advice that hasn't been followed up on
    const { getPendingFollowUps } = await import('./counterfactual-memory.js');
    const pendingAdvice = await getPendingFollowUps(userId);

    if (pendingAdvice.length === 0) {
      return; // No pending advice to track
    }

    // V3.1: Use semantic matching to find the most relevant advice
    // Convert to PastAdvice format for semantic matching
    // Note: DecisionPoint.timestamp is a number (ms), DecisionPoint has context not domain
    const pastAdviceList: PastAdvice[] = pendingAdvice.map((a) => ({
      id: a.id,
      adviceText: a.advice,
      topic: a.context ?? 'general', // Use context as topic since DecisionPoint doesn't have domain
      timestamp: new Date(a.timestamp), // timestamp is already a number (ms since epoch)
    }));

    // Pre-compute embeddings for faster matching
    await precomputeAdviceEmbeddings(pastAdviceList);

    // Find semantically matching advice
    const match = await findMatchingAdvice(userText, pastAdviceList);

    // Determine outcome
    let result: 'positive' | 'negative' | 'neutral' | 'mixed' = 'neutral';
    const positiveMatch = POSITIVE_OUTCOME_PATTERNS.some((p) => p.test(lowerText));
    const negativeMatch = NEGATIVE_OUTCOME_PATTERNS.some((p) => p.test(lowerText));

    if (positiveMatch && negativeMatch) {
      result = 'mixed';
    } else if (positiveMatch) {
      result = 'positive';
    } else if (negativeMatch) {
      result = 'negative';
    }

    // Use semantic match if confident, otherwise fall back to most recent
    const targetAdvice = match && match.confidence > 0.5
      ? match.advice
      : pastAdviceList[0];

    await recordAdviceOutcome(userId, targetAdvice.id, {
      followed: mentionsFollowThrough,
      result,
      userFeedback: userText.slice(0, 200),
    });

    log.info(
      {
        userId,
        adviceId: targetAdvice.id,
        followed: mentionsFollowThrough,
        result,
        matchType: match?.matchType ?? 'recency_fallback',
        matchConfidence: match?.confidence,
      },
      '🎯 Detected advice outcome (semantic match)'
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Advice outcome detection failed');
  }
}

// ============================================================================
// HELPER FUNCTIONS - Domain Signal Extraction
// ============================================================================

interface DomainSignal {
  domain: string;
  signal: string;
  intensity?: number;
}

/**
 * Extract domain signals from user text for correlation mining
 */
function extractDomainSignals(text: string): DomainSignal[] {
  const signals: DomainSignal[] = [];
  const lowerText = text.toLowerCase();

  // Type for patterns with optional intensity
  type PatternDef = { pattern: RegExp; signal: string; intensity?: number };

  // Work-related signals
  const workPatterns: PatternDef[] = [
    { pattern: /\b(work|job|boss|meeting|deadline|project|office)\b/i, signal: 'work_mention' },
    { pattern: /\b(stressed|overwhelmed|busy|swamped)\b.*\b(work|job)\b/i, signal: 'work_stress', intensity: 0.8 },
    { pattern: /\b(promoted|raise|success|win)\b.*\b(work|job)\b/i, signal: 'work_success', intensity: 0.9 },
  ];

  for (const { pattern, signal, intensity } of workPatterns) {
    if (pattern.test(text)) {
      signals.push({ domain: 'work', signal, intensity });
    }
  }

  // Sleep-related signals
  const sleepPatterns: PatternDef[] = [
    { pattern: /\b(tired|exhausted|sleep|insomnia|rest)\b/i, signal: 'sleep_issue' },
    { pattern: /\b(couldn't sleep|can't sleep|up all night)\b/i, signal: 'sleep_deprivation', intensity: 0.9 },
    { pattern: /\b(slept great|good night|well rested)\b/i, signal: 'sleep_quality_good', intensity: 0.8 },
  ];

  for (const { pattern, signal, intensity } of sleepPatterns) {
    if (pattern.test(text)) {
      signals.push({ domain: 'sleep', signal, intensity });
    }
  }

  // Health-related signals
  const healthPatterns: PatternDef[] = [
    { pattern: /\b(sick|ill|headache|pain|doctor)\b/i, signal: 'health_issue' },
    { pattern: /\b(exercise|workout|gym|run|yoga)\b/i, signal: 'exercise' },
    { pattern: /\b(diet|eating|food|healthy)\b/i, signal: 'nutrition' },
  ];

  for (const { pattern, signal, intensity } of healthPatterns) {
    if (pattern.test(text)) {
      signals.push({ domain: 'health', signal, intensity });
    }
  }

  // Relationship-related signals
  const relationshipPatterns: PatternDef[] = [
    { pattern: /\b(fight|argument|disagreed|conflict)\b/i, signal: 'relationship_conflict', intensity: 0.8 },
    { pattern: /\b(date|romantic|love|partner)\b/i, signal: 'romantic' },
    { pattern: /\b(friend|friendship|hangout|social)\b/i, signal: 'social' },
  ];

  for (const { pattern, signal, intensity } of relationshipPatterns) {
    if (pattern.test(text)) {
      signals.push({ domain: 'relationship', signal, intensity });
    }
  }

  // Goal-related signals
  const goalPatterns: PatternDef[] = [
    { pattern: /\b(goal|achieve|accomplish|want to|trying to)\b/i, signal: 'goal_mention' },
    { pattern: /\b(gave up|quit|failed|can't)\b/i, signal: 'setback', intensity: 0.7 },
    { pattern: /\b(did it|made it|succeeded|finally)\b/i, signal: 'achievement', intensity: 0.9 },
  ];

  for (const { pattern, signal, intensity } of goalPatterns) {
    if (pattern.test(text)) {
      signals.push({ domain: 'goal', signal, intensity });
    }
  }

  // Energy-related signals
  if (/\b(energized|pumped|motivated|excited)\b/i.test(lowerText)) {
    signals.push({ domain: 'energy', signal: 'high_energy', intensity: 0.8 });
  }
  if (/\b(drained|exhausted|no energy|tired)\b/i.test(lowerText)) {
    signals.push({ domain: 'energy', signal: 'low_energy', intensity: 0.7 });
  }

  return signals;
}

/**
 * Detect emotional catalysts (life events that shift emotional trajectories)
 */
function detectEmotionalCatalyst(text: string): string | undefined {
  const catalysts = [
    { pattern: /\b(lost my|passed away|died|death)\b/i, catalyst: 'loss' },
    { pattern: /\b(broke up|divorce|separated|ended)\b/i, catalyst: 'relationship_end' },
    { pattern: /\b(new job|got hired|started working)\b/i, catalyst: 'job_change' },
    { pattern: /\b(moving|moved to|relocated)\b/i, catalyst: 'relocation' },
    { pattern: /\b(pregnant|baby|expecting|gave birth)\b/i, catalyst: 'new_baby' },
    { pattern: /\b(engaged|married|wedding)\b/i, catalyst: 'marriage' },
    { pattern: /\b(graduated|degree|finished school)\b/i, catalyst: 'graduation' },
    { pattern: /\b(diagnosed|illness|cancer|disease)\b/i, catalyst: 'health_diagnosis' },
    { pattern: /\b(retired|retirement)\b/i, catalyst: 'retirement' },
  ];

  for (const { pattern, catalyst } of catalysts) {
    if (pattern.test(text)) {
      return catalyst;
    }
  }

  return undefined;
}

/**
 * Extract linguistic markers for growth tracking
 */
function extractLinguisticMarkers(text: string): string[] {
  const markers: string[] = [];

  // Self-awareness language
  if (/\b(I realize|I notice|I'm aware|I understand now)\b/i.test(text)) {
    markers.push('self_awareness');
  }

  // Growth language
  if (/\b(I've learned|I'm learning|getting better|improving)\b/i.test(text)) {
    markers.push('growth_mindset');
  }

  // Certainty vs uncertainty
  if (/\b(I think|maybe|perhaps|not sure)\b/i.test(text)) {
    markers.push('uncertainty');
  }
  if (/\b(I know|definitely|certainly|absolutely)\b/i.test(text)) {
    markers.push('certainty');
  }

  // Future orientation
  if (/\b(I will|going to|plan to|want to)\b/i.test(text)) {
    markers.push('future_oriented');
  }

  // Agency language
  if (/\b(I decided|I chose|I'm going to|I can)\b/i.test(text)) {
    markers.push('agency');
  }
  if (/\b(I have to|I should|they made me|no choice)\b/i.test(text)) {
    markers.push('low_agency');
  }

  // Gratitude
  if (/\b(grateful|thankful|appreciate|blessed)\b/i.test(text)) {
    markers.push('gratitude');
  }

  return markers;
}

/**
 * Detect cognitive patterns (problem-solving style, thought patterns)
 */
function detectCognitivePatterns(text: string): string[] {
  const patterns: string[] = [];

  // Problem-solving approaches
  if (/\b(what if|could try|another way|options)\b/i.test(text)) {
    patterns.push('solution_seeking');
  }

  // Cognitive distortions (ANTs)
  if (/\b(always|never|everyone|no one)\b/i.test(text)) {
    patterns.push('absolute_thinking');
  }
  if (/\b(should have|shouldn't have|my fault|blame myself)\b/i.test(text)) {
    patterns.push('self_blame');
  }
  if (/\b(worst|terrible|awful|disaster|catastrophe)\b/i.test(text)) {
    patterns.push('catastrophizing');
  }

  // Healthy patterns
  if (/\b(perspective|on the other hand|but also|although)\b/i.test(text)) {
    patterns.push('balanced_thinking');
  }
  if (/\b(let's see|figure out|work through|step by step)\b/i.test(text)) {
    patterns.push('methodical');
  }

  return patterns;
}

/**
 * Extract key concepts for threading
 */
function extractKeyConcepts(text: string): string[] {
  const concepts: string[] = [];
  const lowerText = text.toLowerCase();

  // Life domains
  const domains = [
    'work', 'career', 'job', 'family', 'relationship', 'health',
    'money', 'finances', 'fitness', 'mental health', 'anxiety',
    'depression', 'stress', 'sleep', 'goals', 'dreams', 'future',
  ];

  for (const domain of domains) {
    if (lowerText.includes(domain)) {
      concepts.push(domain);
    }
  }

  // Activities
  const activities = [
    'exercise', 'meditation', 'journaling', 'therapy', 'reading',
    'learning', 'travel', 'cooking', 'hobbies', 'volunteering',
  ];

  for (const activity of activities) {
    if (lowerText.includes(activity)) {
      concepts.push(activity);
    }
  }

  return concepts;
}

// ============================================================================
// SESSION WARMUP (call on connection)
// ============================================================================

/**
 * Warm up semantic intelligence caches for a user.
 * Call this on session connect to preload user data.
 *
 * This pre-loads Firestore data into memory caches for faster context building.
 */
export async function warmupSemanticIntelligence(userId: string): Promise<void> {
  if (!userId || userId === 'anonymous') {
    return;
  }

  try {
    // Import the context builders which load data into cache
    const { buildCorrelationContext } = await import('./correlation-mining.js');
    const { buildEmotionalTrajectoryContext } = await import('./emotional-trajectories.js');
    const { buildRelationalContext } = await import('./relational-semantics.js');
    const { buildGrowthContext } = await import('./growth-fingerprint.js');
    const { buildThreadingContext } = await import('./cross-session-threading.js');
    const { buildCounterfactualContext } = await import('./counterfactual-memory.js');

    // Build context in parallel - this populates the caches
    await Promise.allSettled([
      buildCorrelationContext(userId),
      buildEmotionalTrajectoryContext(userId),
      buildRelationalContext(userId),
      buildGrowthContext(userId),
      buildThreadingContext(userId),
      buildCounterfactualContext(userId),
    ]);

    log.info({ userId }, '🧠 Semantic intelligence warmed up');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Semantic intelligence warmup failed');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  extractDomainSignals,
  detectEmotionalCatalyst,
  extractLinguisticMarkers,
  detectCognitivePatterns,
  extractKeyConcepts,
};

