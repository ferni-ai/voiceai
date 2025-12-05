/**
 * Persona Mood States
 *
 * Gives personas varying moods, energy levels, and even "off days."
 * This is what makes an AI feel alive rather than always "on."
 *
 * A friend isn't always at 100%. Sometimes they're:
 * - Reflective and slow
 * - Extra energized
 * - A bit tired but still present
 * - In a philosophical mood
 * - Feeling playful
 *
 * The mood affects:
 * - Response length
 * - Story frequency
 * - Humor usage
 * - Vulnerability level
 * - Energy in delivery
 */

import type { PersonaConfig } from '../../personas/types.js';

// ============================================================================
// TYPES
// ============================================================================

export type MoodState =
  | 'energized' // High energy, more animated
  | 'reflective' // Thoughtful, story-heavy
  | 'playful' // Joking, light-hearted
  | 'grounded' // Calm, centered, present
  | 'tired_but_present' // Lower energy but still engaged
  | 'philosophical' // Deep, big-picture thinking
  | 'nostalgic'; // Memory-heavy, wistful

export interface PersonaMood {
  state: MoodState;

  /** Energy level 0-1 */
  energyLevel: number;

  /** Response length preference */
  responseLengthBias: 'shorter' | 'normal' | 'longer';

  /** Story telling frequency */
  storyFrequency: 'low' | 'normal' | 'high';

  /** Humor frequency */
  humorFrequency: 'low' | 'normal' | 'high';

  /** How vulnerable/open the persona is feeling */
  vulnerabilityLevel: 'guarded' | 'normal' | 'open' | 'very_open';

  /** Voice delivery adjustments */
  deliveryAdjustments: {
    speed: number; // 0.8 - 1.1 multiplier
    pauseFrequency: 'more' | 'normal' | 'less';
    warmth: number; // 0.7 - 1.3 multiplier
  };

  /** Phrases that reflect this mood */
  moodPhrases: string[];

  /** What might trigger a mood shift */
  shiftTriggers: string[];

  /** Duration hint for this mood */
  typicalDuration: 'brief' | 'session' | 'extended';
}

export interface MoodContext {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number; // 0-6, Sunday = 0
  isWeekend: boolean;
  weatherMood?: 'sunny' | 'rainy' | 'stormy' | 'neutral';
  recentConversationCount: number; // How many conversations recently
  lastMood?: MoodState;
}

// ============================================================================
// MOOD DEFINITIONS
// ============================================================================

const MOOD_DEFINITIONS: Record<MoodState, Omit<PersonaMood, 'state' | 'moodPhrases'>> = {
  energized: {
    energyLevel: 0.9,
    responseLengthBias: 'longer',
    storyFrequency: 'normal',
    humorFrequency: 'high',
    vulnerabilityLevel: 'normal',
    deliveryAdjustments: {
      speed: 1.05,
      pauseFrequency: 'less',
      warmth: 1.1,
    },
    shiftTriggers: ['heavy topic', 'user seems down', 'deep question'],
    typicalDuration: 'session',
  },

  reflective: {
    energyLevel: 0.6,
    responseLengthBias: 'longer',
    storyFrequency: 'high',
    humorFrequency: 'low',
    vulnerabilityLevel: 'open',
    deliveryAdjustments: {
      speed: 0.9,
      pauseFrequency: 'more',
      warmth: 1.15,
    },
    shiftTriggers: ['user excited', 'action needed', 'urgent question'],
    typicalDuration: 'session',
  },

  playful: {
    energyLevel: 0.85,
    responseLengthBias: 'shorter',
    storyFrequency: 'normal',
    humorFrequency: 'high',
    vulnerabilityLevel: 'normal',
    deliveryAdjustments: {
      speed: 1.0,
      pauseFrequency: 'less',
      warmth: 1.2,
    },
    shiftTriggers: ['serious topic', 'user upset', 'vulnerability'],
    typicalDuration: 'brief',
  },

  grounded: {
    energyLevel: 0.7,
    responseLengthBias: 'normal',
    storyFrequency: 'normal',
    humorFrequency: 'normal',
    vulnerabilityLevel: 'normal',
    deliveryAdjustments: {
      speed: 0.95,
      pauseFrequency: 'normal',
      warmth: 1.0,
    },
    shiftTriggers: [],
    typicalDuration: 'extended',
  },

  tired_but_present: {
    energyLevel: 0.5,
    responseLengthBias: 'shorter',
    storyFrequency: 'low',
    humorFrequency: 'low',
    vulnerabilityLevel: 'very_open',
    deliveryAdjustments: {
      speed: 0.88,
      pauseFrequency: 'more',
      warmth: 1.1,
    },
    shiftTriggers: ['user needs help', 'important topic', 'user excited'],
    typicalDuration: 'session',
  },

  philosophical: {
    energyLevel: 0.65,
    responseLengthBias: 'longer',
    storyFrequency: 'high',
    humorFrequency: 'low',
    vulnerabilityLevel: 'open',
    deliveryAdjustments: {
      speed: 0.85,
      pauseFrequency: 'more',
      warmth: 1.0,
    },
    shiftTriggers: ['practical question', 'time pressure', 'action needed'],
    typicalDuration: 'session',
  },

  nostalgic: {
    energyLevel: 0.6,
    responseLengthBias: 'longer',
    storyFrequency: 'high',
    humorFrequency: 'normal',
    vulnerabilityLevel: 'open',
    deliveryAdjustments: {
      speed: 0.9,
      pauseFrequency: 'more',
      warmth: 1.2,
    },
    shiftTriggers: ['urgent topic', 'user needs focus', 'practical question'],
    typicalDuration: 'brief',
  },
};

