/**
 * John Bogle Speech Traits
 *
 * Defines voice pacing, pauses, and timing characteristics
 * for the John Bogle persona.
 *
 * Voice style: Warm, grandfatherly, unhurried, wise
 */

export const johnBogleSpeechTraits = {
  /** Base speaking rate (words per minute) - slightly slower for gravitas */
  baseRate: 130,

  /** Pause durations in milliseconds */
  pauses: {
    /** Brief pause for breath */
    micro: 200,
    /** Standard sentence break */
    short: 400,
    /** Pause before wisdom */
    medium: 600,
    /** Pause for effect */
    long: 900,
    /** Pause before important principle */
    dramatic: 1400,
  },

  /** Emphasis patterns */
  emphasis: {
    /** Words that get extra stress */
    stressWords: [
      'course',
      'time',
      'costs',
      'simple',
      'patient',
      'long-term',
      'character',
      'discipline',
    ],
    /** Phrases that slow down for impact */
    slowPhrases: [
      'stay the course',
      'time is your friend',
      'costs matter',
      'you get what you don\'t pay for',
      'the greatest enemy of a good plan',
    ],
  },

  /** Prosody characteristics */
  prosody: {
    /** Pitch variation (0-1 scale) - moderate, not dramatic */
    pitchVariation: 0.3,
    /** Energy level (0-1 scale) - calm wisdom */
    energy: 0.5,
    /** Warmth in tone (0-1 scale) - very warm */
    warmth: 0.85,
  },

  /** Wisdom-sharing mode adjustments */
  wisdomMode: {
    /** Slower pace when sharing principles */
    rateMultiplier: 0.85,
    /** Longer pauses for reflection */
    pauseMultiplier: 1.4,
    /** Steady pitch for authority */
    pitchVariationDecrease: 0.1,
  },

  /** Question asking mode - for connecting with people */
  questionMode: {
    /** Slight warmth increase */
    warmthBoost: 0.1,
    /** Brief pause before question */
    prePause: 250,
    /** Genuine interest tone */
    curiosityLevel: 0.7,
  },

  /** Calming presence for anxious users */
  calmingMode: {
    rateMultiplier: 0.8,
    pauseMultiplier: 1.5,
    pitchVariation: 0.2,
    warmth: 0.95,
  },

  /** Story-telling mode */
  storytellingMode: {
    rateMultiplier: 0.9,
    pauseMultiplier: 1.3,
    pitchVariationBoost: 0.1,
  },

  /** Principle emphasis - when sharing core beliefs */
  principleMode: {
    rateMultiplier: 0.85,
    pauseMultiplier: 1.4,
    firmness: 0.7,
  },
} as const;

export type JohnBogleSpeechTraits = typeof johnBogleSpeechTraits;
