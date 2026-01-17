/**
 * Shared Personality Context Assembler
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
 * Generalized from: personas/bundles/ferni/personality-context-assembler.ts
 *
 * @module personas/shared/personality-context-assembler
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { PersonalityContext, UserResonanceProfile } from './better-than-human-personality.js';
import { getCachedResonance } from './personality-resonance-store.js';

const log = createLogger({ module: 'shared-personality-context' });

// ============================================================================
// ASSEMBLER INPUT
// ============================================================================

export interface ContextAssemblerInput {
  // Required identifiers
  personaId: string;
  sessionId: string;
  userId?: string;
  turnCount: number;

  // Current user input
  userTranscript: string;

  // Voice signals (from voice emotion detection)
  voiceEmotion?: {
    primary?: string;
    confidence?: number;
    arousal?: number;
    valence?: number;
  };

  // Speech signals
  speechRateWPM?: number;
  pauseBeforeMs?: number;

  // Text analysis results
  textEmotion?: {
    primary?: string;
    intensity?: number;
    distressLevel?: number;
  };

  // Conversation state
  conversationMomentum?:
    | 'opening'
    | 'building'
    | 'cruising'
    | 'winding_down'
    | 'peaking'
    | 'intimate'
    | 'closing'
    | 'stalled';
  currentTopics?: string[];
  lastTopics?: string[];

  // Relationship data
  relationshipStage?: string;
  totalConversations?: number;
  sharedVulnerabilities?: number;

  // Turn history (last few turns)
  previousTurns?: Array<{
    userTranscript: string;
    speechRate?: number;
    pauseBefore?: number;
    voiceEmotion?: string;
    topics?: string[];
    timestamp: number;
  }>;
}

// ============================================================================
// TEMPORAL CONTEXT (Dimension #1)
// ============================================================================

type TimeOfDay = 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night' | 'late_night';
type Season = 'spring' | 'summer' | 'fall' | 'winter';

function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  if (hour >= 21 || hour < 1) return 'night';
  return 'late_night'; // 1am - 5am
}

function getSeason(): Season {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

function getIsWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

// ============================================================================
// EMOTIONAL CONTEXT (Dimension #2)
// ============================================================================

type EmotionalTrajectory = 'rising' | 'falling' | 'stable' | 'volatile';

function detectEmotionalTrajectory(input: ContextAssemblerInput): EmotionalTrajectory {
  if (!input.previousTurns || input.previousTurns.length < 2) {
    return 'stable';
  }

  // Simple trajectory detection based on voice emotion patterns
  const recentEmotions = input.previousTurns
    .slice(-3)
    .filter((t) => t.voiceEmotion)
    .map((t) => t.voiceEmotion!);

  if (recentEmotions.length < 2) return 'stable';

  const positiveEmotions = ['happy', 'content', 'excited', 'hopeful'];
  const negativeEmotions = ['sad', 'anxious', 'stressed', 'angry', 'fearful'];

  const positiveCount = recentEmotions.filter((e) =>
    positiveEmotions.includes(e.toLowerCase())
  ).length;
  const negativeCount = recentEmotions.filter((e) =>
    negativeEmotions.includes(e.toLowerCase())
  ).length;

  // Current emotion for comparison
  const current = input.voiceEmotion?.primary?.toLowerCase();
  const currentPositive = current && positiveEmotions.includes(current);
  const currentNegative = current && negativeEmotions.includes(current);

  // Rising: more positive now than before
  if (currentPositive && negativeCount > positiveCount) return 'rising';

  // Falling: more negative now than before
  if (currentNegative && positiveCount > negativeCount) return 'falling';

  // Volatile: switching between positive and negative
  if (positiveCount > 0 && negativeCount > 0) return 'volatile';

  return 'stable';
}

// ============================================================================
// PROSODIC CONTEXT (Dimension #5)
// ============================================================================

type SpeechPace = 'fast' | 'normal' | 'slow' | 'hesitant';
type EnergyLevel = 'high' | 'medium' | 'low' | 'subdued';

function detectSpeechPace(input: ContextAssemblerInput): SpeechPace {
  if (!input.speechRateWPM) return 'normal';

  if (input.speechRateWPM > 180) return 'fast';
  if (input.speechRateWPM < 100) return 'slow';

  // Hesitant = slow with long pauses
  if (input.speechRateWPM < 120 && input.pauseBeforeMs && input.pauseBeforeMs > 2000) {
    return 'hesitant';
  }

  return 'normal';
}

function detectEnergyLevel(input: ContextAssemblerInput): EnergyLevel {
  const arousal = input.voiceEmotion?.arousal ?? 0.5;
  const valence = input.voiceEmotion?.valence ?? 0;

  // High energy: high arousal, positive or negative
  if (arousal > 0.7) return 'high';

  // Subdued: low arousal, negative valence
  if (arousal < 0.3 && valence < 0) return 'subdued';

  // Low: low arousal
  if (arousal < 0.4) return 'low';

  return 'medium';
}

// ============================================================================
// TOPICAL CONTEXT (Dimension #6)
// ============================================================================

function detectTopicShift(input: ContextAssemblerInput): boolean {
  if (!input.currentTopics || input.currentTopics.length === 0) return false;
  if (!input.lastTopics || input.lastTopics.length === 0) return false;

  // Check if any current topic overlaps with last topics
  const hasOverlap = input.currentTopics.some((ct) =>
    input.lastTopics!.some(
      (lt) =>
        ct.toLowerCase().includes(lt.toLowerCase()) || lt.toLowerCase().includes(ct.toLowerCase())
    )
  );

  return !hasOverlap;
}

// ============================================================================
// BEHAVIORAL CONTEXT (Dimension #7)
// ============================================================================

type UserSharingType = 'win' | 'struggle' | 'question' | 'story' | 'feeling' | 'request';

function detectUserSharingType(transcript: string): UserSharingType | undefined {
  const lower = transcript.toLowerCase();

  // Win patterns
  if (
    lower.match(/i (did|finished|completed|achieved|got|made|passed)/i) ||
    lower.match(/finally|succeeded|accomplished/i)
  ) {
    return 'win';
  }

  // Struggle patterns
  if (
    lower.match(/i('m| am) (struggling|having trouble|stuck|overwhelmed)/i) ||
    lower.match(/can't|couldn't|failed|lost|afraid|worried/i)
  ) {
    return 'struggle';
  }

  // Question patterns
  if (lower.match(/\?$/) || lower.match(/^(what|how|why|when|where|can you|could you)/i)) {
    return 'question';
  }

  // Story patterns (past tense narrative)
  if (lower.match(/so (then|anyway|basically)|let me tell you|you won't believe/i)) {
    return 'story';
  }

  // Feeling patterns
  if (lower.match(/i feel|i('m| am) feeling|makes me feel|it feels/i)) {
    return 'feeling';
  }

  // Request patterns
  if (lower.match(/can you|could you|would you|please|i need|help me/i)) {
    return 'request';
  }

  return undefined;
}

function isPersonalSharing(transcript: string, distressLevel?: number): boolean {
  const lower = transcript.toLowerCase();

  // Explicit personal content
  const personalPatterns = [
    /my (mom|dad|parent|family|wife|husband|partner|child|kid|sister|brother)/i,
    /when i was/i,
    /i've been/i,
    /i never told/i,
    /this is hard to/i,
    /between us/i,
  ];

  if (personalPatterns.some((p) => p.test(lower))) return true;

  // High distress + decent length = probably personal
  if (distressLevel && distressLevel > 0.5 && transcript.split(' ').length > 15) {
    return true;
  }

  return false;
}

function isHeavyTopic(transcript: string, distressLevel?: number): boolean {
  const lower = transcript.toLowerCase();

  const heavyPatterns = [
    /death|died|dying|suicide|kill/i,
    /cancer|terminal|diagnosis/i,
    /abuse|assault|trauma/i,
    /divorce|separation/i,
    /addiction|relapse/i,
    /depression|anxiety|panic/i,
    /lost my|grief|funeral/i,
  ];

  if (heavyPatterns.some((p) => p.test(lower))) return true;

  // High distress indicates heavy topic
  if (distressLevel && distressLevel > 0.7) return true;

  return false;
}

// ============================================================================
// MAIN ASSEMBLER
// ============================================================================

/**
 * Assemble full 8-dimensional personality context from available signals.
 * This is the foundation for "Better Than Human" personality composition.
 */
