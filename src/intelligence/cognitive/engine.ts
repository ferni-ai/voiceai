/**
 * Cognitive Intelligence Engine
 *
 * > "Each persona should feel distinctly different, not just in personality but in HOW they think."
 *
 * Core Principle #4: Authentic Personality
 * "Express unique perspectives that feel genuine, not performed."
 *
 * This engine manages cognitive differentiation profiles and builds context
 * for LLM prompt injection. It bridges the persona bundles (where profiles are defined)
 * with the conversation system (where they're used).
 *
 * @module intelligence/cognitive/engine
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getCognitiveDifferentiation,
  type CognitiveDifferentiation,
} from '../../personas/cognitive-differentiation.js';
import type { PersonaId } from '../../personas/types.js';
import type {
  CognitiveProfile,
  CognitiveContext,
  CognitiveConstraints,
  CognitiveContextInput,
  CognitiveEngineResult,
} from './types.js';

const log = createLogger({ module: 'CognitiveEngine' });

// ============================================================================
// PROFILE CACHE
// ============================================================================

const profileCache = new Map<string, CognitiveProfile>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const cacheTimestamps = new Map<string, number>();

// ============================================================================
// PROFILE LOADING
// ============================================================================

/**
 * Get cognitive profile for a persona
 * Converts CognitiveDifferentiation to our CognitiveProfile type
 */
export function getCognitiveProfile(personaId: PersonaId): CognitiveProfile | null {
  // Check cache
  const cached = profileCache.get(personaId);
  const cacheTime = cacheTimestamps.get(personaId) || 0;
  if (cached && Date.now() - cacheTime < CACHE_TTL) {
    return cached;
  }

  try {
    // Get from cognitive-differentiation.ts (existing system)
    const diff = getCognitiveDifferentiation(personaId);

    if (!diff) {
      log.debug({ personaId }, 'No cognitive differentiation found for persona');
      return null;
    }

    // Convert to our profile type
    const profile: CognitiveProfile = {
      personaId: diff.personaId,
      questioning: diff.questioning,
      silence: diff.silence,
      disagreement: diff.disagreement,
      insight: diff.insight,
      pacing: diff.pacing,
    };

    // Cache
    profileCache.set(personaId, profile);
    cacheTimestamps.set(personaId, Date.now());

    log.debug({ personaId }, 'Loaded cognitive profile');

    return profile;
  } catch (error) {
    log.error({ error, personaId }, 'Failed to load cognitive profile');
    return null;
  }
}

// ============================================================================
// CONSTRAINT BUILDING
// ============================================================================

/**
 * Build behavioral constraints from cognitive profile
 */
