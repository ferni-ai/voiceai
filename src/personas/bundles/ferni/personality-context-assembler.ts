/**
 * Personality Context Assembler
 *
 * Gathers ALL contextual signals to enable "Better Than Human" personality composition.
 * This is the 8-dimensional sensing layer that makes expressions feel alive.
 *
 * Dimensions:
 * 1. Temporal (time of day, day of week, season)
 * 2. Emotional (current, trajectory, intensity, distress)
 * 3. Conversational (momentum, topic, turn count)
 * 4. Relational (stage, history, shared vulnerability)
 * 5. Prosodic (speech pace, pauses, energy level)
 * 6. Topical (current, shift detection, user mentions)
 * 7. Behavioral (what user just shared, personal sharing)
 * 8. Learned (user resonance profile from cross-session)
 *
 * @module personas/bundles/ferni/personality-context-assembler
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { PersonalityContext, UserResonanceProfile } from './better-than-human-personality.js';
import { getCachedResonance } from './personality-resonance-store.js';

const log = createLogger({ module: 'personality-context' });

// ============================================================================
// TYPES
// ============================================================================

export interface ContextAssemblerInput {
  // Session
  sessionId: string;
  userId?: string;
  turnCount: number;

  // Analysis results
  emotion?: {
    primary?: string;
    intensity?: number;
    distressLevel?: number;
    valence?: 'positive' | 'negative' | 'neutral';
    trajectory?: 'rising' | 'falling' | 'stable';
  };

  // Conversation state
  momentum?: 'opening' | 'cruising' | 'peaking' | 'intimate' | 'closing' | 'stalled';
  topics?: string[];
  lastTopic?: string;

  // Voice/prosody signals
  userSpeechRate?: number; // WPM
  pauseBeforeMs?: number;
  voiceEmotionConfidence?: number;

  // Relationship
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  totalConversations?: number;
  sharedVulnerabilities?: number;

  // User profile data
  userProfile?: {
    preferredTopics?: string[];
    avoidTopics?: string[];
  };

  // What just happened
  userIntent?: 'sharing' | 'asking' | 'venting' | 'exploring' | 'celebrating' | 'requesting';
  wasPersonalSharing?: boolean;
  isHeavyTopic?: boolean;
}

// ============================================================================
// CONTEXT ASSEMBLY
// ============================================================================

/**
 * Assemble full personality context from all available signals
 *
 * PERF: This is now SYNCHRONOUS (uses cache instead of Firestore read)
 * Pre-warm the resonance cache at session start using prewarmResonanceCache().
 */
export function assemblePersonalityContext(
  input: ContextAssemblerInput
): PersonalityContext {
  const now = new Date();

  // 1. TEMPORAL CONTEXT
  const temporal = assembleTemporalContext(now);

  // 2. EMOTIONAL CONTEXT
  const emotional = assembleEmotionalContext(input);

  // 3. CONVERSATIONAL CONTEXT
  const conversational = assembleConversationalContext(input);

  // 4. PROSODIC CONTEXT
  const prosodic = assembleProsodicsContext(input);

  // 5. RELATIONAL CONTEXT
  const relational = assembleRelationalContext(input);

  // 6. BEHAVIORAL CONTEXT
  const behavioral = assembleBehavioralContext(input);

  // 7. LEARNED CONTEXT (cross-session) - SYNC cache lookup, no Firestore latency
  const userResonance = input.userId ? getCachedResonance(input.userId) : null;

  // Combine into full context
  const context: PersonalityContext = {
    // Session
    sessionId: input.sessionId,
    userId: input.userId,
    turnCount: input.turnCount,

    // Temporal
    ...temporal,

    // Emotional
    currentEmotion: emotional.currentEmotion,
    emotionalIntensity: emotional.intensity,
    emotionalTrajectory: emotional.trajectory,
    distressLevel: emotional.distressLevel,

    // Conversational
    conversationMomentum: conversational.momentum,
    lastTopic: conversational.lastTopic,
    currentTopic: conversational.currentTopic,
    topicShiftDetected: conversational.topicShiftDetected,

    // Prosodic
    userSpeechPace: prosodic.pace,
    pauseBeforeUserSpoke: prosodic.pauseMs,
    voiceEnergyLevel: prosodic.energyLevel,

    // Relational
    relationshipStage: relational.stage,
    sharedVulnerabilityCount: relational.sharedVulnerabilities,
    conversationsTotal: relational.totalConversations,

    // Behavioral
    userJustShared: behavioral.userJustShared,
    wasPersonalSharing: behavioral.wasPersonalSharing,
    isHeavyTopic: behavioral.isHeavyTopic,

    // Learned
    userResonance: userResonance || undefined,
  };

  log.debug(
    {
      sessionId: input.sessionId,
      timeOfDay: temporal.timeOfDay,
      momentum: conversational.momentum,
      emotion: emotional.currentEmotion,
      stage: relational.stage,
    },
    'Assembled personality context'
  );

  return context;
}

// ============================================================================
// DIMENSION ASSEMBLERS
// ============================================================================

