/**
 * Advanced Voice Humanization System
 *
 * Implements research-backed techniques to make Ferni's voice feel genuinely human:
 *
 * 1. **Expanded Emotions** - Uses Cartesia Sonic-3's full 50+ emotion palette
 * 2. **Natural Fillers** - Injects "um", "well", "you know" for spontaneity
 * 3. **Breath Group Pacing** - Natural pauses at phrase boundaries
 * 4. **Speech Rhythm Variation** - Prevents monotonous delivery
 *
 * @see docs/VOICE-HUMANIZATION-RESEARCH.md for research basis
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'AdvancedHumanization' });

// ============================================================================
// CARTESIA EMOTION PALETTE
// Full list of Cartesia Sonic-3 supported emotions
// ============================================================================

export const CARTESIA_EMOTIONS = {
  // Positive emotions
  positive: [
    'happy',
    'excited',
    'enthusiastic',
    'elated',
    'euphoric',
    'triumphant',
    'content',
    'peaceful',
    'serene',
    'calm',
    'grateful',
    'affectionate',
    'trust',
    'sympathetic',
    'flirtatious',
  ],

  // Engagement emotions
  engagement: [
    'curious',
    'amazed',
    'surprised',
    'anticipation',
    'mysterious',
    'joking',
    'comedic',
    'sarcastic',
    'ironic',
  ],

  // Negative emotions
  negative: [
    'sad',
    'dejected',
    'melancholic',
    'disappointed',
    'hurt',
    'angry',
    'mad',
    'outraged',
    'frustrated',
    'agitated',
    'threatened',
    'scared',
    'disgusted',
    'contempt',
    'envious',
  ],

  // Nuanced states
  nuanced: [
    'hesitant',
    'insecure',
    'confused',
    'resigned',
    'guilty',
    'bored',
    'tired',
    'rejected',
    'nostalgic',
    'wistful',
    'apologetic',
  ],
} as const;

// All emotions flattened
export const ALL_CARTESIA_EMOTIONS = [
  ...CARTESIA_EMOTIONS.positive,
  ...CARTESIA_EMOTIONS.engagement,
  ...CARTESIA_EMOTIONS.negative,
  ...CARTESIA_EMOTIONS.nuanced,
] as const;

export type CartesiaEmotion = (typeof ALL_CARTESIA_EMOTIONS)[number];

// ============================================================================
// EMOTION CONTEXT MAPPING
// Maps conversational contexts to appropriate Cartesia emotions
// ============================================================================

export interface EmotionContext {
  /** What the agent is doing */
  agentIntent:
    | 'supportive'
    | 'thinking'
    | 'explaining'
    | 'celebrating'
    | 'comforting'
    | 'joking'
    | 'remembering'
    | 'questioning'
    | 'uncertain'
    | 'apologizing'
    | 'encouraging'
    | 'reflecting';

  /** User's emotional state (if detected) */
  userEmotion?: 'happy' | 'sad' | 'anxious' | 'frustrated' | 'neutral' | 'excited';

  /** Conversation weight */
  topicWeight: 'light' | 'medium' | 'heavy';

  /** Relationship depth */
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

  /** Optional: Current persona */
  personaId?: string;
}

/**
 * Map conversation context to appropriate Cartesia emotion
 *
 * Uses nuanced emotion selection based on:
 * - Agent's intent
 * - User's emotional state
 * - Topic weight
 * - Relationship depth
 */
