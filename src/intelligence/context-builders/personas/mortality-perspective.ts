/**
 * Mortality Perspective Context Builder
 *
 * Provides Nayan (Wisdom Guide) with concrete mortality awareness.
 * "Better than Human" - The Stoic memento mori made personal and actionable.
 *
 * This is NOT morbid - it's clarifying. When you know the number of Tuesdays left,
 * you stop wasting them.
 *
 * Superhuman Capabilities:
 * - Concrete time remaining calculations
 * - Parent/family visit countdowns
 * - "Someday" to "today" reframes
 * - Seasonal and cyclical awareness
 *
 * @module intelligence/context-builders/mortality-perspective
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  calculateLifeExpectancy,
  generateMortalityPerspective,
  generateSuperhumanMortalityMoment,
  calculateRemainingInstances,
  type LifeExpectancyResult,
} from '../../../services/wisdom/life-expectancy.js';

const log = createLogger({ module: 'MortalityPerspectiveBuilder' });

// ============================================================================
// TYPES
// ============================================================================

interface MortalityContext {
  /** User's calculated life expectancy */
  lifeExpectancy: LifeExpectancyResult | null;
  /** Relevant mortality perspective for current topic */
  perspective: {
    statement: string;
    wisdom: string;
    prompt: string;
  } | null;
  /** Concrete time calculations */
  timeRemaining: {
    summers: number;
    christmases: number;
    tuesdays: number;
    fullMoons: number;
  } | null;
  /** Formatted context for LLM */
  contextString: string;
}

interface UserMortalityProfile {
  birthDate: Date;
  sex: 'male' | 'female';
  parentAges?: { mother?: number; father?: number };
  healthFactors?: {
    smoker?: boolean;
    exerciseFrequency?: 'none' | 'occasional' | 'regular' | 'daily';
  };
}

// ============================================================================
// TOPIC DETECTION
// ============================================================================

/**
 * Detect if conversation warrants mortality perspective
 */
