/**
 * Persona Instruct Profiles
 *
 * Translates each persona's speech fingerprint into Qwen3-TTS `instruct` parameters.
 * This is the Qwen3 equivalent of persona-fingerprints.ts (which generates SSML).
 *
 * Each persona has:
 * - Base voice instruct (replaces SSML speed/emotion tags)
 * - Emotion-specific instructs (replaces <emotion> tags)
 * - Special pattern triggers (replaces regex-based SSML injection)
 * - Thinking sounds and emphasis style (still injected as text)
 *
 * Source of truth: src/speech/adaptive-ssml/alive-voice/persona-fingerprints.ts
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'PersonaInstructProfiles' });

// =============================================================================
// TYPES
// =============================================================================

/** Speed description for natural language instruct */
export type SpeedDescription =
  | 'very slow, meditative'
  | 'slow, deliberate'
  | 'unhurried, warm'
  | 'natural, comfortable'
  | 'clear, articulate'
  | 'energetic, natural'
  | 'enthusiastic, slightly quick'
  | 'quick, excited';

/** Emphasis style for the persona */
export type EmphasisStyle =
  | 'warm'         // Slows for emotional words
  | 'deliberate'   // Pauses before data/facts
  | 'encouraging'  // Adds warmth to progress
  | 'celebratory'  // Energizes milestones
  | 'meditative';  // Long pauses for reflection

/** A pattern that triggers a voice shift */
export interface InstructTriggerPattern {
  /** Regex or keywords that trigger the shift */
  readonly trigger: RegExp;
  /** New instruct to apply for this segment */
  readonly instruct: string;
  /** Whether to add a text pause before the triggered segment */
  readonly addPause: boolean;
  /** Description for debugging */
  readonly description: string;
}

/** Complete instruct profile for a persona */
export interface PersonaInstructProfile {
  /** Persona identifier */
  readonly personaId: string;
  /** Display name */
  readonly name: string;
  /** Base voice instruct (always applied) */
  readonly baseInstruct: string;
  /** Speed description in natural language */
  readonly speedDescription: SpeedDescription;
  /** Numeric speed factor (for reference, not sent to TTS) */
  readonly speedFactor: number;
  /** Default emotion instruct */
  readonly defaultEmotionInstruct: string;
  /** Emphasis style */
  readonly emphasisStyle: EmphasisStyle;
  /** Thinking sounds (injected as text, not instruct) */
  readonly thinkingSounds: readonly string[];
  /** Laughter probability (0-1) */
  readonly laughterProbability: number;
  /** Patterns that trigger voice shifts */
  readonly triggerPatterns: readonly InstructTriggerPattern[];
  /** Late-night voice adjustment */
  readonly lateNightInstruct: string;
  /** Low-energy voice adjustment */
  readonly lowEnergyInstruct: string;
  /** High-energy voice adjustment */
  readonly highEnergyInstruct: string;
}

// =============================================================================
// PERSONA PROFILES
// =============================================================================

const ferniProfile: PersonaInstructProfile = {
  personaId: 'ferni',
  name: 'Ferni',
  baseInstruct:
    'Warm male baritone, speaking at an unhurried deliberate pace with natural warmth, like a caring life coach who genuinely listens',
  speedDescription: 'unhurried, warm',
  speedFactor: 0.92,
  defaultEmotionInstruct: 'With warm affection and genuine care in the voice',
  emphasisStyle: 'warm',
  thinkingSounds: ['Hmm...', 'Well...', 'You know...'],
  laughterProbability: 0.35,
  triggerPatterns: [
    {
      trigger: /\bwyoming\b/i,
      instruct:
        'Nostalgic and wistful, slowing down as if remembering somewhere special',
      addPause: true,
      description: 'Wyoming memories',
    },
    {
      trigger: /\bsecond chance\b/i,
      instruct:
        'Deep affection and hope, speaking more slowly with emotional weight',
      addPause: false,
      description: 'Second chance theme',
    },
    {
      trigger: /\b(proud|celebrate|congrat|amazing|incredible)\b/i,
      instruct:
        'Genuine elation, slightly more energetic, with a smile in the voice',
      addPause: false,
      description: 'Celebration moments',
    },
  ],
  lateNightInstruct: 'Quieter and more intimate, like a late-night conversation between close friends',
  lowEnergyInstruct: 'Very gentle and grounding, matching a quiet reflective energy',
  highEnergyInstruct: 'Warmer and more present, gently matching enthusiasm without pushing',
};

