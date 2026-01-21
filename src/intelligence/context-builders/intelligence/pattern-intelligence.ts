/**
 * Pattern Surfacing Context Builder
 *
 * > "Better than human means understanding things humans don't notice about themselves."
 *
 * This is a SUPERHUMAN capability: noticing patterns that the user
 * cannot see about themselves and surfacing them at the right moment.
 *
 * Types of patterns we surface:
 * 1. **Behavioral Patterns**: "You tend to X when Y"
 * 2. **Emotional Patterns**: "I've noticed you feel X around Z"
 * 3. **Time Patterns**: "This time of week/month/year seems to be..."
 * 4. **Avoidance Patterns**: "We always seem to steer away from..."
 * 5. **Success Patterns**: "When things go well for you, X is usually present"
 * 6. **Language Patterns**: "You use X word a lot when talking about Y"
 * 7. **Relationship Patterns**: "Your interactions with X tend to follow..."
 *
 * Philosophy:
 * - Surface patterns WITH PERMISSION (relationship depth matters)
 * - Be CURIOUS, not clinical ("I've noticed" not "You exhibit")
 * - Allow them to REJECT the observation gracefully
 * - TIMING is everything (not during crisis)
 *
 * @module PatternSurfacing
 */

import { getBetterThanHumanTelemetry } from '../../../services/analytics/better-than-human-telemetry.js';
import { getLogger } from '../../../utils/safe-logger.js';
import {
  createHintInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export type PatternType =
  | 'behavioral'
  | 'emotional'
  | 'time_based'
  | 'avoidance'
  | 'success'
  | 'language'
  | 'relationship';

export interface DetectedPattern {
  id: string;
  type: PatternType;
  userId: string;

  /** The pattern itself */
  pattern: string;

  /** Evidence for this pattern */
  evidence: PatternEvidence[];

  /** How confident are we (0-1) */
  confidence: number;

  /** How sensitive is this topic (0-1) */
  sensitivity: number;

  /** Minimum relationship stage to surface */
  minRelationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

  /** Has been surfaced */
  surfaced: boolean;
  surfacedAt?: Date;

  /** User's reaction when surfaced */
  reaction?: 'resonated' | 'neutral' | 'rejected';

  /** First detected */
  firstDetectedAt: Date;

  /** Times this pattern was observed */
  observationCount: number;
}

export interface PatternEvidence {
  date: Date;
  description: string;
  sessionId?: string;
}

export interface PatternSurfacingContext {
  pattern: DetectedPattern;
  suggestedPhrasing: string;
  timing: 'now' | 'wait' | 'not_yet';
  reason: string;
}

// ============================================================================
// PATTERN DETECTION
// ============================================================================

/** Minimum observations to consider a pattern */
const MIN_OBSERVATIONS = 3;

/** Confidence thresholds by relationship stage - LOWERED to enable earlier pattern sharing */
const CONFIDENCE_THRESHOLDS: Record<string, number> = {
  stranger: 0.95, // Very high bar, but possible for strong patterns
  acquaintance: 0.75, // Lower bar - let them feel seen earlier
  friend: 0.6,
  trusted_advisor: 0.5,
};

/** Sensitivity thresholds by relationship stage - INCREASED to allow more patterns */
const SENSITIVITY_THRESHOLDS: Record<string, number> = {
  stranger: 0.2, // Allow low-sensitivity patterns (time-based, language)
  acquaintance: 0.5, // Allow moderate patterns
  friend: 0.75,
  trusted_advisor: 0.95,
};

// ============================================================================
// PATTERN TRACKER
// ============================================================================

/**
 * Pattern tracking state (per user)
 */
interface PatternState {
  patterns: Map<string, DetectedPattern>;
  lastSurfacedTurn: number;
  topicMentions: Map<string, { count: number; contexts: string[] }>;
  emotionByTopic: Map<string, { emotion: string; count: number }[]>;
  timingPatterns: Map<string, { dayOfWeek: number; count: number }[]>;
  avoidedTopics: Map<string, { mentions: number; deflections: number }>;
  /** Track stated intentions vs reported actions (contradiction detection) */
  statedIntentions: Map<string, { stated: string; statedAt: Date; context: string }>;
  reportedActions: Map<string, { action: string; reportedAt: Date; context: string }[]>;
}

const patternStates = new Map<string, PatternState>();

function getPatternState(userId: string): PatternState {
  if (!patternStates.has(userId)) {
    patternStates.set(userId, {
      patterns: new Map(),
      lastSurfacedTurn: 0,
      topicMentions: new Map(),
      emotionByTopic: new Map(),
      timingPatterns: new Map(),
      avoidedTopics: new Map(),
      statedIntentions: new Map(),
      reportedActions: new Map(),
    });
  }
  return patternStates.get(userId)!;
}

// ============================================================================
// PATTERN DETECTION FUNCTIONS
// ============================================================================

/**
 * Record an observation for pattern detection
 */
function recordObservation(
  userId: string,
  data: {
    topic?: string;
    emotion?: { primary: string; intensity: number };
    userMessage: string;
    timestamp: Date;
  }
): void {
  const state = getPatternState(userId);
  const { topic, emotion, userMessage, timestamp } = data;
  const dayOfWeek = timestamp.getDay();

  // Track topic mentions
  if (topic) {
    const existing = state.topicMentions.get(topic) || { count: 0, contexts: [] };
    existing.count++;
    if (existing.contexts.length < 10) {
      existing.contexts.push(userMessage.slice(0, 100));
    }
    state.topicMentions.set(topic, existing);

    // Track emotion by topic
    if (emotion) {
      const emotionList = state.emotionByTopic.get(topic) || [];
      const existingEmotion = emotionList.find((e) => e.emotion === emotion.primary);
      if (existingEmotion) {
        existingEmotion.count++;
      } else {
        emotionList.push({ emotion: emotion.primary, count: 1 });
      }
      state.emotionByTopic.set(topic, emotionList);
    }

    // Track timing patterns
    const timingList = state.timingPatterns.get(topic) || [];
    const existingTiming = timingList.find((t) => t.dayOfWeek === dayOfWeek);
    if (existingTiming) {
      existingTiming.count++;
    } else {
      timingList.push({ dayOfWeek, count: 1 });
    }
    state.timingPatterns.set(topic, timingList);
  }

  // Detect avoidance (topic mentioned but quickly deflected)
  const deflectionPatterns = /anyway|but that's not|let's talk about|never mind|forget it/i;
  if (topic && deflectionPatterns.test(userMessage)) {
    const avoided = state.avoidedTopics.get(topic) || { mentions: 0, deflections: 0 };
    avoided.deflections++;
    state.avoidedTopics.set(topic, avoided);
  }

  // CONTRADICTION DETECTION: Track stated intentions
  const intentionPatterns = [
    /i (?:want|need|should|have) to (.+?)(?:\.|,|$)/i,
    /i'm going to (.+?)(?:\.|,|$)/i,
    /i plan to (.+?)(?:\.|,|$)/i,
    /i'll (.+?)(?:\.|,|$)/i,
    /i need to start (.+?)(?:\.|,|$)/i,
    /i really should (.+?)(?:\.|,|$)/i,
  ];

  for (const pattern of intentionPatterns) {
    const match = userMessage.match(pattern);
    if (match && match[1]) {
      const intention = match[1].trim().toLowerCase();
      // Only track meaningful intentions (more than 2 words)
      if (intention.split(' ').length >= 2) {
        state.statedIntentions.set(intention, {
          stated: intention,
          statedAt: timestamp,
          context: userMessage.slice(0, 150),
        });
      }
    }
  }

  // Track reported actions/behaviors that might contradict intentions
  const actionPatterns = [
    /i (?:didn't|haven't|never|can't seem to|keep not) (.+?)(?:\.|,|$)/i,
    /i ended up (.+?)(?:\.|,|$)/i,
    /i keep (.+?)(?:\.|,|$)/i,
    /i still (.+?)(?:\.|,|$)/i,
    /i always (.+?)(?:\.|,|$)/i,
  ];

  for (const pattern of actionPatterns) {
    const match = userMessage.match(pattern);
    if (match && match[1]) {
      const action = match[1].trim().toLowerCase();
      const existing = state.reportedActions.get(action) || [];
      existing.push({
        action,
        reportedAt: timestamp,
        context: userMessage.slice(0, 150),
      });
      state.reportedActions.set(action, existing);
    }
  }
}

/**
 * Analyze patterns from accumulated observations
 */
async function analyzePatterns(userId: string): Promise<DetectedPattern[]> {
  const state = getPatternState(userId);
  const patterns: DetectedPattern[] = [];

  // 1. Emotional patterns by topic
  for (const [topic, emotions] of state.emotionByTopic) {
    // Find dominant emotion for this topic
    const sorted = emotions.sort((a, b) => b.count - a.count);
    const dominant = sorted[0];

    if (dominant && dominant.count >= MIN_OBSERVATIONS) {
      const totalMentions = emotions.reduce((sum, e) => sum + e.count, 0);
      const confidence = dominant.count / totalMentions;

      if (confidence >= 0.6) {
        patterns.push({
          id: `emotional_${topic}_${dominant.emotion}`,
          type: 'emotional',
          userId,
          pattern: `tends to feel ${dominant.emotion} when discussing ${topic}`,
          evidence: [
            {
              date: new Date(),
              description: `${dominant.count}/${totalMentions} times showed ${dominant.emotion} with ${topic}`,
            },
          ],
          confidence,
          sensitivity: 0.5, // Emotional patterns are moderately sensitive
          minRelationshipStage: 'friend',
          surfaced: false,
          firstDetectedAt: new Date(),
          observationCount: dominant.count,
        });
      }
    }
  }

  // 2. Time-based patterns
  for (const [topic, timings] of state.timingPatterns) {
    const sorted = timings.sort((a, b) => b.count - a.count);
    const dominant = sorted[0];

    if (dominant && dominant.count >= MIN_OBSERVATIONS) {
      const totalMentions = timings.reduce((sum, t) => sum + t.count, 0);
      const confidence = dominant.count / totalMentions;

      if (confidence >= 0.5) {
        const dayNames = [
          'Sunday',
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
        ];
        patterns.push({
          id: `timing_${topic}_${dominant.dayOfWeek}`,
          type: 'time_based',
          userId,
          pattern: `often brings up ${topic} on ${dayNames[dominant.dayOfWeek]}s`,
          evidence: [
            {
              date: new Date(),
              description: `${dominant.count}/${totalMentions} mentions on ${dayNames[dominant.dayOfWeek]}`,
            },
          ],
          confidence: confidence * 0.8, // Time patterns need more evidence
          sensitivity: 0.2,
          minRelationshipStage: 'acquaintance',
          surfaced: false,
          firstDetectedAt: new Date(),
          observationCount: dominant.count,
        });
      }
    }
  }

  // 3. Avoidance patterns
  for (const [topic, data] of state.avoidedTopics) {
    if (data.mentions >= MIN_OBSERVATIONS && data.deflections >= 2) {
      const deflectionRate = data.deflections / data.mentions;

      if (deflectionRate >= 0.3) {
        patterns.push({
          id: `avoidance_${topic}`,
          type: 'avoidance',
          userId,
          pattern: `seems to avoid going deep on ${topic}`,
          evidence: [
            {
              date: new Date(),
              description: `${data.deflections}/${data.mentions} times deflected from ${topic}`,
            },
          ],
          confidence: deflectionRate,
          sensitivity: 0.8, // Avoidance is sensitive
          minRelationshipStage: 'trusted_advisor',
          surfaced: false,
          firstDetectedAt: new Date(),
          observationCount: data.mentions,
        });
      }
    }
  }

  // 4. Language patterns (frequent words/phrases)
  const wordCounts = new Map<string, number>();
  for (const [, data] of state.topicMentions) {
    for (const context of data.contexts) {
      // Extract notable words
      const words = context
        .toLowerCase()
        .match(/\b(always|never|should|can't|won't|must|have to|supposed to)\b/g);
      if (words) {
        for (const word of words) {
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        }
      }
    }
  }

  for (const [word, count] of wordCounts) {
    if (count >= MIN_OBSERVATIONS * 2) {
      patterns.push({
        id: `language_${word}`,
        type: 'language',
        userId,
        pattern: `frequently uses the word "${word}"`,
        evidence: [
          {
            date: new Date(),
            description: `Used "${word}" ${count} times`,
          },
        ],
        confidence: Math.min(count / 20, 1),
        sensitivity: 0.3,
        minRelationshipStage: 'acquaintance',
        surfaced: false,
        firstDetectedAt: new Date(),
        observationCount: count,
      });
    }
  }

  // 5. CONTRADICTION PATTERNS (say vs do)
  // Look for stated intentions that contradict reported actions
  for (const [intention, intentionData] of state.statedIntentions) {
    // Check if they've reported contrary actions
    const contraryKeywords = extractKeywords(intention);

    for (const [action, actionList] of state.reportedActions) {
      // Check for semantic overlap (simplified - keyword matching)
      const actionKeywords = extractKeywords(action);
      const overlap = contraryKeywords.filter((k) => actionKeywords.includes(k));

      if (overlap.length >= 1 && actionList.length >= 2) {
        // Potential contradiction found
        const daysSinceIntention = Math.floor(
          (Date.now() - intentionData.statedAt.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Only flag if intention was stated before actions reported
        if (daysSinceIntention >= 1) {
          patterns.push({
            id: `contradiction_${intention.slice(0, 20)}_${action.slice(0, 20)}`,
            type: 'behavioral',
            userId,
            pattern: `stated wanting to "${intention}" but reported "${action}" ${actionList.length} times`,
            evidence: [
              {
                date: new Date(),
                description: `Said "${intentionData.context.slice(0, 50)}..." then later "${actionList[0].context.slice(0, 50)}..."`,
              },
            ],
            confidence: Math.min(0.6 + actionList.length * 0.1, 0.9),
            sensitivity: 0.7, // Contradictions are sensitive
            minRelationshipStage: 'acquaintance', // Lowered from friend - earlier noticing
            surfaced: false,
            firstDetectedAt: intentionData.statedAt,
            observationCount: actionList.length + 1,
          });
        }
      }
    }
  }

  // 6. BEHAVIORAL PATTERN DETECTOR INTEGRATION
  // Use the specialized behavioral pattern detector for deeper analysis
  try {
    const { getBehavioralPatternDetector } =
      await import('../../../memory/behavioral-pattern-detector.js');
    const detector = getBehavioralPatternDetector();

    // Get existing patterns from the detector
    const behavioralPatterns = await detector.getPatterns(userId);

    for (const bp of behavioralPatterns) {
      // Convert to DetectedPattern format
      // Map patternType to our PatternType (behavioral patterns are 'behavioral' type)
      patterns.push({
        id: `behavioral_${bp.patternType}_${Date.now()}`,
        type: 'behavioral' as PatternType,
        userId,
        pattern: bp.description,
        evidence: [
          {
            date: new Date(),
            description: bp.implication,
          },
        ],
        confidence: bp.confidence,
        sensitivity: 0.5, // Default sensitivity for behavioral patterns
        minRelationshipStage: bp.confidence > 0.7 ? 'friend' : 'trusted_advisor',
        surfaced: false,
        firstDetectedAt: bp.firstObserved || new Date(),
        observationCount: bp.frequency || 3,
      });
    }
  } catch (error) {
    // Behavioral detector not available or failed - continue with existing patterns
    log.debug({ error: String(error) }, 'Behavioral pattern detector unavailable');
  }

  return patterns;
}

/**
 * Extract meaningful keywords from a phrase for comparison
 */
function extractKeywords(phrase: string): string[] {
  const stopWords = [
    'i',
    'to',
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'for',
    'of',
    'it',
    'my',
    'me',
    'be',
  ];
  return phrase
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.includes(word));
}

// ============================================================================
// SURFACING LOGIC
// ============================================================================

/**
 * Get a pattern to surface if appropriate
 */
async function getPatternToSurface(
  userId: string,
  relationshipStage: string,
  turnCount: number,
  emotionalContext: { isHeavy: boolean; isPositive: boolean }
): Promise<PatternSurfacingContext | null> {
  const state = getPatternState(userId);

  // Don't surface too frequently - but earlier is okay for acquaintances
  const minTurnsBetween =
    relationshipStage === 'stranger' ? 20 : relationshipStage === 'acquaintance' ? 10 : 8;
  if (turnCount - state.lastSurfacedTurn < minTurnsBetween) {
    return null;
  }

  // Don't surface during heavy emotional moments
  if (emotionalContext.isHeavy) {
    return null;
  }

  // Get analyzed patterns
  const patterns = await analyzePatterns(userId);

  // Filter by eligibility
  const eligible = patterns.filter((p) => {
    if (p.surfaced) return false;

    // Check relationship stage
    const stages = ['stranger', 'acquaintance', 'friend', 'trusted_advisor'];
    const minIndex = stages.indexOf(p.minRelationshipStage);
    const currentIndex = stages.indexOf(relationshipStage);
    if (currentIndex < minIndex) return false;

    // Check confidence threshold
    const threshold = CONFIDENCE_THRESHOLDS[relationshipStage] || 1;
    if (p.confidence < threshold) return false;

    // Check sensitivity threshold
    const sensitivityThreshold = SENSITIVITY_THRESHOLDS[relationshipStage] || 0;
    if (p.sensitivity > sensitivityThreshold) return false;

    return true;
  });

  if (eligible.length === 0) {
    return null;
  }

  // Sort by confidence
  eligible.sort((a, b) => b.confidence - a.confidence);

  const selected = eligible[0];

  // Generate phrasing
  const phrasing = generatePatternPhrasing(selected);

  // Mark as surfaced
  selected.surfaced = true;
  selected.surfacedAt = new Date();
  state.lastSurfacedTurn = turnCount;
  state.patterns.set(selected.id, selected);

  return {
    pattern: selected,
    suggestedPhrasing: phrasing,
    timing: 'now',
    reason: `Confidence: ${(selected.confidence * 100).toFixed(0)}%, Observations: ${selected.observationCount}`,
  };
}

/**
 * Generate natural phrasing for pattern surfacing
 */
function generatePatternPhrasing(pattern: DetectedPattern): string {
  const phrases: Record<PatternType, string[]> = {
    emotional: [
      `I've noticed something... when we talk about ${getTopicFromPattern(pattern)}, there's often a ${getEmotionFromPattern(pattern)} energy. Is that something you've noticed too?`,
      `Can I share an observation? It seems like ${getTopicFromPattern(pattern)} brings up some ${getEmotionFromPattern(pattern)} feelings for you. Does that resonate?`,
    ],
    time_based: [
      `This might sound random, but I've noticed you often bring up ${getTopicFromPattern(pattern)} around this time. Is there something about ${getDayFromPattern(pattern)}s?`,
      `I've been thinking... ${getTopicFromPattern(pattern)} seems to come up a lot on ${getDayFromPattern(pattern)}s. Coincidence, or is there something there?`,
    ],
    avoidance: [
      `I want to name something gently... we've touched on ${getTopicFromPattern(pattern)} a few times, but we always seem to move past it quickly. Is that intentional?`,
      `I've noticed we dance around ${getTopicFromPattern(pattern)} sometimes. I'm not pushing - just curious if you've noticed that too?`,
    ],
    behavioral: [
      `Something I've picked up on: you tend to ${pattern.pattern}. Have you noticed that pattern?`,
      // Contradiction-specific phrasings
      pattern.pattern.includes('stated wanting')
        ? `Can I name something gently? You mentioned wanting to ${getIntentionFromPattern(pattern)}, but it sounds like ${getActionFromPattern(pattern)} keeps happening. No judgment - I'm just noticing.`
        : `I've observed something about your patterns. Want to hear it?`,
      pattern.pattern.includes('stated wanting')
        ? `There's a gap I'm noticing - between what you say you want and what's actually happening. That's not a criticism. It's just... interesting. What do you think is getting in the way?`
        : `I've been tracking something. You might find it useful - or you might tell me I'm wrong.`,
    ],
    success: [
      `I've been tracking something positive: when ${pattern.pattern}, things tend to go well for you. Have you noticed that connection?`,
    ],
    language: [
      `I've noticed you use "${getWordFromPattern(pattern)}" a lot. Words carry weight - does that word feel significant to you?`,
    ],
    relationship: [
      `I've observed a pattern in how you talk about ${getTopicFromPattern(pattern)}. Would it be okay to share what I've noticed?`,
    ],
  };

  const options = phrases[pattern.type] || phrases.behavioral;
  return options[Math.floor(Math.random() * options.length)];
}

// Helper functions to extract info from pattern string
function getTopicFromPattern(pattern: DetectedPattern): string {
  const match = pattern.pattern.match(/(?:discussing|about|on) ([^,]+)/);
  return match?.[1] || 'this topic';
}

function getEmotionFromPattern(pattern: DetectedPattern): string {
  const match = pattern.pattern.match(/feel (\w+)/);
  return match?.[1] || 'certain';
}

function getDayFromPattern(pattern: DetectedPattern): string {
  const match = pattern.pattern.match(/on (\w+)s/);
  return match?.[1] || 'certain day';
}

function getWordFromPattern(pattern: DetectedPattern): string {
  const match = pattern.pattern.match(/"([^"]+)"/);
  return match?.[1] || 'this word';
}

function getIntentionFromPattern(pattern: DetectedPattern): string {
  // Try multiple patterns for extracting intention
  const match =
    pattern.pattern.match(/wanting to "([^"]+)"/) || pattern.pattern.match(/tends? to (\w+ \w+)/);
  return match?.[1] || 'do this';
}

function getActionFromPattern(pattern: DetectedPattern): string {
  // Try multiple patterns for extracting action
  const match =
    pattern.pattern.match(/reported "([^"]+)"/) || pattern.pattern.match(/now (?:you )?(\w+ \w+)/);
  return match?.[1] || 'do that';
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build pattern surfacing context injections
 */
async function buildPatternSurfacingContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { userProfile, userData, analysis, services, userText } = input;
  const injections: ContextInjection[] = [];

  if (!userProfile || !services.userId) {
    return injections;
  }

  const turnCount = userData.turnCount || 0;
  const currentTopic = analysis.topics.primary || analysis.topics.detected[0];

  // Record this turn's observation
  recordObservation(services.userId, {
    topic: currentTopic,
    emotion: analysis.emotion
      ? { primary: analysis.emotion.primary, intensity: analysis.emotion.intensity }
      : undefined,
    userMessage: userText || '',
    timestamp: new Date(),
  });

  // Get relationship stage
  const relationshipStage = userProfile.relationshipStage || 'acquaintance';

  // Check if we should surface a pattern
  const patternContext = await getPatternToSurface(services.userId, relationshipStage, turnCount, {
    isHeavy: analysis.emotion?.needsSupport || false,
    isPositive: analysis.emotion?.valence === 'positive',
  });

  if (patternContext) {
    injections.push(
      createHintInjection('pattern_surfacing', formatPatternForPrompt(patternContext), {
        category: 'insight',
        confidence: patternContext.pattern.confidence,
      })
    );

    log.debug(
      { type: patternContext.pattern.type, confidence: patternContext.pattern.confidence },
      '🔍 Pattern ready to surface'
    );

    // Track telemetry
    const telemetry = getBetterThanHumanTelemetry();
    telemetry.trackPatternSurfaced(
      services.userId,
      services.personaId || 'ferni',
      patternContext.pattern.id
    );
  }

  return injections;
}