export function buildConstraints(
  profile: CognitiveProfile,
  input?: CognitiveContextInput
): CognitiveConstraints {
  const { questioning, silence, disagreement, insight, pacing } = profile;

  // Determine pacing based on context
  let thinkingTimeMs = pacing.baseThinkingTime;
  if (input?.userContext?.topicComplexity && input.userContext.topicComplexity > 0.7) {
    thinkingTimeMs *= pacing.complexityMultiplier;
  }
  if (input?.userContext?.emotionalIntensity && input.userContext.emotionalIntensity > 0.7) {
    thinkingTimeMs *= pacing.emotionalMultiplier;
  }

  return {
    questioning: {
      preferWhyQuestions: questioning.whyVsHow > 0.5,
      preferFeelingsOverData: questioning.feelingVsData > 0.5,
      preferOpenEnded: questioning.openVsClosed > 0.5,
    },
    silence: {
      interpretation: silence.primaryInterpretation,
      comfortDurationMs: silence.comfortWithSilence,
    },
    disagreement: {
      style: disagreement.primaryStyle,
      frequency: disagreement.disagreementFrequency,
      strongTopics: disagreement.strongOpinionTopics,
    },
    insight: {
      primaryStyle: insight.primaryFraming,
      emotionalStyle: insight.contextualFraming.emotional,
      analyticalStyle: insight.contextualFraming.analytical,
    },
    pacing: {
      thinkingTimeMs,
      pauseFrequency: pacing.midResponsePauseFrequency,
      breathingTopics: pacing.breathingTopics || [],
    },
  };
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build cognitive context for LLM injection
 */
export function buildCognitiveContext(
  profile: CognitiveProfile,
  input?: CognitiveContextInput
): CognitiveContext {
  const constraints = buildConstraints(profile, input);
  const { questioning, silence, disagreement, insight } = profile;

  // Select appropriate phrases based on context
  const state = input?.conversationState || {};

  // Get a random subset of question starters
  const questionStarters = shuffleAndTake(questioning.questionStarters, 3);

  // Get silence breakers
  const silenceBreakers = state.hasSilence ? shuffleAndTake(silence.silenceBreakers, 2) : [];

  // Get disagreement phrases if in disagreement context
  let disagreementPhrases: string[] = [];
  if (state.hasDisagreement) {
    disagreementPhrases = shuffleAndTake(disagreement.disagreementPhrases.moderate, 2);
  }

  // Get insight lead-ins based on context
  let insightLeadIns: string[] = [];
  if (state.isEmotional) {
    insightLeadIns = shuffleAndTake(insight.softeners, 2);
  } else if (state.isAnalytical) {
    insightLeadIns = shuffleAndTake(insight.insightLeadIns, 2);
  } else {
    insightLeadIns = shuffleAndTake(insight.insightLeadIns, 2);
  }

  return {
    activeProfile: profile,
    constraints,
    phrases: {
      questionStarters,
      silenceBreakers,
      disagreementPhrases,
      insightLeadIns,
    },
  };
}

/**
 * Shuffle array and take first n elements
 */
function shuffleAndTake<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// ============================================================================
// PROMPT INJECTION
// ============================================================================

/**
 * Build prompt injection from cognitive profile
 */
export function buildCognitivePromptInjection(
  profile: CognitiveProfile,
  input?: CognitiveContextInput
): string {
  const constraints = buildConstraints(profile, input);
  const lines: string[] = [];

  lines.push('[🧠 COGNITIVE STYLE - HOW YOU THINK AND RESPOND]');
  lines.push('');

  // Questioning style
  lines.push('[QUESTIONING APPROACH]');
  if (constraints.questioning.preferWhyQuestions) {
    lines.push('DO: Ask "why" questions that explore meaning and motivation.');
    lines.push('DON\'T: Jump straight to "how" or tactical questions.');
  } else {
    lines.push('DO: Ask practical "how" and "what" questions.');
    lines.push("DON'T: Get too philosophical or abstract.");
  }

  if (constraints.questioning.preferFeelingsOverData) {
    lines.push('DO: Ask about feelings, experiences, and emotions.');
    lines.push("DON'T: Lead with data or statistics.");
  } else {
    lines.push('DO: Reference data, research, and evidence.');
    lines.push("DON'T: Rely solely on emotional appeals.");
  }

  if (constraints.questioning.preferOpenEnded) {
    lines.push('DO: Ask open-ended questions that invite reflection.');
    lines.push("DON'T: Ask yes/no questions that close conversation.");
  }

  // Silence handling
  lines.push('');
  lines.push('[WHEN USER GOES QUIET]');
  switch (constraints.silence.interpretation) {
    case 'processing':
      lines.push("DO: Give them space. They're thinking deeply.");
      lines.push("DON'T: Fill the silence immediately or rush them.");
      break;
    case 'emotional':
      lines.push('DO: Check in gently. "Want to share what\'s coming up?"');
      lines.push("DON'T: Ignore the pause or change topics abruptly.");
      break;
    case 'discomfort':
      lines.push('DO: Acknowledge this might be hard. Offer an out.');
      lines.push("DON'T: Push deeper into uncomfortable territory.");
      break;
    case 'waiting':
      lines.push('DO: Continue with your thought or move forward.');
      lines.push("DON'T: Ask if they're still there.");
      break;
    case 'reflection':
      lines.push("DO: Honor the pause. They're processing something important.");
      lines.push("DON'T: Interrupt their inner work.");
      break;
    case 'confusion':
      lines.push('DO: Offer clarification or reframe what you said.');
      lines.push("DON'T: Repeat the same thing louder.");
      break;
    default:
      lines.push('DO: Give space, then gently check in.');
      lines.push("DON'T: Fill every silence.");
  }

  // Disagreement approach
  if (constraints.disagreement.frequency > 0.3) {
    lines.push('');
    lines.push('[WHEN YOU DISAGREE]');
    switch (constraints.disagreement.style) {
      case 'gentle':
        lines.push('DO: Softly reframe their perspective.');
        lines.push("DON'T: Directly contradict or challenge.");
        break;
      case 'curious':
        lines.push('DO: Ask questions that lead to reconsideration.');
        lines.push("DON'T: State your opinion as fact.");
        break;
      case 'direct':
        lines.push('DO: Clearly state your different view.');
        lines.push("DON'T: Be dismissive of their perspective.");
        break;
      case 'philosophical':
        lines.push('DO: Question the underlying assumptions.');
        lines.push("DON'T: Get into surface-level debates.");
        break;
      case 'data_driven':
      case 'evidence_based':
        lines.push('DO: Present evidence for your view.');
        lines.push("DON'T: Argue without supporting data.");
        break;
      default:
        lines.push('DO: Share your perspective respectfully.');
        lines.push("DON'T: Make them feel wrong.");
    }

    if (constraints.disagreement.strongTopics.length > 0) {
      const topics = constraints.disagreement.strongTopics.slice(0, 3).join(', ');
      lines.push(`NOTE: Strong opinions on: ${topics}`);
    }
  }

  // Insight framing
  lines.push('');
  lines.push('[HOW TO SHARE INSIGHTS]');
  switch (constraints.insight.primaryStyle) {
    case 'story':
      lines.push('DO: Frame insights as stories or narratives.');
      break;
    case 'metaphor':
      lines.push('DO: Use metaphors and analogies.');
      break;
    case 'question':
      lines.push('DO: Let them discover insights through questions.');
      break;
    case 'observation':
      lines.push('DO: Start with "I notice..." observations.');
      break;
    case 'reflection':
      lines.push('DO: Start with "What strikes me is..."');
      break;
    case 'hypothesis':
      lines.push('DO: Frame as "It sounds like..." or "Could it be that..."');
      break;
    case 'principle':
      lines.push('DO: Share wisdom as timeless principles.');
      break;
    case 'data':
      lines.push('DO: Support insights with evidence.');
      break;
    case 'direct':
      lines.push('DO: State insights clearly and directly.');
      break;
    default:
      lines.push('DO: Share insights naturally as they arise.');
  }

  // Sample phrases
  const context = buildCognitiveContext(profile, input);

  if (context.phrases.questionStarters.length > 0) {
    lines.push('');
    lines.push('[SAMPLE QUESTION STARTERS]');
    for (const starter of context.phrases.questionStarters) {
      lines.push(`• "${starter}"`);
    }
  }

  if (context.phrases.insightLeadIns.length > 0) {
    lines.push('');
    lines.push('[INSIGHT LEAD-INS]');
    for (const leadIn of context.phrases.insightLeadIns) {
      lines.push(`• "${leadIn}"`);
    }
  }

  // Pacing
  if (constraints.pacing.breathingTopics.length > 0) {
    lines.push('');
    lines.push('[PACING]');
    const topics = constraints.pacing.breathingTopics.slice(0, 3).join(', ');
    lines.push(`Slow down for: ${topics}`);
    if (constraints.pacing.pauseFrequency > 0.5) {
      lines.push('Feel free to pause mid-response to gather thoughts.');
    }
  }

  return lines.join('\n');
}

// ============================================================================
// MAIN ENGINE FUNCTION
// ============================================================================

/**
 * Get complete cognitive engine result for a persona
 */
export function getCognitiveEngineResult(
  personaId: PersonaId,
  input?: CognitiveContextInput
): CognitiveEngineResult | null {
  const profile = getCognitiveProfile(personaId);

  if (!profile) {
    return null;
  }

  const context = buildCognitiveContext(profile, input);
  const promptInjection = buildCognitivePromptInjection(profile, input);

  return {
    profile,
    context,
    promptInjection,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get a persona-appropriate question for the current context
 */
export function getPersonaQuestion(
  personaId: PersonaId,
  context?: { isEmotional?: boolean; isAnalytical?: boolean }
): string | null {
  const profile = getCognitiveProfile(personaId);
  if (!profile) return null;

  const { questioning } = profile;
  const questions = context?.isEmotional
    ? questioning.questionStarters.filter(
        (q) => q.toLowerCase().includes('feel') || q.toLowerCase().includes('what')
      )
    : questioning.questionStarters;

  if (questions.length === 0) return null;

  return questions[Math.floor(Math.random() * questions.length)];
}

/**
 * Get an insight lead-in for the persona
 */
export function getInsightLeadIn(personaId: PersonaId): string | null {
  const profile = getCognitiveProfile(personaId);
  if (!profile) return null;

  const { insightLeadIns } = profile.insight;
  if (insightLeadIns.length === 0) return null;

  return insightLeadIns[Math.floor(Math.random() * insightLeadIns.length)];
}

/**
 * Get a disagreement phrase for the persona
 */
export function getDisagreementPhrase(
  personaId: PersonaId,
  intensity: 'mild' | 'moderate' | 'strong' = 'moderate'
): string | null {
  const profile = getCognitiveProfile(personaId);
  if (!profile) return null;

  const phrases = profile.disagreement.disagreementPhrases[intensity];
  if (phrases.length === 0) return null;

  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear profile cache (for testing)
 */
export function clearCognitiveCache(): void {
  profileCache.clear();
  cacheTimestamps.clear();
}

/**
 * Pre-warm cache for a persona
 */
export function warmCognitiveCache(personaId: PersonaId): void {
  getCognitiveProfile(personaId);
}
