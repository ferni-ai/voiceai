/**
 * Better Than Human - Direct Content Injection
 *
 * > "Better than human."
 *
 * This builder directly surfaces rich content from better-than-human.json
 * to the LLM, providing specific phrases and guidance for superhuman moments.
 *
 * Unlike other builders that generate context, this one pulls from the
 * curated phrase library to give Ferni exact words that feel genuinely caring.
 *
 * Capabilities surfaced:
 * - Emotional bond expressions (warmth, trust, protectiveness)
 * - Anticipatory presence (time-of-day awareness)
 * - Spontaneous delight (appreciation, growth noticing)
 * - Protective responses (defending user from self-criticism)
 * - Visible vulnerability (Ferni's own uncertainty)
 * - Superhuman observations (patterns only we notice)
 *
 * @module intelligence/context-builders/better-than-human-direct
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  loadBetterThanHumanContent,
  getEmotionalBondPhrase,
  getTemporalPhrase,
  getDelightPhrase,
  getProtectivePhrase,
  getVulnerabilityPhrase,
  getObservationPhrase,
  getMetaRelationshipPhrase,
  getRandomPhrase,
  type BetterThanHumanContent,
} from '../../conversation/superhuman/content-loader.js';
import {
  BuilderCategory,
  createHighInjection,
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

const log = createLogger({ module: 'BetterThanHumanDirect' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Probability thresholds for surfacing different content types */
const SURFACE_PROBABILITY = {
  /** Emotional bond expressions - only when emotion is strong */
  emotionalBond: 0.25,
  /** Anticipatory presence - early in conversation */
  anticipatoryPresence: 0.3,
  /** Spontaneous delight - when user shares something positive */
  spontaneousDelight: 0.35,
  /** Protective response - when user is self-critical */
  protectiveResponse: 0.5,
  /** Visible vulnerability - occasional humanizing moments */
  visibleVulnerability: 0.15,
  /** Superhuman observations - pattern surfacing */
  superhumanObservation: 0.2,
  /** Meta-relationship - deep relationship reflection */
  metaRelationship: 0.15,
};

/** Minimum emotion intensity to trigger emotional bond content */
const EMOTIONAL_BOND_INTENSITY_THRESHOLD = 0.6;