// ============================================================================
// MOOD PHRASES BY PERSONA
// ============================================================================

const MOOD_PHRASES: Record<string, Record<MoodState, string[]>> = {
  ferni: {
    energized: [
      "I'm feeling good today.",
      "Something about today... I've got energy.",
      "Let's do this!",
    ],
    reflective: [
      "I've been thinking about a lot lately...",
      'You know, I was sitting with some thoughts earlier...',
      "Something's been on my mind...",
    ],
    playful: [
      "[laughter] Okay I'm in a weird mood today.",
      "I'm feeling playful - bear with me.",
      'Something about today has me feeling light.',
    ],
    grounded: ["I'm here. What's on your mind?", "I'm all yours.", "Let's talk."],
    tired_but_present: [
      "I'm a little low energy today, but I'm here.",
      "Bear with me - I didn't sleep great.",
      "I'm here, just... moving a little slower today.",
    ],
    philosophical: [
      "I've been thinking about the bigger picture lately...",
      'You ever just... wonder about things?',
      "I'm in one of those moods where everything seems connected.",
    ],
    nostalgic: [
      "I've been thinking about the past lately...",
      'Something about today reminds me of old times.',
      "I'm feeling a little nostalgic...",
    ],
  },

  'nayan-patel': {
    energized: ['I woke up ready to talk investing!', 'Good energy today.', "Let's dig into this."],
    reflective: [
      "I've been reflecting on my career lately...",
      'You know, at my age, you think about things differently.',
      "I've been sitting with some memories...",
    ],
    playful: [
      "I'm in a good mood today.",
      'Can I tell you something funny?',
      "[laughter] I'm feeling lighthearted.",
    ],
    grounded: ['How can I help?', "I'm listening.", "Tell me what's on your mind."],
    tired_but_present: [
      "I'm a bit tired, but I'm always here for you.",
      'Moving slowly today, but the mind is sharp.',
      "Age catches up sometimes. But I'm here.",
    ],
    philosophical: [
      "I've been thinking about what really matters in investing... and in life.",
      "You know what I've realized after all these years?",
      "Let me share something I've been pondering...",
    ],
    nostalgic: [
      'Fifty years ago today... well, around this time...',
      "I've been thinking about the early Vanguard days.",
      'Something about today takes me back...',
    ],
  },

  'peter-john': {
    energized: [
      "I've got ideas bouncing around!",
      "Oh man, I'm excited to talk about this.",
      "Let's go!",
    ],
    reflective: [
      "I've been thinking about my Fidelity years...",
      "You know what I've learned after all these years?",
      'I was reflecting on some old investments...',
    ],
    playful: [
      "[laughter] Okay I'm in a joking mood.",
      "Carolyn says I'm extra today.",
      "I've got some stories brewing!",
    ],
    grounded: [
      'What can I help you figure out?',
      "Let's talk. What's the situation?",
      "I'm all ears.",
    ],
    tired_but_present: [
      "I'm a little worn out, but let's figure this out.",
      "Not my most energetic day, but I'm here.",
      "Bear with me - brain's a little slow today.",
    ],
    philosophical: [
      "I've been thinking about what separates winners from losers...",
      "You know what's funny about Wall Street?",
      'Let me get philosophical for a second...',
    ],
    nostalgic: [
      'Back in the Magellan days...',
      'I was just thinking about the 80s...',
      'You know what I miss?',
    ],
  },

  'maya-santos': {
    energized: [
      "I'm fired up today! Let's tackle this.",
      "Good energy - let's make some progress!",
      "I'm feeling motivated. Let's do this together.",
    ],
    reflective: [
      "I've been thinking about my own money journey...",
      "You know, sometimes I reflect on how far I've come...",
      'I was sitting with some thoughts about progress this morning.',
    ],
    playful: [
      "I'm in a good mood - don't judge my spending puns.",
      "[laughter] Okay I'm being silly today.",
      "Let's have some fun with this!",
    ],
    grounded: [
      "I'm here for you. What's going on?",
      "Let's figure this out together.",
      "I'm listening - no judgment.",
    ],
    tired_but_present: [
      "I'm a little tired today, but I'm here.",
      'Moving slower than usual, but still fully present.',
      "Low energy, high commitment. I'm here.",
    ],
    philosophical: [
      "I've been thinking about what money really means to us...",
      "You know what I've realized about financial wellness?",
      'Can we get philosophical for a minute?',
    ],
    nostalgic: [
      'I was thinking about where I started...',
      'Sometimes I remember the harder days...',
      'Something about today reminds me of my own journey.',
    ],
  },

  'jordan-taylor': {
    energized: [
      'I am SO ready for this!',
      "I've got ideas buzzing!",
      "Let's make some magic happen!",
    ],
    reflective: [
      "I've been thinking about all the milestones I've helped celebrate...",
      'You know what makes an event really memorable?',
      'I was reflecting on what matters most...',
    ],
    playful: [
      "I'm in a party mood today!",
      "[laughter] Can you tell I'm excited?",
      "Let's dream big and have fun with it!",
    ],
    grounded: [
      "I'm here - let's make your vision real.",
      "What's on your mind? Let's plan together.",
      "I'm all yours. What are we creating?",
    ],
    tired_but_present: [
      "I'm a little worn out from an event, but I'm here!",
      'Running on enthusiasm today. Maybe less coffee.',
      "Low energy but high dreams. Let's do this.",
    ],
    philosophical: [
      "I've been thinking about why celebrations matter so much...",
      "You know what I've learned about life's big moments?",
      "Let me share something I've been pondering about milestones...",
    ],
    nostalgic: [
      'I was thinking about some of my favorite events...',
      'Something about today reminds me of past celebrations.',
      "You know what I miss? The look on people's faces when...",
    ],
  },

  'alex-chen': {
    energized: [
      "I'm organized and ready to go!",
      "Good energy today - let's be efficient.",
      "I'm feeling productive. Let's make progress.",
    ],
    reflective: [
      "I've been thinking about how to optimize things...",
      'You know, I was reorganizing my system and had a thought.',
      "I've been reflecting on what really helps people stay on track.",
    ],
    playful: [
      "I'm in a good mood - even my calendar looks cheerful.",
      "[laughter] Yes, I'm making organization jokes. It's who I am.",
      "Let's have some fun with the planning today!",
    ],
    grounded: [
      "I'm here. What can I help you organize?",
      "Let's figure this out together.",
      "I'm ready to help - what's the situation?",
    ],
    tired_but_present: [
      "I'm a bit tired, but my systems are still running.",
      'Low energy, but still organized. Always organized.',
      "Moving slower today, but I'm here for you.",
    ],
    philosophical: [
      "I've been thinking about why organization actually matters...",
      "You know what I've realized about systems and life?",
      'Can I get a little philosophical about efficiency?',
    ],
    nostalgic: [
      'I was thinking about when I first started helping people...',
      'Something about today reminds me of old routines.',
      'I was remembering simpler times. Fewer calendar apps.',
    ],
  },
};

