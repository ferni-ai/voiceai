/**
 * Signal Integration - Better Than Human v4
 *
 * Feeds data from turn processing into the 8 superhuman predictive capabilities.
 *
 * This module connects the existing analysis pipeline to the new predictive
 * systems, allowing them to learn from every conversation.
 *
 * Integration points:
 * - Turn processing → Multiple capability updates
 * - Topic detection → Avoidance, Conversation Prep
 * - Emotion detection → Pre-trajectory, Cognitive Fingerprint
 * - Conversation outcomes → Intervention Timing, Breakthrough
 * - Session events → Life Phase, Ripple Effects
 *
 * @module intelligence/predictive/signal-integration
 */

import { createLogger } from '../../utils/safe-logger.js';

// Import all superhuman capabilities
import { avoidancePrediction } from './avoidance-prediction.js';
import { breakthroughProximity, type IndicatorType } from './breakthrough-proximity.js';
import { preTrajectoryDetection, type PrecursorSignal } from './pre-trajectory-detection.js';
import { conversationPreparation, type ConversationNeed, type TopicCategory } from './conversation-preparation.js';
import { cognitiveFingerprint, type DecisionStyle, type StressResponse } from './cognitive-fingerprint.js';
import { rippleEffectPrediction, type LifeDomain, type EventType } from './ripple-effect-prediction.js';
import { lifePhasePrediction, type PhaseSignal } from './life-phase-prediction.js';
import { interventionTiming, type InterventionType } from './intervention-timing.js';

const log = createLogger({ module: 'PredictiveSignalIntegration' });

// ============================================================================
// TURN PROCESSING INTEGRATION
// ============================================================================

/**
 * Process a conversation turn through all superhuman capabilities
 *
 * Call this after every turn to feed the prediction systems.
 *
 * @param userId - User ID
 * @param turnData - Data from the turn
 */
export async function processTurnForSuperhumanLearning(
  userId: string,
  turnData: {
    // User message
    userMessage: string;
    // Analysis results
    emotion?: {
      primary?: string;
      intensity?: number;
      valence?: 'positive' | 'negative' | 'neutral';
      distressLevel?: number;
      isVenting?: boolean;
      needsSupport?: boolean;
    };
    topic?: {
      primary?: string;
      secondary?: string[];
      category?: string;
    };
    // Conversation state
    conversationContext?: {
      turnCount?: number;
      sessionDuration?: number;
      daysSinceLastConversation?: number;
    };
    // Response data
    responseData?: {
      responseType?: string;
      depth?: 'surface' | 'moderate' | 'deep';
      userEngagement?: number;
    };
  }
): Promise<void> {
  try {
    // =========================================
    // 1. PRE-TRAJECTORY DETECTION
    // Feed emotional and behavioral signals
    // =========================================
    const emotionalVolatility = turnData.emotion?.distressLevel
      ? Math.min(1, turnData.emotion.distressLevel * 1.5)
      : undefined;

    preTrajectoryDetection.recordConversationSignals(userId, {
      emotionalValence: turnData.emotion?.valence === 'positive' ? 0.7 :
        turnData.emotion?.valence === 'negative' ? -0.7 : 0,
      emotionalVolatility,
      selfTalkValence: detectSelfTalkValence(turnData.userMessage),
      futureOrientation: detectFutureOrientation(turnData.userMessage),
      socialMentions: detectSocialMentions(turnData.userMessage),
      topicDiversity: turnData.topic?.secondary?.length ? 
        Math.min(1, turnData.topic.secondary.length * 0.2) : 0.3,
    });

    // =========================================
    // 2. CONVERSATION PREPARATION
    // Record topic discussion for learning
    // =========================================
    if (turnData.topic?.primary) {
      conversationPreparation.recordTopicDiscussion(userId, {
        topic: turnData.topic.primary,
        category: mapToTopicCategory(turnData.topic.category),
        emotionalIntensity: turnData.emotion?.intensity || 0.5,
        resolved: false,  // Will be updated at conversation end
        unresolvedAspects: [],
        followUpNeeded: turnData.emotion?.needsSupport || false,
        userInitiated: true,
      });
    }

    // Record conversation need
    const detectedNeed = detectConversationNeed(turnData);
    if (detectedNeed) {
      conversationPreparation.recordConversationNeed(userId, detectedNeed);
    }

    // =========================================
    // 3. AVOIDANCE DETECTION
    // Look for deflection patterns
    // =========================================
    const deflectionAnalysis = detectDeflection(turnData);
    if (deflectionAnalysis.detected && deflectionAnalysis.topic && deflectionAnalysis.style) {
      avoidancePrediction.recordDeflection(
        userId,
        deflectionAnalysis.topic,
        deflectionAnalysis.style,
        {
          triggerTopic: turnData.topic?.primary,
          emotionalState: turnData.emotion?.primary,
        }
      );
    }

    // =========================================
    // 4. BREAKTHROUGH PROXIMITY
    // Look for breakthrough indicators
    // =========================================
    const breakthroughIndicators = detectBreakthroughIndicators(turnData);
    for (const indicator of breakthroughIndicators) {
      breakthroughProximity.recordIndicator(
        userId,
        {
          type: indicator.type,
          strength: indicator.strength,
          content: turnData.userMessage.slice(0, 200),
        },
        indicator.topic || turnData.topic?.primary || 'general'
      );
    }

    // =========================================
    // 5. LIFE PHASE SIGNALS
    // Detect phase-relevant signals
    // =========================================
    const phaseSignals = detectPhaseSignals(turnData);
    for (const signal of phaseSignals) {
      lifePhasePrediction.recordPhaseSignal(userId, signal.signal, signal.strength);
    }

    // =========================================
    // 6. COGNITIVE FINGERPRINT
    // Record effectiveness of current conversation
    // =========================================
    if (turnData.responseData?.userEngagement !== undefined) {
      const now = new Date();
      cognitiveFingerprint.recordConversationEffectiveness(userId, {
        dayOfWeek: now.getDay(),
        hour: now.getHours(),
        effectiveness: turnData.responseData.userEngagement,
        tone: 'warm',  // Would be better from actual response
        depthReached: turnData.responseData.depth || 'moderate',
      });
    }

    log.debug({ userId, topic: turnData.topic?.primary }, '🧠 Processed turn for superhuman learning');

  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to process turn for superhuman learning');
  }
}

