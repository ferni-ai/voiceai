/**
 * Vocal Humanization - "Better Than Human" Voice Processing
 *
 * Makes Ferni's voice feel genuinely human through:
 * 1. Energy Matching - Mirror user's energy level
 * 2. Pitch Variation - Natural intonation patterns
 * 3. Contraction Enforcement - Natural speech patterns
 * 4. Intake Breath - Gathering moment before speaking
 * 5. Emotion Bleeding - Voice changes with emotional content
 * 6. Mid-sentence Reactions - React during thoughts, not just between
 *
 * Philosophy: Humans don't speak in monotone with perfect grammar.
 * They breathe, hesitate, get excited, match energy, and their
 * voice CHANGES based on what they're feeling - not just what they're saying.
 */

import { getLogger } from '../utils/safe-logger.js';

// Import shared detection utilities (re-export for backwards compatibility)
import {
  detectEmotionalContent as sharedDetectEmotionalContent,
  detectHeavyContent as sharedDetectHeavyContent,
  detectUserEnergy as sharedDetectUserEnergy,
  type EnergyLevel,
} from './utils/detection.js';

import { chance, createSeededRandom, createSystemRandom, type RandomSource } from './utils/rng.js';

const log = getLogger().child({ module: 'VocalHumanization' });

// ============================================================================
// TYPES (re-export from shared)
// ============================================================================

export type { EnergyLevel } from './utils/detection.js';

export interface VocalContext {
  /** Detected user energy level */
  userEnergy?: EnergyLevel;
  /** Emotional content of the response */
  emotion?: string;
  /** Is this a question? */
  isQuestion?: boolean;
  /** Is this responding to something heavy/emotional? */
  isHeavyContent?: boolean;
  /** Turn number in conversation */
  turnNumber?: number;
  /** Was this a meaningful moment? */
  isMeaningfulMoment?: boolean;
  /** Previous user message (for energy detection) */
  userMessage?: string;
  /**
   * Optional random source/seed to make behavior deterministic per session/turn.
   * If omitted, falls back to system randomness.
   */
  rng?: RandomSource;
  randomSeed?: string;
}

export interface VocalProfile {
  /** Speed ratio (0.85 = slower, 1.0 = normal, 1.1 = faster) */
  speed: number;
  /** Pitch adjustment in semitones or percentage */
  pitch: string;
  /** Volume level */
  volume: string;
  /** Base pause duration multiplier */
  pauseMultiplier: number;
  /** Should add intake breath? */
  addIntakeBreath: boolean;
  /** Breath duration if added */
  breathDuration: number;
}

