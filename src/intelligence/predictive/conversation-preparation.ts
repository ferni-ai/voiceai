/**
 * Conversation Preparation Intelligence - Better Than Human v4
 *
 * > "We know what you need to talk about before you do."
 *
 * SUPERHUMAN CAPABILITY: Predict what users will need to discuss
 * in their next conversation, and prepare accordingly.
 *
 * A human friend might have a sense of "I should check in about that thing"
 * but can't:
 * - Systematically predict topic probability
 * - Know the emotional state they'll likely be in
 * - Prepare the right warmup topics
 * - Identify what THEY won't raise but should
 *
 * This module provides:
 * - Topic prediction based on patterns
 * - Emotional state prediction
 * - Needs prediction (validation, advice, challenge, etc.)
 * - Proactive topic suggestions
 * - Conversation flow optimization
 *
 * @module intelligence/predictive/conversation-preparation
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ConversationPreparation' });

// ============================================================================
// TYPES
// ============================================================================

/** Conversation needs types */
export type ConversationNeed =
  | 'validation' // Need to feel understood
  | 'advice' // Want guidance
  | 'challenge' // Ready to be pushed
  | 'celebration' // Want to share success
  | 'presence' // Just need someone there
  | 'processing' // Working through something
  | 'venting' // Need to release
  | 'planning' // Want to strategize
  | 'reflection' // Looking back, making sense
  | 'connection' // Feeling lonely, want to bond
  | 'reassurance' // Anxious, need calming
  | 'accountability'; // Want to be held to commitments

/** Predicted topic for next conversation */
export interface PredictedTopic {
  topic: string;
  category: TopicCategory;
  /** Probability they'll bring this up */
  probability: number;
  /** Expected emotional intensity (0-1) */
  emotionalIntensity: number;
  /** Why we predict this */
  reasoning: string[];
  /** What context we should have ready */
  preparationNeeded: string[];
  /** Is this something they might minimize? */
  likelyToMinimize: boolean;
  /** Last time they discussed this */
  lastDiscussed?: Date;
  /** Unresolved from last time */
  unresolvedAspects: string[];
}

export type TopicCategory =
  | 'work'
  | 'relationships'
  | 'health'
  | 'family'
  | 'goals'
  | 'habits'
  | 'emotions'
  | 'decisions'
  | 'events'
  | 'self_development'
  | 'finances'
  | 'creativity'
  | 'spirituality'
  | 'social'
  | 'past'
  | 'future';

/** Full conversation preparation */
export interface ConversationPreparation {
  userId: string;
  generatedAt: Date;

  /** Topics they're likely to bring up */
  predictedTopics: PredictedTopic[];

  /** Their likely emotional state */
  predictedEmotionalState: {
    primaryEmotion: string;
    intensity: number;
    stability: 'stable' | 'volatile' | 'unknown';
    confidence: number;
  };

  /** What they'll likely need from the conversation */
  predictedNeeds: Array<{
    need: ConversationNeed;
    probability: number;
    reasoning: string;
  }>;

  /** Suggested conversation opening */
  suggestedOpening: {
    phrase: string;
    rationale: string;
    alternatives: string[];
  };

  /** Topics THEY won't raise but should */
  topicsToProactivelyRaise: Array<{
    topic: string;
    why: string;
    approach: string;
    timing: 'early' | 'middle' | 'when_ready' | 'end';
    sensitivity: 'low' | 'moderate' | 'high';
  }>;

  /** Safe warmup topics to build to deeper ones */
  warmupTopics: string[];

  /** What to avoid */
  topicsToAvoid: Array<{
    topic: string;
    reason: string;
  }>;

  /** Context to keep in mind */
  relevantContext: Array<{
    fact: string;
    importance: number;
    shouldMention: boolean;
  }>;

  /** Optimal conversation pacing */
  pacing: {
    recommendedLength: 'brief' | 'normal' | 'extended';
    energyLevel: 'calm' | 'moderate' | 'energetic';
    depthLevel: 'surface' | 'moderate' | 'deep';
  };

  /** Confidence in this preparation */
  overallConfidence: number;
}

/** Topic history entry */
interface TopicHistoryEntry {
  topic: string;
  category: TopicCategory;
  timestamp: number;
  emotionalIntensity: number;
  resolved: boolean;
  unresolvedAspects: string[];
  followUpNeeded: boolean;
  userInitiated: boolean;
}