interface TemporalContext {
  timeOfDay: 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night' | 'late_night';
  dayOfWeek: number;
  isWeekend: boolean;
  season: 'spring' | 'summer' | 'fall' | 'winter';
}

function assembleTemporalContext(now: Date): TemporalContext {
  const hour = now.getHours();
  const month = now.getMonth();
  const day = now.getDay();

  // Time of day with nuance
  let timeOfDay: TemporalContext['timeOfDay'];
  if (hour >= 5 && hour < 7) timeOfDay = 'dawn';
  else if (hour >= 7 && hour < 12) timeOfDay = 'morning';
  else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
  else if (hour >= 21 || hour < 1) timeOfDay = 'night';
  else timeOfDay = 'late_night'; // 1-5am

  // Season (Northern hemisphere default)
  let season: TemporalContext['season'];
  if (month >= 2 && month <= 4) season = 'spring';
  else if (month >= 5 && month <= 7) season = 'summer';
  else if (month >= 8 && month <= 10) season = 'fall';
  else season = 'winter';

  return {
    timeOfDay,
    dayOfWeek: day,
    isWeekend: day === 0 || day === 6,
    season,
  };
}

interface EmotionalContext {
  currentEmotion?: string;
  intensity: number;
  trajectory: 'rising' | 'falling' | 'stable' | 'volatile';
  distressLevel: number;
}

function assembleEmotionalContext(input: ContextAssemblerInput): EmotionalContext {
  return {
    currentEmotion: input.emotion?.primary,
    intensity: input.emotion?.intensity ?? 0.5,
    trajectory: (input.emotion?.trajectory as EmotionalContext['trajectory']) ?? 'stable',
    distressLevel: input.emotion?.distressLevel ?? 0,
  };
}

interface ConversationalContext {
  momentum: PersonalityContext['conversationMomentum'];
  lastTopic?: string;
  currentTopic?: string;
  topicShiftDetected: boolean;
}

function assembleConversationalContext(input: ContextAssemblerInput): ConversationalContext {
  const topics = input.topics || [];
  const currentTopic = topics[0];
  const lastTopic = input.lastTopic;

  // Detect topic shift
  const topicShiftDetected =
    lastTopic && currentTopic
      ? lastTopic.toLowerCase() !== currentTopic.toLowerCase()
      : false;

  return {
    momentum: input.momentum ?? 'cruising',
    lastTopic,
    currentTopic,
    topicShiftDetected,
  };
}

interface ProsodicContext {
  pace: 'fast' | 'normal' | 'slow' | 'hesitant';
  pauseMs: number;
  energyLevel: 'high' | 'medium' | 'low' | 'subdued';
}

function assembleProsodicsContext(input: ContextAssemblerInput): ProsodicContext {
  // Derive speech pace from WPM
  let pace: ProsodicContext['pace'] = 'normal';
  if (input.userSpeechRate) {
    if (input.userSpeechRate > 170) pace = 'fast';
    else if (input.userSpeechRate < 100) pace = 'slow';
    else if (input.userSpeechRate < 80) pace = 'hesitant';
  }

  // Derive energy from confidence and pace
  let energyLevel: ProsodicContext['energyLevel'] = 'medium';
  if (input.voiceEmotionConfidence) {
    if (input.voiceEmotionConfidence > 0.8) {
      energyLevel = pace === 'fast' ? 'high' : 'medium';
    } else if (input.voiceEmotionConfidence < 0.3) {
      energyLevel = 'subdued';
    }
  }

  // Long pause indicates something
  if (input.pauseBeforeMs && input.pauseBeforeMs > 3000) {
    pace = 'hesitant';
    energyLevel = 'subdued';
  }

  return {
    pace,
    pauseMs: input.pauseBeforeMs ?? 0,
    energyLevel,
  };
}

interface RelationalContext {
  stage: PersonalityContext['relationshipStage'];
  sharedVulnerabilities: number;
  totalConversations: number;
}

function assembleRelationalContext(input: ContextAssemblerInput): RelationalContext {
  return {
    stage: input.relationshipStage ?? 'acquaintance',
    sharedVulnerabilities: input.sharedVulnerabilities ?? 0,
    totalConversations: input.totalConversations ?? 1,
  };
}

interface BehavioralContext {
  userJustShared?: PersonalityContext['userJustShared'];
  wasPersonalSharing: boolean;
  isHeavyTopic: boolean;
}

function assembleBehavioralContext(input: ContextAssemblerInput): BehavioralContext {
  // Map intent to sharing type
  const intentToSharing: Record<string, PersonalityContext['userJustShared']> = {
    sharing: 'story',
    asking: 'question',
    venting: 'feeling',
    exploring: 'question',
    celebrating: 'win',
    requesting: 'request',
  };

  return {
    userJustShared: input.userIntent
      ? intentToSharing[input.userIntent]
      : undefined,
    wasPersonalSharing: input.wasPersonalSharing ?? false,
    isHeavyTopic: input.isHeavyTopic ?? false,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const personalityContextAssembler = {
  assemble: assemblePersonalityContext,
};

export default personalityContextAssembler;