export interface HumanizedVocals {
  /** The processed text with SSML */
  ssml: string;
  /** What was applied */
  appliedFeatures: string[];
  /** The detected/used energy level */
  energyLevel: EnergyLevel;
  /** The vocal profile used */
  profile: VocalProfile;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Formal contractions that should be converted */
const CONTRACTION_MAP: Record<string, string> = {
  'do not': "don't",
  'does not': "doesn't",
  'did not': "didn't",
  'have not': "haven't",
  'has not': "hasn't",
  'had not': "hadn't",
  'will not': "won't",
  'would not': "wouldn't",
  'could not': "couldn't",
  'should not': "shouldn't",
  'can not': "can't",
  cannot: "can't",
  'is not': "isn't",
  'are not': "aren't",
  'was not': "wasn't",
  'were not': "weren't",
  'I am': "I'm",
  'I have': "I've",
  'I will': "I'll",
  'I would': "I'd",
  'I had': "I'd",
  'you are': "you're",
  'you have': "you've",
  'you will': "you'll",
  'you would': "you'd",
  'we are': "we're",
  'we have': "we've",
  'we will': "we'll",
  'we would': "we'd",
  'they are': "they're",
  'they have': "they've",
  'they will': "they'll",
  'they would': "they'd",
  'it is': "it's",
  'it has': "it's",
  'it will': "it'll",
  'that is': "that's",
  'that has': "that's",
  'that will': "that'll",
  'there is': "there's",
  'there are': "there're",
  'here is': "here's",
  'what is': "what's",
  'what has': "what's",
  'what will': "what'll",
  'who is': "who's",
  'who has': "who's",
  'where is': "where's",
  'when is': "when's",
  'why is': "why's",
  'how is': "how's",
  'let us': "let's",
  'going to': 'gonna',
  'want to': 'wanna',
  'got to': 'gotta',
};

/** Intake breath sounds for different contexts */
const INTAKE_BREATHS = {
  meaningful: ['<break time="400ms"/>', '<break time="350ms"/>', '<break time="450ms"/>'],
  heavy: ['<break time="500ms"/>', '<break time="550ms"/>', '<break time="600ms"/>'],
  thoughtful: ['<break time="300ms"/>', '<break time="350ms"/>'],
  excited: ['<break time="150ms"/>', '<break time="200ms"/>'],
};

// ============================================================================
// ENERGY DETECTION (delegated to shared utilities)
// ============================================================================

/**
 * Detect user's energy level from their message
 * @see {@link sharedDetectUserEnergy} - Uses shared detection utilities
 */
export const detectUserEnergy = sharedDetectUserEnergy;

/**
 * Detect if content is emotionally charged
 * @see {@link sharedDetectEmotionalContent} - Uses shared detection utilities
 */
export const detectEmotionalContent = sharedDetectEmotionalContent;

/**
 * Detect if content is heavy/serious
 * @see {@link sharedDetectHeavyContent} - Uses shared detection utilities
 */
export const detectHeavyContent = sharedDetectHeavyContent;

// ============================================================================
// CONTRACTION ENFORCER
// ============================================================================

/**
 * Convert formal speech to natural contractions
 * "I am going to help you" → "I'm gonna help you"
 */
export function enforceContractions(text: string): string {
  let result = text;

  // Sort by length (longest first) to avoid partial replacements
  const sortedContractions = Object.entries(CONTRACTION_MAP).sort(
    ([a], [b]) => b.length - a.length
  );

  for (const [formal, contracted] of sortedContractions) {
    // Case-insensitive replacement, preserving sentence case
    const regex = new RegExp(`\\b${formal}\\b`, 'gi');
    result = result.replace(regex, (match) => {
      // Preserve capitalization of first letter
      if (match[0] === match[0].toUpperCase()) {
        return contracted.charAt(0).toUpperCase() + contracted.slice(1);
      }
      return contracted;
    });
  }

  return result;
}

// ============================================================================
// VOCAL PROFILE GENERATION
// ============================================================================

/**
 * Generate vocal profile based on context
 */
export function generateVocalProfile(context: VocalContext): VocalProfile {
  const energy = context.userEnergy || 'medium';
  const isHeavy = context.isHeavyContent || detectHeavyContent(context.userMessage || '');
  const isEmotional = context.emotion || detectEmotionalContent(context.userMessage || '');

  // Base profile
  const profile: VocalProfile = {
    speed: 1.0,
    pitch: '+0%',
    volume: 'medium',
    pauseMultiplier: 1.0,
    addIntakeBreath: false,
    breathDuration: 300,
  };

  // Adjust for user energy - MIRROR their energy
  switch (energy) {
    case 'high':
      profile.speed = 1.08; // Slightly faster
      profile.pitch = '+5%'; // Slightly higher pitch
      profile.volume = 'medium'; // Normal volume, not loud
      profile.pauseMultiplier = 0.85; // Shorter pauses
      profile.breathDuration = 150;
      break;
    case 'low':
      profile.speed = 0.92; // Slower
      profile.pitch = '-3%'; // Slightly lower
      profile.volume = 'soft'; // Gentler
      profile.pauseMultiplier = 1.2; // Longer pauses
      profile.breathDuration = 400;
      profile.addIntakeBreath = true;
      break;
    case 'subdued':
      profile.speed = 0.88; // Even slower
      profile.pitch = '-5%'; // Lower pitch
      profile.volume = 'soft'; // Soft
      profile.pauseMultiplier = 1.4; // Much longer pauses
      profile.breathDuration = 500;
      profile.addIntakeBreath = true;
      break;
    case 'medium':
    default:
      profile.speed = 1.0;
      profile.pitch = '+0%';
      profile.pauseMultiplier = 1.0;
      profile.breathDuration = 300;
      break;
  }

  // Adjust for heavy content - override energy matching
  if (isHeavy) {
    profile.speed = Math.min(profile.speed, 0.9);
    profile.volume = 'soft';
    profile.pauseMultiplier = Math.max(profile.pauseMultiplier, 1.3);
    profile.addIntakeBreath = true;
    profile.breathDuration = 500;
  }

  // Adjust for emotional content
  if (isEmotional) {
    profile.addIntakeBreath = true;
    profile.pauseMultiplier *= 1.1;
  }

  // Meaningful moments get a breath
  if (context.isMeaningfulMoment) {
    profile.addIntakeBreath = true;
    profile.breathDuration = Math.max(profile.breathDuration, 400);
  }

  return profile;
}

// ============================================================================
// PITCH VARIATION
// ============================================================================

/**
 * Add natural pitch variation to text
 * - Questions rise at the end
 * - Lists have varied pitch
 * - Statements fall at the end
 * - Emphasis words get pitch boost
 */
export function addPitchVariation(text: string, context: VocalContext): string {
  let result = text;

  // Don't add pitch if already has prosody tags
  if (/<prosody/.test(text)) return text;

  // Split into sentences for processing
  const sentences = result.split(/(?<=[.!?])\s+/);
  const processed: string[] = [];

  for (const sentence of sentences) {
    let processedSentence = sentence;

    // Questions: rising pitch at the end
    if (sentence.trim().endsWith('?')) {
      // Find the last few words and raise pitch
      const words = sentence.trim().split(/\s+/);
      if (words.length > 2) {
        const lastTwo = words.slice(-2).join(' ');
        const rest = words.slice(0, -2).join(' ');
        processedSentence = `${rest} <prosody pitch="+8%">${lastTwo}</prosody>`;
      }
    }
    // Exclamations: slight pitch boost
    else if (sentence.trim().endsWith('!')) {
      processedSentence = `<prosody pitch="+3%">${sentence}</prosody>`;
    }
    // Statements: slight fall at end (natural)
    else if (sentence.trim().endsWith('.')) {
      const words = sentence.trim().split(/\s+/);
      if (words.length > 3) {
        const lastWord = words[words.length - 1];
        const rest = words.slice(0, -1).join(' ');
        processedSentence = `${rest} <prosody pitch="-2%">${lastWord}</prosody>`;
      }
    }

    processed.push(processedSentence);
  }

  result = processed.join(' ');

  // Add emphasis to key words
  result = addEmphasisPitch(result);

  return result;
}

/**
 * Add pitch emphasis to important words
 */
function addEmphasisPitch(text: string): string {
  let result = text;

  // Words that get emphasis (slight pitch boost + slower)
  const emphasisWords = [
    'really',
    'actually',
    'honestly',
    'seriously',
    'genuinely',
    'truly',
    'absolutely',
    'definitely',
    'important',
    'incredible',
    'amazing',
  ];

  for (const word of emphasisWords) {
    const regex = new RegExp(`\\b(${word})\\b`, 'gi');
    result = result.replace(regex, '<prosody pitch="+5%" rate="90%">$1</prosody>');
  }

  return result;
}

// ============================================================================
// INTAKE BREATH
// ============================================================================

/**
 * Add intake breath before response if appropriate
 */
export function addIntakeBreath(text: string, context: VocalContext): string {
  const profile = generateVocalProfile(context);

  if (!profile.addIntakeBreath) return text;

  // Select appropriate breath type
  let breathOptions: string[];
  if (context.isHeavyContent) {
    breathOptions = INTAKE_BREATHS.heavy;
  } else if (context.isMeaningfulMoment) {
    breathOptions = INTAKE_BREATHS.meaningful;
  } else if (context.userEnergy === 'high') {
    breathOptions = INTAKE_BREATHS.excited;
  } else {
    breathOptions = INTAKE_BREATHS.thoughtful;
  }

  const rng =
    context.rng ??
    (context.randomSeed
      ? createSeededRandom(`${context.randomSeed}:vocal-breath`)
      : createSystemRandom());
  const breath = breathOptions[rng.nextInt(breathOptions.length)];

  return `${breath}${text}`;
}

// ============================================================================
// EMOTION BLEEDING
// ============================================================================

/**
 * Make voice automatically change based on emotional content
 * "Emotion bleeding through" - not stated, but heard
 * 
 * Enhanced with more patterns for dynamic prosody
 */
export function applyEmotionBleeding(text: string, context: VocalContext): string {
  let result = text;
  const emotionalPatterns = [
    // Sympathetic - holding space
    {
      pattern: /\b(I'm so sorry|that's really hard|that sounds painful|that's heavy|that's a lot)\b/i,
      effect: 'sympathetic',
    },
    // Warm - genuine affection
    { pattern: /\b(I'm proud of you|that's amazing|you did it|look at you|I believe in you)\b/i, effect: 'warm' },
    // Concerned - protective
    { pattern: /\b(I'm worried|I'm concerned|be careful|are you okay|that doesn't sound right)\b/i, effect: 'concerned' },
    // Touched - emotionally moved
    { pattern: /\b(I love that|that's wonderful|beautiful|that means a lot|that's real)\b/i, effect: 'touched' },
    // Surprised - genuine surprise
    { pattern: /\b(wait|hold on|what|really|whoa|oh wow|no way)\b/i, effect: 'surprised' },
    // Excited - breakthrough moments
    { pattern: /\b(YES|that's it|there it is|you nailed it|exactly|that's huge)\b/i, effect: 'excited' },
    // Curious - genuine interest
    { pattern: /\b(tell me more|I'm curious|interesting|how so|what do you mean)\b/i, effect: 'curious' },
    // Playful - lighthearted
    { pattern: /\b(ha|haha|\[laughter\]|funny|classic|oh man)\b/i, effect: 'playful' },
    // Thoughtful - processing
    { pattern: /\b(let me think|hmm|I wonder|the thing is|here's what I'm thinking)\b/i, effect: 'thoughtful' },
    // Emphatic - important points
    { pattern: /\b(this is important|listen|seriously|I mean it|no really)\b/i, effect: 'emphatic' },
    // Gentle - tender moments
    { pattern: /\b(take your time|no rush|I'm here|it's okay|you're safe)\b/i, effect: 'gentle' },
  ];

  for (const { pattern, effect } of emotionalPatterns) {
    if (pattern.test(text)) {
      result = applyEmotionEffect(result, effect, pattern);
    }
  }

  return result;
}

/**
 * Apply specific emotion effect to matching portion
 * Enhanced for more dynamic prosody variation
 */
function applyEmotionEffect(text: string, effect: string, pattern: RegExp): string {
  switch (effect) {
    case 'sympathetic':
      // Softer, slower, lower pitch - holding space
      return text.replace(pattern, '<prosody rate="88%" pitch="-5%" volume="soft">$&</prosody>');
    case 'warm':
      // Slightly higher, warmer - genuine affection
      return text.replace(pattern, '<prosody pitch="+3%" rate="95%">$&</prosody>');
    case 'concerned':
      // Slightly faster, focused - protective energy
      return text.replace(pattern, '<prosody rate="102%" pitch="+2%">$&</prosody>');
    case 'touched':
      // Slower, softer - emotionally moved
      return text.replace(pattern, '<prosody rate="90%" volume="soft">$&</prosody>');
    case 'surprised':
      // Quick, higher pitch - genuine surprise
      return text.replace(pattern, '<prosody rate="110%" pitch="+10%">$&</prosody>');
    case 'excited':
      // Faster, higher, more energy - breakthrough moments
      return text.replace(pattern, '<prosody rate="112%" pitch="+8%">$&</prosody>');
    case 'curious':
      // Slightly upward inflection, measured pace - genuine interest
      return text.replace(pattern, '<prosody rate="98%" pitch="+5%">$&</prosody>');
    case 'playful':
      // Bouncy, varied - lighthearted moments
      return text.replace(pattern, '<prosody rate="105%" pitch="+6%">$&</prosody>');
    case 'thoughtful':
      // Slower, deliberate - processing deeply
      return text.replace(pattern, '<prosody rate="92%" pitch="-2%">$&</prosody>');
    case 'emphatic':
      // Strong, clear - important point
      return text.replace(pattern, '<prosody rate="95%" pitch="+3%" volume="loud">$&</prosody>');
    case 'gentle':
      // Very soft, slow - tender moments
      return text.replace(pattern, '<prosody rate="85%" volume="soft" pitch="-3%">$&</prosody>');
    default:
      return text;
  }
}

// ============================================================================
// MID-SENTENCE REACTIONS
// ============================================================================

/**
 * Add potential mid-sentence reaction points
 * Not every response, but when natural
 */
export function addMidSentenceReactions(text: string, context: VocalContext): string {
  const rng =
    context.rng ??
    (context.randomSeed
      ? createSeededRandom(`${context.randomSeed}:vocal-mid-reaction`)
      : createSystemRandom());

  // Only occasionally add mid-sentence reactions
  if (!chance(rng, 0.15)) return text;

  // Don't add to short responses
  if (text.length < 100) return text;

  // Don't add in heavy/serious contexts
  if (context.isHeavyContent) return text;

  const reactions = [
    { trigger: /\b(and then|so then)\b/i, insert: '—<break time="100ms"/>actually, wait—' },
    { trigger: /\b(I think)\b/i, insert: '—<break time="150ms"/>no, I know—' },
    { trigger: /\b(the thing is)\b/i, insert: '—<break time="100ms"/>well—' },
  ];

  let result = text;
  let usedOne = false;

  for (const { trigger, insert } of reactions) {
    if (!usedOne && trigger.test(result) && chance(rng, 0.3)) {
      result = result.replace(trigger, insert);
      usedOne = true;
      break; // Only one mid-sentence reaction per response
    }
  }

  return result;
}

// ============================================================================
// MAIN HUMANIZATION FUNCTION
// ============================================================================

/**
 * Apply all vocal humanization to text
 */
export function humanizeVocals(text: string, context: VocalContext): HumanizedVocals {
  const appliedFeatures: string[] = [];
  let result = text;

  const rng =
    context.rng ??
    (context.randomSeed
      ? createSeededRandom(`${context.randomSeed}:vocal-main:${context.turnNumber ?? 0}`)
      : createSystemRandom());
  context.rng = rng;

  // 1. Detect user energy if not provided
  const userEnergy = context.userEnergy || detectUserEnergy(context.userMessage || '');
  context.userEnergy = userEnergy;

  // 2. Detect if heavy content
  context.isHeavyContent = context.isHeavyContent || detectHeavyContent(result);

  // 3. Generate vocal profile
  const profile = generateVocalProfile(context);

  // 4. Enforce contractions (always)
  const beforeContractions = result;
  result = enforceContractions(result);
  if (result !== beforeContractions) {
    appliedFeatures.push('contractions');
  }

  // 5. Add mid-sentence reactions (occasionally)
  const beforeReactions = result;
  result = addMidSentenceReactions(result, context);
  if (result !== beforeReactions) {
    appliedFeatures.push('mid_sentence_reaction');
  }

  // 6. Add emotion bleeding
  const beforeEmotion = result;
  result = applyEmotionBleeding(result, context);
  if (result !== beforeEmotion) {
    appliedFeatures.push('emotion_bleeding');
  }

  // 7. Add pitch variation
  const beforePitch = result;
  result = addPitchVariation(result, context);
  if (result !== beforePitch) {
    appliedFeatures.push('pitch_variation');
  }

  // 8. Add intake breath (if appropriate)
  if (profile.addIntakeBreath) {
    result = addIntakeBreath(result, context);
    appliedFeatures.push('intake_breath');
  }

  // 9. Wrap with overall prosody from profile
  if (profile.speed !== 1.0 || profile.pitch !== '+0%' || profile.volume !== 'medium') {
    const volumeAttr = profile.volume !== 'medium' ? ` volume="${profile.volume}"` : '';
    const rateAttr = profile.speed !== 1.0 ? ` rate="${Math.round(profile.speed * 100)}%"` : '';
    const pitchAttr = profile.pitch !== '+0%' ? ` pitch="${profile.pitch}"` : '';

    if (volumeAttr || rateAttr || pitchAttr) {
      result = `<prosody${rateAttr}${pitchAttr}${volumeAttr}>${result}</prosody>`;
      appliedFeatures.push('energy_matching');
    }
  }

  log.debug(
    { energy: userEnergy, features: appliedFeatures.length, profile },
    'Applied vocal humanization'
  );

  return {
    ssml: result,
    appliedFeatures,
    energyLevel: userEnergy,
    profile,
  };
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export default {
  humanizeVocals,
  detectUserEnergy,
  enforceContractions,
  generateVocalProfile,
  addPitchVariation,
  addIntakeBreath,
  applyEmotionBleeding,
  addMidSentenceReactions,
  detectEmotionalContent,
  detectHeavyContent,
};