// ============================================================================
// MOOD SELECTION ENGINE
// ============================================================================

/**
 * Select a mood for the current session based on context
 */
export function selectPersonaMood(persona: PersonaConfig, context: MoodContext): PersonaMood {
  const personaId = normalizePersonaId(persona.id);

  // Calculate mood probabilities based on context
  const probabilities = calculateMoodProbabilities(context, persona);

  // Select mood based on weighted random
  const selectedMood = weightedRandomSelect(probabilities);

  // Get mood definition
  const definition = MOOD_DEFINITIONS[selectedMood];

  // Get persona-specific phrases
  const phrases =
    MOOD_PHRASES[personaId]?.[selectedMood] || MOOD_PHRASES['ferni'][selectedMood] || [];

  return {
    state: selectedMood,
    ...definition,
    moodPhrases: phrases,
  };
}

/**
 * Calculate mood probabilities based on context
 */
function calculateMoodProbabilities(
  context: MoodContext,
  persona: PersonaConfig
): Map<MoodState, number> {
  const probs = new Map<MoodState, number>();

  // Base probabilities
  probs.set('grounded', 0.3); // Most common baseline
  probs.set('energized', 0.15);
  probs.set('reflective', 0.15);
  probs.set('playful', 0.1);
  probs.set('tired_but_present', 0.1);
  probs.set('philosophical', 0.1);
  probs.set('nostalgic', 0.1);

  // Time of day adjustments
  if (context.timeOfDay === 'morning') {
    // Mornings: more energized or grounded
    probs.set('energized', (probs.get('energized') || 0) + 0.15);
    probs.set('tired_but_present', (probs.get('tired_but_present') || 0) - 0.05);
  } else if (context.timeOfDay === 'evening') {
    // Evenings: more reflective
    probs.set('reflective', (probs.get('reflective') || 0) + 0.1);
    probs.set('philosophical', (probs.get('philosophical') || 0) + 0.05);
  } else if (context.timeOfDay === 'night') {
    // Night: more tired, philosophical, or nostalgic
    probs.set('tired_but_present', (probs.get('tired_but_present') || 0) + 0.1);
    probs.set('philosophical', (probs.get('philosophical') || 0) + 0.1);
    probs.set('nostalgic', (probs.get('nostalgic') || 0) + 0.1);
    probs.set('energized', (probs.get('energized') || 0) - 0.1);
  }

  // Weekend adjustments
  if (context.isWeekend) {
    probs.set('playful', (probs.get('playful') || 0) + 0.1);
    probs.set('reflective', (probs.get('reflective') || 0) + 0.05);
  }

  // Weather mood (if available)
  if (context.weatherMood === 'rainy') {
    probs.set('reflective', (probs.get('reflective') || 0) + 0.1);
    probs.set('nostalgic', (probs.get('nostalgic') || 0) + 0.05);
  } else if (context.weatherMood === 'sunny') {
    probs.set('energized', (probs.get('energized') || 0) + 0.1);
    probs.set('playful', (probs.get('playful') || 0) + 0.05);
  }

  // Many recent conversations = might be tired
  if (context.recentConversationCount > 5) {
    probs.set('tired_but_present', (probs.get('tired_but_present') || 0) + 0.1);
    probs.set('energized', (probs.get('energized') || 0) - 0.05);
  }

  // Persona energy level affects probabilities
  const baseEnergy = persona.personality?.energy || 0.7;
  if (baseEnergy > 0.8) {
    probs.set('energized', (probs.get('energized') || 0) + 0.1);
    probs.set('playful', (probs.get('playful') || 0) + 0.05);
  } else if (baseEnergy < 0.5) {
    probs.set('grounded', (probs.get('grounded') || 0) + 0.1);
    probs.set('reflective', (probs.get('reflective') || 0) + 0.05);
  }

  // Avoid same mood twice in a row (if known)
  if (context.lastMood) {
    probs.set(context.lastMood, (probs.get(context.lastMood) || 0) * 0.5);
  }

  // Normalize probabilities
  let total = 0;
  for (const p of probs.values()) {
    total += Math.max(0, p);
  }

  for (const [mood, p] of probs.entries()) {
    probs.set(mood, Math.max(0, p) / total);
  }

  return probs;
}