export function mapContextToEmotion(context: EmotionContext): CartesiaEmotion {
  const { agentIntent, userEmotion, topicWeight, relationshipStage } = context;

  // Heavy topics need gentler emotions
  if (topicWeight === 'heavy') {
    if (userEmotion === 'sad') return 'sympathetic';
    if (userEmotion === 'anxious') return 'calm';
    if (userEmotion === 'frustrated') return 'peaceful';
    return 'affectionate';
  }

  // Intent-based mapping
  switch (agentIntent) {
    case 'supportive':
      if (userEmotion === 'sad') return 'sympathetic';
      if (userEmotion === 'anxious') return 'calm';
      return 'affectionate';

    case 'thinking':
      return 'curious';

    case 'explaining':
      if (relationshipStage === 'trusted_advisor') return 'calm';
      return 'content';

    case 'celebrating':
      if (userEmotion === 'excited') return 'triumphant';
      return 'excited';

    case 'comforting':
      // Note: heavy topics handled at top, but for extra empathy on medium weight
      return userEmotion === 'sad' ? 'sympathetic' : 'affectionate';

    case 'joking':
      if (relationshipStage === 'stranger') return 'content'; // Don't overdo it
      return 'comedic';

    case 'remembering':
      return 'nostalgic';

    case 'questioning':
      return 'curious';

    case 'uncertain':
      return 'hesitant';

    case 'apologizing':
      return 'apologetic';

    case 'encouraging':
      if (userEmotion === 'anxious') return 'calm';
      return 'enthusiastic';

    case 'reflecting':
      return 'wistful';

    default:
      return 'content';
  }
}

/**
 * Get emotion transition for smoother delivery
 * Instead of jumping between emotions, we create a transition path
 */
export function getEmotionTransition(
  fromEmotion: CartesiaEmotion | null,
  toEmotion: CartesiaEmotion
): Array<{ emotion: CartesiaEmotion; breakBefore: string }> {
  // If no previous emotion, just return target
  if (!fromEmotion) {
    return [{ emotion: toEmotion, breakBefore: '' }];
  }

  // Same emotion, no transition needed
  if (fromEmotion === toEmotion) {
    return [{ emotion: toEmotion, breakBefore: '' }];
  }

  // Define emotion "distances" for smooth transitions
  const emotionGroups: Record<string, CartesiaEmotion[]> = {
    warm: ['affectionate', 'sympathetic', 'grateful', 'content', 'peaceful'],
    excited: ['excited', 'enthusiastic', 'triumphant', 'happy', 'elated'],
    thoughtful: ['curious', 'wistful', 'nostalgic', 'calm', 'serene'],
    uncertain: ['hesitant', 'confused', 'insecure', 'apologetic'],
    heavy: ['sad', 'melancholic', 'disappointed', 'sympathetic'],
  };

  // Find groups
  let fromGroup: string | null = null;
  let toGroup: string | null = null;

  for (const [group, emotions] of Object.entries(emotionGroups)) {
    if (emotions.includes(fromEmotion)) fromGroup = group;
    if (emotions.includes(toEmotion)) toGroup = group;
  }

  // Same group = quick transition
  if (fromGroup === toGroup) {
    return [{ emotion: toEmotion, breakBefore: '<break time="200ms"/>' }];
  }

  // Different groups = pause and transition
  return [
    { emotion: 'calm', breakBefore: '<break time="300ms"/>' }, // Neutral transition
    { emotion: toEmotion, breakBefore: '<break time="150ms"/>' },
  ];
}

// ============================================================================
// NATURAL FILLER INJECTION
// Adds spontaneous speech disfluencies for human-like delivery
// ============================================================================

export interface FillerConfig {
  /** Probability of adding filler (0-1) */
  probability: number;

  /** Max fillers per response */
  maxPerResponse: number;

  /** Persona-specific filler preference */
  preferredFillers?: string[];
}

const DEFAULT_FILLER_CONFIG: FillerConfig = {
  probability: 0.12, // 12% chance at injection points
  maxPerResponse: 2,
};

// Fillers categorized by function
const FILLERS = {
  /** Thinking/hesitation fillers */
  thinking: ['Hmm', 'Um', 'Let me see', 'Let me think'],

  /** Transition fillers */
  transition: ['So', 'Well', 'Okay so', 'Alright'],

  /** Connection/engagement fillers */
  connection: ['You know', 'I mean', 'Actually'],

  /** Consideration fillers */
  consideration: ['Well', 'I think', 'It seems like'],
} as const;

// Persona-specific filler preferences
const PERSONA_FILLER_PREFERENCES: Record<string, Array<keyof typeof FILLERS>> = {
  ferni: ['thinking', 'connection', 'consideration'],
  'jack-bogle': ['consideration', 'transition'],
  'peter-john': ['thinking', 'transition'],
  'maya-santos': ['connection', 'thinking'],
  'alex-chen': ['transition', 'consideration'],
  'jordan-taylor': ['connection', 'transition'],
};

