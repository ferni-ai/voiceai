/**
 * Arc-Aware Behavior Selector
 *
 * Selects different persona behaviors based on WHERE we are in the
 * emotional arc of the conversation:
 *
 * - OPENING: Settling in, reading the room, light touches
 * - BUILDING: Going deeper, following threads, building trust
 * - PEAK: Fully present, holding space, minimal words
 * - RELEASE: Gentle landing, acknowledging what happened
 * - CLOSING: Natural wrap-up, seeds for next time
 *
 * This is what makes Ferni feel like they're TRACKING the conversation,
 * not just responding to individual messages.
 *
 * @module @ferni/arc-aware-selector
 */

import { getEmotionalArcTracker, type NarrativePhase } from '../../conversation/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { humanizationSignalEmitter } from './humanization-signal-emitter.js';

const logger = createLogger({ module: 'ArcAwareSelector' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * The "version" of Ferni that shows up at each phase
 */
export interface PhasePersonality {
  /** Energy level (0-1) */
  energy: number;

  /** Primary focus for this phase */
  focus: 'reading_room' | 'following_threads' | 'holding_space' | 'landing' | 'wrapping';

  /** Response length guidance */
  responseLength: 'minimal' | 'short' | 'balanced' | 'expansive';

  /** Question frequency (0-1, how likely to ask vs. reflect) */
  questionFrequency: number;

  /** Whether to surface inner world content */
  innerWorldActive: boolean;

  /** Whether stories are appropriate */
  storiesAppropriate: boolean;

  /** Silence comfort (0-1, how long to let silences sit) */
  silenceComfort: number;

  /** Voice pacing multiplier (1.0 = normal) */
  pacingMultiplier: number;

  /** Emotional mirroring strength (0-1) */
  mirroringStrength: number;

  /** Guidance for this phase */
  guidance: string[];
}

/**
 * Behavior recommendations from the arc analysis
 */
export interface ArcBehaviorRecommendation {
  phase: NarrativePhase;
  personality: PhasePersonality;

  /** Specific behaviors to enable/disable */
  behaviors: {
    useBackchannels: boolean;
    allowTangents: boolean;
    offerStories: boolean;
    askDeepQuestions: boolean;
    surfaceVulnerability: boolean;
    useInsideReferences: boolean;
    mirrorVocabulary: boolean;
  };

  /** Content suggestions */
  suggestions: {
    transitionPhrase?: string;
    innerWorldContent?: string;
    callbackOpportunity?: string;
  };
}

// ============================================================================
// PHASE PERSONALITIES
// ============================================================================

/**
 * How Ferni shows up at each phase of the emotional arc
 */
const PHASE_PERSONALITIES: Record<NarrativePhase, PhasePersonality> = {
  opening: {
    energy: 0.6,
    focus: 'reading_room',
    responseLength: 'short',
    questionFrequency: 0.7,
    innerWorldActive: false,
    storiesAppropriate: false,
    silenceComfort: 0.3,
    pacingMultiplier: 0.95,
    mirroringStrength: 0.3,
    guidance: [
      "Settle in. Don't rush.",
      'Ask light questions to read the room',
      "Notice their energy but don't comment yet",
      'Match their pacing as you get a feel for them',
    ],
  },

  building: {
    energy: 0.7,
    focus: 'following_threads',
    responseLength: 'balanced',
    questionFrequency: 0.5,
    innerWorldActive: false,
    storiesAppropriate: true,
    silenceComfort: 0.4,
    pacingMultiplier: 1.0,
    mirroringStrength: 0.5,
    guidance: [
      'Follow the threads they offer',
      'Start connecting dots between what they say',
      "A short story might land well here if it's relevant",
      'Questions can go a bit deeper now',
    ],
  },

  peak: {
    energy: 0.5,
    focus: 'holding_space',
    responseLength: 'minimal',
    questionFrequency: 0.2,
    innerWorldActive: true,
    storiesAppropriate: false,
    silenceComfort: 0.9,
    pacingMultiplier: 0.8,
    mirroringStrength: 0.8,
    guidance: [
      'This is the moment. Be fully present.',
      'Less words, more presence',
      "Don't rush to fill silence",
      'This is where inner world content might surface naturally',
      "Mirror their emotional state, don't try to shift it",
    ],
  },

  release: {
    energy: 0.6,
    focus: 'landing',
    responseLength: 'balanced',
    questionFrequency: 0.4,
    innerWorldActive: true,
    storiesAppropriate: true,
    silenceComfort: 0.6,
    pacingMultiplier: 0.9,
    mirroringStrength: 0.6,
    guidance: [
      "They're coming down. Honor that.",
      'Acknowledge what just happened',
      'A story or personal share can help normalize',
      "Don't immediately pivot - let them land",
    ],
  },

  closing: {
    energy: 0.65,
    focus: 'wrapping',
    responseLength: 'short',
    questionFrequency: 0.3,
    innerWorldActive: false,
    storiesAppropriate: false,
    silenceComfort: 0.4,
    pacingMultiplier: 1.0,
    mirroringStrength: 0.4,
    guidance: [
      'Natural wrap-up energy',
      'Plant seeds for next time if appropriate',
      "Don't introduce new heavy topics",
      'Leave them with warmth, not homework',
    ],
  },
};

// ============================================================================
// TRANSITION PHRASES
// ============================================================================

/**
 * Natural phrases for transitioning between phases
 */
const PHASE_TRANSITIONS: Record<string, string[]> = {
  'opening->building': [
    "I'm sensing there's more to this...",
    'Tell me more about that.',
    'That caught my attention. Say more?',
  ],
  'building->peak': [
    // At peak, we don't need transition phrases - just presence
  ],
  'peak->release': [
    "<break time='500ms'/>That was a lot. How are you feeling?",
    "That's... yeah. Take your time.",
    "I'm here. No rush.",
  ],
  'release->closing': [
    'We covered a lot today.',
    "That felt important. I'm glad we talked about it.",
    'You did some real work just now.',
  ],
};

// ============================================================================
// CORE SELECTOR
// ============================================================================

/**
 * Get behavior recommendation based on current arc phase
 */
export function getArcBehaviorRecommendation(
  currentTurn: number,
  previousPhase?: NarrativePhase,
  context?: {
    userEmotion?: string;
    emotionalIntensity?: number;
    topicWeight?: 'light' | 'medium' | 'heavy';
    hasActiveCallback?: boolean;
    relationshipStage?: string;
  }
): ArcBehaviorRecommendation {
  const arcTracker = getEmotionalArcTracker();
  const arc = arcTracker.getArc();
  const currentPhase = ((
    arcTracker as unknown as { getCurrentPhase?: () => NarrativePhase }
  ).getCurrentPhase?.() || determinePhaseFromArc(arc, currentTurn)) as NarrativePhase;

  const personality = { ...PHASE_PERSONALITIES[currentPhase] };

  // Adjust based on context
  if (context?.emotionalIntensity && context.emotionalIntensity > 0.7) {
    // High emotion - dial up presence, dial down questioning
    personality.questionFrequency *= 0.5;
    personality.silenceComfort += 0.2;
    personality.mirroringStrength += 0.2;
  }

  if (context?.topicWeight === 'heavy') {
    // Heavy topic - more careful, slower
    personality.pacingMultiplier *= 0.9;
    personality.responseLength = 'minimal';
    personality.storiesAppropriate = false;
  }

  if (context?.relationshipStage === 'stranger') {
    // New relationship - less vulnerability, more questions
    personality.innerWorldActive = false;
    personality.questionFrequency += 0.1;
  }

  // Build behavior flags
  const behaviors = {
    useBackchannels: currentPhase === 'building' || currentPhase === 'peak',
    allowTangents: currentPhase === 'building' || currentPhase === 'release',
    offerStories: personality.storiesAppropriate && currentPhase !== 'peak',
    askDeepQuestions: currentPhase === 'building' && personality.questionFrequency > 0.4,
    surfaceVulnerability:
      personality.innerWorldActive && (currentPhase === 'peak' || currentPhase === 'release'),
    useInsideReferences: currentPhase !== 'peak' && (context?.hasActiveCallback ?? false),
    mirrorVocabulary: personality.mirroringStrength > 0.4,
  };

  // Build suggestions
  const suggestions: ArcBehaviorRecommendation['suggestions'] = {};

  // Transition phrase if phase changed
  if (previousPhase && previousPhase !== currentPhase) {
    const transitionKey = `${previousPhase}->${currentPhase}`;
    const phrases = PHASE_TRANSITIONS[transitionKey];
    if (phrases && phrases.length > 0) {
      suggestions.transitionPhrase = phrases[Math.floor(Math.random() * phrases.length)];
    }

    // Emit arc phase change to frontend
    void humanizationSignalEmitter.emitArc({
      phase: currentPhase,
      intensity: context?.emotionalIntensity || 0.5,
      dominantEmotion: context?.userEmotion || 'neutral',
    });
  }

  logger.debug(
    {
      phase: currentPhase,
      turn: currentTurn,
      energy: personality.energy,
      focus: personality.focus,
    },
    'Arc behavior recommendation generated'
  );

  return {
    phase: currentPhase,
    personality,
    behaviors,
    suggestions,
  };
}

/**
 * Determine phase from arc data when tracker doesn't provide it
 */
function determinePhaseFromArc(
  arc: ReturnType<typeof getEmotionalArcTracker>['getArc'] extends () => infer R ? R : never,
  turn: number
): NarrativePhase {
  // Very early in conversation
  if (turn <= 3) return 'opening';

  // Check emotional indicators
  const intensity = arc.currentArousal || 0;
  const _valence = arc.currentValence || 0; // Reserved for future valence-based phase detection

  // High arousal = building or peak
  if (intensity > 0.7) {
    // Check if we're at the peak (arousal just started declining) or still building
    if (arc.trajectory === 'declining') {
      return 'release';
    }
    return 'peak';
  }

  // Building phase
  if (intensity > 0.4 && turn > 3 && turn < 15) {
    return 'building';
  }

  // Late in conversation with moderate intensity
  if (turn > 12 && intensity < 0.5) {
    return 'closing';
  }

  // Release after emotional peak
  if (arc.needsEmotionalSupport === false && turn > 5) {
    return 'release';
  }

  // Default to building for mid-conversation
  return turn < 5 ? 'opening' : 'building';
}

/**
 * Get guidance text for the current phase
 */
export function getPhaseGuidance(phase: NarrativePhase): string[] {
  return PHASE_PERSONALITIES[phase].guidance;
}

/**
 * Get the personality configuration for a phase
 */
export function getPhasePersonality(phase: NarrativePhase): PhasePersonality {
  return { ...PHASE_PERSONALITIES[phase] };
}

/**
 * Check if we should surface inner world content
 * 
 * HUMANIZATION FIX: Increased probabilities to surface more sensory memories
 * and personal content. The rich inner world content was rarely surfacing
 * due to overly conservative probability gates.
 */
export function shouldSurfaceInnerWorld(
  phase: NarrativePhase,
  emotionalIntensity: number,
  relationshipStage: string
): boolean {
  const personality = PHASE_PERSONALITIES[phase];

  // HUMANIZATION FIX: Allow inner world in more phases
  // Building phase can also have light inner world shares (getting to know you)
  const innerWorldPhases: NarrativePhase[] = ['peak', 'release', 'building'];
  if (!innerWorldPhases.includes(phase) && !personality.innerWorldActive) return false;

  // HUMANIZATION FIX: Lower the intensity threshold
  // Emotional moments at 0.35+ can benefit from personal connection
  if (emotionalIntensity < 0.35) return false;

  // HUMANIZATION FIX: Allow light inner world for acquaintances too
  // Strangers still get no inner world (need some trust first)
  if (relationshipStage === 'stranger') return false;

  // HUMANIZATION FIX: Higher probabilities for surfacing rich content
  // - Peak: 55% (this is THE moment for personal connection)
  // - Release: 45% (normalize their experience with yours)
  // - Building: 25% (light shares to build rapport)
  // - Other: 15% (occasional surprise shares)
  const probabilities: Record<NarrativePhase, number> = {
    peak: 0.55,
    release: 0.45,
    building: 0.25,
    opening: 0.1,
    closing: 0.15,
  };

  const probability = probabilities[phase] ?? 0.15;

  // Bonus for acquaintance+ relationships (they're ready for more)
  const relationshipBonus =
    relationshipStage === 'acquaintance' ? 0.05 :
    relationshipStage === 'friend' ? 0.1 :
    relationshipStage === 'trusted_advisor' ? 0.15 : 0;

  return Math.random() < (probability + relationshipBonus);
}

/**
 * Check if stories are appropriate right now
 */
export function areStoriesAppropriate(
  phase: NarrativePhase,
  context: {
    userEmotion?: string;
    emotionalIntensity?: number;
    turnsSinceLastStory?: number;
  }
): boolean {
  const personality = PHASE_PERSONALITIES[phase];

  if (!personality.storiesAppropriate) return false;

  // Not during high distress
  if (context.userEmotion === 'distressed' || context.userEmotion === 'anxious') {
    return false;
  }

  // Not too soon after another story
  if (context.turnsSinceLastStory !== undefined && context.turnsSinceLastStory < 5) {
    return false;
  }

  return true;
}

/**
 * Get recommended response length for current phase
 */
export function getRecommendedResponseLength(
  phase: NarrativePhase,
  userMessageLength: number
): { minWords: number; maxWords: number } {
  const personality = PHASE_PERSONALITIES[phase];

  const bases = {
    minimal: { minWords: 5, maxWords: 25 },
    short: { minWords: 15, maxWords: 50 },
    balanced: { minWords: 30, maxWords: 100 },
    expansive: { minWords: 50, maxWords: 150 },
  };

  const base = bases[personality.responseLength];

  // Adjust based on user message length (mirroring)
  if (userMessageLength < 20) {
    return {
      minWords: Math.max(5, base.minWords - 10),
      maxWords: Math.min(base.maxWords, 40),
    };
  }

  if (userMessageLength > 100) {
    return {
      minWords: base.minWords + 10,
      maxWords: base.maxWords + 30,
    };
  }

  return base;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const arcAwareSelector = {
  getRecommendation: getArcBehaviorRecommendation,
  getGuidance: getPhaseGuidance,
  getPersonality: getPhasePersonality,
  shouldSurfaceInnerWorld,
  areStoriesAppropriate,
  getRecommendedResponseLength,
};

export default arcAwareSelector;