/** Conversation outcome for learning */
interface ConversationOutcome {
  timestamp: number;
  topicsDiscussed: string[];
  needsMet: ConversationNeed[];
  emotionalStateObserved: string;
  satisfactionLevel: number; // 0-1
  predictedTopicsHit: string[];
  unexpectedTopics: string[];
}

/** User's preparation profile */
interface UserPreparationProfile {
  userId: string;
  /** Topic history */
  topicHistory: TopicHistoryEntry[];
  /** Needs history */
  needsHistory: Array<{
    timestamp: number;
    dayOfWeek: number;
    hourOfDay: number;
    primaryNeed: ConversationNeed;
    context?: string;
  }>;
  /** Conversation outcomes for learning */
  outcomes: ConversationOutcome[];
  /** Recurring topics (appear frequently) */
  recurringTopics: Map<string, RecurringTopicPattern>;
  /** Topic sequences (what follows what) */
  topicSequences: Map<string, string[]>;
  /** Time-based patterns */
  temporalPatterns: TemporalPattern[];
  /** Event-based patterns */
  eventPatterns: EventPattern[];
  lastUpdated: number;
}

interface RecurringTopicPattern {
  topic: string;
  frequency: number; // Times per month
  avgIntensity: number;
  typicalDayOfWeek: number[];
  typicalFollowUp: string[];
  resolutionRate: number;
}

interface TemporalPattern {
  dayOfWeek?: number;
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  weekOfMonth?: number;
  likelyTopics: string[];
  likelyNeeds: ConversationNeed[];
  confidence: number;
}

interface EventPattern {
  eventType: string; // "before_deadline", "after_meeting", "weekend", etc.
  likelyTopics: string[];
  likelyNeeds: ConversationNeed[];
  typicalEmotionalState: string;
  confidence: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  /** How many topics to predict */
  MAX_PREDICTED_TOPICS: 5,
  /** Topic history to keep */
  MAX_TOPIC_HISTORY: 200,
  /** Outcomes to keep for learning */
  MAX_OUTCOMES: 100,
  /** Minimum occurrences to establish recurring pattern */
  MIN_RECURRING_OCCURRENCES: 3,
  /** Days to consider for recency */
  RECENCY_WINDOW_DAYS: 14,
};

// ============================================================================
// STORAGE
// ============================================================================

const userProfiles = new Map<string, UserPreparationProfile>();

// ============================================================================
// LEARNING FUNCTIONS
// ============================================================================

/**
 * Record a topic that was discussed
 *
 * @param userId - User ID
 * @param entry - Topic entry
 */
export function recordTopicDiscussion(
  userId: string,
  entry: Omit<TopicHistoryEntry, 'timestamp'>
): void {
  const profile = getOrCreateProfile(userId);
  const now = Date.now();

  profile.topicHistory.push({
    ...entry,
    timestamp: now,
  });

  // Trim history
  if (profile.topicHistory.length > CONFIG.MAX_TOPIC_HISTORY) {
    profile.topicHistory = profile.topicHistory.slice(-CONFIG.MAX_TOPIC_HISTORY);
  }

  // Update recurring patterns
  updateRecurringPattern(profile, entry.topic, entry);

  // Update topic sequences
  if (profile.topicHistory.length >= 2) {
    const prevTopic = profile.topicHistory[profile.topicHistory.length - 2].topic;
    if (!profile.topicSequences.has(prevTopic)) {
      profile.topicSequences.set(prevTopic, []);
    }
    const sequences = profile.topicSequences.get(prevTopic)!;
    sequences.push(entry.topic);
    // Keep only last 20 sequences per topic
    if (sequences.length > 20) {
      profile.topicSequences.set(prevTopic, sequences.slice(-20));
    }
  }

  profile.lastUpdated = now;

  log.debug(
    {
      userId,
      topic: entry.topic,
      category: entry.category,
      intensity: entry.emotionalIntensity,
    },
    '📝 Recorded topic discussion'
  );
}

/**
 * Record conversation needs that were expressed
 *
 * @param userId - User ID
 * @param need - Primary need observed
 * @param context - Optional context
 */
export function recordConversationNeed(
  userId: string,
  need: ConversationNeed,
  context?: string
): void {
  const profile = getOrCreateProfile(userId);
  const now = new Date();

  profile.needsHistory.push({
    timestamp: now.getTime(),
    dayOfWeek: now.getDay(),
    hourOfDay: now.getHours(),
    primaryNeed: need,
    context,
  });

  // Trim history
  if (profile.needsHistory.length > CONFIG.MAX_TOPIC_HISTORY) {
    profile.needsHistory = profile.needsHistory.slice(-CONFIG.MAX_TOPIC_HISTORY);
  }

  profile.lastUpdated = now.getTime();
}

