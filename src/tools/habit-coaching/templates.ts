/**
 * Habit Templates - Pre-built habits for common goals
 *
 * Curated collection of habit templates based on behavioral science.
 * Each template includes glidepath versions for gradual progression.
 *
 * @module habit-coaching/templates
 */

import type { LifeDomain, LifeStage } from './types.js';
import type { HabitLoopTemplate } from './types.js';

// ============================================================================
// TEMPLATE INTERFACE
// ============================================================================

export interface HabitTemplate {
  id: string;
  name: string;
  domain: LifeDomain;
  description: string;
  goal: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  timeRequired: number; // minutes at full level

  // Glidepath versions
  tinyVersion: string; // Level 1
  miniVersion: string; // Level 2
  fullVersion: string; // Level 5

  // Science
  habitLoop: HabitLoopTemplate;

  // Benefits
  benefits: string[];
  cascadeEffects?: string[];
  isKeystone: boolean;

  // Stacking suggestions
  stacksWellWith: string[];
  stacksWellAfter: string[];

  // Life stage fit
  bestForStages: LifeStage[];

  // Evidence
  scienceNote?: string;
}

// ============================================================================
// HABIT TEMPLATES
// ============================================================================

export const HABIT_TEMPLATES: HabitTemplate[] = [
  // HEALTH DOMAIN
  {
    id: 'morning-movement',
    name: 'Morning Movement',
    domain: 'health',
    description: 'Start the day with gentle movement to energize body and mind',
    goal: 'More energy, better mood, improved health',
    difficulty: 'beginner',
    timeRequired: 15,
    tinyVersion: 'Stand up and stretch for 30 seconds after getting out of bed',
    miniVersion: '5-minute stretch or walk around the house',
    fullVersion: '15-minute morning exercise routine',
    habitLoop: {
      cue: {
        type: 'preceding_action',
        description: 'After getting out of bed',
        specificity: 'Feet hit the floor',
      },
      routine: { behavior: 'Gentle stretching or movement', duration: 15, difficulty: 'easy' },
      reward: {
        intrinsic: 'Energized and awake feeling',
        celebration: 'Say "I\'m awake and alive!"',
      },
    },
    benefits: ['More energy', 'Better mood', 'Improved flexibility', 'Mental clarity'],
    cascadeEffects: ['Better sleep', 'Healthier eating', 'More productive mornings'],
    isKeystone: true,
    stacksWellWith: ['morning-hydration', 'morning-meditation'],
    stacksWellAfter: ['wake-up'],
    bestForStages: ['student', 'early_career', 'mid_career', 'retirement'],
    scienceNote:
      'Morning exercise increases cortisol at the right time and improves circadian rhythm',
  },
  {
    id: 'morning-hydration',
    name: 'Morning Hydration',
    domain: 'health',
    description: 'Rehydrate after sleep with a full glass of water',
    goal: 'Better hydration, energy, digestion',
    difficulty: 'beginner',
    timeRequired: 1,
    tinyVersion: 'Take one sip of water',
    miniVersion: 'Drink half a glass of water',
    fullVersion: 'Drink full glass of water, optionally with lemon',
    habitLoop: {
      cue: {
        type: 'location',
        description: 'Entering the kitchen',
        specificity: 'See the water glass I set out',
      },
      routine: { behavior: 'Drink water', duration: 1, difficulty: 'tiny' },
      reward: { intrinsic: 'Refreshed feeling', celebration: 'Smile and say "hydrated!"' },
    },
    benefits: ['Better hydration', 'Improved digestion', 'More energy', 'Clearer skin'],
    isKeystone: false,
    stacksWellWith: ['morning-movement'],
    stacksWellAfter: ['wake-up'],
    bestForStages: ['student', 'early_career', 'mid_career', 'new_parent', 'retirement'],
  },

  // MIND DOMAIN
  {
    id: 'daily-gratitude',
    name: 'Daily Gratitude',
    domain: 'mind',
    description: "Note things you're grateful for to shift perspective",
    goal: 'Better mood, perspective, resilience',
    difficulty: 'beginner',
    timeRequired: 5,
    tinyVersion: "Think of one thing you're grateful for",
    miniVersion: 'Write down 3 gratitudes',
    fullVersion: 'Gratitude journaling with reflection',
    habitLoop: {
      cue: {
        type: 'time',
        description: 'Morning coffee/tea time',
        specificity: 'While the coffee brews',
      },
      routine: { behavior: 'Write gratitudes', duration: 5, difficulty: 'easy' },
      reward: {
        intrinsic: 'Warm, appreciative feeling',
        celebration: 'Take a deep breath and smile',
      },
    },
    benefits: ['Improved mood', 'Better sleep', 'Increased resilience', 'Stronger relationships'],
    cascadeEffects: ['More optimism', 'Better stress handling', 'Improved relationships'],
    isKeystone: true,
    stacksWellWith: ['morning-journaling', 'meditation'],
    stacksWellAfter: ['morning-coffee'],
    bestForStages: ['early_career', 'mid_career', 'new_parent', 'transition', 'retirement'],
    scienceNote:
      'Gratitude practice rewires the brain toward positivity and has been shown to improve wellbeing',
  },
  {
    id: 'meditation',
    name: 'Daily Meditation',
    domain: 'mind',
    description: 'Quiet the mind with focused meditation practice',
    goal: 'Reduced stress, better focus, emotional balance',
    difficulty: 'beginner',
    timeRequired: 15,
    tinyVersion: 'Take 3 deep breaths with eyes closed',
    miniVersion: '2-5 minute guided meditation',
    fullVersion: '15-20 minute meditation session',
    habitLoop: {
      cue: {
        type: 'preceding_action',
        description: 'After morning routine',
        specificity: 'Sit in meditation spot',
      },
      routine: { behavior: 'Meditation practice', duration: 15, difficulty: 'medium' },
      reward: { intrinsic: 'Calm, centered feeling', celebration: 'Gentle smile, hands on heart' },
    },
    benefits: ['Reduced stress', 'Better focus', 'Emotional regulation', 'Improved sleep'],
    cascadeEffects: ['Better decisions', 'Improved relationships', 'More patience'],
    isKeystone: true,
    stacksWellWith: ['morning-movement', 'daily-gratitude'],
    stacksWellAfter: ['morning-movement'],
    bestForStages: [
      'early_career',
      'mid_career',
      'new_parent',
      'pre_retirement',
      'retirement',
      'transition',
    ],
    scienceNote:
      'Regular meditation physically changes brain structure, increasing gray matter in areas related to focus and emotional regulation',
  },

  // RELATIONSHIPS DOMAIN
  {
    id: 'daily-connection',
    name: 'Daily Connection',
    domain: 'relationships',
    description: 'Reach out to someone you care about each day',
    goal: 'Stronger relationships, less isolation',
    difficulty: 'beginner',
    timeRequired: 5,
    tinyVersion: 'Send a thinking-of-you text to one person',
    miniVersion: 'Have a brief check-in call or meaningful text exchange',
    fullVersion: 'Scheduled quality time with loved ones',
    habitLoop: {
      cue: {
        type: 'time',
        description: 'Lunch break or commute',
        specificity: 'When I sit down for lunch',
      },
      routine: { behavior: 'Send thoughtful message', duration: 5, difficulty: 'easy' },
      reward: { intrinsic: 'Feeling of connection', celebration: 'Feel the warmth of connection' },
    },
    benefits: ['Stronger bonds', 'Less loneliness', 'Better mental health', 'Support network'],
    cascadeEffects: ['Improved mood', 'Longer life', 'Better stress resilience'],
    isKeystone: true,
    stacksWellWith: ['daily-gratitude'],
    stacksWellAfter: ['lunch-break'],
    bestForStages: ['early_career', 'mid_career', 'empty_nester', 'retirement'],
    scienceNote: 'Social connection is the #1 predictor of longevity and happiness',
  },

  // FINANCE DOMAIN
  {
    id: 'daily-money-check',
    name: 'Daily Money Check-in',
    domain: 'finance',
    description: 'Quick daily review of spending and accounts',
    goal: 'Financial awareness, better spending decisions',
    difficulty: 'beginner',
    timeRequired: 3,
    tinyVersion: 'Open banking app and look at balance',
    miniVersion: "Review yesterday's transactions",
    fullVersion: 'Full daily financial review and categorization',
    habitLoop: {
      cue: { type: 'time', description: 'Morning coffee', specificity: 'First sip of coffee' },
      routine: { behavior: 'Check accounts', duration: 3, difficulty: 'easy' },
      reward: { intrinsic: 'Feeling in control', celebration: 'Nod and say "I\'ve got this"' },
    },
    benefits: ['Financial awareness', 'Catch fraud early', 'Better decisions', 'Reduced anxiety'],
    cascadeEffects: ['Better budgeting', 'Increased saving', 'Less impulse spending'],
    isKeystone: true,
    stacksWellWith: ['morning-coffee-routine'],
    stacksWellAfter: ['morning-coffee'],
    bestForStages: ['student', 'early_career', 'mid_career', 'pre_retirement'],
    scienceNote: 'Daily awareness of finances significantly reduces overspending',
  },

  // LEARNING DOMAIN
  {
    id: 'daily-learning',
    name: 'Daily Learning',
    domain: 'learning',
    description: 'Dedicated time for learning something new',
    goal: 'Continuous growth, skill development',
    difficulty: 'beginner',
    timeRequired: 20,
    tinyVersion: 'Read one page or watch 2 minutes of educational content',
    miniVersion: '10 minutes of reading or learning',
    fullVersion: '20-30 minutes of focused learning',
    habitLoop: {
      cue: {
        type: 'time',
        description: 'Evening wind-down',
        specificity: 'After dinner, in reading chair',
      },
      routine: { behavior: 'Read or study', duration: 20, difficulty: 'easy' },
      reward: { intrinsic: 'Satisfaction of growth', celebration: 'Note one thing you learned' },
    },
    benefits: ['New skills', 'Mental stimulation', 'Career advancement', 'Confidence'],
    cascadeEffects: ['Better problem solving', 'More opportunities', 'Increased confidence'],
    isKeystone: false,
    stacksWellWith: ['evening-routine'],
    stacksWellAfter: ['dinner'],
    bestForStages: ['student', 'early_career', 'mid_career', 'retirement'],
  },

  // HOME DOMAIN
  {
    id: 'daily-tidy',
    name: 'Daily Tidy',
    domain: 'home',
    description: 'Quick daily tidying to maintain a clean space',
    goal: 'Clean home, reduced stress, peace of mind',
    difficulty: 'beginner',
    timeRequired: 10,
    tinyVersion: 'Put one thing away',
    miniVersion: '5-minute tidy of one room',
    fullVersion: '10-minute whole home tidy',
    habitLoop: {
      cue: {
        type: 'preceding_action',
        description: 'After dinner cleanup',
        specificity: 'Kitchen clean, ready to relax',
      },
      routine: { behavior: 'Quick tidy', duration: 10, difficulty: 'easy' },
      reward: {
        intrinsic: 'Calm, orderly feeling',
        celebration: 'Look around and appreciate the space',
      },
    },
    benefits: ['Cleaner home', 'Less stress', 'Better sleep', 'Saves weekend time'],
    cascadeEffects: ['Better mental clarity', 'More relaxing evenings', 'Guests welcome anytime'],
    isKeystone: false,
    stacksWellWith: ['evening-routine'],
    stacksWellAfter: ['dinner-cleanup'],
    bestForStages: ['early_career', 'new_parent', 'mid_career', 'empty_nester'],
  },

  // SELF CARE DOMAIN
  {
    id: 'evening-wind-down',
    name: 'Evening Wind Down',
    domain: 'selfCare',
    description: 'Transition ritual from day to rest',
    goal: 'Better sleep, clearer boundary between work and rest',
    difficulty: 'beginner',
    timeRequired: 15,
    tinyVersion: 'Put phone away 10 min before bed',
    miniVersion: 'No screens 30 min before bed',
    fullVersion: 'Full wind-down routine: no screens, dim lights, relaxation',
    habitLoop: {
      cue: { type: 'time', description: '9:00 PM', specificity: 'Alarm labeled "wind down"' },
      routine: { behavior: 'Wind-down activities', duration: 15, difficulty: 'easy' },
      reward: { intrinsic: 'Peaceful, sleepy feeling', celebration: 'Deep breath, ready for rest' },
    },
    benefits: ['Better sleep', 'Reduced anxiety', 'Clear work/rest boundary', 'More present evenings'],
    cascadeEffects: ['Better next-day energy', 'Improved mood', 'Better relationships'],
    isKeystone: true,
    stacksWellWith: ['daily-gratitude', 'evening-journaling'],
    stacksWellAfter: ['evening-tasks'],
    bestForStages: ['student', 'early_career', 'mid_career', 'new_parent', 'pre_retirement'],
    scienceNote: 'Screen-free wind-down improves sleep quality and next-day performance',
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get templates for a specific domain
 */
export function getTemplatesByDomain(domain: LifeDomain): HabitTemplate[] {
  return HABIT_TEMPLATES.filter((t) => t.domain === domain);
}

/**
 * Get templates by difficulty level
 */
export function getTemplatesByDifficulty(
  difficulty: 'beginner' | 'intermediate' | 'advanced'
): HabitTemplate[] {
  return HABIT_TEMPLATES.filter((t) => t.difficulty === difficulty);
}

/**
 * Get keystone habits (high-impact habits)
 */
export function getKeystoneTemplates(): HabitTemplate[] {
  return HABIT_TEMPLATES.filter((t) => t.isKeystone);
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): HabitTemplate | undefined {
  return HABIT_TEMPLATES.find((t) => t.id === id);
}

/**
 * Get templates suitable for a life stage
 */
export function getTemplatesForStage(stage: LifeStage): HabitTemplate[] {
  return HABIT_TEMPLATES.filter((t) => t.bestForStages.includes(stage));
}