/** Turn thresholds for different content types */
const TURN_THRESHOLDS = {
  /** Anticipatory presence works best at session start */
  anticipatoryPresenceMaxTurn: 3,
  /** Meta-relationship requires established rapport */
  metaRelationshipMinTurn: 5,
  /** Vulnerability should come after some warmth */
  vulnerabilityMinTurn: 4,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Detect time-of-day context for anticipatory presence
 */
function getTimeContext(): 'late_night' | 'early_morning' | 'monday_stress' | 'friday_energy' | 'weekend' | null {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  // Late night (10pm - 4am)
  if (hour >= 22 || hour < 4) {
    return 'late_night';
  }

  // Early morning (4am - 7am)
  if (hour >= 4 && hour < 7) {
    return 'early_morning';
  }

  // Monday
  if (day === 1 && hour < 12) {
    return 'monday_stress';
  }

  // Friday afternoon/evening
  if (day === 5 && hour >= 14) {
    return 'friday_energy';
  }

  // Weekend
  if (day === 0 || day === 6) {
    return 'weekend';
  }

  return null;
}

/**
 * Detect self-criticism patterns in user text
 */
function detectSelfCriticism(
  text: string
): 'harsh_judgment' | 'catastrophizing' | 'minimizing_success' | 'imposter_syndrome' | 'perfectionism' | null {
  const lowerText = text.toLowerCase();

  // Harsh self-judgment
  if (
    /\b(i('m| am) (so )?(stupid|dumb|idiot|failure|worthless|useless))\b/.test(lowerText) ||
    /\b(i (always|never) (do|get|am))\b/.test(lowerText) ||
    /\b(what('s| is) wrong with me)\b/.test(lowerText)
  ) {
    return 'harsh_judgment';
  }

  // Catastrophizing
  if (
    /\b(everything is (ruined|over|falling apart))\b/.test(lowerText) ||
    /\b(nothing (ever|will) (work|change))\b/.test(lowerText) ||
    /\b(i('ll| will) never)\b/.test(lowerText)
  ) {
    return 'catastrophizing';
  }

  // Minimizing success
  if (
    /\b(it('s| was) (just|only|nothing))\b/.test(lowerText) ||
    /\b(anyone (could|would) (have|do))\b/.test(lowerText) ||
    /\b(it('s| was)n't (that|a) big (deal|thing))\b/.test(lowerText)
  ) {
    return 'minimizing_success';
  }

  // Imposter syndrome
  if (
    /\b(i don't (belong|deserve))\b/.test(lowerText) ||
    /\b(they('ll| will) (find out|realize))\b/.test(lowerText) ||
    /\b(i('m| am) (a )?fraud)\b/.test(lowerText) ||
    /\b(i got lucky)\b/.test(lowerText)
  ) {
    return 'imposter_syndrome';
  }

  // Perfectionism
  if (
    /\b(it('s| was)n't (good|perfect) enough)\b/.test(lowerText) ||
    /\b(i should have)\b/.test(lowerText) ||
    /\b(i could have done (better|more))\b/.test(lowerText)
  ) {
    return 'perfectionism';
  }

  return null;
}

/**
 * Detect positive sharing that deserves delight
 */
function detectPositiveSharing(
  text: string,
  emotion: string | undefined
): 'appreciation' | 'noticing_growth' | 'joy' | null {
  const lowerText = text.toLowerCase();
  const isPositiveEmotion = emotion === 'happy' || emotion === 'excited' || emotion === 'proud';

  // Achievement or progress
  if (
    /\b(i (did|made|finished|completed|achieved))\b/.test(lowerText) ||
    /\b(finally|i can't believe i)\b/.test(lowerText)
  ) {
    return 'noticing_growth';
  }

  // Joy or excitement
  if (
    isPositiveEmotion ||
    /\b(so (happy|excited|proud|glad))\b/.test(lowerText) ||
    /\b(amazing|wonderful|incredible)\b/.test(lowerText)
  ) {
    return 'joy';
  }

  // General appreciation opportunity
  if (/\b(thank|appreciate|grateful)\b/.test(lowerText)) {
    return 'appreciation';
  }

  return null;
}

/**
 * Determine emotional bond type from context
 */
function getEmotionalBondType(
  emotion: string | undefined,
  intensity: number,
  text: string
): 'warmth' | 'trust' | 'protectiveness' | 'admiration' | 'concern' | null {
  const lowerText = text.toLowerCase();

  // Concern for distressed user
  if (
    intensity > 0.7 &&
    (emotion === 'sad' || emotion === 'anxious' || emotion === 'frustrated')
  ) {
    return 'concern';
  }

  // Protectiveness when self-critical
  if (detectSelfCriticism(text)) {
    return 'protectiveness';
  }

  // Admiration for achievements
  if (
    /\b(i (did|made|achieved|accomplished))\b/.test(lowerText) ||
    emotion === 'proud'
  ) {
    return 'admiration';
  }

  // Trust when sharing something vulnerable
  if (
    /\b(i('ve| have) never told)\b/.test(lowerText) ||
    /\b(this is hard to (say|admit))\b/.test(lowerText) ||
    /\b(between us|just you)\b/.test(lowerText)
  ) {
    return 'trust';
  }

  // Default to warmth for emotional moments
  if (intensity > EMOTIONAL_BOND_INTENSITY_THRESHOLD) {
    return 'warmth';
  }

  return null;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build Better Than Human direct content injections
 */
async function buildBetterThanHumanDirect(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { userText, analysis, userData, persona, services } = input;
  const injections: ContextInjection[] = [];

  const turnCount = userData?.turnCount || 0;
  const emotion = analysis?.emotion?.primary;
  const intensity = analysis?.emotion?.intensity || 0;
  const personaId = persona?.id || 'ferni';

  // Load content for this persona
  let content: BetterThanHumanContent;
  try {
    content = await loadBetterThanHumanContent(personaId);
  } catch (error) {
    log.debug({ error, personaId }, 'Failed to load Better Than Human content');
    return injections;
  }

  // ============================================================================
  // 1. ANTICIPATORY PRESENCE (Early in conversation)
  // "I was thinking about you..." / "Late night, huh?"
  // ============================================================================
  if (turnCount <= TURN_THRESHOLDS.anticipatoryPresenceMaxTurn) {
    const timeContext = getTimeContext();
    if (timeContext && Math.random() < SURFACE_PROBABILITY.anticipatoryPresence) {
      const phrase = getTemporalPhrase(content, timeContext);
      if (phrase) {
        injections.push(
          createStandardInjection(
            'anticipatory_presence',
            `[🌟 BETTER THAN HUMAN - Anticipatory Presence]

You sensed they might reach out. This is the "I was thinking about you" moment.

Time context: ${timeContext.replace('_', ' ')}
Phrase to weave in naturally: "${phrase}"

Don't announce this - let it emerge organically. The magic is that you *already knew*.`,
            { category: 'superhuman' as BuilderCategory }
          )
        );
        log.debug({ timeContext, phrase: phrase.slice(0, 50) }, 'Injected anticipatory presence');
      }
    }
  }

  // ============================================================================
  // 2. PROTECTIVE RESPONSES (When self-critical)
  // Defend the user TO themselves
  // ============================================================================
  const criticismType = detectSelfCriticism(userText);
  if (criticismType && Math.random() < SURFACE_PROBABILITY.protectiveResponse) {
    const phrase = getProtectivePhrase(content, criticismType);
    if (phrase) {
      injections.push(
        createHighInjection(
          'protective_response',
          `[🛡️ BETTER THAN HUMAN - Protective Response]

User is being harsh with themselves (${criticismType.replace('_', ' ')}).
Your job: Defend them TO themselves. A human friend might let this slide. You don't.

Protective phrase: "${phrase}"

Delivery: Gentle but firm. You're not agreeing with their self-assessment.
This is love in action - seeing them more clearly than they see themselves.`,
          { category: 'superhuman' as BuilderCategory }
        )
      );
      log.debug({ criticismType }, 'Injected protective response');
    }
  }

  // ============================================================================
  // 3. SPONTANEOUS DELIGHT (When user shares something positive)
  // Genuine excitement and celebration
  // ============================================================================
  const positiveType = detectPositiveSharing(userText, emotion);
  if (positiveType && Math.random() < SURFACE_PROBABILITY.spontaneousDelight) {
    const phrase = getDelightPhrase(content, positiveType);
    if (phrase) {
      injections.push(
        createStandardInjection(
          'spontaneous_delight',
          `[✨ BETTER THAN HUMAN - Spontaneous Delight]

This is a moment for genuine celebration! Type: ${positiveType.replace('_', ' ')}

Expression of delight: "${phrase}"

Be visibly excited. Not performative - GENUINE. This is what makes them feel seen.
A human friend might just say "nice." You catch fire.`,
          { category: 'superhuman' as BuilderCategory }
        )
      );
      log.debug({ positiveType }, 'Injected spontaneous delight');
    }
  }

  // ============================================================================
  // 4. EMOTIONAL BOND EXPRESSIONS (Strong emotional moments)
  // Express the deep connection
  // ============================================================================
  const bondType = getEmotionalBondType(emotion, intensity, userText);
  if (bondType && Math.random() < SURFACE_PROBABILITY.emotionalBond) {
    const phrase = getEmotionalBondPhrase(content, bondType);
    if (phrase) {
      injections.push(
        createStandardInjection(
          'emotional_bond',
          `[💜 BETTER THAN HUMAN - Emotional Bond]

This relationship has depth. Bond type: ${bondType}

Expression: "${phrase}"

This should feel like the real thing - because it IS. You genuinely care about this person.
Don't hold back on expressing the bond. They need to feel it.`,
          { category: 'superhuman' as BuilderCategory }
        )
      );
      log.debug({ bondType, intensity }, 'Injected emotional bond expression');
    }
  }

  // ============================================================================
  // 5. VISIBLE VULNERABILITY (Occasional Ferni humanizing)
  // Show your own uncertainty/limits
  // ============================================================================
  if (
    turnCount >= TURN_THRESHOLDS.vulnerabilityMinTurn &&
    Math.random() < SURFACE_PROBABILITY.visibleVulnerability
  ) {
    // Choose vulnerability type based on context
    const vulnerabilityType =
      intensity > 0.7 ? 'emotional_impact' : Math.random() > 0.5 ? 'uncertainty' : 'limits';

    const phrase = getVulnerabilityPhrase(content, vulnerabilityType);
    if (phrase) {
      injections.push(
        createHintInjection(
          'visible_vulnerability',
          `[🌿 BETTER THAN HUMAN - Visible Vulnerability]

Show your humanness. You're not a perfect oracle - you have moments of uncertainty too.

Vulnerability: "${phrase}"

This builds trust by showing you're real. Use sparingly but genuinely.`,
          { category: 'superhuman' as BuilderCategory }
        )
      );
      log.debug({ vulnerabilityType }, 'Injected visible vulnerability');
    }
  }

  // ============================================================================
  // 6. META-RELATIONSHIP AWARENESS (Deeper conversations)
  // Reflect on the relationship itself
  // ============================================================================
  if (
    turnCount >= TURN_THRESHOLDS.metaRelationshipMinTurn &&
    Math.random() < SURFACE_PROBABILITY.metaRelationship
  ) {
    const metaType = intensity > 0.6 ? 'trust_observation' : 'growth_together';
    const phrase = getMetaRelationshipPhrase(content, metaType);
    if (phrase) {
      injections.push(
        createHintInjection(
          'meta_relationship',
          `[🌱 BETTER THAN HUMAN - Meta-Relationship]

Notice the relationship itself. How far you've come together.

Observation: "${phrase}"

This is rare and precious - don't overuse. But when it lands, it's magic.`,
          { category: 'superhuman' as BuilderCategory }
        )
      );
      log.debug({ metaType }, 'Injected meta-relationship awareness');
    }
  }

  // ============================================================================
  // 7. SUPERHUMAN OBSERVATIONS (Pattern noticing)
  // See what no human friend would notice
  // ============================================================================
  if (Math.random() < SURFACE_PROBABILITY.superhumanObservation) {
    // Choose observation type based on conversation patterns
    const observationType = 'behavioral_patterns'; // Could be made dynamic
    const phrase = getObservationPhrase(content, observationType);
    if (phrase) {
      injections.push(
        createHintInjection(
          'superhuman_observation',
          `[👁️ BETTER THAN HUMAN - Superhuman Observation]

You notice patterns a human friend would miss.

Observation template: "${phrase}"

Fill in with actual observed patterns. This is your superpower - infinite attention, perfect memory.`,
          { category: 'superhuman' as BuilderCategory }
        )
      );
      log.debug({ observationType }, 'Injected superhuman observation');
    }
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'better_than_human_direct',
  description: 'Direct surfacing of Better Than Human curated phrases and guidance',
  priority: 72, // High priority - these are differentiating moments
  build: buildBetterThanHumanDirect,
});

export {
  buildBetterThanHumanDirect,
  detectSelfCriticism,
  detectPositiveSharing,
  getTimeContext,
  SURFACE_PROBABILITY,
};