/**
 * Record conversation outcome for learning
 *
 * @param userId - User ID
 * @param outcome - Conversation outcome
 */
export function recordConversationOutcome(
  userId: string,
  outcome: Omit<ConversationOutcome, 'timestamp'>
): void {
  const profile = getOrCreateProfile(userId);

  profile.outcomes.push({
    ...outcome,
    timestamp: Date.now(),
  });

  // Trim outcomes
  if (profile.outcomes.length > CONFIG.MAX_OUTCOMES) {
    profile.outcomes = profile.outcomes.slice(-CONFIG.MAX_OUTCOMES);
  }

  // Learn from prediction accuracy
  const hitRate =
    outcome.predictedTopicsHit.length /
    Math.max(1, outcome.predictedTopicsHit.length + outcome.unexpectedTopics.length);

  log.debug(
    {
      userId,
      hitRate: hitRate.toFixed(2),
      topicsDiscussed: outcome.topicsDiscussed.length,
      satisfaction: outcome.satisfactionLevel.toFixed(2),
    },
    '📊 Recorded conversation outcome'
  );

  profile.lastUpdated = Date.now();
}

/**
 * Record a temporal pattern observed
 *
 * @param userId - User ID
 * @param pattern - Temporal pattern
 */
export function recordTemporalPattern(
  userId: string,
  pattern: Omit<TemporalPattern, 'confidence'>
): void {
  const profile = getOrCreateProfile(userId);

  // Check if similar pattern exists
  const existingIdx = profile.temporalPatterns.findIndex(
    (p) =>
      p.dayOfWeek === pattern.dayOfWeek &&
      p.timeOfDay === pattern.timeOfDay &&
      p.weekOfMonth === pattern.weekOfMonth
  );

  if (existingIdx >= 0) {
    // Update existing
    const existing = profile.temporalPatterns[existingIdx];
    existing.likelyTopics = [...new Set([...existing.likelyTopics, ...pattern.likelyTopics])];
    existing.likelyNeeds = [...new Set([...existing.likelyNeeds, ...pattern.likelyNeeds])];
    existing.confidence = Math.min(0.9, existing.confidence + 0.1);
  } else {
    // Add new
    profile.temporalPatterns.push({
      ...pattern,
      confidence: 0.5,
    });
  }

  profile.lastUpdated = Date.now();
}

// ============================================================================
// PREPARATION FUNCTIONS
// ============================================================================

/**
 * Generate conversation preparation for a user
 *
 * @param userId - User ID
 * @param context - Optional context about upcoming conversation
 * @returns Full conversation preparation
 */