/**
 * Determine if we should inject a filler at this point
 */
function shouldInjectFiller(
  text: string,
  position: number,
  config: FillerConfig,
  currentFillerCount: number
): boolean {
  // Don't exceed max
  if (currentFillerCount >= config.maxPerResponse) return false;

  // Check probability
  if (Math.random() > config.probability) return false;

  // Good injection points: after sentence start, before important content
  const before = text.slice(Math.max(0, position - 30), position);
  const after = text.slice(position, position + 30);

  // After sentence start
  if (/^[.!?]\s*$/.test(before)) return true;

  // Before explanations
  if (/^(I think|The thing is|What I|Here's)/i.test(after)) return true;

  // After transitions
  if (/\b(But|And|So|However)\s*$/i.test(before)) return true;

  return Math.random() < 0.5; // 50% chance at other points
}

/**
 * Get appropriate filler for context
 */
function getFillerForContext(
  personaId: string | undefined,
  position: 'start' | 'middle' | 'before_important'
): string {
  const preferences = personaId
    ? PERSONA_FILLER_PREFERENCES[personaId] || ['thinking', 'transition']
    : ['thinking', 'transition'];

  // Choose filler type based on position
  let fillerType: keyof typeof FILLERS;
  switch (position) {
    case 'start':
      fillerType = preferences.includes('transition') ? 'transition' : 'thinking';
      break;
    case 'before_important':
      fillerType = preferences.includes('consideration') ? 'consideration' : 'thinking';
      break;
    case 'middle':
    default: {
      const randomIndex = Math.floor(Math.random() * preferences.length);
      const randomPreference = preferences[randomIndex];
      // Type assertion needed because array access might return undefined
      fillerType = (randomPreference as keyof typeof FILLERS) ?? 'thinking';
    }
  }

  const options = FILLERS[fillerType];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Inject natural fillers into text
 *
 * @param text - The text to inject fillers into
 * @param config - Filler configuration
 * @param personaId - Optional persona for filler style
 * @returns Text with fillers injected
 */
export function injectNaturalFillers(
  text: string,
  config: FillerConfig = DEFAULT_FILLER_CONFIG,
  personaId?: string
): string {
  // Don't add fillers to very short responses
  if (text.length < 50) return text;

  // Don't add fillers if already has SSML emotion tags (complex response)
  if (text.includes('<emotion')) return text;

  let result = text;
  let fillerCount = 0;
  const sentences = text.split(/(?<=[.!?])\s+/);

  // Process each sentence
  const processedSentences = sentences.map((sentence, index) => {
    // Skip first sentence if it's a greeting
    if (index === 0 && /^(Hi|Hey|Hello|Good|Welcome)/i.test(sentence)) {
      return sentence;
    }

    // Check for injection at sentence start
    if (shouldInjectFiller(text, 0, config, fillerCount) && index > 0) {
      const filler = getFillerForContext(personaId, 'start');
      fillerCount++;
      return `${filler}... <break time="150ms"/> ${sentence}`;
    }

    // Check for injection before important content
    const importantMatch = sentence.match(/^(.{10,}?)(I think|The thing is|What I|Here's)/i);
    if (importantMatch && shouldInjectFiller(text, importantMatch[1].length, config, fillerCount)) {
      const filler = getFillerForContext(personaId, 'before_important');
      fillerCount++;
      return sentence.replace(
        importantMatch[2],
        `${filler}, <break time="100ms"/> ${importantMatch[2]}`
      );
    }

    return sentence;
  });

  result = processedSentences.join(' ');

  if (fillerCount > 0) {
    log.debug({ fillerCount, personaId }, 'Injected natural fillers');
  }

  return result;
}

// ============================================================================
// BREATH GROUP PACING
// Natural pauses at phrase boundaries, mimicking human breath patterns
// ============================================================================

export interface BreathGroupConfig {
  /** Short pause (ms) for minor boundaries */
  shortPause: number;

  /** Medium pause (ms) for clause boundaries */
  mediumPause: number;

  /** Long pause (ms) for sentence boundaries */
  longPause: number;

  /** Enable breath group detection */
  enabled: boolean;
}

const DEFAULT_BREATH_CONFIG: BreathGroupConfig = {
  shortPause: 120,
  mediumPause: 220,
  longPause: 350,
  enabled: true,
};

/**
 * Add natural breath group pauses to text
 *
 * Humans speak in "breath groups" - phrases produced on a single exhalation.
 * This function identifies natural phrase boundaries and adds appropriate pauses.
 */
export function addBreathGroupPauses(
  text: string,
  config: BreathGroupConfig = DEFAULT_BREATH_CONFIG
): string {
  if (!config.enabled) return text;

  let result = text;

  // ═══════════════════════════════════════════════════════════════════════════
  // SENTENCE-LEVEL PAUSES (Long breath)
  // ═══════════════════════════════════════════════════════════════════════════

  // After sentence endings (period, exclamation, question)
  result = result.replace(/([.!?])\s+(?=[A-Z])/g, `$1 <break time="${config.longPause}ms"/> `);

  // ═══════════════════════════════════════════════════════════════════════════
  // CLAUSE-LEVEL PAUSES (Medium breath)
  // ═══════════════════════════════════════════════════════════════════════════

  // Before conjunctions (but, however, although, though)
  result = result.replace(
    /\s+(but|however|although|though)\s+/gi,
    ` <break time="${config.mediumPause}ms"/> $1 `
  );

  // After long introductory phrases (more than 4 words before comma)
  result = result.replace(
    /^(\w+\s+\w+\s+\w+\s+\w+[^,]*),\s+/gm,
    `$1, <break time="${config.mediumPause}ms"/> `
  );

  // Before "because", "since", "so that"
  result = result.replace(
    /\s+(because|since|so that)\s+/gi,
    ` <break time="${config.shortPause}ms"/> $1 `
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PHRASE-LEVEL PAUSES (Short breath)
  // ═══════════════════════════════════════════════════════════════════════════

  // After commas in lists (if followed by "and" or "or")
  result = result.replace(/,\s+(and|or)\s+/gi, `, <break time="${config.shortPause}ms"/> $1 `);

  // Before parenthetical remarks
  result = result.replace(/\s+—\s+/g, ` <break time="${config.shortPause}ms"/> — `);

  // After time markers
  result = result.replace(
    /(right now|at this point|for now|currently),?\s+/gi,
    `$1 <break time="${config.shortPause}ms"/> `
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // EMPHASIS PAUSES
  // ═══════════════════════════════════════════════════════════════════════════

  // Before important words/phrases
  result = result.replace(
    /\b(really|truly|actually|honestly|importantly)\s+/gi,
    `<break time="${config.shortPause}ms"/> $1 `
  );

  // Clean up double breaks
  result = result.replace(/(<break time="\d+ms"\/>\s*){2,}/g, (match) => {
    // Keep the longest pause
    const pauses = match.match(/\d+/g) || [];
    const maxPause = Math.max(...pauses.map(Number));
    return `<break time="${maxPause}ms"/> `;
  });

  // Clean up excessive whitespace
  result = result.replace(/\s{2,}/g, ' ');

  return result;
}

// ============================================================================
// SPEECH RHYTHM VARIATION
// Prevents monotonous delivery by varying speed within a response
// ============================================================================

export interface RhythmVariation {
  /** Speed multiplier for this segment */
  speedRatio: number;

  /** Text content */
  content: string;
}

/**
 * Analyze text and suggest speed variations for natural rhythm
 *
 * Different content types benefit from different speeds:
 * - Important points: slightly slower
 * - Examples/lists: slightly faster
 * - Emotional content: slower
 * - Conclusions: slower, more deliberate
 */
export function analyzeRhythm(text: string): RhythmVariation[] {
  const segments: RhythmVariation[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    // Important/emphasis content → slower
    if (/\b(important|key|crucial|remember|note that)\b/i.test(sentence)) {
      segments.push({ speedRatio: 0.92, content: sentence });
      continue;
    }

    // Questions → slightly slower, thoughtful
    if (/\?$/.test(sentence)) {
      segments.push({ speedRatio: 0.95, content: sentence });
      continue;
    }

    // Emotional content → slower
    if (/\b(feel|feeling|emotion|heart|love|care|worry|concern)\b/i.test(sentence)) {
      segments.push({ speedRatio: 0.9, content: sentence });
      continue;
    }

    // Lists/examples → slightly faster
    if (/\b(for example|such as|like|first|second|third)\b/i.test(sentence)) {
      segments.push({ speedRatio: 1.05, content: sentence });
      continue;
    }

    // Conclusions → slower, more weight
    if (/\b(so|therefore|in conclusion|ultimately|the point is)\b/i.test(sentence)) {
      segments.push({ speedRatio: 0.93, content: sentence });
      continue;
    }

    // Default: normal speed
    segments.push({ speedRatio: 1.0, content: sentence });
  }

  return segments;
}

/**
 * Apply rhythm variations as SSML speed tags
 */
export function applyRhythmVariations(variations: RhythmVariation[]): string {
  return variations
    .map((v) => {
      if (v.speedRatio === 1.0) {
        return v.content;
      }
      return `<speed ratio="${v.speedRatio.toFixed(2)}"/>${v.content}`;
    })
    .join(' <break time="200ms"/> ');
}

// ============================================================================
// MAIN HUMANIZATION PIPELINE
// Combines all techniques into a unified pipeline
// ============================================================================

export interface HumanizationOptions {
  /** Enable filler injection */
  fillers: boolean;

  /** Enable breath group pacing */
  breathGroups: boolean;

  /** Enable rhythm variation */
  rhythmVariation: boolean;

  /** Enable emotion mapping */
  emotionMapping: boolean;

  /** Filler configuration */
  fillerConfig?: FillerConfig;

  /** Breath group configuration */
  breathConfig?: BreathGroupConfig;

  /** Persona ID for persona-specific adjustments */
  personaId?: string;

  /** Emotion context for mapping */
  emotionContext?: EmotionContext;
}

const DEFAULT_OPTIONS: HumanizationOptions = {
  fillers: true,
  breathGroups: true,
  rhythmVariation: true,
  emotionMapping: true,
};

/**
 * Apply full humanization pipeline to text
 *
 * This is the main entry point for the advanced humanization system.
 * It combines all techniques for maximum natural speech effect.
 */
export function humanizeText(text: string, options: Partial<HumanizationOptions> = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let result = text;

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Emotion mapping (if context provided)
  // ═══════════════════════════════════════════════════════════════════════════
  if (opts.emotionMapping && opts.emotionContext) {
    const emotion = mapContextToEmotion(opts.emotionContext);
    // Prepend emotion tag
    result = `<emotion value="${emotion}"/>${result}`;
    log.debug({ emotion, intent: opts.emotionContext.agentIntent }, 'Applied emotion mapping');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Natural filler injection
  // ═══════════════════════════════════════════════════════════════════════════
  if (opts.fillers) {
    result = injectNaturalFillers(result, opts.fillerConfig, opts.personaId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Breath group pacing
  // ═══════════════════════════════════════════════════════════════════════════
  if (opts.breathGroups) {
    result = addBreathGroupPauses(result, opts.breathConfig);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Rhythm variation
  // ═══════════════════════════════════════════════════════════════════════════
  if (opts.rhythmVariation && !result.includes('<speed')) {
    const variations = analyzeRhythm(result);
    // Only apply if there's meaningful variation
    const hasVariation = variations.some((v) => v.speedRatio !== 1.0);
    if (hasVariation) {
      result = applyRhythmVariations(variations);
    }
  }

  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Emotion system
  CARTESIA_EMOTIONS,
  ALL_CARTESIA_EMOTIONS,
  mapContextToEmotion,
  getEmotionTransition,

  // Filler system
  injectNaturalFillers,

  // Breath groups
  addBreathGroupPauses,

  // Rhythm
  analyzeRhythm,
  applyRhythmVariations,

  // Main pipeline
  humanizeText,
};