function detectMortalityRelevance(text: string): {
  relevant: boolean;
  topic?: string;
  parentMentioned?: boolean;
} {
  const lowerText = text.toLowerCase();

  // Procrastination / "someday" thinking
  if (
    /\bsomeday\b|\blater\b|\bwhen i have time\b|\bprocrastinat|\bputting off\b|\bkeep meaning to\b/i.test(
      lowerText
    )
  ) {
    return { relevant: true, topic: 'someday' };
  }

  // Parent/family time
  if (
    /\bparent|\bfather|\bmother|\bmom\b|\bdad\b|\bfamily visit|\bsee my folks\b/i.test(lowerText)
  ) {
    return { relevant: true, topic: 'parent', parentMentioned: true };
  }

  // Career / work-life balance
  if (
    /\bcareer\b|\bwork-life\b|\bburning out\b|\bwhen i retire\b|\byears left working/i.test(
      lowerText
    )
  ) {
    return { relevant: true, topic: 'career' };
  }

  // Health / exercise
  if (
    /\bhealth\b|\bexercise\b|\bshould work out\b|\bstart exercising\b|\bget healthy\b/i.test(
      lowerText
    )
  ) {
    return { relevant: true, topic: 'health' };
  }

  // Life meaning / legacy
  if (
    /\bmeaning\b|\bpurpose\b|\blegacy\b|\bwhat matters\b|\blooking back\b|\bregret\b/i.test(
      lowerText
    )
  ) {
    return { relevant: true, topic: 'meaning' };
  }

  // Time / aging
  if (
    /\bgetting old|\bbirthday\b|\btime flies|\bwhere did the time go|\byears go by\b/i.test(
      lowerText
    )
  ) {
    return { relevant: true, topic: 'time' };
  }

  return { relevant: false };
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build mortality perspective context for Nayan
 *
 * Called during context injection when Nayan is discussing relevant topics
 */
export async function buildMortalityPerspectiveContext(
  userId: string,
  recentTranscript: string,
  userProfile?: UserMortalityProfile
): Promise<MortalityContext | null> {
  try {
    // Detect if mortality perspective is relevant
    const relevance = detectMortalityRelevance(recentTranscript);

    if (!relevance.relevant) {
      return null;
    }

    // Calculate life expectancy if we have user data
    let lifeExpectancy: LifeExpectancyResult | null = null;

    if (userProfile?.birthDate && userProfile?.sex) {
      lifeExpectancy = calculateLifeExpectancy({
        birthDate: userProfile.birthDate,
        sex: userProfile.sex,
        healthFactors: userProfile.healthFactors,
      });
    } else {
      // Use median values for general perspective
      lifeExpectancy = calculateLifeExpectancy({
        birthDate: new Date(Date.now() - 40 * 365.25 * 24 * 60 * 60 * 1000), // ~40 years old
        sex: 'male',
      });
    }

    // Generate perspective for the topic
    const perspective = generateMortalityPerspective(
      relevance.topic || 'general',
      lifeExpectancy,
      relevance.parentMentioned && userProfile?.parentAges
        ? {
            parentAge: userProfile.parentAges.mother || userProfile.parentAges.father || 70,
            visitFrequency: 'monthly',
          }
        : undefined
    );

    // Build context string
    let contextString = '\n[Mortality Perspective - Stoic Clarity]\n';

    contextString += `${perspective.statement}\n`;
    contextString += `\nWisdom: ${perspective.wisdom}\n`;
    contextString += `\nPrompt to offer: "${perspective.prompt}"\n`;

    if (lifeExpectancy) {
      const { timeRemaining } = lifeExpectancy;
      contextString += `\n[Concrete Time Remaining]\n`;
      contextString += `• ${timeRemaining.summers} more summers\n`;
      contextString += `• ${timeRemaining.christmases} more Christmases\n`;
      contextString += `• ${timeRemaining.tuesdays.toLocaleString()} more Tuesdays\n`;
      contextString += `• ${timeRemaining.fullMoons} more full moons\n`;
    }

    contextString += `\nNayan can surface this perspective gently when the user seems stuck in "someday" thinking.\n`;
    contextString += `This is not morbid - it's clarifying. Help them see finite time as a gift, not a burden.\n`;

    log.debug({ userId, topic: relevance.topic }, 'Built mortality perspective context');

    return {
      lifeExpectancy,
      perspective,
      timeRemaining: lifeExpectancy?.timeRemaining || null,
      contextString,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to build mortality perspective context');
    return null;
  }
}

/**
 * Generate superhuman mortality moment for Nayan
 *
 * Used for proactive wisdom during conversation
 */
export function generateSuperhumanWisdomMoment(
  userProfile: UserMortalityProfile,
  currentTopic?: string
): string | null {
  try {
    const lifeExpectancy = calculateLifeExpectancy({
      birthDate: userProfile.birthDate,
      sex: userProfile.sex,
      healthFactors: userProfile.healthFactors,
    });

    return generateSuperhumanMortalityMoment(lifeExpectancy, currentTopic);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to generate wisdom moment');
    return null;
  }
}

/**
 * Calculate remaining instances of specific life events
 *
 * "You have 40 more Christmases. How do you want to spend them?"
 */
export function calculateConcreteRemaining(
  userProfile: UserMortalityProfile,
  eventType: 'christmas' | 'birthday' | 'summer' | 'fullMoon' | 'tuesday' | 'weekend' | 'sunrise'
): { count: number; wisdom: string } | null {
  try {
    const lifeExpectancy = calculateLifeExpectancy({
      birthDate: userProfile.birthDate,
      sex: userProfile.sex,
      healthFactors: userProfile.healthFactors,
    });

    return calculateRemainingInstances(lifeExpectancy, eventType);
  } catch (error) {
    log.error({ error: String(error), eventType }, 'Failed to calculate remaining');
    return null;
  }
}

/**
 * Calculate remaining visits with a parent
 *
 * "At your current visit rate, you have roughly 60 visits left with your parent."
 */
export function calculateParentVisitsRemaining(
  parentAge: number,
  visitFrequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
): { visits: number; wisdom: string } | null {
  try {
    // Estimate parent's remaining years
    const parentLifeExpectancy = calculateLifeExpectancy({
      birthDate: new Date(Date.now() - parentAge * 365.25 * 24 * 60 * 60 * 1000),
      sex: 'female', // Use female as more conservative (longer) estimate
    });

    const yearsRemaining = parentLifeExpectancy.expectedYearsRemaining;
    const visitsPerYear =
      visitFrequency === 'weekly'
        ? 52
        : visitFrequency === 'monthly'
          ? 12
          : visitFrequency === 'quarterly'
            ? 4
            : 1;

    const visitsRemaining = Math.round(yearsRemaining * visitsPerYear);

    return {
      visits: visitsRemaining,
      wisdom: `At your current visit rate, you have approximately ${visitsRemaining} visits left. Time with loved ones is finite and knowable. The question is: how do you want to spend those visits?`,
    };
  } catch (error) {
    log.error({ error: String(error), parentAge }, 'Failed to calculate parent visits');
    return null;
  }
}

export default {
  buildMortalityPerspectiveContext,
  generateSuperhumanWisdomMoment,
  calculateConcreteRemaining,
  calculateParentVisitsRemaining,
  detectMortalityRelevance,
};
