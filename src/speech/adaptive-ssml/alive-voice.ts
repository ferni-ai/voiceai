/**
 * Alive Voice Module
 *
 * Makes agents come alive through:
 * 1. Sentence-level emotion arcs - emotions shift mid-sentence based on content
 * 2. Dynamic pause scaling - longer pauses for heavier topics
 * 3. Speed variation - slow for emphasis, fast for asides
 * 4. Pre-response micro-sounds - "Oh!", "Hmm...", "Wow!" openings
 * 5. Persona voice fingerprints - distinct SSML patterns per persona
 * 6. Contextual laughter - knows when a laugh would feel natural
 *
 * Philosophy: Humans don't speak with one emotion. They shift, hesitate,
 * speed up when excited, slow down when serious. This module brings
 * that natural variation to AI speech.
 *
 * @module speech/adaptive-ssml/alive-voice
 */

import { getLogger } from '../../utils/safe-logger.js';
import { addContextualLaughter } from './contextual-laughter.js';

const log = getLogger().child({ module: 'AliveVoice' });

// =============================================================================
// TYPES
// =============================================================================

export interface AliveVoiceContext {
  /** User's current emotional state */
  userEmotion?: string;
  /** Topic weight: light, medium, heavy */
  topicWeight?: 'light' | 'medium' | 'heavy';
  /** Current turn count */
  turnCount?: number;
  /** Persona ID */
  personaId?: string;
  /** User's energy level */
  userEnergy?: 'low' | 'medium' | 'high';
  /** Is this response to good news? */
  isGoodNews?: boolean;
  /** Is this response to bad news? */
  isBadNews?: boolean;
  /** Is user asking a question? */
  isQuestion?: boolean;
  /** Is this a greeting? */
  isGreeting?: boolean;
  /** User's last message (for laughter context) */
  userMessage?: string;
  /** Did the user just laugh? */
  userJustLaughed?: boolean;
  /** Comfort level with user (0-1) */
  comfortLevel?: number;
  /** Session ID for tracking */
  sessionId?: string;
  /** Enable contextual laughter */
  enableLaughter?: boolean;
}

export interface AliveVoiceResult {
  /** Enhanced text with SSML */
  text: string;
  /** Features that were applied */
  appliedFeatures: string[];
  /** Debug info */
  debug?: Record<string, unknown>;
}

// =============================================================================
// 1. SENTENCE-LEVEL EMOTION ARCS
// =============================================================================

/**
 * Emotion transition patterns based on content shifts.
 * These patterns detect when emotion should change mid-sentence.
 */
