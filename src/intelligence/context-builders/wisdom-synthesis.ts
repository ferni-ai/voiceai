/**
 * Wisdom Synthesis Context Builder
 *
 * Injects population-level wisdom into conversations.
 * Learns from millions of conversations what approaches work
 * for different situations—something no human coach can do.
 *
 * PRIVACY: All patterns are anonymized. No individual data is stored.
 *
 * @module WisdomSynthesisContextBuilder
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createStandardInjection,
  createHintInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import {
  getWisdomContextInjection,
  getPopulationInsights,
  type SituationType,
} from '../../services/wisdom-synthesis/index.js';

const log = getLogger().child({ module: 'context:wisdom-synthesis' });

// ============================================================================
// SITUATION DETECTION
// ============================================================================

/**
 * Map conversation analysis to situation type for wisdom lookup.
 */
function detectSituation(input: ContextBuilderInput): SituationType | null {
  const { analysis, userText } = input;
  const emotion = analysis.emotion.primary?.toLowerCase() ?? '';
  const topics = analysis.topics.detected.map((t) => t.toLowerCase());
  const userTextLower = userText.toLowerCase();

  // Check for anxiety signals
  if (
    emotion.includes('anxious') ||
    emotion.includes('worried') ||
    emotion.includes('nervous') ||
    userTextLower.includes('anxious') ||
    userTextLower.includes('panic') ||
    userTextLower.includes("can't stop thinking")
  ) {
    // Distinguish between acute anxiety and rumination
    if (
      userTextLower.includes('panic') ||
      userTextLower.includes("can't breathe") ||
      userTextLower.includes('racing')
    ) {
      return {
        category: 'emotional',
        subcategory: 'anxiety',
        description: 'Acute anxiety or panic',
      };
    }
    return {
      category: 'emotional',
      subcategory: 'anxiety',
      description: 'Anxious rumination',
    };
  }

  // Check for sadness signals
  if (
    emotion.includes('sad') ||
    emotion.includes('depressed') ||
    emotion.includes('down') ||
    userTextLower.includes('feeling down') ||
    userTextLower.includes('sad') ||
    userTextLower.includes('hopeless')
  ) {
    // Distinguish between general sadness and stuck state
    if (
      userTextLower.includes('stuck') ||
      userTextLower.includes('unmotivated') ||
      userTextLower.includes("can't do anything")
    ) {
      return {
        category: 'emotional',
        subcategory: 'sadness',
        description: 'Low motivation, stuck',
      };
    }
    return {
      category: 'emotional',
      subcategory: 'sadness',
      description: 'Feeling sad or down',
    };
  }

  // Check for relationship/conflict signals
  if (
    topics.some(
      (t) => t.includes('relationship') || t.includes('partner') || t.includes('family')
    ) ||
    userTextLower.includes('fight') ||
    userTextLower.includes('argument') ||
    userTextLower.includes('conflict')
  ) {
    // Distinguish between acute conflict and recurring pattern
    if (
      userTextLower.includes('always') ||
      userTextLower.includes('again') ||
      userTextLower.includes('keep having')
    ) {
      return {
        category: 'relational',
        subcategory: 'conflict',
        description: 'Recurring conflict',
      };
    }
    return {
      category: 'relational',
      subcategory: 'conflict',
      description: 'Relationship conflict',
    };
  }

  // Check for stuck/motivation signals
  if (
    userTextLower.includes('stuck') ||
    userTextLower.includes('unmotivated') ||
    userTextLower.includes('procrastinat') ||
    userTextLower.includes('overwhelmed')
  ) {
    if (userTextLower.includes('goal') || userTextLower.includes('too much')) {
      return {
        category: 'behavioral',
        subcategory: 'motivation',
        description: 'Overwhelmed by goals',
      };
    }
    return {
      category: 'behavioral',
      subcategory: 'motivation',
      description: 'Feeling stuck or unmotivated',
    };
  }

  // Check for self-criticism signals
  if (
    userTextLower.includes('stupid') ||
    userTextLower.includes('idiot') ||
    userTextLower.includes('failure') ||
    userTextLower.includes('hate myself') ||
    userTextLower.includes('so dumb')
  ) {
    return {
      category: 'cognitive',
      subcategory: 'self_criticism',
      description: 'Harsh self-judgment',
    };
  }

  // Check for decision-making signals
  if (
    userTextLower.includes('decide') ||
    userTextLower.includes('choice') ||
    userTextLower.includes("don't know what to") ||
    userTextLower.includes('should i')
  ) {
    return {
      category: 'cognitive',
      subcategory: 'decision',
      description: 'Difficulty deciding',
    };
  }

  // No clear situation detected
  return null;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

const wisdomSynthesisBuilder: ContextBuilder = {
  name: 'wisdom-synthesis',
  description: 'Injects population-level wisdom about effective approaches',
  priority: 45, // Between core context (40) and enhancement (60)

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const injections: ContextInjection[] = [];

    try {
      // Detect what situation the user is in
      const situation = detectSituation(input);

      if (!situation) {
        return []; // No clear situation for wisdom injection
      }

      const userId = input.services.userId ?? input.services.sessionId;

      // Get personalized wisdom context
      const wisdomContext = getWisdomContextInjection(userId, situation);

      if (wisdomContext && wisdomContext.length > 0) {
        injections.push(
          createStandardInjection('wisdom-synthesis', wisdomContext, {
            category: 'wisdom',
            confidence: 0.8,
          })
        );

        log.debug({ situation: situation.subcategory, userId }, 'Wisdom context injected');
      }

      // Also add population insights as a hint for transparency
      const insights = getPopulationInsights(situation);
      if (insights.topApproaches.length > 0) {
        const topApproach = insights.topApproaches[0];
        if (topApproach) {
          injections.push(
            createHintInjection(
              'wisdom-synthesis',
              `[Population insight: "${topApproach.technique}" works for ${Math.round(topApproach.helpfulRate * 100)}% of people in similar situations]`,
              { category: 'wisdom-meta', confidence: 0.7 }
            )
          );
        }
      }
    } catch (error) {
      log.warn({ error }, 'Wisdom synthesis context builder failed');
    }

    return injections;
  },
};

// Register on module load
registerContextBuilder(wisdomSynthesisBuilder);

export { wisdomSynthesisBuilder };
export default wisdomSynthesisBuilder;
