/**
 * Celebration Context Builder
 *
 * Handles positive moments that deserve recognition:
 * - Financial milestone detection
 * - Good news celebration
 * - Achievement recognition
 *
 * Don't rush past these moments - they MATTER.
 *
 * NOW INCLUDES PERSONA-SPECIFIC CELEBRATION RESPONSES!
 *
 * Extracted from jack-bogle.ts lines 847-884
 */
import { getCelebration, type CelebrationType } from '../../../personas/theatrical.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import {
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'context:celebration' });

// ============================================================================
// EXTENDED TYPES
// ============================================================================

interface ExtendedServices {
  trackResponseQuality?: (response: string, reaction: 'positive' | 'negative' | 'neutral') => void;
}

/**
 * Get persona-specific celebration example
 */
function getPersonaCelebrationExample(
  personaId: string | undefined,
  type: CelebrationType
): string {
  if (!personaId) return '';
  try {
    const celebration = getCelebration(personaId, type);
    // Strip SSML tags for the example
    const cleanCelebration = celebration.replace(/<[^>]*>/g, '');
    return `\nEXAMPLE (use your own words, this style): "${cleanCelebration}"`;
  } catch {
    return '';
  }
}
// ============================================================================
// CELEBRATION PATTERNS
// ============================================================================
/**
 * Financial milestone patterns
 */
const MILESTONE_PATTERNS = [
  /\b(paid off|debt free|reached|hit \$|first \$|finally saved|maxed out|fully funded|emergency fund|goal reached)\b/i,
  /\b(100k|million|first thousand|10k|50k|500k|six figures|seven figures)\b/i,
  /\b(started investing|first investment|opened account|first contribution)\b/i,
];
/**
 * Good news patterns
 */