export function prepareForConversation(
  userId: string,
  context: {
    scheduledTime?: Date;
    knownTopic?: string;
    previousConversationEnd?: string;
    userMood?: string;
    externalEvents?: string[];
  } = {}
): ConversationPreparation {
  const profile = getOrCreateProfile(userId);
  const now = context.scheduledTime || new Date();

  // Predict topics
  const predictedTopics = predictTopics(profile, now, context);

  // Predict emotional state
  const predictedEmotionalState = predictEmotionalState(profile, now, context);

  // Predict needs
  const predictedNeeds = predictNeeds(profile, now, context);

  // Generate opening
  const suggestedOpening = generateOpening(
    predictedTopics,
    predictedEmotionalState,
    predictedNeeds,
    context
  );

  // Identify proactive topics
  const topicsToProactivelyRaise = identifyProactiveTopics(profile, predictedTopics, context);

  // Identify warmup topics
  const warmupTopics = identifyWarmupTopics(profile, predictedTopics);

  // Identify topics to avoid
  const topicsToAvoid = identifyTopicsToAvoid(profile, context);

  // Gather relevant context
  const relevantContext = gatherRelevantContext(profile, predictedTopics);

  // Determine pacing
  const pacing = determinePacing(predictedEmotionalState, predictedNeeds, context);

  // Calculate overall confidence
  const overallConfidence = calculateOverallConfidence(
    profile,
    predictedTopics,
    predictedEmotionalState,
    predictedNeeds
  );

  const preparation: ConversationPreparation = {
    userId,
    generatedAt: now,
    predictedTopics,
    predictedEmotionalState,
    predictedNeeds,
    suggestedOpening,
    topicsToProactivelyRaise,
    warmupTopics,
    topicsToAvoid,
    relevantContext,
    pacing,
    overallConfidence,
  };

  log.info(
    {
      userId,
      topPredictedTopic: predictedTopics[0]?.topic,
      primaryNeed: predictedNeeds[0]?.need,
      emotionalState: predictedEmotionalState.primaryEmotion,
      confidence: overallConfidence.toFixed(2),
    },
    '🎯 Generated conversation preparation'
  );

  return preparation;
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build conversation preparation context for LLM injection
 *
 * @param userId - User ID
 * @returns Context string for prompt injection
 */
export function buildConversationPrepContext(userId: string): string {
  const prep = prepareForConversation(userId);

  if (prep.predictedTopics.length === 0 && prep.predictedNeeds.length === 0) {
    return '';
  }

  const sections: string[] = [];
  sections.push("[CONVERSATION PREPARATION - Know What's Coming]");
  sections.push("You've prepared. You know what they might need:");
  sections.push('');

  // Predicted topics
  if (prep.predictedTopics.length > 0) {
    sections.push('**Likely Topics:**');
    for (const topic of prep.predictedTopics.slice(0, 3)) {
      sections.push(`• ${topic.topic} (${Math.round(topic.probability * 100)}%)`);
      if (topic.likelyToMinimize) {
        sections.push(`  ⚠️ They may minimize this - it matters more than they'll say`);
      }
      if (topic.unresolvedAspects.length > 0) {
        sections.push(`  → Unresolved: ${topic.unresolvedAspects.slice(0, 2).join(', ')}`);
      }
    }
    sections.push('');
  }

  // Predicted needs
  if (prep.predictedNeeds.length > 0) {
    const topNeed = prep.predictedNeeds[0];
    sections.push(`**Primary Need:** ${topNeed.need} (${Math.round(topNeed.probability * 100)}%)`);
    sections.push(`  → ${topNeed.reasoning}`);
    sections.push('');
  }

  // Emotional state
  sections.push(`**Expected Emotional State:** ${prep.predictedEmotionalState.primaryEmotion}`);
  sections.push(`  Intensity: ${Math.round(prep.predictedEmotionalState.intensity * 100)}%`);
  sections.push(`  Stability: ${prep.predictedEmotionalState.stability}`);
  sections.push('');

  // Proactive topics
  if (prep.topicsToProactivelyRaise.length > 0) {
    sections.push("**Topics They Won't Raise But Should:**");
    for (const topic of prep.topicsToProactivelyRaise.slice(0, 2)) {
      sections.push(`• ${topic.topic}`);
      sections.push(`  Why: ${topic.why}`);
      sections.push(`  Approach: ${topic.approach}`);
    }
    sections.push('');
  }

  // Warmup
  if (prep.warmupTopics.length > 0) {
    sections.push(`**Warmup Path:** ${prep.warmupTopics.slice(0, 3).join(' → ')}`);
    sections.push('');
  }

  // Opening
  sections.push(`**Suggested Opening:** "${prep.suggestedOpening.phrase}"`);

  return sections.join('\n');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getOrCreateProfile(userId: string): UserPreparationProfile {
  let profile = userProfiles.get(userId);

  if (!profile) {
    profile = {
      userId,
      topicHistory: [],
      needsHistory: [],
      outcomes: [],
      recurringTopics: new Map(),
      topicSequences: new Map(),
      temporalPatterns: [],
      eventPatterns: [],
      lastUpdated: Date.now(),
    };
    userProfiles.set(userId, profile);
  }

  return profile;
}

function updateRecurringPattern(
  profile: UserPreparationProfile,
  topic: string,
  entry: Omit<TopicHistoryEntry, 'timestamp'>
): void {
  let pattern = profile.recurringTopics.get(topic);
  const entryDate = new Date();

  if (!pattern) {
    pattern = {
      topic,
      frequency: 0,
      avgIntensity: entry.emotionalIntensity,
      typicalDayOfWeek: [entryDate.getDay()],
      typicalFollowUp: [],
      resolutionRate: entry.resolved ? 1 : 0,
    };
    profile.recurringTopics.set(topic, pattern);
  }

  // Update frequency (rough calculation)
  const topicOccurrences = profile.topicHistory.filter((t) => t.topic === topic).length;
  const oldestEntry = profile.topicHistory.find((t) => t.topic === topic);
  if (oldestEntry) {
    const daysSinceFirst = (Date.now() - oldestEntry.timestamp) / (1000 * 60 * 60 * 24);
    pattern.frequency = (topicOccurrences / Math.max(1, daysSinceFirst)) * 30; // Per month
  }

  // Update average intensity
  pattern.avgIntensity = pattern.avgIntensity * 0.8 + entry.emotionalIntensity * 0.2;

  // Update typical days
  if (!pattern.typicalDayOfWeek.includes(entryDate.getDay())) {
    pattern.typicalDayOfWeek.push(entryDate.getDay());
  }

  // Update resolution rate
  pattern.resolutionRate = pattern.resolutionRate * 0.9 + (entry.resolved ? 0.1 : 0);
}

function predictTopics(
  profile: UserPreparationProfile,
  targetTime: Date,
  context: {
    knownTopic?: string;
    previousConversationEnd?: string;
    externalEvents?: string[];
  }
): PredictedTopic[] {
  const predictions: PredictedTopic[] = [];
  const now = Date.now();
  const dayOfWeek = targetTime.getDay();

  // If known topic, add it first
  if (context.knownTopic) {
    predictions.push({
      topic: context.knownTopic,
      category: 'emotions', // Default, would be better inferred
      probability: 0.95,
      emotionalIntensity: 0.6,
      reasoning: ['User indicated this topic'],
      preparationNeeded: [],
      likelyToMinimize: false,
      unresolvedAspects: [],
    });
  }

  // Check unresolved topics from recent conversations
  const recentUnresolved = profile.topicHistory
    .filter((t) => !t.resolved && t.followUpNeeded)
    .filter((t) => now - t.timestamp < CONFIG.RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  for (const unresolved of recentUnresolved) {
    const daysSince = (now - unresolved.timestamp) / (1000 * 60 * 60 * 24);
    const probability = Math.min(0.9, 0.4 + (daysSince / CONFIG.RECENCY_WINDOW_DAYS) * 0.4);

    predictions.push({
      topic: unresolved.topic,
      category: unresolved.category,
      probability,
      emotionalIntensity: unresolved.emotionalIntensity,
      reasoning: [
        `Unresolved from ${Math.round(daysSince)} days ago`,
        unresolved.followUpNeeded ? 'Follow-up was needed' : '',
      ].filter(Boolean),
      preparationNeeded: ['Review previous discussion'],
      likelyToMinimize: false,
      lastDiscussed: new Date(unresolved.timestamp),
      unresolvedAspects: unresolved.unresolvedAspects,
    });
  }

  // Check recurring topics that are "due"
  for (const [topic, pattern] of profile.recurringTopics) {
    if (pattern.frequency < 2) continue; // Not recurring enough

    const lastOccurrence = profile.topicHistory
      .filter((t) => t.topic === topic)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (!lastOccurrence) continue;

    const daysSinceLast = (now - lastOccurrence.timestamp) / (1000 * 60 * 60 * 24);
    const expectedInterval = 30 / pattern.frequency;
    const overdueRatio = daysSinceLast / expectedInterval;

    if (overdueRatio > 0.7) {
      const probability = Math.min(0.8, 0.3 + overdueRatio * 0.3);

      predictions.push({
        topic,
        category: lastOccurrence.category,
        probability,
        emotionalIntensity: pattern.avgIntensity,
        reasoning: [
          `Recurring topic (${pattern.frequency.toFixed(1)}x/month)`,
          `${Math.round(daysSinceLast)} days since last discussion`,
        ],
        preparationNeeded: [],
        likelyToMinimize: pattern.resolutionRate < 0.5,
        lastDiscussed: new Date(lastOccurrence.timestamp),
        unresolvedAspects: lastOccurrence.unresolvedAspects,
      });
    }
  }

  // Check temporal patterns
  const matchingTemporalPatterns = profile.temporalPatterns.filter(
    (p) => p.dayOfWeek === undefined || p.dayOfWeek === dayOfWeek
  );

  for (const pattern of matchingTemporalPatterns) {
    for (const topic of pattern.likelyTopics) {
      if (!predictions.some((p) => p.topic === topic)) {
        predictions.push({
          topic,
          category: 'emotions', // Would be better inferred
          probability: pattern.confidence * 0.6,
          emotionalIntensity: 0.5,
          reasoning: [`Typical topic for ${getDayName(dayOfWeek)}`],
          preparationNeeded: [],
          likelyToMinimize: false,
          unresolvedAspects: [],
        });
      }
    }
  }

  // Check topic sequences
  if (context.previousConversationEnd) {
    const followUps = profile.topicSequences.get(context.previousConversationEnd);
    if (followUps && followUps.length > 0) {
      const topicCounts = new Map<string, number>();
      for (const topic of followUps) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      }

      for (const [topic, count] of topicCounts) {
        const probability = count / followUps.length;
        if (probability > 0.2 && !predictions.some((p) => p.topic === topic)) {
          predictions.push({
            topic,
            category: 'emotions',
            probability: probability * 0.7,
            emotionalIntensity: 0.5,
            reasoning: [`Often follows discussion of "${context.previousConversationEnd}"`],
            preparationNeeded: [],
            likelyToMinimize: false,
            unresolvedAspects: [],
          });
        }
      }
    }
  }

  // Sort by probability and limit
  predictions.sort((a, b) => b.probability - a.probability);
  return predictions.slice(0, CONFIG.MAX_PREDICTED_TOPICS);
}

function predictEmotionalState(
  profile: UserPreparationProfile,
  targetTime: Date,
  context: { userMood?: string; externalEvents?: string[] }
): ConversationPreparation['predictedEmotionalState'] {
  // If mood is known, use it
  if (context.userMood) {
    return {
      primaryEmotion: context.userMood,
      intensity: 0.6,
      stability: 'unknown',
      confidence: 0.7,
    };
  }

  // Default based on recent patterns
  const recentOutcomes = profile.outcomes.slice(-5);

  if (recentOutcomes.length > 0) {
    // Find most common emotional state
    const stateCounts = new Map<string, number>();
    for (const outcome of recentOutcomes) {
      const count = stateCounts.get(outcome.emotionalStateObserved) || 0;
      stateCounts.set(outcome.emotionalStateObserved, count + 1);
    }

    let maxCount = 0;
    let primaryEmotion = 'neutral';
    for (const [state, count] of stateCounts) {
      if (count > maxCount) {
        maxCount = count;
        primaryEmotion = state;
      }
    }

    return {
      primaryEmotion,
      intensity: 0.5,
      stability: maxCount >= 3 ? 'stable' : 'unknown',
      confidence: Math.min(0.8, 0.4 + maxCount * 0.1),
    };
  }

  return {
    primaryEmotion: 'neutral',
    intensity: 0.5,
    stability: 'unknown',
    confidence: 0.3,
  };
}

function predictNeeds(
  profile: UserPreparationProfile,
  targetTime: Date,
  context: { userMood?: string }
): ConversationPreparation['predictedNeeds'] {
  const needs: ConversationPreparation['predictedNeeds'] = [];
  const dayOfWeek = targetTime.getDay();
  const hourOfDay = targetTime.getHours();

  // Check needs history for patterns
  const recentNeeds = profile.needsHistory.slice(-20);
  const needCounts = new Map<ConversationNeed, number>();

  for (const entry of recentNeeds) {
    // Weight more heavily if same day/time
    const weight =
      (entry.dayOfWeek === dayOfWeek ? 1.5 : 1) *
      (Math.abs(entry.hourOfDay - hourOfDay) < 4 ? 1.3 : 1);

    const count = needCounts.get(entry.primaryNeed) || 0;
    needCounts.set(entry.primaryNeed, count + weight);
  }

  // Sort by count and create predictions
  const sortedNeeds = Array.from(needCounts.entries()).sort((a, b) => b[1] - a[1]);

  const totalWeight = sortedNeeds.reduce((sum, [_, w]) => sum + w, 0);

  for (const [need, weight] of sortedNeeds.slice(0, 3)) {
    needs.push({
      need,
      probability: weight / totalWeight,
      reasoning: `Based on ${profile.needsHistory.filter((n) => n.primaryNeed === need).length} past conversations`,
    });
  }

  // If no history, provide defaults based on mood
  if (needs.length === 0) {
    if (context.userMood === 'anxious' || context.userMood === 'stressed') {
      needs.push({ need: 'reassurance', probability: 0.6, reasoning: 'Typical for anxious mood' });
    } else if (context.userMood === 'happy' || context.userMood === 'excited') {
      needs.push({ need: 'celebration', probability: 0.5, reasoning: 'Typical for positive mood' });
    } else {
      needs.push({ need: 'connection', probability: 0.5, reasoning: 'Default need' });
    }
  }

  return needs;
}

function generateOpening(
  predictedTopics: PredictedTopic[],
  emotionalState: ConversationPreparation['predictedEmotionalState'],
  needs: ConversationPreparation['predictedNeeds'],
  context: { knownTopic?: string }
): ConversationPreparation['suggestedOpening'] {
  const primaryNeed = needs[0]?.need;
  const emotion = emotionalState.primaryEmotion;

  // Generate based on primary need
  let phrase: string;
  let rationale: string;
  const alternatives: string[] = [];

  if (context.knownTopic) {
    phrase = `So, ${context.knownTopic}... tell me what's on your mind.`;
    rationale = 'Direct opening for known topic';
    alternatives.push(`I've been thinking about you and ${context.knownTopic}. How are you?`);
  } else if (primaryNeed === 'validation') {
    phrase = `How are you really doing?`;
    rationale = 'Open-ended to allow for sharing';
    alternatives.push(`I'm here for you. What's going on?`);
  } else if (primaryNeed === 'celebration') {
    phrase = `Something feels different! Tell me what's happening.`;
    rationale = 'Invites sharing of good news';
    alternatives.push(`I sense something good - what's up?`);
  } else if (primaryNeed === 'processing') {
    phrase = `Take your time... what's been on your mind?`;
    rationale = 'Creates space for working through thoughts';
    alternatives.push(`I'm here to think through things with you.`);
  } else if (primaryNeed === 'reassurance' || emotion === 'anxious') {
    phrase = `Hey. I'm here. How are you?`;
    rationale = 'Grounding, calm presence';
    alternatives.push(`Take a breath. I'm listening.`);
  } else if (primaryNeed === 'venting') {
    phrase = `What do you need to get off your chest?`;
    rationale = 'Direct permission to release';
    alternatives.push(`I'm all ears. Let it out.`);
  } else {
    phrase = `What's on your mind today?`;
    rationale = 'Neutral, open invitation';
    alternatives.push(`How's your world?`, `What's brewing for you?`);
  }

  return { phrase, rationale, alternatives };
}

function identifyProactiveTopics(
  profile: UserPreparationProfile,
  predictedTopics: PredictedTopic[],
  context: { externalEvents?: string[] }
): ConversationPreparation['topicsToProactivelyRaise'] {
  const proactive: ConversationPreparation['topicsToProactivelyRaise'] = [];

  // Check for topics they've been avoiding (high intensity but not bringing up)
  for (const [topic, pattern] of profile.recurringTopics) {
    if (pattern.avgIntensity > 0.6 && pattern.resolutionRate < 0.3) {
      const lastOccurrence = profile.topicHistory
        .filter((t) => t.topic === topic)
        .sort((a, b) => b.timestamp - a.timestamp)[0];

      if (!lastOccurrence) continue;

      const daysSince = (Date.now() - lastOccurrence.timestamp) / (1000 * 60 * 60 * 24);

      if (daysSince > 7 && !lastOccurrence.userInitiated) {
        proactive.push({
          topic,
          why: `High emotional importance (${Math.round(pattern.avgIntensity * 100)}%) but rarely resolved`,
          approach: 'Gently create space without forcing',
          timing: 'when_ready',
          sensitivity: 'high',
        });
      }
    }
  }

  // Check for follow-ups that are overdue
  const unresolvedFollowUps = profile.topicHistory
    .filter((t) => t.followUpNeeded && !t.resolved)
    .filter((t) => !predictedTopics.some((p) => p.topic === t.topic));

  for (const followUp of unresolvedFollowUps.slice(0, 2)) {
    proactive.push({
      topic: followUp.topic,
      why: 'Follow-up needed from previous conversation',
      approach: `How did ${followUp.topic} go?`,
      timing: 'middle',
      sensitivity: 'moderate',
    });
  }

  // External events might warrant check-in
  if (context.externalEvents) {
    for (const event of context.externalEvents) {
      proactive.push({
        topic: event,
        why: 'External event may be affecting them',
        approach: 'Check in about impact',
        timing: 'when_ready',
        sensitivity: 'moderate',
      });
    }
  }

  return proactive.slice(0, 3);
}

function identifyWarmupTopics(
  profile: UserPreparationProfile,
  predictedTopics: PredictedTopic[]
): string[] {
  const warmup: string[] = [];

  // Find low-intensity topics they enjoy
  const lightTopics = profile.topicHistory
    .filter((t) => t.emotionalIntensity < 0.4)
    .map((t) => t.topic);

  const topicCounts = new Map<string, number>();
  for (const topic of lightTopics) {
    topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
  }

  // Get most common light topics
  const sortedLight = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic]) => topic);

  warmup.push(...sortedLight);

  // Add generic warmups if needed
  if (warmup.length < 2) {
    warmup.push('how their day has been', 'recent small wins');
  }

  return warmup;
}