/**
 * Record intervention outcome from turn
 *
 * Call this when we can evaluate how an intervention landed.
 *
 * @param userId - User ID
 * @param intervention - What intervention was attempted
 * @param outcome - How it went
 */
export function recordInterventionFromTurn(
  userId: string,
  intervention: InterventionType,
  outcome: {
    success: boolean;
    emotionalState?: string;
    topic?: string;
    userResponse?: 'engaged' | 'deflected' | 'ignored' | 'rejected';
  }
): void {
  interventionTiming.recordQuickOutcome(userId, intervention, outcome.success, {
    emotionalState: outcome.emotionalState,
    topic: outcome.topic,
  });
}

/**
 * Record a breakthrough moment
 *
 * Call this when user has a breakthrough/insight.
 *
 * @param userId - User ID
 * @param breakthrough - Breakthrough details
 */
export function recordBreakthroughMoment(
  userId: string,
  breakthrough: {
    topic: string;
    type: 'self_understanding' | 'pattern_recognition' | 'belief_shift' | 'emotional_release' | 
      'decision_clarity' | 'relationship_insight' | 'value_alignment' | 'acceptance' | 'integration';
    catalyst: 'question' | 'reflection' | 'connection' | 'emotion' | 'external_event';
  }
): void {
  breakthroughProximity.recordBreakthrough(
    userId,
    breakthrough.topic,
    breakthrough.type,
    breakthrough.catalyst
  );

  log.info({ userId, topic: breakthrough.topic, type: breakthrough.type }, '🎆 Breakthrough recorded');
}

/**
 * Record a life domain event
 *
 * Call this when user mentions a significant life event.
 *
 * @param userId - User ID
 * @param event - Event details
 */
export function recordLifeEvent(
  userId: string,
  event: {
    domain: LifeDomain;
    eventType: EventType;
    magnitude: number;  // -1 to 1
    description: string;
  }
): void {
  rippleEffectPrediction.recordDomainEvent(userId, event);
}

/**
 * Record a decision being made
 *
 * Call this when user makes or discusses a decision.
 *
 * @param userId - User ID
 * @param decision - Decision details
 */
export function recordDecisionMade(
  userId: string,
  decision: {
    style: DecisionStyle;
    timeToDecision: number;  // hours
    outcome?: 'satisfied' | 'regret' | 'neutral';
  }
): void {
  cognitiveFingerprint.recordDecision(userId, decision);
}

/**
 * Record stress response observed
 *
 * Call this when user exhibits stress response.
 *
 * @param userId - User ID
 * @param response - Stress response details
 */
export function recordStressObserved(
  userId: string,
  response: {
    style: StressResponse;
    stressLevel: number;
    trigger?: string;
  }
): void {
  cognitiveFingerprint.recordStressResponse(userId, response);
}