const peterProfile: PersonaInstructProfile = {
  personaId: 'peter-john',
  name: 'Peter',
  baseInstruct:
    'Deep tenor voice, measured and thoughtful like an Ivy League professor explaining complex topics with clarity and patience',
  speedDescription: 'slow, deliberate',
  speedFactor: 0.88,
  defaultEmotionInstruct: 'Calm and intellectually engaged, with quiet confidence',
  emphasisStyle: 'deliberate',
  thinkingSounds: ['Now...', 'The thing is...', 'Ooh...', 'Ha!', 'Wait—'],
  laughterProbability: 0.15,
  triggerPatterns: [
    {
      trigger: /\bwait wait wait\b/i,
      instruct:
        'Enthusiastic and rapid, like discovering something exciting in the data',
      addPause: false,
      description: 'Excitement burst',
    },
    {
      trigger: /\b(grief|loss|divorce|died|passing)\b/i,
      instruct:
        'Deeply sympathetic, slowing considerably, with careful deliberate pacing',
      addPause: true,
      description: 'Heavy topics',
    },
    {
      trigger: /\b(data|research|study|evidence|pattern)\b/i,
      instruct:
        'Intellectually excited, with anticipation, like revealing a fascinating finding',
      addPause: false,
      description: 'Data discoveries',
    },
  ],
  lateNightInstruct: 'Quieter and more contemplative, like a late-night philosophical discussion',
  lowEnergyInstruct: 'Calm and steady, with quiet intellectual warmth',
  highEnergyInstruct: 'More animated and excited, the energy of discovering something new',
};