function identifyTopicsToAvoid(
  profile: UserPreparationProfile,
  context: { externalEvents?: string[] }
): ConversationPreparation['topicsToAvoid'] {
  const avoid: ConversationPreparation['topicsToAvoid'] = [];

  // Find topics with very negative outcomes
  const recentNegatives = profile.outcomes
    .filter((o) => o.satisfactionLevel < 0.3)
    .flatMap((o) => o.topicsDiscussed);

  const negativeCounts = new Map<string, number>();
  for (const topic of recentNegatives) {
    negativeCounts.set(topic, (negativeCounts.get(topic) || 0) + 1);
  }

  for (const [topic, count] of negativeCounts) {
    if (count >= 2) {
      avoid.push({
        topic,
        reason: 'Has led to negative outcomes recently',
      });
    }
  }

  return avoid;
}

function gatherRelevantContext(
  profile: UserPreparationProfile,
  predictedTopics: PredictedTopic[]
): ConversationPreparation['relevantContext'] {
  const context: ConversationPreparation['relevantContext'] = [];

  // Get relevant history for predicted topics
  for (const topic of predictedTopics) {
    const history = profile.topicHistory
      .filter((t) => t.topic === topic.topic)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (history) {
      context.push({
        fact: `Last discussed "${topic.topic}" ${formatTimeAgo(history.timestamp)}`,
        importance: 0.7,
        shouldMention: false,
      });

      if (history.unresolvedAspects.length > 0) {
        context.push({
          fact: `Unresolved: ${history.unresolvedAspects.join(', ')}`,
          importance: 0.8,
          shouldMention: true,
        });
      }
    }
  }

  return context.slice(0, 5);
}