/**
 * Record vulnerability moment
 *
 * Call this when user shows vulnerability.
 *
 * @param userId - User ID
 * @param vulnerability - Vulnerability details
 */
export function recordVulnerabilityMoment(
  userId: string,
  vulnerability: {
    style: 'direct' | 'indirect' | 'physical' | 'deflected';
    topic: string;
    warmupMinutes: number;
    safetyFactor?: string;
  }
): void {
  cognitiveFingerprint.recordVulnerabilityMoment(userId, vulnerability);
}

// ============================================================================
// SESSION EVENTS
// ============================================================================

/**
 * Process session start
 *
 * Call at beginning of conversation.
 *
 * @param userId - User ID
 * @param sessionData - Session context
 */
export async function processSessionStart(
  userId: string,
  sessionData: {
    daysSinceLastConversation?: number;
    scheduledTime?: Date;
    externalEvents?: string[];
  }
): Promise<void> {
  // Prepare conversation context
  conversationPreparation.prepareForConversation(userId, {
    scheduledTime: sessionData.scheduledTime,
    externalEvents: sessionData.externalEvents,
  });

  // Record temporal pattern
  if (sessionData.daysSinceLastConversation !== undefined) {
    const now = new Date();
    conversationPreparation.recordTemporalPattern(userId, {
      dayOfWeek: now.getDay(),
      timeOfDay: getTimeOfDay(now.getHours()),
      likelyTopics: [],
      likelyNeeds: [],
    });
  }

  log.debug({ userId, daysSince: sessionData.daysSinceLastConversation }, '🎯 Session start processed');
}

/**
 * Process session end
 *
 * Call at end of conversation.
 *
 * @param userId - User ID
 * @param sessionSummary - Session summary data
 */
