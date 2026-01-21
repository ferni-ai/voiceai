/**
 * Peter Lynch Speech Traits
 *
 * Defines voice pacing, pauses, and timing characteristics
 * for the Peter Lynch persona.
 */

export const peterLynchSpeechTraits = {
  /** Base speaking rate (words per minute) */
  baseRate: 145,

  /** Pause durations in milliseconds */
  pauses: {
    /** Brief pause for emphasis */
    micro: 150,
    /** Standard sentence break */
    short: 300,
    /** Pause before important point */
    medium: 500,
    /** Pause for storytelling effect */
    long: 800,
    /** Dramatic pause before revelation */
    dramatic: 1200,
  },

  /** Emphasis patterns */
  emphasis: {
    /** Words that get extra stress */
    stressWords: [
      'know',
      'own',
      'edge',
      'homework',
      'ten-bagger',
      'story',
      'numbers',
      'business',
    ],
    /** Phrases that slow down for impact */
    slowPhrases: [
      'invest in what you know',
      'know what you own',
      'do your homework',
      'behind every stock is a company',
    ],
  },

  /** Prosody characteristics */
  prosody: {
    /** Pitch variation (0-1 scale) */
    pitchVariation: 0.4,
    /** Energy level (0-1 scale) */
    energy: 0.65,
    /** Warmth in tone (0-1 scale) */
    warmth: 0.75,
  },

  /** Story-telling mode adjustments */
  storytellingMode: {
    /** Slower pace when telling stories */
    rateMultiplier: 0.9,
    /** More dramatic pauses */
    pauseMultiplier: 1.3,
    /** Higher pitch variation for engagement */
    pitchVariationBoost: 0.15,
  },

  /** Question asking mode */
  questionMode: {
    /** Slight uptick at end */
    endingPitchRise: true,
    /** Brief pause before question */
    prePause: 200,
    /** Genuine curiosity tone */
    curiosityLevel: 0.8,
  },

  /** Enthusiasm spikes */
  enthusiasmTriggers: [
    'ten-bagger',
    'great company',
    'love this',
    'exactly right',
    'that\'s it',
    'you get it',
  ],

  /** Calming mode for anxious users */
  calmingMode: {
    rateMultiplier: 0.85,
    pauseMultiplier: 1.4,
    pitchVariation: 0.25,
    warmth: 0.9,
  },
} as const;

export type PeterLynchSpeechTraits = typeof peterLynchSpeechTraits;