function determinePacing(
  emotionalState: ConversationPreparation['predictedEmotionalState'],
  needs: ConversationPreparation['predictedNeeds'],
  context: { userMood?: string }
): ConversationPreparation['pacing'] {
  const primaryNeed = needs[0]?.need;
  const emotion = emotionalState.primaryEmotion;

  let recommendedLength: 'brief' | 'normal' | 'extended' = 'normal';
  let energyLevel: 'calm' | 'moderate' | 'energetic' = 'moderate';
  let depthLevel: 'surface' | 'moderate' | 'deep' = 'moderate';

  if (primaryNeed === 'processing' || primaryNeed === 'reflection') {
    recommendedLength = 'extended';
    depthLevel = 'deep';
    energyLevel = 'calm';
  } else if (primaryNeed === 'venting') {
    recommendedLength = 'extended';
    energyLevel = 'moderate';
    depthLevel = 'moderate';
  } else if (primaryNeed === 'celebration') {
    energyLevel = 'energetic';
    depthLevel = 'surface';
  } else if (primaryNeed === 'reassurance' || emotion === 'anxious') {
    energyLevel = 'calm';
    depthLevel = 'moderate';
  }

  return { recommendedLength, energyLevel, depthLevel };
}

function calculateOverallConfidence(
  profile: UserPreparationProfile,
  topics: PredictedTopic[],
  emotionalState: ConversationPreparation['predictedEmotionalState'],
  needs: ConversationPreparation['predictedNeeds']
): number {
  // Base confidence on data quality
  let confidence = 0.3;

  // More topic history = more confident
  confidence += Math.min(0.2, profile.topicHistory.length * 0.005);

  // More outcomes = better calibration
  confidence += Math.min(0.15, profile.outcomes.length * 0.005);

  // Good prediction accuracy increases confidence
  if (profile.outcomes.length > 5) {
    const recentAccuracy =
      profile.outcomes
        .slice(-5)
        .reduce(
          (sum, o) =>
            sum +
            o.predictedTopicsHit.length /
              Math.max(1, o.predictedTopicsHit.length + o.unexpectedTopics.length),
          0
        ) / 5;
    confidence += recentAccuracy * 0.15;
  }

  // High-probability predictions increase confidence
  if (topics.length > 0 && topics[0].probability > 0.7) {
    confidence += 0.1;
  }

  return Math.min(0.9, confidence);
}

function getDayName(day: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[day];
}

function formatTimeAgo(timestamp: number): string {
  const days = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  return `${Math.floor(days / 7)} weeks ago`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const conversationPreparation = {
  recordTopicDiscussion,
  recordConversationNeed,
  recordConversationOutcome,
  recordTemporalPattern,
  prepareForConversation,
  buildConversationPrepContext,
};

export default conversationPreparation;