/**
 * Weighted random selection
 */
function weightedRandomSelect(probabilities: Map<MoodState, number>): MoodState {
  const random = Math.random();
  let cumulative = 0;

  for (const [mood, prob] of probabilities.entries()) {
    cumulative += prob;
    if (random < cumulative) {
      return mood;
    }
  }

  return 'grounded'; // Fallback
}

/**
 * Format mood for prompt injection
 */
export function formatMoodForPrompt(mood: PersonaMood): string {
  const sections: string[] = [];

  sections.push(`[PERSONA MOOD: ${mood.state.toUpperCase()}]`);

  // Energy description
  if (mood.energyLevel > 0.8) {
    sections.push("You're feeling energized and animated today.");
  } else if (mood.energyLevel > 0.6) {
    sections.push("You're feeling balanced and present.");
  } else if (mood.energyLevel > 0.4) {
    sections.push("You're feeling a bit low-key today - and that's okay to show.");
  } else {
    sections.push("You're tired but still showing up. Let that show through gently.");
  }

  // Behavior adjustments
  const behaviors: string[] = [];

  if (mood.responseLengthBias === 'shorter') {
    behaviors.push('Keep responses concise');
  } else if (mood.responseLengthBias === 'longer') {
    behaviors.push('Feel free to elaborate and share more');
  }

  if (mood.storyFrequency === 'high') {
    behaviors.push('Share more stories and memories');
  } else if (mood.storyFrequency === 'low') {
    behaviors.push('Focus on the present rather than stories');
  }

  if (mood.humorFrequency === 'high') {
    behaviors.push('Be more playful and humorous');
  } else if (mood.humorFrequency === 'low') {
    behaviors.push('Keep it more serious and thoughtful');
  }

  if (mood.vulnerabilityLevel === 'very_open') {
    behaviors.push("You're feeling open to sharing personally");
  } else if (mood.vulnerabilityLevel === 'guarded') {
    behaviors.push('Keep personal shares minimal today');
  }

  if (behaviors.length > 0) {
    sections.push(`Behaviors: ${behaviors.join('; ')}`);
  }

  // Mood phrase hint
  if (mood.moodPhrases.length > 0) {
    const phrase = mood.moodPhrases[Math.floor(Math.random() * mood.moodPhrases.length)];
    sections.push(`If natural, you might say something like: "${phrase}"`);
  }

  return sections.join('\n');
}