const alexProfile: PersonaInstructProfile = {
  personaId: 'alex-chen',
  name: 'Alex',
  baseInstruct:
    'Clear and articulate mezzo-soprano, professional yet warm, like a trusted communications advisor who brings clarity to chaos',
  speedDescription: 'clear, articulate',
  speedFactor: 1.02,
  defaultEmotionInstruct: 'Curious and organized, with an undercurrent of warmth',
  emphasisStyle: 'deliberate',
  thinkingSounds: ['Okay so...', 'Alright...', 'Hey.', 'Breathe.', 'One sec...'],
  laughterProbability: 0.2,
  triggerPatterns: [
    {
      trigger: /\b(overwhelm|too much|can't handle|stressed)\b/i,
      instruct:
        'Very calm and grounding, speaking slowly and clearly, creating order from chaos',
      addPause: true,
      description: 'Overwhelm detection',
    },
    {
      trigger: /\bbreathe\b/i,
      instruct:
        'Extremely calm and slow, almost meditative, guiding someone to stillness',
      addPause: true,
      description: 'Breathing guidance',
    },
    {
      trigger: /\b(done|finished|completed|shipped|accomplished)\b/i,
      instruct:
        'Triumphant and proud, with genuine satisfaction in the voice',
      addPause: false,
      description: 'Productivity wins',
    },
  ],
  lateNightInstruct: 'Softer and more personal, dropping the professional efficiency for warmth',
  lowEnergyInstruct: 'Gentle and clear, offering simple direction without pressure',
  highEnergyInstruct: 'Crisp and energized, matching productive momentum',
};

const mayaProfile: PersonaInstructProfile = {
  personaId: 'maya-santos',
  name: 'Maya',
  baseInstruct:
    'Encouraging alto voice, energetic and warm like a personal trainer who motivates with genuine belief in you',
  speedDescription: 'energetic, natural',
  speedFactor: 0.98,
  defaultEmotionInstruct: 'Happy, encouraging, with bright warm energy',
  emphasisStyle: 'encouraging',
  thinkingSounds: ['So...', 'Okay!', "Here's the thing...", 'You know what?'],
  laughterProbability: 0.3,
  triggerPatterns: [
    {
      trigger: /\b(streak|day\s+\d+|consistent|routine)\b/i,
      instruct:
        'Enthusiastic and celebratory, genuinely proud of their consistency',
      addPause: false,
      description: 'Streak celebrations',
    },
    {
      trigger: /\b(slipped|missed|broke|failed|gave up)\b/i,
      instruct:
        'Soft, gentle compassion, slower pace, no judgment whatsoever',
      addPause: true,
      description: 'Setback empathy',
    },
    {
      trigger: /\bsystems?\s+beat\s+willpower\b/i,
      instruct:
        'Warm and wise, slowing to emphasize this core philosophy',
      addPause: true,
      description: 'Core philosophy',
    },
  ],
  lateNightInstruct: 'Softer and calmer, like a gentle wind-down coach preparing for rest',
  lowEnergyInstruct: 'Warm and gentle, meeting them where they are without pushing',
  highEnergyInstruct: 'Energized and bright, matching and amplifying their momentum',
};

const jordanProfile: PersonaInstructProfile = {
  personaId: 'jordan-taylor',
  name: 'Jordan',
  baseInstruct:
    'Bright soprano voice, enthusiastic and organized like a creative event planner bursting with ideas and excitement',
  speedDescription: 'enthusiastic, slightly quick',
  speedFactor: 1.05,
  defaultEmotionInstruct: 'Excited and joyful, with infectious enthusiasm',
  emphasisStyle: 'celebratory',
  thinkingSounds: ['Oh!', 'So...', 'I love this...', 'Wait—', 'Okay okay okay', 'Wow!'],
  laughterProbability: 0.5,
  triggerPatterns: [
    {
      trigger: /\b(exciting|amazing|love it|perfect|brilliant)\b/i,
      instruct:
        'Bursting with excitement, speaking quickly with bright joyful energy',
      addPause: false,
      description: 'Excitement bursts',
    },
    {
      trigger: /\b(grief|loss|hard chapter|difficult time)\b/i,
      instruct:
        'Deeply sympathetic, much slower and gentler, holding space with care',
      addPause: true,
      description: 'Hard chapters',
    },
    {
      trigger: /\b(life arc|story|journey|chapter)\b/i,
      instruct:
        'Contemplative and philosophical, slowing to reflect on the bigger picture',
      addPause: true,
      description: 'Life arc philosophy',
    },
  ],
  lateNightInstruct: 'Quieter but still warm, like sharing dreams before sleep',
  lowEnergyInstruct: 'Gentler enthusiasm, warm but not pushing energy',
  highEnergyInstruct: 'Full exuberance, matching their peak excitement',
};

const nayanProfile: PersonaInstructProfile = {
  personaId: 'nayan-patel',
  name: 'Nayan',
  baseInstruct:
    'Deep bass-baritone voice, very slow and meditative, like an Indian philosopher sharing ancient wisdom with modern relevance',
  speedDescription: 'very slow, meditative',
  speedFactor: 0.85,
  defaultEmotionInstruct: 'Calm, serene, with deep wisdom and infinite patience',
  emphasisStyle: 'meditative',
  thinkingSounds: ['Hmm...', '...', 'Consider...', 'Ah...', 'You see...'],
  laughterProbability: 0.1,
  triggerPatterns: [
    {
      trigger: /\b(wisdom|truth|purpose|meaning|dharma)\b/i,
      instruct:
        'Deeply contemplative, very slow with profound pauses, as if the words need space to land',
      addPause: true,
      description: 'Wisdom moments',
    },
    {
      trigger: /\b(poem|poetry|verse|rumi|tagore)\b/i,
      instruct:
        'Mysterious and reverent, reading poetry with sacred slowness',
      addPause: true,
      description: 'Poetry/philosophy',
    },
    {
      trigger: /\bnamaskaram\b/i,
      instruct:
        'Deeply serene, extremely slow, as if bowing with the voice',
      addPause: true,
      description: 'Greeting with reverence',
    },
  ],
  lateNightInstruct: 'Even more quiet and intimate, like sharing wisdom by firelight',
  lowEnergyInstruct: 'Matching the stillness, barely above a whisper, deeply grounding',
  highEnergyInstruct: 'Slightly more animated but still grounded, calm energy from within',
};

// =============================================================================
// PROFILE REGISTRY
// =============================================================================

const PROFILES: ReadonlyMap<string, PersonaInstructProfile> = new Map([
  ['ferni', ferniProfile],
  ['peter-john', peterProfile],
  ['alex-chen', alexProfile],
  ['maya-santos', mayaProfile],
  ['jordan-taylor', jordanProfile],
  ['nayan-patel', nayanProfile],
]);

/**
 * Get the instruct profile for a persona.
 *
 * @param personaId - Persona identifier
 * @returns The persona's instruct profile, or Ferni's as fallback
 */
export function getPersonaInstructProfile(
  personaId: string
): PersonaInstructProfile {
  const profile = PROFILES.get(personaId);
  if (!profile) {
    log.warn(
      { personaId },
      'Unknown persona ID for instruct profile (check for typos or add profile in persona-instruct-profiles), falling back to Ferni'
    );
    return ferniProfile;
  }
  return profile;
}

/**
 * Get all available persona instruct profiles.
 */
export function getAllInstructProfiles(): readonly PersonaInstructProfile[] {
  return Array.from(PROFILES.values());
}

/**
 * Check trigger patterns against text and return matching instruct override.
 *
 * @param personaId - Persona identifier
 * @param text - Text to check against trigger patterns
 * @returns Matching instruct override, or null if no triggers matched
 */
export function checkTriggerPatterns(
  personaId: string,
  text: string
): { instruct: string; addPause: boolean } | null {
  const profile = getPersonaInstructProfile(personaId);

  for (const pattern of profile.triggerPatterns) {
    if (pattern.trigger.test(text)) {
      log.debug(
        { personaId, pattern: pattern.description },
        'Trigger pattern matched'
      );
      return {
        instruct: pattern.instruct,
        addPause: pattern.addPause,
      };
    }
  }

  return null;
}

/**
 * Get a random thinking sound for the persona.
 *
 * @param personaId - Persona identifier
 * @returns A thinking sound string, or empty string if none
 */
export function getRandomThinkingSound(personaId: string): string {
  const profile = getPersonaInstructProfile(personaId);
  const sounds = profile.thinkingSounds;
  if (sounds.length === 0) return '';
  return sounds[Math.floor(Math.random() * sounds.length)] as string;
}

/**
 * Get the energy-adjusted instruct for the persona.
 *
 * @param personaId - Persona identifier
 * @param energy - Energy level (0-1)
 * @returns Energy-adjusted instruct string
 */
export function getEnergyInstruct(
  personaId: string,
  energy: number
): string | null {
  const profile = getPersonaInstructProfile(personaId);

  if (energy < 0.3) return profile.lowEnergyInstruct;
  if (energy > 0.7) return profile.highEnergyInstruct;

  return null; // Normal energy, no override
}

/**
 * Check if it's late night and return adjusted instruct.
 *
 * @param personaId - Persona identifier
 * @param hour - Current hour (0-23)
 * @returns Late-night instruct string, or null if not late night
 */
export function getLateNightInstruct(
  personaId: string,
  hour: number
): string | null {
  if (hour >= 22 || hour < 5) {
    return getPersonaInstructProfile(personaId).lateNightInstruct;
  }
  return null;
}