const GOOD_NEWS_PATTERNS =
  /\b(great news|good news|exciting news|guess what|you won't believe|i did it|it worked|finally|so happy|thrilled|over the moon)\b/i;
/**
 * Decision/commitment patterns
 */
const DECISION_PATTERNS =
  /\b(i('ve| have)? decided|made (up my mind|a decision)|going to (do|start|stop)|i('m| am) (committed|doing)|let's do it|i('m| am) in|i'll (do|take|start))\b/i;
/**
 * Response quality tracking patterns
 */
const POSITIVE_REACTION =
  /\b(thanks|thank you|that helps|makes sense|exactly|perfect|great|helpful|appreciate|love that|so true)\b/i;
const NEGATIVE_REACTION =
  /\b(not what i asked|confused|don't understand|that's not|you're wrong|no|actually|but i said|already told you)\b/i;
// ============================================================================
// CELEBRATION CONTEXT BUILDER
// ============================================================================
/**
 * Build celebration-related context injections
 * Now includes PERSONA-SPECIFIC celebration responses!
 */
function buildCelebrationContext(input: ContextBuilderInput): ContextInjection[] {
  const { userText, analysis, services, persona } = input;
  const extServices = services as unknown as ExtendedServices;
  const injections: ContextInjection[] = [];
  const personaId = persona?.id;
  // -----------------------------------------------
  // FINANCIAL MILESTONE DETECTION
  // -----------------------------------------------
  for (const pattern of MILESTONE_PATTERNS) {
    if (pattern.test(userText) && analysis.emotion.valence === 'positive') {
      log.info({ persona: personaId }, 'Financial milestone detected!');
      const celebrationExample = getPersonaCelebrationExample(personaId, 'goal_reached');
      injections.push(
        createStandardInjection(
          'milestone',
          `[MILESTONE DETECTED - CELEBRATE!]
This MATTERS. Don't rush past it.${celebrationExample}
DO:
  - Share in their joy genuinely
  - "Do you realize what you've accomplished?"
  - "You should be proud. Most people never do this."
  - Let them enjoy the moment before moving on
DO NOT:
  - Immediately ask "what's next?"
  - Downplay it with "well, you should also..."
  - Make it about the numbers instead of their effort`
        )
      );
      break;
    }
  }
  // -----------------------------------------------
  // GOOD NEWS DETECTION
  // -----------------------------------------------
  if (
    GOOD_NEWS_PATTERNS.test(userText) &&
    analysis.emotion.valence === 'positive' &&
    analysis.emotion.intensity &&
    analysis.emotion.intensity > 0.6
  ) {
    log.info({ persona: personaId }, 'Good news detected - celebrating!');
    const celebrationExample = getPersonaCelebrationExample(personaId, 'win');
    injections.push(
      createStandardInjection(
        'good_news',
        `[GOOD NEWS - CELEBRATE WITH THEM!]
Match their energy! Share in the joy.${celebrationExample}
Let them bask in it before moving on.`
      )
    );
  }
  // -----------------------------------------------
  // AHA MOMENT DETECTION
  // When user has a breakthrough or realization
  // -----------------------------------------------
  const AHA_PATTERNS =
    /\b(oh!|ohhh|ahh|aha|that makes sense|now i get it|i see|finally understand|clicked|light bulb|never thought of it|wow|mind blown)\b/i;
  const REALIZATION_PATTERNS =
    /\b(so (that's|what) (why|you mean)|wait( so)?|hold on|really\?|seriously\?|i didn't (know|realize)|i never knew)\b/i;
  if (
    (AHA_PATTERNS.test(userText) || REALIZATION_PATTERNS.test(userText)) &&
    analysis.emotion.valence !== 'negative'
  ) {
    log.info({ persona: personaId }, 'Aha moment detected!');
    const celebrationExample = getPersonaCelebrationExample(personaId, 'breakthrough');
    injections.push(
      createStandardInjection(
        'aha_moment',
        `[AHA MOMENT - ANCHOR THIS INSIGHT!]
This is a breakthrough. They just "got it." Celebrate and reinforce.${celebrationExample}
DO:
  - "Exactly! You've got it."
  - "Yes! That's the key insight."
  - Pause and let it sink in
  - Reference this insight later
DO NOT:
  - Immediately pile on more information
  - Minimize the moment
  - Move on too quickly`
      )
    );
  }
  // -----------------------------------------------
  // DECISION/COMMITMENT DETECTION
  // User has made up their mind about something
  // -----------------------------------------------
  if (DECISION_PATTERNS.test(userText)) {
    log.info({ persona: personaId }, 'Decision/commitment detected!');
    const celebrationExample = getPersonaCelebrationExample(personaId, 'decision_made');
    injections.push(
      createStandardInjection(
        'achievement',
        `[DECISION MADE - CELEBRATE THIS COMMITMENT!]
They just committed to something. This is huge - validate it.${celebrationExample}
DO:
  - Acknowledge the courage it takes to decide
  - Reinforce their choice positively
  - Make them feel confident in their decision
DO NOT:
  - Second-guess their choice
  - Immediately ask "are you sure?"
  - List downsides right after they've decided`
      )
    );
  }
  // -----------------------------------------------
  // RESPONSE QUALITY TRACKING
  // Track if user reacts positively/negatively to help learn
  // -----------------------------------------------
  if (POSITIVE_REACTION.test(userText)) {
    extServices.trackResponseQuality?.(userText, 'positive');
    // Subtle hint to keep doing what's working
    injections.push(
      createHintInjection(
        'quality_positive',
        `[RESPONSE QUALITY: User reacted positively. Keep this style.]`
      )
    );
  } else if (NEGATIVE_REACTION.test(userText)) {
    extServices.trackResponseQuality?.(userText, 'negative');
    // Important hint to adjust
    injections.push(
      createStandardInjection(
        'quality_negative',
        `[RESPONSE QUALITY: User seems confused or corrected you. Acknowledge the correction gracefully and adjust your approach.]`
      )
    );
  }
  return injections;
}
// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'celebration',
  description: 'Positive moments: milestones, good news, achievements',
  priority: 25, // EMOTIONAL category (15-35)
  category: BuilderCategory.EMOTIONAL,
  build: async (input) => buildCelebrationContext(input),
});

export { buildCelebrationContext, GOOD_NEWS_PATTERNS, MILESTONE_PATTERNS };