export function assemblePersonalityContext(input: ContextAssemblerInput): PersonalityContext {
  // Try to get cached resonance (sync, no Firestore latency)
  let userResonance: UserResonanceProfile | undefined;
  if (input.userId) {
    const cached = getCachedResonance(input.userId);
    if (cached) {
      userResonance = cached;
    }
  }

  // Map conversation momentum to expected type
  const momentum = mapMomentum(input.conversationMomentum);

  const context: PersonalityContext = {
    // Identity
    personaId: input.personaId,
    sessionId: input.sessionId,
    userId: input.userId,
    turnCount: input.turnCount,

    // Dimension 1: Temporal
    timeOfDay: getTimeOfDay(),
    dayOfWeek: new Date().getDay(),
    isWeekend: getIsWeekend(),
    season: getSeason(),

    // Dimension 2: Emotional
    currentEmotion: input.voiceEmotion?.primary || input.textEmotion?.primary,
    emotionalIntensity: input.textEmotion?.intensity ?? 0.5,
    emotionalTrajectory: detectEmotionalTrajectory(input),
    distressLevel: input.textEmotion?.distressLevel ?? 0,

    // Dimension 3: Conversation
    conversationMomentum: momentum,
    lastTopic: input.lastTopics?.[0],
    currentTopic: input.currentTopics?.[0],
    topicShiftDetected: detectTopicShift(input),

    // Dimension 4: Voice/Prosody
    userSpeechPace: detectSpeechPace(input),
    pauseBeforeUserSpoke: input.pauseBeforeMs ?? 0,
    voiceEnergyLevel: detectEnergyLevel(input),

    // Dimension 5: Relationship
    relationshipStage: mapRelationshipStage(input.relationshipStage),
    sharedVulnerabilityCount: input.sharedVulnerabilities ?? 0,
    conversationsTotal: input.totalConversations ?? 1,

    // Dimension 6: Learned (cross-session)
    userResonance,

    // Dimension 7: Behavioral
    userJustShared: detectUserSharingType(input.userTranscript),
    wasPersonalSharing: isPersonalSharing(input.userTranscript, input.textEmotion?.distressLevel),
    isHeavyTopic: isHeavyTopic(input.userTranscript, input.textEmotion?.distressLevel),
  };

  log.debug(
    {
      personaId: input.personaId,
      sessionId: input.sessionId,
      timeOfDay: context.timeOfDay,
      momentum: context.conversationMomentum,
      emotion: context.currentEmotion,
      trajectory: context.emotionalTrajectory,
      distress: context.distressLevel.toFixed(2),
      hasResonance: !!userResonance,
    },
    '8D context assembled'
  );

  return context;
}