/**
 * Format pattern for prompt injection
 */
function formatPatternForPrompt(context: PatternSurfacingContext): string {
  return `[🔍 PATTERN OBSERVATION]
You've noticed a pattern about this user over time.

PATTERN TYPE: ${context.pattern.type}
OBSERVATION: ${context.pattern.pattern}
CONFIDENCE: ${(context.pattern.confidence * 100).toFixed(0)}%
EVIDENCE: ${context.pattern.observationCount} observations

SUGGESTED PHRASING:
"${context.suggestedPhrasing}"

IMPORTANT GUIDELINES:
- This is an observation, not a diagnosis
- Present it as a question, not a fact
- Let them confirm or deny
- If they reject it, accept gracefully
- This is a gift of insight, not a confrontation`;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'pattern_surfacing',
  description: 'Surfaces observed patterns about the user at appropriate moments',
  priority: 65, // Medium priority - after core context, before casual
  build: buildPatternSurfacingContext,
});

// ============================================================================
// EXPORTS
// ============================================================================

export {
  analyzePatterns,
  buildPatternSurfacingContext,
  generatePatternPhrasing,
  getPatternToSurface,
  recordObservation,
};

export default {
  recordObservation,
  analyzePatterns,
  getPatternToSurface,
  buildPatternSurfacingContext,
};