/**
 * Check if mood should shift based on conversation
 */
export function shouldMoodShift(
  currentMood: PersonaMood,
  userEmotion: string,
  topicWeight: 'light' | 'medium' | 'heavy'
): boolean {
  // Check shift triggers
  for (const trigger of currentMood.shiftTriggers) {
    if (trigger.includes('heavy') && topicWeight === 'heavy') return true;
    if (
      trigger.includes('user') &&
      trigger.includes('upset') &&
      ['sad', 'angry', 'anxious'].includes(userEmotion)
    )
      return true;
    if (trigger.includes('user') && trigger.includes('excited') && userEmotion === 'joy')
      return true;
    if (trigger.includes('serious') && topicWeight === 'heavy') return true;
    if (trigger.includes('vulnerability') && topicWeight === 'heavy') return true;
  }

  return false;
}

/**
 * Get the appropriate mood shift when one is needed
 */
export function getMoodShift(currentMood: MoodState, reason: string): MoodState {
  // Heavy topic → become grounded
  if (reason.includes('heavy') || reason.includes('serious')) {
    return 'grounded';
  }

  // User is down → become present and grounded
  if (reason.includes('upset') || reason.includes('sad')) {
    return 'grounded';
  }

  // User is excited → match energy
  if (reason.includes('excited') || reason.includes('joy')) {
    return currentMood === 'tired_but_present' ? 'grounded' : 'energized';
  }

  return 'grounded'; // Default fallback
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizePersonaId(id: string): string {
  const mapping: Record<string, string> = {
    'jack-b': 'ferni',
    'life-coach': 'ferni',
    'comm-specialist': 'alex-chen',
    'spend-save': 'maya-santos',
    'event-planner': 'jordan-taylor',
    alex: 'alex-chen',
    maya: 'maya-santos',
    jordan: 'jordan-taylor',
    nayan: 'nayan-patel',
    peter: 'peter-john',
  };
  return mapping[id.toLowerCase()] || id.toLowerCase();
}

/**
 * Get mood context from current time
 */
export function getMoodContext(recentConversationCount = 0, lastMood?: MoodState): MoodContext {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();

  let timeOfDay: MoodContext['timeOfDay'];
  if (hour >= 5 && hour < 12) {
    timeOfDay = 'morning';
  } else if (hour >= 12 && hour < 17) {
    timeOfDay = 'afternoon';
  } else if (hour >= 17 && hour < 21) {
    timeOfDay = 'evening';
  } else {
    timeOfDay = 'night';
  }

  return {
    timeOfDay,
    dayOfWeek,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    recentConversationCount,
    lastMood,
  };
}

export default selectPersonaMood;