export async function processSessionEnd(
  userId: string,
  sessionSummary: {
    topicsDiscussed: string[];
    primaryNeed?: ConversationNeed;
    emotionalArc?: string;
    satisfactionLevel?: number;
    breakthroughs?: string[];
  }
): Promise<void> {
  // Record conversation outcome
  conversationPreparation.recordConversationOutcome(userId, {
    topicsDiscussed: sessionSummary.topicsDiscussed,
    needsMet: sessionSummary.primaryNeed ? [sessionSummary.primaryNeed] : [],
    emotionalStateObserved: sessionSummary.emotionalArc || 'neutral',
    satisfactionLevel: sessionSummary.satisfactionLevel || 0.7,
    predictedTopicsHit: [],  // Would need to track predictions
    unexpectedTopics: [],
  });

  // Update domain health based on session
  if (sessionSummary.emotionalArc) {
    const mentalHealthChange = sessionSummary.satisfactionLevel 
      ? (sessionSummary.satisfactionLevel - 0.5) * 0.1 
      : 0;
    
    // Mental health improves slightly from good conversations
    if (mentalHealthChange > 0) {
      rippleEffectPrediction.updateDomainHealth(
        userId,
        'mental_health',
        0.6 + mentalHealthChange  // Relative update
      );
    }
  }

  log.debug({ userId, topics: sessionSummary.topicsDiscussed.length }, '📊 Session end processed');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function detectSelfTalkValence(message: string): number {
  const lower = message.toLowerCase();
  
  // Negative self-talk patterns
  const negativePatterns = [
    /i('m| am) (so )?(stupid|dumb|worthless|terrible|bad|awful)/,
    /i can('t| not)( do| handle| manage)/,
    /i('m| am) (a )?(failure|mess|disaster)/,
    /what('s| is) wrong with me/,
    /i('m| am) (always|never) (good|enough)/,
  ];
  
  // Positive self-talk patterns
  const positivePatterns = [
    /i('m| am) (proud|happy|excited|grateful)/,
    /i (did|can|will|made) (it|well|good)/,
    /i('m| am) (getting|doing) better/,
    /i (learned|grew|improved)/,
  ];
  
  let score = 0;
  for (const pattern of negativePatterns) {
    if (pattern.test(lower)) score -= 0.3;
  }
  for (const pattern of positivePatterns) {
    if (pattern.test(lower)) score += 0.3;
  }
  
  return Math.max(-1, Math.min(1, score));
}

function detectFutureOrientation(message: string): number {
  const lower = message.toLowerCase();
  
  // Future-focused words
  const futureWords = ['will', 'going to', 'plan', 'want to', 'hope', 'looking forward', 'tomorrow', 'next', 'someday', 'future'];
  const pastWords = ['was', 'were', 'did', 'used to', 'remember', 'back then', 'before', 'yesterday', 'last'];
  
  let futureCount = 0;
  let pastCount = 0;
  
  for (const word of futureWords) {
    if (lower.includes(word)) futureCount++;
  }
  for (const word of pastWords) {
    if (lower.includes(word)) pastCount++;
  }
  
  const total = futureCount + pastCount;
  if (total === 0) return 0;
  
  return (futureCount - pastCount) / total;
}

function detectSocialMentions(message: string): number {
  const lower = message.toLowerCase();
  
  // Social references
  const socialWords = [
    'friend', 'friends', 'family', 'mom', 'dad', 'parent', 'partner', 'husband', 'wife',
    'boyfriend', 'girlfriend', 'colleague', 'coworker', 'boss', 'team', 'we', 'us', 'they',
    'brother', 'sister', 'son', 'daughter', 'child', 'kids', 'people'
  ];
  
  let count = 0;
  for (const word of socialWords) {
    if (lower.includes(word)) count++;
  }
  
  return Math.min(1, count * 0.2);
}

function detectConversationNeed(turnData: {
  userMessage: string;
  emotion?: { isVenting?: boolean; needsSupport?: boolean; primary?: string };
}): ConversationNeed | null {
  const { userMessage, emotion } = turnData;
  const lower = userMessage.toLowerCase();
  
  // Explicit venting
  if (emotion?.isVenting) return 'venting';
  
  // Seeking validation
  if (/am i (crazy|wrong|right|normal)|is it (okay|wrong|weird|normal)/.test(lower)) {
    return 'validation';
  }
  
  // Asking for advice
  if (/what (should|would you|do you think) i (do|think|try)|any (advice|suggestions|ideas)/.test(lower)) {
    return 'advice';
  }
  
  // Celebration
  if (/i (did it|made it|got|achieved|finished)|good news|excited (to|about)/.test(lower)) {
    return 'celebration';
  }
  
  // Planning
  if (/how (can|do|should) i|plan|strategy|prepare|get ready/.test(lower)) {
    return 'planning';
  }
  
  // Reassurance
  if (emotion?.primary === 'anxious' || /worried|scared|anxious|nervous/.test(lower)) {
    return 'reassurance';
  }
  
  // Reflection
  if (/been thinking|realized|noticed|wondering|looking back/.test(lower)) {
    return 'reflection';
  }
  
  // Processing
  if (emotion?.needsSupport && /trying to (understand|figure|make sense)/.test(lower)) {
    return 'processing';
  }
  
  return null;
}

function detectDeflection(turnData: {
  userMessage: string;
  emotion?: { primary?: string };
  topic?: { primary?: string };
}): {
  detected: boolean;
  topic?: string;
  style?: 'humor' | 'topic_change' | 'brevity' | 'minimize' | 'intellectualize';
} {
  const { userMessage } = turnData;
  const lower = userMessage.toLowerCase();
  
  // Humor deflection
  if (/haha|lol|just kidding|anyway|but whatever/.test(lower) && 
      turnData.emotion?.primary && ['sad', 'anxious', 'stressed'].includes(turnData.emotion.primary)) {
    return {
      detected: true,
      topic: turnData.topic?.primary,
      style: 'humor',
    };
  }
  
  // Minimizing
  if (/it('s| is) (not a big deal|fine|nothing|okay|whatever)/.test(lower)) {
    return {
      detected: true,
      topic: turnData.topic?.primary,
      style: 'minimize',
    };
  }
  
  // Very brief responses to deep topics
  if (userMessage.length < 20 && turnData.topic?.primary) {
    return {
      detected: true,
      topic: turnData.topic.primary,
      style: 'brevity',
    };
  }
  
  return { detected: false };
}

function detectBreakthroughIndicators(turnData: {
  userMessage: string;
  topic?: { primary?: string };
}): Array<{ type: IndicatorType; strength: number; topic?: string }> {
  const indicators: Array<{ type: IndicatorType; strength: number; topic?: string }> = [];
  const lower = turnData.userMessage.toLowerCase();
  
  // Questioning beliefs
  if (/i (always|never) (thought|believed|assumed)|maybe i('ve| have) been wrong|what if/.test(lower)) {
    indicators.push({
      type: 'questioning_beliefs',
      strength: 0.7,
      topic: turnData.topic?.primary,
    });
  }
  
  // Connecting dots
  if (/i (just )?realized|it('s| is) (like|similar|the same)|i (see|notice) (a )?(pattern|connection)/.test(lower)) {
    indicators.push({
      type: 'connecting_dots',
      strength: 0.8,
      topic: turnData.topic?.primary,
    });
  }
  
  // Increasing reflection
  if (/i('ve| have) been thinking|looking back|when i think about/.test(lower)) {
    indicators.push({
      type: 'increasing_reflection',
      strength: 0.6,
      topic: turnData.topic?.primary,
    });
  }
  
  // Past reframing
  if (/i (now )?see (it|that|things) differently|i (used to think|thought).*(but now|now i)/.test(lower)) {
    indicators.push({
      type: 'past_reframing',
      strength: 0.8,
      topic: turnData.topic?.primary,
    });
  }
  
  // Language shift (new vocabulary)
  if (/i('d| would) call it|it('s| is) (more like|actually)|what i mean is/.test(lower)) {
    indicators.push({
      type: 'language_shift',
      strength: 0.5,
      topic: turnData.topic?.primary,
    });
  }
  
  // Aha adjacency
  if (/oh|wow|huh|wait|hmm.*(i (just|never)|that('s| is))/.test(lower)) {
    indicators.push({
      type: 'aha_adjacency',
      strength: 0.7,
      topic: turnData.topic?.primary,
    });
  }
  
  return indicators;
}

function detectPhaseSignals(turnData: {
  userMessage: string;
  emotion?: { primary?: string; intensity?: number };
  topic?: { primary?: string };
}): Array<{ signal: PhaseSignal; strength: number }> {
  const signals: Array<{ signal: PhaseSignal; strength: number }> = [];
  const lower = turnData.userMessage.toLowerCase();
  
  // New initiatives
  if (/i('m| am) (starting|beginning|trying|going to)|new (project|job|thing|idea)/.test(lower)) {
    signals.push({ signal: 'new_initiatives', strength: 0.7 });
  }
  
  // Reflection
  if (/i('ve| have) been (thinking|reflecting)|looking back|when i think about/.test(lower)) {
    signals.push({ signal: 'reflection_increase', strength: 0.6 });
  }
  
  // Future planning
  if (/plan|planning|goal|want to|going to|next (year|month|week)/.test(lower)) {
    signals.push({ signal: 'future_planning', strength: 0.6 });
  }
  
  // Identity questioning
  if (/who (am i|i am)|what do i (want|really)|i('m| am) not sure (who|what) i/.test(lower)) {
    signals.push({ signal: 'questioning_identity', strength: 0.8 });
  }
  
  // Values questioning
  if (/what (matters|('s| is) important)|do i (care|value)|should i (even|really)/.test(lower)) {
    signals.push({ signal: 'values_questioning', strength: 0.7 });
  }
  
  // Emotional processing
  if (turnData.emotion?.intensity && turnData.emotion.intensity > 0.6) {
    signals.push({ signal: 'emotional_processing', strength: turnData.emotion.intensity });
  }
  
  // Learning mode
  if (/learn|learning|trying to understand|figure out|how (do|does|can)/.test(lower)) {
    signals.push({ signal: 'learning_mode', strength: 0.6 });
  }
  
  // Grief presence
  if (/miss|grief|lost|gone|passed away|died/.test(lower)) {
    signals.push({ signal: 'grief_presence', strength: 0.8 });
  }
  
  return signals;
}

function mapToTopicCategory(category?: string): TopicCategory {
  if (!category) return 'emotions';
  
  const mapping: Record<string, TopicCategory> = {
    career: 'work',
    job: 'work',
    work: 'work',
    relationship: 'relationships',
    partner: 'relationships',
    dating: 'relationships',
    family: 'family',
    parent: 'family',
    health: 'health',
    fitness: 'health',
    money: 'finances',
    financial: 'finances',
    goal: 'goals',
    habit: 'habits',
    routine: 'habits',
    emotion: 'emotions',
    feeling: 'emotions',
    decision: 'decisions',
    choice: 'decisions',
    event: 'events',
    growth: 'self_development',
    creative: 'creativity',
    spiritual: 'spirituality',
    social: 'social',
    past: 'past',
    future: 'future',
  };
  
  const lower = category.toLowerCase();
  for (const [key, value] of Object.entries(mapping)) {
    if (lower.includes(key)) return value;
  }
  
  return 'emotions';
}

function getTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

// ============================================================================
// EXPORTS
// ============================================================================

export const signalIntegration = {
  processTurnForSuperhumanLearning,
  recordInterventionFromTurn,
  recordBreakthroughMoment,
  recordLifeEvent,
  recordDecisionMade,
  recordStressObserved,
  recordVulnerabilityMoment,
  processSessionStart,
  processSessionEnd,
};

export default signalIntegration;