// ============================================================================
// HELPERS
// ============================================================================

function mapMomentum(
  input?: string
): 'opening' | 'cruising' | 'peaking' | 'intimate' | 'closing' | 'stalled' {
  switch (input) {
    case 'opening':
      return 'opening';
    case 'building':
    case 'cruising':
      return 'cruising';
    case 'peaking':
      return 'peaking';
    case 'intimate':
      return 'intimate';
    case 'winding_down':
    case 'closing':
      return 'closing';
    case 'stalled':
      return 'stalled';
    default:
      return 'cruising';
  }
}

function mapRelationshipStage(
  input?: string
): 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor' {
  switch (input?.toLowerCase()) {
    case 'stranger':
    case 'first_meeting':
    case 'new':
      return 'stranger';
    case 'acquaintance':
    case 'getting_started':
    case 'early':
      return 'acquaintance';
    case 'friend':
    case 'building_trust':
    case 'established':
      return 'friend';
    case 'trusted_advisor':
    case 'deep_partnership':
    case 'trusted':
      return 'trusted_advisor';
    default:
      return 'acquaintance';
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const sharedContextAssembler = {
  assemble: assemblePersonalityContext,
  getTimeOfDay,
  getSeason,
  detectTopicShift,
  detectUserSharingType,
  isPersonalSharing,
  isHeavyTopic,
};

export default sharedContextAssembler;
