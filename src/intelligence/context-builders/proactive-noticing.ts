/**
 * Proactive Noticing Context Builder
 *
 * "Better Than Human" - Actually SPEAKS the patterns we detect.
 *
 * Most AI systems detect patterns but never surface them.
 * This builder actively injects "I notice..." observations
 * that create "they really see me" moments.
 *
 * What we surface:
 * - Repeated mentions of topics/emotions (3+ times)
 * - Voice/text contradictions ("I'm fine" + sad voice)
 * - Deflection patterns (avoiding certain topics)
 * - Growth moments (changed behavior over time)
 * - Energy/mood patterns across conversations
 *
 * @module ProactiveNoticingContext
 */

import {
  type ContextBuilderInput,
  type ContextInjection,
  createHighInjection,
  createStandardInjection,
  registerContextBuilder,
} from './index.js';
import { BuilderCategory } from './core/categories.js';
import { createLogger } from '../../utils/safe-logger.js';
import { loadPersonaContent } from '../../services/persona-content-loader.js';

const log = createLogger({ module: 'ProactiveNoticing' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Probability of surfacing a notice (to avoid overuse)
 * Start conservative - can increase based on user reception
 */
const SURFACING_PROBABILITY = 0.15; // 15% chance per turn when triggered

/**
 * Minimum turns between surfacing notices
 */
const MIN_TURNS_BETWEEN_NOTICES = 8;

/**
 * Minimum relationship stage for deeper noticing
 */
const DEEP_NOTICING_MIN_STAGE = 'friend';

/**
 * In-memory tracking to avoid over-surfacing
 */
const lastNoticeSurfaced = new Map<string, number>(); // userId -> turnCount

// ============================================================================
// I-NOTICE PHRASE LOADING
// ============================================================================

interface ProactiveTrigger {
  trigger: string;
  behavior: string;
}

interface INoticePhrases {
  opening_frames: {
    gentle_openings?: string[];
    gentle_openers?: string[];
    soft_landings?: string[];
  };
  surfacing_phrases: {
    temporal_patterns?: string[];
    behavioral_patterns?: string[];
    emotional_patterns?: string[];
    habit_patterns?: string[];
    growth_patterns?: string[];
    communication_patterns?: string[];
    timing_patterns?: string[];
    avoidance_patterns?: string[];
    transition_patterns?: string[];
    celebration_patterns?: string[];
    life_arc_patterns?: string[];
    spiritual_patterns?: string[];
    financial_patterns?: string[];
  };
  contradiction_surfacing: {
    phrases?: string[];
    gentle_call_outs?: string[];
    relationship_gate?: string;
  };
  growth_noticing?: {
    phrases: string[];
  };
  voice_noticing?: {
    phrases: string[];
  };
  what_they_didnt_say?: {
    phrases: string[];
  };
  /** Dynamic triggers - CONDITIONS that prompt noticing, not scripts */
  proactive_notice_triggers?: Record<string, ProactiveTrigger>;
  /** Pattern categories - guidance for what to scan for */
  pattern_categories?: Record<string, string>;
  /** Usage rules with dynamic conditions */
  usage_rules?: {
    probability?: number;
    min_turns_between?: number;
    relationship_gate?: string;
    ask_permission_first?: boolean;
    frame_as?: string;
    more_likely_when?: string[];
    never_when?: string[];
  };
}

let cachedPhrases: INoticePhrases | null = null;

async function loadINoticePhrases(personaId: string): Promise<INoticePhrases | null> {
  if (cachedPhrases) return cachedPhrases;

  try {
    const content = await loadPersonaContent<INoticePhrases>(personaId, 'i-notice-power');
    if (content) {
      cachedPhrases = content;
      return cachedPhrases;
    }
  } catch (err) {
    log.debug({ personaId, error: String(err) }, 'Could not load i-notice-power.json');
  }

  return null;
}

// ============================================================================
// PATTERN DETECTION HELPERS
// ============================================================================

interface TopicMention {
  topic: string;
  count: number;
  emotion?: string;
  lastMentioned: number; // turn number
}

interface DetectedPattern {
  type: 'frequency' | 'contradiction' | 'deflection' | 'growth' | 'energy';
  description: string;
  confidence: number;
  surfacePhrase: string;
}

/**
 * Detect repeating topic/emotion patterns
 */
function detectFrequencyPattern(
  userText: string,
  userData: ContextBuilderInput['userData'],
  analysis: ContextBuilderInput['analysis']
): DetectedPattern | null {
  // Check for repeated emotion mentions
  const emotion = analysis?.emotion?.primary;
  const intensity = analysis?.emotion?.intensity || 0;

  // Get recent topics from user data
  const recentTopics = userData?.recentTopics || [];
  const currentTopic = analysis?.topics?.primary;

  // Count emotion mentions in recent conversation
  // This is a simplified heuristic - real implementation would use persistent storage
  if (emotion && intensity > 0.5) {
    const emotionMentionThreshold = 3;
    // Check if this emotion appears frequently in recent context
    // For now, use a probability-based trigger with intensity
    if (intensity > 0.7 && Math.random() < 0.3) {
      return {
        type: 'frequency',
        description: `User expressing strong ${emotion} emotion`,
        confidence: intensity,
        surfacePhrase: `You've mentioned feeling ${emotion} a few times now. Is there something underneath that?`,
      };
    }
  }

  return null;
}

/**
 * Detect voice/text contradictions
 */
function detectContradictionPattern(
  userText: string,
  analysis: ContextBuilderInput['analysis']
): DetectedPattern | null {
  const lowerText = userText.toLowerCase();
  const voiceEmotion = analysis?.emotion?.primary;
  const voiceIntensity = analysis?.emotion?.intensity || 0;

  // "I'm fine" patterns with negative voice emotion
  const finePatterns = [
    "i'm fine",
    "i'm okay",
    "it's fine",
    "it's okay",
    "i'm good",
    "it's whatever",
    "it doesn't matter",
  ];

  const negativVoiceEmotions = ['sad', 'anxious', 'frustrated', 'tired', 'stressed', 'worried'];

  const saidFine = finePatterns.some((p) => lowerText.includes(p));
  const voiceSaysOtherwise =
    negativVoiceEmotions.includes(voiceEmotion || '') && voiceIntensity > 0.4;

  if (saidFine && voiceSaysOtherwise) {
    return {
      type: 'contradiction',
      description: `Said "${userText.slice(0, 30)}..." but voice indicates ${voiceEmotion}`,
      confidence: voiceIntensity,
      surfacePhrase: `You said you're fine, but... I hear something else in your voice. You don't have to talk about it. But I notice.`,
    };
  }

  return null;
}

/**
 * Detect deflection/avoidance patterns
 */
function detectDeflectionPattern(userText: string): DetectedPattern | null {
  const lowerText = userText.toLowerCase();

  const deflectionPatterns = [
    /anyway,? (what about|how about|let's talk about)/i,
    /but enough about (me|that)/i,
    /forget i said/i,
    /never ?mind/i,
    /let's move on/i,
    /i don't (want to|wanna) talk about/i,
    /can we (change|talk about something)/i,
  ];

  for (const pattern of deflectionPatterns) {
    if (pattern.test(lowerText)) {
      return {
        type: 'deflection',
        description: 'User deflecting from current topic',
        confidence: 0.7,
        surfacePhrase: `You just steered us away from something. We don't have to go back there. But I noticed.`,
      };
    }
  }

  return null;
}

/**
 * Select appropriate opening frame and phrase
 */
function buildNoticingPhrase(
  pattern: DetectedPattern,
  phrases: INoticePhrases,
  relationshipStage: string
): string {
  // Select opening - handle both naming conventions
  const openings =
    phrases.opening_frames.gentle_openings || phrases.opening_frames.gentle_openers || [];
  const opening = openings.length > 0 ? openings[Math.floor(Math.random() * openings.length)] : '';

  // Get type-specific phrase
  let bodyPhrase = pattern.surfacePhrase;

  switch (pattern.type) {
    case 'contradiction':
      if (
        relationshipStage === 'friend' ||
        relationshipStage === 'close_friend' ||
        relationshipStage === 'familiar'
      ) {
        // Handle both naming conventions
        const contradictionPhrases =
          phrases.contradiction_surfacing.phrases ||
          phrases.contradiction_surfacing.gentle_call_outs ||
          [];
        if (contradictionPhrases.length > 0) {
          bodyPhrase =
            contradictionPhrases[Math.floor(Math.random() * contradictionPhrases.length)];
        }
      }
      break;
    case 'frequency':
      // Try multiple phrase categories based on persona
      const emotionalPhrases =
        phrases.surfacing_phrases.emotional_patterns ||
        phrases.surfacing_phrases.habit_patterns ||
        phrases.surfacing_phrases.behavioral_patterns ||
        phrases.surfacing_phrases.communication_patterns ||
        phrases.surfacing_phrases.life_arc_patterns ||
        [];
      if (emotionalPhrases.length > 0) {
        bodyPhrase = emotionalPhrases[Math.floor(Math.random() * emotionalPhrases.length)];
      }
      break;
    case 'deflection':
      const unsaidPhrases =
        phrases.what_they_didnt_say?.phrases || phrases.surfacing_phrases.avoidance_patterns || [];
      if (unsaidPhrases.length > 0) {
        bodyPhrase = unsaidPhrases[Math.floor(Math.random() * unsaidPhrases.length)];
      }
      break;
  }

  // Clean up template variables (replace with generic if not filled)
  bodyPhrase = bodyPhrase
    .replace(/\{emotion\}/g, 'something heavy')
    .replace(/\{topic\}/g, 'that')
    .replace(/\{person\}/g, 'someone')
    .replace(/\{goal\}/g, 'that goal')
    .replace(/\{value\}/g, 'what matters');

  // Clean up SSML breaks for logging (keep them in actual output)
  const cleanedOpening = opening.replace(/<break[^>]*>/g, '').trim();
  return cleanedOpening ? `${opening} ${bodyPhrase}` : bodyPhrase;
}

/**
 * Check if a dynamic trigger condition matches current context
 */
function checkDynamicTriggers(
  triggers: Record<string, ProactiveTrigger> | undefined,
  context: {
    userText: string;
    emotion?: string;
    intensity?: number;
    turnCount: number;
    relationshipStage: string;
  }
): { matched: boolean; triggerName: string; behavior: string } | null {
  if (!triggers) return null;

  const lowerText = context.userText.toLowerCase();

  for (const [name, trigger] of Object.entries(triggers)) {
    // Skip internal notes
    if (name === '_note') continue;

    // Match triggers based on keywords in the trigger description
    const triggerLower = trigger.trigger.toLowerCase();

    // Check for emotional patterns
    if (
      triggerLower.includes('distress') &&
      context.emotion &&
      ['anxious', 'stressed', 'overwhelmed', 'sad'].includes(context.emotion)
    ) {
      return { matched: true, triggerName: name, behavior: trigger.behavior };
    }

    // Check for "should" language (self-criticism)
    if (
      (triggerLower.includes('should') || triggerLower.includes('self-criticism')) &&
      (lowerText.match(/i should/gi) || []).length >= 2
    ) {
      return { matched: true, triggerName: name, behavior: trigger.behavior };
    }

    // Check for comparison language
    if (
      triggerLower.includes('comparison') &&
      (lowerText.includes('others') ||
        lowerText.includes('everyone else') ||
        lowerText.includes('should be'))
    ) {
      return { matched: true, triggerName: name, behavior: trigger.behavior };
    }

    // Check for avoidance patterns
    if (
      triggerLower.includes('avoidance') &&
      (lowerText.includes("i don't want to") ||
        lowerText.includes("let's not") ||
        lowerText.includes('never mind'))
    ) {
      return { matched: true, triggerName: name, behavior: trigger.behavior };
    }

    // Check for meaning/existential questions
    if (triggerLower.includes('meaning') || triggerLower.includes('point')) {
      if (
        lowerText.includes("what's the point") ||
        lowerText.includes('is this all') ||
        lowerText.includes('why bother')
      ) {
        return { matched: true, triggerName: name, behavior: trigger.behavior };
      }
    }
  }

  return null;
}

// ============================================================================
// MAIN CONTEXT BUILDER
// ============================================================================

async function buildProactiveNoticingContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { userText, analysis, userData, services, persona } = input;
  const userId = services?.userId;
  const turnCount = userData?.turnCount || 0;
  const personaId = persona?.id || 'ferni';
  const relationshipStage =
    ((userData as Record<string, unknown> | undefined)?.relationshipStage as string) || 'stranger';

  // Skip if no user identification
  if (!userId) return [];

  // Load I-notice phrases (do this early to get persona-specific rules)
  const phrases = await loadINoticePhrases(personaId);
  if (!phrases) {
    log.debug({ personaId }, 'No i-notice phrases loaded');
    return [];
  }

  // Get persona-specific usage rules (fall back to defaults)
  const usageRules = phrases.usage_rules || {};
  const minTurns = usageRules.min_turns_between ?? MIN_TURNS_BETWEEN_NOTICES;
  const probability = usageRules.probability ?? SURFACING_PROBABILITY;
  const relationshipGate = usageRules.relationship_gate || 'familiar';
  const neverWhen = usageRules.never_when || [];
  const moreLikelyWhen = usageRules.more_likely_when || [];

  // Skip early turns (let relationship build first)
  if (turnCount < 3) return [];

  // Check "never_when" conditions
  const emotion = analysis?.emotion?.primary;
  if (neverWhen.includes('first_few_turns') && turnCount < 4) return [];
  if (
    neverWhen.includes('user_distressed') &&
    emotion &&
    ['distressed', 'crisis', 'panic'].includes(emotion)
  )
    return [];
  if (neverWhen.includes('user_in_crisis') && emotion === 'crisis') return [];

  // Check cooldown
  const lastNotice = lastNoticeSurfaced.get(userId) || 0;
  if (turnCount - lastNotice < minTurns) {
    return [];
  }

  // Check relationship gate
  const relationshipLevels = [
    'stranger',
    'acquaintance',
    'familiar',
    'friend',
    'close_friend',
    'trusted_advisor',
  ];
  const currentLevel = relationshipLevels.indexOf(relationshipStage);
  const gateLevel = relationshipLevels.indexOf(relationshipGate);
  if (currentLevel < gateLevel) {
    return [];
  }

  // Check for dynamic triggers from the JSON
  const dynamicTrigger = checkDynamicTriggers(phrases.proactive_notice_triggers, {
    userText,
    emotion,
    intensity: analysis?.emotion?.intensity,
    turnCount,
    relationshipStage,
  });

  // Detect patterns using hardcoded detectors
  const patterns: DetectedPattern[] = [];

  // 1. Check for voice/text contradiction (highest priority)
  const contradiction = detectContradictionPattern(userText, analysis);
  if (contradiction) patterns.push(contradiction);

  // 2. Check for deflection
  const deflection = detectDeflectionPattern(userText);
  if (deflection) patterns.push(deflection);

  // 3. Check for frequency patterns
  const frequency = detectFrequencyPattern(userText, userData, analysis);
  if (frequency) patterns.push(frequency);

  // No patterns detected and no dynamic trigger
  if (patterns.length === 0 && !dynamicTrigger) return [];

  // If dynamic trigger matched, create a pattern from it
  if (dynamicTrigger) {
    patterns.push({
      type: 'frequency', // Use frequency as generic type
      description: `Dynamic trigger: ${dynamicTrigger.triggerName}`,
      confidence: 0.8,
      surfacePhrase: dynamicTrigger.behavior,
    });
  }

  // Select highest confidence pattern
  const bestPattern = patterns.sort((a, b) => b.confidence - a.confidence)[0];

  // Calculate adjusted probability based on "more_likely_when" conditions
  let adjustedProbability = probability;
  if (moreLikelyWhen.includes('pattern_repeating') && patterns.length > 1)
    adjustedProbability *= 1.5;
  if (moreLikelyWhen.includes('user_asked_why') && userText.toLowerCase().includes('why'))
    adjustedProbability *= 1.3;
  if (moreLikelyWhen.includes('contradiction_detected') && contradiction)
    adjustedProbability *= 1.4;
  if (dynamicTrigger) adjustedProbability *= 1.5; // Boost when dynamic trigger matches

  // Apply probability gate
  if (Math.random() > Math.min(adjustedProbability, 0.4)) {
    // Cap at 40%
    log.debug(
      { userId, pattern: bestPattern.type, confidence: bestPattern.confidence },
      'Pattern detected but probability gate not passed'
    );
    return [];
  }

  // Build the noticing phrase
  const noticingPhrase = buildNoticingPhrase(bestPattern, phrases, relationshipStage);

  // Record that we surfaced a notice
  lastNoticeSurfaced.set(userId, turnCount);

  // Build guidance with pattern categories if available
  let patternGuidance = '';
  if (phrases.pattern_categories) {
    const categories = Object.entries(phrases.pattern_categories)
      .filter(([key]) => key !== '_note')
      .map(([key, value]) => `- ${key}: ${value}`)
      .slice(0, 3) // Limit to top 3 for brevity
      .join('\n');
    if (categories) {
      patternGuidance = `\n\nPatterns to scan for:\n${categories}`;
    }
  }

  log.info(
    {
      userId,
      pattern: bestPattern.type,
      confidence: bestPattern.confidence,
      turnCount,
      dynamicTrigger: dynamicTrigger?.triggerName,
    },
    '🔍 BETTER-THAN-HUMAN: Surfacing proactive notice'
  );

  return [
    createHighInjection(
      'proactive_noticing',
      `[BETTER-THAN-HUMAN MOMENT] You noticed something worth surfacing. Consider saying something like: "${noticingPhrase}" - but make it natural and in your own voice. This is a "they really see me" moment. Offer an exit ramp.${patternGuidance}`,
      { category: 'trust', confidence: bestPattern.confidence }
    ),
  ];
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder({
  name: 'proactive-noticing',
  description: 'Surfaces "I notice..." observations about patterns (Better Than Human)',
  priority: 35, // After safety, before general context
  category: BuilderCategory.HUMANIZING,
  build: buildProactiveNoticingContext,
});

export { buildProactiveNoticingContext };