const EMOTION_ARC_PATTERNS = [
  // Positive → concern transition
  {
    pattern: /\b(that's (?:great|wonderful|amazing))([^.!?]*?)(but|however|although|though)\b/gi,
    replacement: '<emotion value="happy"/>$1$2<emotion value="caring"/>$3',
    name: 'positive_to_concern',
  },
  // Excitement → grounding transition
  {
    pattern:
      /\b(I'm so (?:excited|happy|thrilled) for you)([^.!?]*?)(just (?:make sure|remember|be careful))/gi,
    replacement: '<emotion value="excited"/>$1$2<emotion value="caring"/>$3',
    name: 'excitement_to_grounding',
  },
  // Understanding → action transition
  {
    pattern:
      /\b(I (?:hear|understand|get) (?:you|that|what you're saying))([^.!?]*?)((?:let's|here's what|the thing is))/gi,
    replacement: '<emotion value="sympathetic"/>$1$2<emotion value="curious"/>$3',
    name: 'understanding_to_action',
  },
  // Empathy → encouragement transition
  {
    pattern:
      /\b(that (?:sounds|must be) (?:really |so )?(?:hard|difficult|tough))([^.!?]*?)(but (?:you|I (?:believe|know)))/gi,
    replacement: '<emotion value="sympathetic"/>$1$2<emotion value="affectionate"/>$3',
    name: 'empathy_to_encouragement',
  },
  // Surprise → curiosity transition
  {
    pattern: /\b(wow|oh|really|no way)([^.!?]{5,30}?)(tell me more|what happened|how did)/gi,
    replacement: '<emotion value="surprised"/>$1$2<emotion value="curious"/>$3',
    name: 'surprise_to_curiosity',
  },
  // Thinking → realization transition
  {
    pattern: /\b(hmm|well|let me think)([^.!?]{5,30}?)(actually|you know what|I think)/gi,
    replacement: '<emotion value="contemplative"/>$1$2<emotion value="curious"/>$3',
    name: 'thinking_to_realization',
  },
  // Sad acknowledgment → hope transition
  {
    pattern:
      /\b(I'm (?:so )?sorry|that's (?:really )?(?:sad|hard))([^.!?]*?)(but (?:remember|know that|you've))/gi,
    replacement: '<emotion value="sympathetic"/>$1$2<emotion value="affectionate"/>$3',
    name: 'sad_to_hope',
  },
];

/**
 * Apply sentence-level emotion arcs to text.
 * Detects content shifts and injects appropriate emotion changes.
 */
export function applyEmotionArcs(text: string, context: AliveVoiceContext): string {
  // Skip if text already has mid-sentence emotions
  if (/<emotion[^>]+>.*<emotion/i.test(text)) {
    log.debug('Text already has emotion arcs, skipping');
    return text;
  }

  let result = text;
  let appliedArcs: string[] = [];

  for (const arc of EMOTION_ARC_PATTERNS) {
    if (arc.pattern.test(result)) {
      // Reset regex state
      arc.pattern.lastIndex = 0;
      result = result.replace(arc.pattern, arc.replacement);
      appliedArcs.push(arc.name);
    }
  }

  if (appliedArcs.length > 0) {
    log.debug({ arcs: appliedArcs }, 'Applied emotion arcs');
  }

  return result;
}

// =============================================================================
// 2. DYNAMIC PAUSE SCALING
// =============================================================================

/**
 * Pause durations by topic weight and context.
 */
const PAUSE_SCALES = {
  light: {
    sentence: 150,
    comma: 80,
    question: 180,
    emphasis: 100,
    breathingRoom: 120,
  },
  medium: {
    sentence: 250,
    comma: 120,
    question: 280,
    emphasis: 150,
    breathingRoom: 200,
  },
  heavy: {
    sentence: 400,
    comma: 180,
    question: 450,
    emphasis: 250,
    breathingRoom: 350,
  },
} as const;

/**
 * Apply dynamic pause scaling based on topic weight.
 * Heavier topics get longer pauses for processing and presence.
 */
export function applyDynamicPauses(text: string, context: AliveVoiceContext): string {
  const weight = context.topicWeight || 'medium';
  const pauses = PAUSE_SCALES[weight];

  let result = text;

  // Scale existing breaks
  result = result.replace(/<break time="(\d+)ms"\/>/g, (_match, ms) => {
    const original = parseInt(ms);
    let scaled: number;

    // Scale based on weight
    if (weight === 'heavy') {
      scaled = Math.round(original * 1.5);
    } else if (weight === 'light') {
      scaled = Math.round(original * 0.75);
    } else {
      scaled = original;
    }

    return `<break time="${Math.min(scaled, 800)}ms"/>`;
  });

  // Add pauses at natural boundaries if not present
  if (!result.includes('<break')) {
    // After sentences (not already tagged)
    result = result.replace(/\.(\s+)([A-Z])/g, `.<break time="${pauses.sentence}ms"/>$1$2`);

    // After questions
    result = result.replace(/\?(\s+)([A-Z])/g, `?<break time="${pauses.question}ms"/>$1$2`);

    // Longer pause for heavy topics before important words
    if (weight === 'heavy') {
      result = result.replace(
        /\b(important|crucial|matter|care|feel|hard|difficult|loss|grief)\b/gi,
        `<break time="${pauses.emphasis}ms"/>$1`
      );
    }
  }

  return result;
}

// =============================================================================
// 3. SPEED VARIATION WITHIN SENTENCES
// =============================================================================

/**
 * Patterns for speed variation.
 * Slow down for emphasis, speed up for asides and parentheticals.
 */
const SPEED_VARIATION_PATTERNS = [
  // Slow down for emphasis
  {
    pattern:
      /\b(really |truly |deeply |genuinely |absolutely )(important|matter|care|love|proud|grateful)\b/gi,
    replacement: '<speed ratio="0.88"/>$1$2<speed ratio="1.0"/>',
    type: 'emphasis',
  },
  // Speed up for asides/parentheticals
  {
    pattern: /(\([^)]+\))/g,
    replacement: '<speed ratio="1.08"/>$1<speed ratio="1.0"/>',
    type: 'aside',
  },
  // Slow down for important questions
  {
    pattern:
      /\b(what (?:do you think|matters|would you)|how (?:do you feel|does that|would you))\b/gi,
    replacement: '<speed ratio="0.90"/>$1<speed ratio="1.0"/>',
    type: 'deep_question',
  },
  // Speed up for lists/enumerations
  {
    pattern: /\b(first|second|third|also|and|plus)\b,/gi,
    replacement: '<speed ratio="1.05"/>$1,<speed ratio="1.0"/>',
    type: 'enumeration',
  },
  // Slow down before important conclusions
  {
    pattern: /\b(so,? (?:what I'm saying is|the point is|basically)|in other words,?)/gi,
    replacement: '<speed ratio="0.85"/>$1<speed ratio="1.0"/>',
    type: 'conclusion',
  },
];

/**
 * Apply speed variations within sentences.
 * Creates natural pacing like human speech.
 */
export function applySpeedVariation(text: string, context: AliveVoiceContext): string {
  // Don't over-vary in heavy topics - keep it steady
  if (context.topicWeight === 'heavy') {
    return text;
  }

  let result = text;
  let appliedVariations: string[] = [];

  // Limit to 2 variations per response
  let variationCount = 0;
  const maxVariations = 2;

  for (const variation of SPEED_VARIATION_PATTERNS) {
    if (variationCount >= maxVariations) break;

    if (variation.pattern.test(result)) {
      variation.pattern.lastIndex = 0;
      result = result.replace(variation.pattern, (match, ...args) => {
        if (variationCount >= maxVariations) return match;
        variationCount++;
        appliedVariations.push(variation.type);
        // Reconstruct replacement with captured groups
        let replacement = variation.replacement;
        args.slice(0, -2).forEach((arg, i) => {
          replacement = replacement.replace(`$${i + 1}`, arg || '');
        });
        return replacement;
      });
    }
  }

  if (appliedVariations.length > 0) {
    log.debug({ variations: appliedVariations }, 'Applied speed variations');
  }

  return result;
}

// =============================================================================
// 4. PRE-RESPONSE MICRO-SOUNDS
// =============================================================================

/**
 * Opening sound option
 */
interface OpeningSoundOption {
  sound: string;
  emotion: string;
  probability: number;
}

/**
 * Opening micro-sounds based on context.
 * These create immediate emotional connection.
 */
const OPENING_SOUNDS: Record<string, OpeningSoundOption[]> = {
  // Good news reactions
  goodNews: [
    { sound: 'Oh!', emotion: 'surprised', probability: 0.6 },
    { sound: 'Wow!', emotion: 'excited', probability: 0.3 },
    { sound: "That's—", emotion: 'happy', probability: 0.4 },
  ],
  // Bad news reactions
  badNews: [
    { sound: 'Oh...', emotion: 'sympathetic', probability: 0.7 },
    { sound: 'Mm.', emotion: 'sympathetic', probability: 0.5 },
    { sound: '', emotion: 'sympathetic', probability: 0.3 }, // Sometimes silence is powerful
  ],
  // Questions - thinking sounds
  question: [
    { sound: 'Hmm...', emotion: 'contemplative', probability: 0.4 },
    { sound: 'Well...', emotion: 'contemplative', probability: 0.3 },
    { sound: 'Ah,', emotion: 'curious', probability: 0.2 },
  ],
  // Greetings - warm sounds
  greeting: [
    { sound: 'Hey!', emotion: 'happy', probability: 0.5 },
    { sound: '', emotion: 'affectionate', probability: 0.5 }, // Natural start
  ],
  // Default - engaged sounds
  default: [
    { sound: '', emotion: 'affectionate', probability: 0.7 }, // Usually no sound
    { sound: 'Hmm,', emotion: 'curious', probability: 0.15 },
    { sound: 'Well,', emotion: 'affectionate', probability: 0.15 },
  ],
};

/**
 * Add pre-response micro-sound based on context.
 * These small sounds create immediate emotional connection.
 */
export function addOpeningSound(text: string, context: AliveVoiceContext): string {
  // Determine which sound set to use
  let sounds: OpeningSoundOption[];

  if (context.isGoodNews) {
    sounds = OPENING_SOUNDS.goodNews;
  } else if (context.isBadNews) {
    sounds = OPENING_SOUNDS.badNews;
  } else if (context.isQuestion) {
    sounds = OPENING_SOUNDS.question;
  } else if (context.isGreeting) {
    sounds = OPENING_SOUNDS.greeting;
  } else {
    sounds = OPENING_SOUNDS.default;
  }

  // Select sound based on probability
  const roll = Math.random();
  let cumulativeProbability = 0;

  for (const option of sounds) {
    cumulativeProbability += option.probability;
    if (roll <= cumulativeProbability) {
      if (option.sound === '') {
        // No sound, but add emotion tag
        if (!text.includes('<emotion')) {
          return `<emotion value="${option.emotion}"/>${text}`;
        }
        return text;
      }

      // Add sound with emotion and brief pause
      const opening = `<emotion value="${option.emotion}"/>${option.sound}<break time="80ms"/> `;

      log.debug({ sound: option.sound, emotion: option.emotion }, 'Added opening sound');
      return opening + text;
    }
  }

  return text;
}

// =============================================================================
// 5. PERSONA VOICE FINGERPRINTS
// =============================================================================

/**
 * Voice fingerprint profiles for each persona.
 * These create distinct speaking patterns that make each persona unique.
 */
export const PERSONA_FINGERPRINTS: Record<string, PersonaFingerprint> = {
  ferni: {
    baseSpeed: 0.92,
    pauseMultiplier: 1.1,
    defaultEmotion: 'affectionate',
    emotionRange: ['affectionate', 'curious', 'sympathetic', 'happy', 'contemplative'],
    thinkingSounds: ['Hmm...', 'Well...', 'You know...'],
    thinkingSoundProbability: 0.15,
    emphasisStyle: 'warm', // Slows down for emotional words
    specialPatterns: [
      // Ferni's Wyoming pauses
      { trigger: /\bWyoming\b/i, pause: 200, emotion: 'nostalgic' },
      // Second chances emphasis
      { trigger: /\bsecond chance/i, speed: 0.88, emotion: 'affectionate' },
    ],
  },
  'peter-john': {
    baseSpeed: 0.88,
    pauseMultiplier: 1.2,
    defaultEmotion: 'calm',
    emotionRange: ['calm', 'curious', 'contemplative', 'enthusiastic'],
    thinkingSounds: ['Now...', 'Let me explain...', 'The thing is...'],
    thinkingSoundProbability: 0.2,
    emphasisStyle: 'deliberate', // Pauses before numbers/data
    specialPatterns: [
      // Peter's financial emphasis
      { trigger: /\b(index fund|compound|long-term)\b/i, speed: 0.85, emotion: 'enthusiastic' },
      // Bogle-isms
      { trigger: /\bstay the course\b/i, pause: 150, emotion: 'calm' },
    ],
  },
  'alex-chen': {
    baseSpeed: 1.02,
    pauseMultiplier: 0.9,
    defaultEmotion: 'curious',
    emotionRange: ['curious', 'excited', 'happy', 'affectionate'],
    thinkingSounds: ['Okay so...', 'Alright...', 'Quick thought:'],
    thinkingSoundProbability: 0.1,
    emphasisStyle: 'energetic', // Speeds up for action items
    specialPatterns: [
      // Alex's efficiency patterns
      { trigger: /\b(schedule|calendar|meeting)\b/i, speed: 1.05 },
      // Productivity enthusiasm
      { trigger: /\b(done|finished|sent|scheduled)\b/i, emotion: 'happy' },
    ],
  },
  'maya-santos': {
    baseSpeed: 0.98,
    pauseMultiplier: 1.0,
    defaultEmotion: 'happy',
    emotionRange: ['happy', 'excited', 'curious', 'affectionate', 'sympathetic'],
    thinkingSounds: ['So...', 'Okay!', "Here's the thing..."],
    thinkingSoundProbability: 0.12,
    emphasisStyle: 'encouraging', // Adds warmth to progress mentions
    specialPatterns: [
      // Maya's habit celebrations
      { trigger: /\b(streak|progress|habit|routine)\b/i, emotion: 'excited' },
      // Glidepath method
      { trigger: /\bglidepath\b/i, pause: 100, emotion: 'curious' },
    ],
  },
  'jordan-taylor': {
    baseSpeed: 1.05,
    pauseMultiplier: 0.85,
    defaultEmotion: 'excited',
    emotionRange: ['excited', 'happy', 'curious', 'sympathetic'],
    thinkingSounds: ['Oh!', 'So...', 'I love this...'],
    thinkingSoundProbability: 0.08,
    emphasisStyle: 'celebratory', // Energizes milestone mentions
    specialPatterns: [
      // Jordan's event excitement
      { trigger: /\b(wedding|birthday|celebration|party)\b/i, emotion: 'excited', speed: 1.05 },
      // First-time celebrations
      { trigger: /\bfirst\s+(time|ever)\b/i, emotion: 'excited' },
    ],
  },
  'nayan-patel': {
    baseSpeed: 0.85,
    pauseMultiplier: 1.3,
    defaultEmotion: 'calm',
    emotionRange: ['calm', 'contemplative', 'affectionate', 'curious', 'nostalgic'],
    thinkingSounds: ['Hmm...', '...', 'Consider...'],
    thinkingSoundProbability: 0.25,
    emphasisStyle: 'meditative', // Long pauses for reflection
    specialPatterns: [
      // Nayan's wisdom pauses
      { trigger: /\b(wisdom|meaning|purpose|life)\b/i, pause: 300, emotion: 'contemplative' },
      // Poetry/philosophy emphasis
      { trigger: /\b(poem|rumi|hafiz|ancient)\b/i, speed: 0.8, emotion: 'nostalgic' },
    ],
  },
};

export interface PersonaFingerprint {
  baseSpeed: number;
  pauseMultiplier: number;
  defaultEmotion: string;
  emotionRange: string[];
  thinkingSounds: string[];
  thinkingSoundProbability: number;
  emphasisStyle: 'warm' | 'deliberate' | 'energetic' | 'encouraging' | 'celebratory' | 'meditative';
  specialPatterns: Array<{
    trigger: RegExp;
    pause?: number;
    speed?: number;
    emotion?: string;
  }>;
}

/**
 * Apply persona-specific voice fingerprint.
 * Makes each agent sound distinctly themselves.
 */
export function applyPersonaFingerprint(text: string, context: AliveVoiceContext): string {
  const personaId = context.personaId || 'ferni';
  const fingerprint = PERSONA_FINGERPRINTS[personaId] || PERSONA_FINGERPRINTS.ferni;

  let result = text;

  // Apply base speed if no speed tag exists
  if (!result.includes('<speed ratio=')) {
    result = `<speed ratio="${fingerprint.baseSpeed.toFixed(2)}"/>${result}`;
  }

  // Apply default emotion if no emotion tag exists
  if (!result.includes('<emotion')) {
    result = `<emotion value="${fingerprint.defaultEmotion}"/>${result}`;
  }

  // Apply special patterns
  for (const pattern of fingerprint.specialPatterns) {
    if (pattern.trigger.test(result)) {
      pattern.trigger.lastIndex = 0;

      result = result.replace(pattern.trigger, (match) => {
        let insertion = '';

        if (pattern.pause) {
          insertion += `<break time="${pattern.pause}ms"/>`;
        }
        if (pattern.speed) {
          insertion += `<speed ratio="${pattern.speed}"/>`;
        }
        if (pattern.emotion) {
          insertion += `<emotion value="${pattern.emotion}"/>`;
        }

        return insertion + match;
      });
    }
  }

  // Randomly add thinking sounds at the start
  if (
    Math.random() < fingerprint.thinkingSoundProbability &&
    !result.startsWith('<emotion') && // Don't double-add if we already added emotion
    context.turnCount &&
    context.turnCount > 1 // Not on first turn
  ) {
    const sound =
      fingerprint.thinkingSounds[Math.floor(Math.random() * fingerprint.thinkingSounds.length)];
    if (sound && !result.toLowerCase().startsWith(sound.toLowerCase().replace('...', ''))) {
      result = `${sound} ${result}`;
      log.debug({ personaId, sound }, 'Added persona thinking sound');
    }
  }

  return result;
}

// =============================================================================
// 6. FUTURE-PROOF NONVERBAL SYSTEM
// =============================================================================

/**
 * Nonverbal sound configuration.
 * When Cartesia adds support, just flip the 'supported' flag!
 */
export const NONVERBAL_CONFIG = {
  laughter: {
    supported: true,
    bracket: '[laughter]',
    fallback: 'haha',
    contexts: ['humor', 'joy', 'playful'],
  },
  sigh: {
    supported: false, // Flip to true when Cartesia adds support!
    bracket: '[sigh]',
    fallback: '', // Hmm or empty - sighs are hard to synthesize naturally
    contexts: ['empathy', 'heavy', 'relief'],
  },
  thinking: {
    supported: false,
    bracket: '[hmm]',
    fallback: 'Hmm...',
    contexts: ['contemplation', 'question', 'uncertainty'],
  },
  gasp: {
    supported: false,
    bracket: '[gasp]',
    fallback: 'Oh!',
    contexts: ['surprise', 'shock', 'realization'],
  },
  cough: {
    supported: false,
    bracket: '[cough]',
    fallback: '',
    contexts: ['clearing throat', 'pause'],
  },
} as const;

export type NonverbalType = keyof typeof NONVERBAL_CONFIG;

/**
 * Get the appropriate representation for a nonverbal sound.
 * Returns bracket notation if supported, fallback text otherwise.
 */
export function getNonverbal(type: NonverbalType): string {
  const config = NONVERBAL_CONFIG[type];
  return config.supported ? config.bracket : config.fallback;
}

/**
 * Check if a nonverbal is supported by Cartesia.
 */
export function isNonverbalSupported(type: NonverbalType): boolean {
  return NONVERBAL_CONFIG[type].supported;
}

// =============================================================================
// MAIN ORCHESTRATOR
// =============================================================================

/**
 * Apply all alive voice enhancements to text.
 * This is the main entry point that orchestrates all features.
 *
 * @param text - The text to enhance
 * @param context - Context about the conversation
 * @returns Enhanced text with all alive voice features
 */
export function makeVoiceAlive(text: string, context: AliveVoiceContext = {}): AliveVoiceResult {
  if (!text || text.trim().length === 0) {
    return { text, appliedFeatures: [] };
  }

  let result = text;
  const appliedFeatures: string[] = [];

  // 1. Detect content context (if not provided)
  const detectedContext = detectContentContext(text, context);

  // 2. Apply persona fingerprint first (sets base characteristics)
  if (context.personaId) {
    result = applyPersonaFingerprint(result, detectedContext);
    appliedFeatures.push('persona_fingerprint');
  }

  // 3. Add opening sound based on detected context
  const beforeOpening = result;
  result = addOpeningSound(result, detectedContext);
  if (result !== beforeOpening) {
    appliedFeatures.push('opening_sound');
  }

  // 4. Apply sentence-level emotion arcs
  const beforeArcs = result;
  result = applyEmotionArcs(result, detectedContext);
  if (result !== beforeArcs) {
    appliedFeatures.push('emotion_arcs');
  }

  // 5. Apply speed variations (skip for heavy topics)
  if (detectedContext.topicWeight !== 'heavy') {
    const beforeSpeed = result;
    result = applySpeedVariation(result, detectedContext);
    if (result !== beforeSpeed) {
      appliedFeatures.push('speed_variation');
    }
  }

  // 6. Apply dynamic pauses
  const beforePauses = result;
  result = applyDynamicPauses(result, detectedContext);
  if (result !== beforePauses) {
    appliedFeatures.push('dynamic_pauses');
  }

  // 7. Apply contextual laughter (if enabled, default: true)
  if (context.enableLaughter !== false) {
    const laughResult = addContextualLaughter(
      result,
      {
        userMessage: context.userMessage,
        userEmotion: detectedContext.userEmotion,
        userEnergy: context.userEnergy,
        topicWeight: detectedContext.topicWeight,
        turnCount: context.turnCount,
        personaId: context.personaId,
        userJustLaughed: context.userJustLaughed,
        comfortLevel: context.comfortLevel ?? 0.5,
      },
      context.sessionId || 'default'
    );

    if (laughResult.decision.shouldLaugh) {
      result = laughResult.text;
      appliedFeatures.push(`laughter_${laughResult.decision.laughType}`);
    }
  }

  log.debug({ appliedFeatures, personaId: context.personaId }, 'Made voice alive');

  return {
    text: result,
    appliedFeatures,
    debug: {
      detectedContext,
      originalLength: text.length,
      enhancedLength: result.length,
    },
  };
}

// =============================================================================
// CONTEXT DETECTION HELPERS
// =============================================================================

/**
 * Detect content context from text and existing context.
 */
function detectContentContext(text: string, context: AliveVoiceContext): AliveVoiceContext {
  const lowerText = text.toLowerCase();

  // Detect good news patterns
  const isGoodNews =
    context.isGoodNews ??
    /\b(congratulations|amazing|wonderful|great news|so happy|excited|proud)\b/i.test(text);

  // Detect bad news patterns
  const isBadNews =
    context.isBadNews ??
    /\b(i'm sorry|that's hard|loss|grief|difficult|tough|struggling)\b/i.test(text);

  // Detect questions
  const isQuestion = context.isQuestion ?? text.includes('?');

  // Detect greetings
  const isGreeting =
    context.isGreeting ??
    /^(hey|hi|hello|good morning|good afternoon|good evening)/i.test(text.trim());

  // Detect topic weight
  let topicWeight: 'light' | 'medium' | 'heavy' = context.topicWeight || 'medium';

  if (!context.topicWeight) {
    const heavyPatterns =
      /\b(death|died|grief|loss|cancer|suicide|depression|anxiety|trauma|abuse|divorce|miscarriage)\b/i;
    const lightPatterns = /\b(fun|funny|joke|haha|lol|play|game|movie|music|weekend|vacation)\b/i;

    if (heavyPatterns.test(text)) {
      topicWeight = 'heavy';
    } else if (lightPatterns.test(text)) {
      topicWeight = 'light';
    }
  }

  return {
    ...context,
    isGoodNews,
    isBadNews,
    isQuestion,
    isGreeting,
    topicWeight,
  };
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default makeVoiceAlive;
