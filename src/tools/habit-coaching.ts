/**
 * Habit & Routine Coaching System
 *
 * A comprehensive life habits coach that uses behavior science principles
 * to help users build sustainable habits across all life domains.
 *
 * KEY CAPABILITIES:
 * - Multi-domain habit tracking (health, relationships, career, etc.)
 * - Glidepath progression (start tiny → build up)
 * - Life stage awareness (student, parent, retiree, etc.)
 * - Habit stacking & bundling
 * - Keystone habit identification
 * - Behavior science framework (cue-routine-reward)
 * - Personalized recommendations
 * - Accountability & encouragement
 *
 * Based on: Atomic Habits, Tiny Habits, The Power of Habit
 *
 * NOTE: This is the agent-agnostic version. The original maya-habit-coach.ts
 * re-exports from this file for backward compatibility.
 */

import { llm, log } from '@livekit/agents';
import { z } from 'zod';
import {
  getProductivityStore,
  type EnhancedHabitData,
  type HabitStackData,
  type HabitCoachProfileData,
  type WeeklyReflectionData,
} from '../services/productivity-store.js';

const getLogger = () => log();

// ============================================================================
// LIFE DOMAINS - All areas Maya can help with
// ============================================================================

export const LIFE_DOMAINS = {
  // Physical
  health: {
    name: 'Health & Wellness',
    icon: '💪',
    description: 'Physical health, fitness, nutrition, sleep',
    subdomains: ['exercise', 'nutrition', 'sleep', 'hydration', 'medical', 'energy'],
  },
  mind: {
    name: 'Mental & Emotional',
    icon: '🧠',
    description: 'Mental health, stress, mindfulness, emotional wellbeing',
    subdomains: ['mindfulness', 'stress', 'therapy', 'journaling', 'gratitude', 'meditation'],
  },
  // Relationships
  relationships: {
    name: 'Relationships',
    icon: '❤️',
    description: 'Family, friends, romantic, community connections',
    subdomains: ['family', 'friends', 'romantic', 'community', 'networking', 'communication'],
  },
  // Growth
  career: {
    name: 'Career & Purpose',
    icon: '💼',
    description: 'Work, professional development, purpose',
    subdomains: ['skills', 'productivity', 'leadership', 'side_projects', 'job_search', 'mentorship'],
  },
  learning: {
    name: 'Learning & Growth',
    icon: '📚',
    description: 'Education, skills, personal development',
    subdomains: ['reading', 'courses', 'languages', 'certifications', 'hobbies', 'creativity'],
  },
  // Resources
  finance: {
    name: 'Financial Wellness',
    icon: '💰',
    description: 'Money habits, saving, investing, spending',
    subdomains: ['saving', 'budgeting', 'investing', 'debt', 'income', 'generosity'],
  },
  // Environment
  home: {
    name: 'Home & Environment',
    icon: '🏠',
    description: 'Living space, organization, sustainability',
    subdomains: ['cleaning', 'organization', 'maintenance', 'sustainability', 'cooking', 'garden'],
  },
  // Self
  selfCare: {
    name: 'Self Care & Joy',
    icon: '✨',
    description: 'Rest, hobbies, fun, personal time',
    subdomains: ['rest', 'hobbies', 'entertainment', 'boundaries', 'self_compassion', 'adventure'],
  },
} as const;

export type LifeDomain = keyof typeof LIFE_DOMAINS;

// ============================================================================
// LIFE STAGES - Different needs at different times
// ============================================================================

export const LIFE_STAGES = {
  student: {
    name: 'Student',
    priorities: ['learning', 'career', 'finance', 'relationships'],
    challenges: ['time_management', 'focus', 'budget_constraints', 'stress'],
    opportunities: ['habit_foundation', 'learning_capacity', 'flexibility'],
  },
  early_career: {
    name: 'Early Career',
    priorities: ['career', 'finance', 'relationships', 'health'],
    challenges: ['work_life_balance', 'financial_foundation', 'identity'],
    opportunities: ['income_growth', 'skill_building', 'networking'],
  },
  new_parent: {
    name: 'New Parent',
    priorities: ['relationships', 'health', 'selfCare', 'home'],
    challenges: ['sleep_deprivation', 'time_scarcity', 'identity_shift'],
    opportunities: ['family_bonding', 'perspective_shift', 'resilience'],
  },
  mid_career: {
    name: 'Mid Career',
    priorities: ['career', 'finance', 'health', 'relationships'],
    challenges: ['burnout', 'stagnation', 'sandwich_generation'],
    opportunities: ['peak_earning', 'leadership', 'mentoring'],
  },
  empty_nester: {
    name: 'Empty Nester',
    priorities: ['relationships', 'health', 'selfCare', 'learning'],
    challenges: ['identity_redefinition', 'relationship_renewal', 'health_focus'],
    opportunities: ['freedom', 'rediscovery', 'travel', 'purpose'],
  },
  pre_retirement: {
    name: 'Pre-Retirement',
    priorities: ['finance', 'health', 'relationships', 'selfCare'],
    challenges: ['retirement_planning', 'health_optimization', 'meaning'],
    opportunities: ['wealth_building', 'legacy', 'bucket_list'],
  },
  retirement: {
    name: 'Retirement',
    priorities: ['health', 'relationships', 'selfCare', 'learning'],
    challenges: ['structure', 'purpose', 'health_management', 'social'],
    opportunities: ['freedom', 'grandparenting', 'giving_back', 'travel'],
  },
  transition: {
    name: 'Life Transition',
    priorities: ['mind', 'selfCare', 'relationships', 'career'],
    challenges: ['uncertainty', 'stress', 'identity', 'planning'],
    opportunities: ['reinvention', 'fresh_start', 'clarity'],
  },
} as const;

export type LifeStage = keyof typeof LIFE_STAGES;

// ============================================================================
// FOUR TENDENCIES - Gretchen Rubin's personality framework
// ============================================================================

export const FOUR_TENDENCIES_STRATEGIES = {
  upholder: {
    name: 'Upholder',
    description: 'You meet both outer expectations (from others) and inner expectations (from yourself). You love schedules, to-do lists, and clear rules.',
    habitStrategies: [
      'Set clear rules and schedules for yourself',
      'Create detailed to-do lists and check them off',
      'Use habit tracking apps religiously',
      'Set personal deadlines and honor them',
      'Create routines and stick to them',
    ],
    avoid: [
      'Don\'t be too rigid - allow for flexibility',
      'Watch out for "tightening" - making rules stricter over time',
      'Remember that rest and fun are also "productive"',
    ],
    motivationTip: 'You respond to clear expectations. Put your habits on your calendar and treat them as non-negotiable appointments.',
  },
  questioner: {
    name: 'Questioner',
    description: 'You question all expectations and only follow through if you have good reasons. You need to understand WHY before you commit.',
    habitStrategies: [
      'Research the science behind habits before starting',
      'Understand exactly WHY this habit matters',
      'Set your own goals based on your reasoning',
      'Question advice and customize to fit your logic',
      'Track data to prove the habit is working',
    ],
    avoid: [
      'Analysis paralysis - at some point, just start',
      'Questioning to the point of decision fatigue',
      'Rejecting good advice just because you didn\'t come up with it',
    ],
    motivationTip: 'You need to buy into the WHY. Once you truly believe a habit serves your goals, you\'ll follow through. Do the research first.',
  },
  obliger: {
    name: 'Obliger',
    description: 'You meet outer expectations (for others) but struggle with inner expectations (for yourself). You need external accountability.',
    habitStrategies: [
      'Get an accountability partner or coach',
      'Join a group or class with attendance expectations',
      'Make appointments you can\'t cancel',
      'Tell others about your goals publicly',
      'Set up external consequences (like charitable donations if you miss)',
    ],
    avoid: [
      'Obliger rebellion - pushing yourself too hard until you snap',
      'Saying yes to everyone else\'s needs before your own',
      'Feeling guilty for needing external accountability',
    ],
    motivationTip: 'Your superpower is following through for others. Harness this by creating external accountability structures. This isn\'t weakness - it\'s self-knowledge.',
  },
  rebel: {
    name: 'Rebel',
    description: 'You resist ALL expectations, both outer and inner. You want to act from freedom and choice, doing things your way.',
    habitStrategies: [
      'Frame habits as choices, not rules ("I can" not "I must")',
      'Connect habits to your identity ("I\'m someone who...")',
      'Maintain freedom and options within the habit',
      'Challenge yourself to prove you CAN do it',
      'Make the habit feel like defiance of limitation',
    ],
    avoid: [
      'Don\'t set rigid rules - they\'ll trigger resistance',
      'Avoid tracking streaks - they feel like obligations',
      'Don\'t let others tell you what to do',
    ],
    motivationTip: 'Frame every habit as YOUR choice that expresses who you are. "I\'m the kind of person who..." works better than any rule. You do things because you WANT to, not because you should.',
  },
} as const;

export type FourTendency = keyof typeof FOUR_TENDENCIES_STRATEGIES;

// ============================================================================
// IDENTITY SHIFT TYPES
// ============================================================================

export interface IdentityShift {
  id: string;
  from: string;
  to: string;
  domain: LifeDomain;
  proofs: string[];
  createdAt: string;
  evidenceLog: Array<{ date: string; action: string }>;
}

// ============================================================================
// BAD HABIT BREAKING TYPES
// ============================================================================

export interface HabitBreakPlan {
  id: string;
  badHabit: string;
  cue: string;
  actualReward: string;
  replacement: string;
  frictionAdded: string[];
  startDate: string;
  relapseLog: Array<{ date: string; trigger: string }>;
  successStreak: number;
}

function generateFrictionTips(badHabit: string): string[] {
  const lowerHabit = badHabit.toLowerCase();
  
  if (lowerHabit.includes('phone') || lowerHabit.includes('scroll') || lowerHabit.includes('social media')) {
    return [
      'Delete apps from home screen (keep only in folders)',
      'Enable grayscale mode on phone',
      'Set up app time limits',
      'Charge phone in another room',
      'Use a real alarm clock instead of phone',
    ];
  }
  if (lowerHabit.includes('snack') || lowerHabit.includes('eat') || lowerHabit.includes('junk')) {
    return [
      'Don\'t buy it - if it\'s not in the house, you can\'t eat it',
      'Put snacks in hard-to-reach places',
      'Use smaller plates and containers',
      'Drink water first when you feel hungry',
      'Keep healthy alternatives visible and easy',
    ];
  }
  if (lowerHabit.includes('procrastin') || lowerHabit.includes('distract')) {
    return [
      'Use website blockers during focus time',
      'Work in a different location',
      'Put phone in another room',
      'Use the 2-minute rule - if it takes less than 2 min, do it now',
      'Break tasks into tiny steps',
    ];
  }
  // Generic friction tips
  return [
    'Add steps between you and the bad habit',
    'Remove cues from your environment',
    'Make the habit socially costly (tell others)',
    'Add a delay before indulging',
    'Replace the routine with something else',
  ];
}

// ============================================================================
// ENVIRONMENT DESIGN STRATEGIES
// ============================================================================

export interface EnvironmentDesign {
  id: string;
  habit: string;
  type: 'build' | 'break';
  currentSetup: string;
  changes: string[];
  implemented: string[];
  createdAt: string;
}

const ENVIRONMENT_BUILD_STRATEGIES = [
  'Make cues obvious: Put visual reminders where you\'ll see them',
  'Reduce friction: Remove steps between you and the habit',
  'Prime your environment: Set up the night before',
  'Use habit stacking: Link to existing behaviors',
  'Create a dedicated space: Associate a location with the habit',
];

const ENVIRONMENT_BREAK_STRATEGIES = [
  'Make cues invisible: Remove triggers from sight',
  'Add friction: Put obstacles between you and the habit',
  'Change your environment: Break associations',
  'Avoid trigger situations: Know your weak moments',
  'Replace, don\'t remove: Fill the gap with something better',
];

// ============================================================================
// TEMPTATION BUNDLING TYPES
// ============================================================================

export interface TemptationBundle {
  id: string;
  needToDo: string;
  wantToDo: string;
  rule: string;
  createdAt: string;
  usageLog: Array<{ date: string; completed: boolean }>;
}

// ============================================================================
// SELF-COMPASSION TYPES
// ============================================================================

export interface SetbackLog {
  id: string;
  habit: string;
  trigger: string;
  feeling: string;
  lesson?: string;
  date: string;
}

const SELF_COMPASSION_MESSAGES: Record<string, string> = {
  ashamed: "Hey, shame is the enemy of change. What happened doesn't define you - what you do next does. Everyone stumbles. EVERYONE. Let's focus on the next step, not the last one.",
  frustrated: "I hear you. Frustration means you care, and caring is step one. The path to any goal has setbacks built in. This isn't a detour - it's part of the journey.",
  disappointed: "Disappointment shows you had expectations of yourself - that's actually good! Now let's channel that into curiosity: what can we learn from this?",
  hopeless: "I know it feels like you can't do this. But that feeling is temporary, and it's lying to you. You've overcome hard things before. We'll take the tiniest step forward together.",
  angry: "Anger can be fuel if we channel it right. You're mad because you want better for yourself. Let's turn that energy into your next small action.",
};

function detectSetbackPattern(setbacks: SetbackLog[]): string | null {
  if (setbacks.length < 2) return null;
  
  const triggers = setbacks.map(s => s.trigger.toLowerCase());
  
  // Check for common patterns
  if (triggers.filter(t => t.includes('stress') || t.includes('tired')).length > triggers.length / 2) {
    return 'stress or tiredness';
  }
  if (triggers.filter(t => t.includes('weekend') || t.includes('saturday') || t.includes('sunday')).length > triggers.length / 2) {
    return 'weekends (less structure)';
  }
  if (triggers.filter(t => t.includes('evening') || t.includes('night')).length > triggers.length / 2) {
    return 'evenings (willpower depletion)';
  }
  if (triggers.filter(t => t.includes('alone') || t.includes('bored')).length > triggers.length / 2) {
    return 'boredom or being alone';
  }
  
  return null;
}

// ============================================================================
// ACCOUNTABILITY SYSTEM TYPES
// ============================================================================

export interface AccountabilitySystem {
  id: string;
  habit: string;
  type: 'partner' | 'group' | 'public' | 'coach' | 'app';
  partner?: string;
  schedule: string;
  consequences?: string;
  createdAt: string;
}

const ACCOUNTABILITY_TIPS: Record<string, string[]> = {
  partner: [
    'Check in at the same time each day/week',
    'Share both wins AND struggles honestly',
    'Celebrate each other\'s progress',
    'Be specific about what you\'re committing to',
  ],
  group: [
    'Regular meeting times increase accountability',
    'Share specific goals with the group',
    'Celebrate group milestones together',
    'Support others - it reinforces your own commitment',
  ],
  public: [
    'Share your commitment on social media',
    'Regular progress updates increase follow-through',
    'Be specific about what you\'re doing',
    'Update even when you struggle - vulnerability builds connection',
  ],
  coach: [
    'Be completely honest with your coach',
    'Prepare for sessions with updates',
    'Implement suggestions before next session',
    'Track between sessions for data',
  ],
  app: [
    'Enable notifications and don\'t ignore them',
    'Use apps that share progress with others',
    'Review your stats regularly',
    'Combine app tracking with human accountability for best results',
  ],
};

// ============================================================================
// 30-DAY CHALLENGES
// ============================================================================

export interface ThirtyDayChallenge {
  id: string;
  type: string;
  name: string;
  startDate: string;
  currentDay: number;
  intensity: 'gentle' | 'moderate' | 'intensive';
  completedDays: number[];
  missedDays: number[];
  notes: Record<number, { notes?: string; difficulty?: string; completed: boolean }>;
}

interface ChallengeWeek {
  theme: string;
  days: string[];
  intensityNote: string;
}

interface ChallengeDefinition {
  name: string;
  description: string;
  commitment: string;
  weeks: ChallengeWeek[];
}

export const THIRTY_DAY_CHALLENGES: Record<string, ChallengeDefinition> = {
  morning_person: {
    name: 'Become a Morning Person',
    description: 'Transform your mornings from chaotic to intentional, one day at a time',
    commitment: 'Wake up 15 minutes earlier each week',
    weeks: [
      {
        theme: 'Foundation Week - Just Wake Up',
        days: [
          'Set alarm 15 min earlier. Get out of bed immediately when it rings.',
          'Same alarm. Drink a glass of water within 5 minutes of waking.',
          'Add 30 seconds of stretching after water.',
          'Open curtains/turn on lights immediately. Let light in.',
          'No phone for first 10 minutes. Just exist.',
          'Review: How did you feel this week?',
          'Rest day - sleep in if needed, but wake by regular time.'
        ],
        intensityNote: 'This week is about the wake-up moment. Nothing else.',
      },
      {
        theme: 'Movement Week - Wake Your Body',
        days: [
          'Set alarm another 15 min earlier. Water + 2 min movement.',
          '3 minutes of gentle movement. Stretching, walking, whatever.',
          'Try 5 minutes of movement. Notice how you feel after.',
          'Experiment with the type of movement you enjoy.',
          'Make movement environment ready the night before.',
          'Week reflection: Energy levels improving?',
          'Flexible day - shorter movement is fine.'
        ],
        intensityNote: 'Movement wakes up your brain. Keep it gentle.',
      },
      {
        theme: 'Intention Week - Mind Activation',
        days: [
          'Another 15 min earlier. Add 2 min of quiet sitting after movement.',
          'Write down 1 thing you\'re grateful for.',
          'Write 1-3 intentions for the day.',
          'Spend 3-5 minutes in quiet reflection or meditation.',
          'Visualize your ideal morning routine.',
          'Week reflection: What\'s your favorite part?',
          'Flexible day - do your favorite elements.'
        ],
        intensityNote: 'Starting the day with intention changes everything.',
      },
      {
        theme: 'Mastery Week - Own Your Morning',
        days: [
          'Full routine at your target wake time. You designed it.',
          'Notice what you want to add or remove.',
          'Refine your routine. What\'s essential? What\'s optional?',
          'Create your "minimum viable morning" for busy days.',
          'Plan for how to maintain this long-term.',
          'Celebrate! You transformed your mornings!',
          'Rest and reflect on your journey.'
        ],
        intensityNote: 'You\'re now a morning person. Protect this.',
      },
    ],
  },
  fitness_starter: {
    name: 'Fitness Starter',
    description: 'Build a sustainable exercise habit from zero',
    commitment: '5 minutes of movement daily, building to 20+',
    weeks: [
      {
        theme: 'Just Move Week',
        days: [
          '5 minute walk. That\'s it. Just walk.',
          '5 minute walk. Same route is fine.',
          '5 minutes of any movement you want.',
          'Walk or move for 5-7 minutes.',
          'Try a different type of movement.',
          'Reflection: How does your body feel?',
          'Active rest - gentle stretching only.'
        ],
        intensityNote: 'Building the habit of moving is more important than the workout.',
      },
      {
        theme: 'Building Week',
        days: [
          '10 minute walk or movement.',
          'Try adding one bodyweight exercise (squats, pushups).',
          '10-12 minutes of mixed movement.',
          'Walk faster for part of your walk.',
          'Find a movement you actually enjoy.',
          'Week reflection: What did you like most?',
          'Gentle movement or rest.'
        ],
        intensityNote: 'Finding enjoyment is key to long-term success.',
      },
      {
        theme: 'Challenge Week',
        days: [
          '15 minutes of intentional exercise.',
          'Try something new (yoga video, dance, bike).',
          'Push slightly harder than comfortable.',
          'Do your favorite activity from this month.',
          'Try exercising with someone or in a class.',
          'Week reflection: Feeling stronger?',
          'Active recovery - stretching and walking.'
        ],
        intensityNote: 'You\'re building real fitness now.',
      },
      {
        theme: 'Ownership Week',
        days: [
          '20+ minutes of exercise you enjoy.',
          'Design your weekly workout schedule.',
          'Include variety in your routine.',
          'Plan for obstacles (weather, busy days).',
          'Set your next fitness goal.',
          'Celebrate! You\'re now someone who exercises!',
          'Rest and plan for month 2.'
        ],
        intensityNote: 'You\'ve built a foundation for life.',
      },
    ],
  },
  mindfulness: {
    name: 'Mindfulness Starter',
    description: 'Develop a sustainable meditation and presence practice',
    commitment: 'Daily moments of intentional presence',
    weeks: [
      {
        theme: 'Breathing Week',
        days: [
          'Take 3 conscious breaths. Feel them.',
          '5 conscious breaths. Notice your body.',
          '1 minute of focused breathing.',
          'Practice 3 breaths before each meal.',
          '2 minutes of sitting quietly.',
          'Reflection: Where do you notice tension?',
          'Breathing practice whenever you remember.'
        ],
        intensityNote: 'Breath is always with you. It\'s the simplest anchor.',
      },
      {
        theme: 'Awareness Week',
        days: [
          '3 minutes of sitting with eyes closed.',
          'Practice mindful eating for one meal.',
          '4 minutes sitting. Notice thoughts passing.',
          'Take a mindful walk - notice sensations.',
          '5 minutes sitting. Return to breath when distracted.',
          'Weekly reflection: What did you notice?',
          'Informal mindfulness throughout the day.'
        ],
        intensityNote: 'Noticing is the practice. Not controlling.',
      },
      {
        theme: 'Deepening Week',
        days: [
          '7-10 minutes of meditation.',
          'Try a guided meditation.',
          'Practice during a stressful moment.',
          'Body scan meditation.',
          '10 minutes sitting.',
          'Reflection: How has your relationship to thoughts changed?',
          'Gentle practice day.'
        ],
        intensityNote: 'Longer sits reveal patterns.',
      },
      {
        theme: 'Integration Week',
        days: [
          '10-15 minutes meditation.',
          'Mindfulness during everyday activities.',
          'Practice responding vs. reacting.',
          'Loving-kindness meditation.',
          'Design your ongoing practice.',
          'Celebrate your new relationship with your mind!',
          'Reflection and planning.'
        ],
        intensityNote: 'The real practice is in daily life.',
      },
    ],
  },
  financial_reset: {
    name: 'Financial Reset',
    description: 'Build daily money awareness and healthy financial habits',
    commitment: 'Daily financial check-in, building awareness',
    weeks: [
      {
        theme: 'Awareness Week',
        days: [
          'Check your account balance. Just look.',
          'Track every purchase today. No judgment.',
          'Review yesterday\'s spending. Categorize.',
          'Check all account balances.',
          'List your recurring subscriptions.',
          'Weekly spending review.',
          'Reflection: What surprised you?'
        ],
        intensityNote: 'Awareness before change. No judgment this week.',
      },
      {
        theme: 'Understanding Week',
        days: [
          'Calculate your monthly income.',
          'List your fixed monthly expenses.',
          'Track variable spending categories.',
          'Identify your spending triggers.',
          'Find one subscription to cancel.',
          'Create a simple spending plan.',
          'Review and adjust.'
        ],
        intensityNote: 'Understanding your money flow.',
      },
      {
        theme: 'Action Week',
        days: [
          'Set up automatic savings (even $5).',
          'Create a "spending limit" for one category.',
          'No-spend challenge today.',
          'Find one area to reduce spending.',
          'Review and celebrate savings.',
          'Adjust your spending plan.',
          'Plan for next month.'
        ],
        intensityNote: 'Small actions, big changes.',
      },
      {
        theme: 'Habit Week',
        days: [
          'Full daily financial check-in routine.',
          'Review your financial goals.',
          'Increase automatic savings if possible.',
          'Create your "money date" routine.',
          'Plan for upcoming expenses.',
          'Celebrate your financial awareness!',
          'Design your ongoing money habits.'
        ],
        intensityNote: 'Financial wellness is a habit, not an event.',
      },
    ],
  },
  digital_detox: {
    name: 'Digital Detox',
    description: 'Reclaim your attention from screens',
    commitment: 'Gradually reduce screen time and build boundaries',
    weeks: [
      {
        theme: 'Awareness Week',
        days: [
          'Check your screen time stats. Just notice.',
          'Identify your top 3 time-wasting apps.',
          'Log every time you pick up your phone.',
          'Notice your phone habits without changing.',
          'Identify your trigger moments.',
          'Weekly review: When do you reach for screens?',
          'Rest day - use phone as normal, but aware.'
        ],
        intensityNote: 'Awareness first. See your patterns.',
      },
      {
        theme: 'Boundaries Week',
        days: [
          'No phone for first 30 min after waking.',
          'Set app time limits on top time-wasters.',
          'Create a phone-free zone (bedroom or dining).',
          'No phone for last 30 min before bed.',
          'Delete one distracting app.',
          'Weekly review: How does it feel?',
          'Practice your new boundaries.'
        ],
        intensityNote: 'Building boundaries is freedom.',
      },
      {
        theme: 'Replacement Week',
        days: [
          'Replace morning scrolling with something else.',
          'Find analog alternatives (book, journal, music).',
          'Practice being bored without phone.',
          'Have a phone-free meal with someone.',
          'Replace evening scrolling with wind-down.',
          'Weekly review: What do you enjoy instead?',
          'Experiment with what you like.'
        ],
        intensityNote: 'You need to fill the void with something better.',
      },
      {
        theme: 'New Normal Week',
        days: [
          'Full day with your new phone boundaries.',
          'Notice how your attention feels.',
          'Refine your system.',
          'Plan for challenging situations.',
          'Create your "intentional phone use" guidelines.',
          'Celebrate your reclaimed attention!',
          'Plan for long-term success.'
        ],
        intensityNote: 'Your attention is yours again.',
      },
    ],
  },
  sleep_optimization: {
    name: 'Sleep Optimization',
    description: 'Build habits for better, more restorative sleep',
    commitment: 'Consistent sleep and wake times, wind-down routine',
    weeks: [
      {
        theme: 'Baseline Week',
        days: [
          'Track when you go to bed and wake up.',
          'Note how you feel each morning (1-10).',
          'Track caffeine intake and timing.',
          'Note screen time before bed.',
          'Track how long to fall asleep.',
          'Weekly review: What patterns emerge?',
          'Rest and reflect.'
        ],
        intensityNote: 'Understanding your sleep is step one.',
      },
      {
        theme: 'Consistency Week',
        days: [
          'Set a target wake time. Stick to it.',
          'Set a target bedtime. Aim for it.',
          'Same times on weekend too.',
          'No caffeine after 2pm.',
          'Create a 15-min wind-down routine.',
          'Weekly review: Sleep quality improving?',
          'Maintain consistency.'
        ],
        intensityNote: 'Consistency is the #1 sleep improvement.',
      },
      {
        theme: 'Environment Week',
        days: [
          'Make bedroom dark (blackout or eye mask).',
          'Make bedroom cool (65-68°F ideal).',
          'No screens in bedroom.',
          'Try white noise or quiet.',
          'Reserve bed for sleep only.',
          'Weekly review: Environment optimized?',
          'Fine-tune your space.'
        ],
        intensityNote: 'Your environment shapes your sleep.',
      },
      {
        theme: 'Mastery Week',
        days: [
          'Full wind-down routine each night.',
          'Morning light exposure within 30 min of waking.',
          'Manage stress before bed (journal, breathe).',
          'Exercise earlier in day if sleep is affected.',
          'Create your "sleep emergency" protocol.',
          'Celebrate your improved sleep!',
          'Plan for long-term sleep health.'
        ],
        intensityNote: 'Good sleep changes everything else.',
      },
    ],
  },
  hydration: {
    name: 'Hydration Challenge',
    description: 'Build a consistent water drinking habit',
    commitment: 'Drink more water, track intake, build the habit',
    weeks: [
      {
        theme: 'Baseline Week',
        days: [
          'Track how much water you drink naturally.',
          'Drink one extra glass today.',
          'Drink water first thing in morning.',
          'Add a glass before each meal.',
          'Track your bathroom visits (sign of hydration).',
          'Weekly review: Current average?',
          'Rest day - drink intuitively.'
        ],
        intensityNote: 'See where you\'re starting from.',
      },
      {
        theme: 'Building Week',
        days: [
          'Aim for 6 glasses today.',
          'Get a water bottle you love using.',
          'Set 3 reminders throughout day.',
          'Drink before you feel thirsty.',
          'Replace one other drink with water.',
          'Weekly review: Getting easier?',
          'Practice your system.'
        ],
        intensityNote: 'Make water accessible and visible.',
      },
      {
        theme: 'Optimization Week',
        days: [
          'Aim for 8 glasses.',
          'Connect water to existing habits.',
          'Track energy levels with hydration.',
          'Try adding lemon or other flavoring.',
          'Find your optimal intake level.',
          'Weekly review: How do you feel?',
          'Maintain and adjust.'
        ],
        intensityNote: 'Find what works for your body.',
      },
      {
        theme: 'Habit Week',
        days: [
          'Full hydration routine, no reminders needed.',
          'Hydration is automatic.',
          'Plan for challenging situations.',
          'Notice how dehydration feels now.',
          'Create your maintenance system.',
          'Celebrate your hydration habit!',
          'Plan for life.'
        ],
        intensityNote: 'You now naturally hydrate.',
      },
    ],
  },
  gratitude: {
    name: 'Gratitude Practice',
    description: 'Build a daily gratitude habit to shift perspective',
    commitment: 'Daily gratitude practice, growing in depth',
    weeks: [
      {
        theme: 'Simple Gratitude',
        days: [
          'Think of 1 thing you\'re grateful for.',
          'Write down 1 gratitude.',
          'Write down 3 gratitudes.',
          'Tell someone you\'re grateful for them.',
          'Notice 5 small things you appreciate.',
          'Weekly review: What surprised you?',
          'Gratitude for yourself.'
        ],
        intensityNote: 'Start simple. Quantity before depth.',
      },
      {
        theme: 'Specific Gratitude',
        days: [
          'Write WHY you\'re grateful, not just what.',
          'Gratitude for a difficulty (what you learned).',
          'Gratitude for your body.',
          'Gratitude for a relationship.',
          'Gratitude for an opportunity.',
          'Weekly review: Going deeper?',
          'Free gratitude practice.'
        ],
        intensityNote: 'Specificity increases impact.',
      },
      {
        theme: 'Expression Week',
        days: [
          'Write a gratitude letter (don\'t send yet).',
          'Express gratitude to someone face-to-face.',
          'Send a gratitude text.',
          'Call someone to say thank you.',
          'Do something kind for someone you appreciate.',
          'Weekly review: How did expressing feel?',
          'Gratitude reflection.'
        ],
        intensityNote: 'Expressing gratitude multiplies it.',
      },
      {
        theme: 'Integration Week',
        days: [
          'Design your ongoing gratitude practice.',
          'Morning and evening gratitude.',
          'Gratitude during difficulty.',
          'Share your practice with someone.',
          'Create gratitude ritual.',
          'Celebrate your shifted perspective!',
          'Plan for sustained practice.'
        ],
        intensityNote: 'Gratitude rewires your brain for positivity.',
      },
    ],
  },
  declutter: {
    name: 'Declutter Challenge',
    description: 'Clear your space, clear your mind - one area at a time',
    commitment: 'Daily decluttering actions, building to bigger projects',
    weeks: [
      {
        theme: 'Quick Wins Week',
        days: [
          'Declutter one drawer.',
          'Clear one surface completely.',
          'Bag up 5 things to donate.',
          'Declutter your wallet/purse.',
          'Clear one shelf.',
          'Weekly review: How does it feel?',
          'Maintain cleared areas.'
        ],
        intensityNote: 'Quick wins build momentum.',
      },
      {
        theme: 'Digital Declutter',
        days: [
          'Unsubscribe from 10 emails.',
          'Delete unused apps.',
          'Clear phone photo roll.',
          'Organize desktop files.',
          'Clean up one social media follow list.',
          'Weekly review: Digital space clearer?',
          'Maintain digital order.'
        ],
        intensityNote: 'Digital clutter is still clutter.',
      },
      {
        theme: 'Room Focus Week',
        days: [
          'Declutter bathroom.',
          'Tackle closet/wardrobe.',
          'Kitchen declutter.',
          'Living area reset.',
          'Workspace organization.',
          'Weekly review: Favorite transformation?',
          'Touch up any area.'
        ],
        intensityNote: 'One room at a time makes it manageable.',
      },
      {
        theme: 'Maintenance Week',
        days: [
          'Daily 10-min tidy routine.',
          'One-in-one-out rule.',
          'Weekly reset routine.',
          'Prevent clutter entry points.',
          'Create decluttering schedule.',
          'Celebrate your clear space!',
          'Plan for maintenance.'
        ],
        intensityNote: 'Maintenance is easier than major cleanouts.',
      },
    ],
  },
  connection: {
    name: 'Connection Challenge',
    description: 'Strengthen relationships through daily connection',
    commitment: 'Daily intentional connection with someone',
    weeks: [
      {
        theme: 'Reach Out Week',
        days: [
          'Text someone you haven\'t talked to in a while.',
          'Call someone instead of texting.',
          'Send an unprompted "thinking of you".',
          'Reach out to family.',
          'Connect with a colleague.',
          'Weekly review: How did it feel?',
          'Rest day - quality time with close one.'
        ],
        intensityNote: 'Reaching out is brave. Do it anyway.',
      },
      {
        theme: 'Quality Week',
        days: [
          'Have a phone-free conversation.',
          'Ask a deeper question.',
          'Really listen without planning response.',
          'Share something vulnerable.',
          'Express appreciation.',
          'Weekly review: Conversations deeper?',
          'Intentional quality time.'
        ],
        intensityNote: 'Depth over breadth in connection.',
      },
      {
        theme: 'Community Week',
        days: [
          'Connect with a neighbor.',
          'Reach out to an old friend.',
          'Join a group or class.',
          'Help someone without being asked.',
          'Introduce two people to each other.',
          'Weekly review: Community growing?',
          'Nurture your connections.'
        ],
        intensityNote: 'Community expands support.',
      },
      {
        theme: 'Ritual Week',
        days: [
          'Create a weekly check-in with someone.',
          'Plan a regular get-together.',
          'Start a tradition.',
          'Create your connection routine.',
          'Invest in key relationships.',
          'Celebrate your richer connections!',
          'Plan for ongoing connection.'
        ],
        intensityNote: 'Relationships need rituals to thrive.',
      },
    ],
  },
};

function getChallengeDayEncouragement(day: number): string {
  if (day === 1) return 'Day 1! The hardest part is starting. You did it!';
  if (day === 7) return 'ONE WEEK! Most people don\'t make it this far. You\'re different.';
  if (day === 14) return 'Two weeks! You\'re building something real now.';
  if (day === 21) return 'THREE WEEKS! Research says this is when habits start to stick.';
  if (day === 30) return '30 DAYS! You did it! You transformed yourself!';
  if (day % 7 === 0) return `Week ${day / 7} complete! Keep going!`;
  return 'Another day, another vote for who you\'re becoming.';
}

function checkChallengeMilestones(day: number, completedDays: number): string | null {
  if (day === 7 && completedDays >= 5) return '🌟 First Week Champion! 5+ days completed!';
  if (day === 14 && completedDays >= 10) return '⭐ Two Week Warrior! 10+ days completed!';
  if (day === 21 && completedDays >= 15) return '🏆 Three Week Titan! Habit forming!';
  if (day === 30 && completedDays >= 25) return '🎉 30-Day Master! 25+ days! Incredible!';
  if (completedDays === 7) return '🔥 7-day completion streak!';
  if (completedDays === 14) return '🔥🔥 14-day completion streak!';
  if (completedDays === 21) return '🔥🔥🔥 21-day streak! You\'re unstoppable!';
  return null;
}

// ============================================================================
// HABIT BUNDLES (Pre-built recipes)
// ============================================================================

interface HabitBundleItem {
  name: string;
  minutes: number;
  tinyVersion: string;
  priority: 'core' | 'enhancement';
  order: number;
}

interface HabitBundleDefinition {
  name: string;
  goal: string;
  description: string;
  totalMinutes: number;
  coreMinutes: number;
  stackFormula: string;
  science: string;
  habits: HabitBundleItem[];
}

export const HABIT_BUNDLES: Record<string, HabitBundleDefinition> = {
  morning_person: {
    name: 'Morning Person Bundle',
    goal: 'Wake up earlier and own your mornings',
    description: 'A complete morning routine that energizes body and mind',
    totalMinutes: 45,
    coreMinutes: 15,
    stackFormula: 'After alarm → Water → Movement → Mindset → Ready',
    science: 'Morning routines reduce decision fatigue and set the tone for the day',
    habits: [
      { name: 'Immediate Rise', minutes: 1, tinyVersion: 'Feet on floor within 5 seconds of alarm', priority: 'core', order: 1 },
      { name: 'Hydration', minutes: 2, tinyVersion: 'One sip of water', priority: 'core', order: 2 },
      { name: 'Movement', minutes: 10, tinyVersion: '30-second stretch', priority: 'core', order: 3 },
      { name: 'Mindset', minutes: 5, tinyVersion: 'One deep breath', priority: 'core', order: 4 },
      { name: 'Cold Exposure', minutes: 2, tinyVersion: '10-second cold water on face', priority: 'enhancement', order: 5 },
      { name: 'Journaling', minutes: 10, tinyVersion: 'Write 1 word for how you want to feel', priority: 'enhancement', order: 6 },
      { name: 'Learning', minutes: 15, tinyVersion: 'Read 1 page', priority: 'enhancement', order: 7 },
    ],
  },
  evening_wind_down: {
    name: 'Evening Wind Down Bundle',
    goal: 'Transition from day to restful sleep',
    description: 'A calming routine that prepares body and mind for quality sleep',
    totalMinutes: 45,
    coreMinutes: 20,
    stackFormula: 'After dinner → Tidy → Screens off → Wind down → Bed ready',
    science: 'Evening routines signal the brain to produce melatonin and prepare for sleep',
    habits: [
      { name: 'Kitchen Reset', minutes: 5, tinyVersion: 'Put one dish away', priority: 'core', order: 1 },
      { name: 'Screens Off', minutes: 1, tinyVersion: 'Put phone in another room', priority: 'core', order: 2 },
      { name: 'Light Dimming', minutes: 1, tinyVersion: 'Turn off one bright light', priority: 'core', order: 3 },
      { name: 'Reflection', minutes: 10, tinyVersion: 'Think of one good thing from today', priority: 'core', order: 4 },
      { name: 'Tomorrow Prep', minutes: 5, tinyVersion: 'Write tomorrow\'s one priority', priority: 'enhancement', order: 5 },
      { name: 'Relaxation', minutes: 15, tinyVersion: '3 slow breaths', priority: 'enhancement', order: 6 },
      { name: 'Sleep Prep', minutes: 8, tinyVersion: 'Lay out tomorrow\'s clothes', priority: 'enhancement', order: 7 },
    ],
  },
  fitness_beginner: {
    name: 'Fitness Beginner Bundle',
    goal: 'Build a sustainable exercise habit from zero',
    description: 'Start moving your body daily without overwhelm',
    totalMinutes: 30,
    coreMinutes: 10,
    stackFormula: 'After wake → Movement → Stretch → Hydrate → Log',
    science: 'Consistency beats intensity. Short daily movement builds the habit faster than occasional long workouts.',
    habits: [
      { name: 'Morning Movement', minutes: 10, tinyVersion: '1 pushup or 30-second walk', priority: 'core', order: 1 },
      { name: 'Stretch', minutes: 5, tinyVersion: 'Touch toes once', priority: 'core', order: 2 },
      { name: 'Hydration', minutes: 1, tinyVersion: 'Drink water after movement', priority: 'core', order: 3 },
      { name: 'Midday Movement', minutes: 10, tinyVersion: 'Walk to end of block', priority: 'enhancement', order: 4 },
      { name: 'Evening Stretch', minutes: 5, tinyVersion: 'One stretch before bed', priority: 'enhancement', order: 5 },
    ],
  },
  stress_relief: {
    name: 'Stress Relief Bundle',
    goal: 'Build daily stress management practices',
    description: 'Multiple touchpoints throughout the day to keep stress manageable',
    totalMinutes: 25,
    coreMinutes: 10,
    stackFormula: 'Morning calm → Midday reset → Evening release',
    science: 'Regular stress relief prevents cumulative buildup. Short practices multiple times beat one long session.',
    habits: [
      { name: 'Morning Calm', minutes: 5, tinyVersion: '3 deep breaths before phone', priority: 'core', order: 1 },
      { name: 'Midday Reset', minutes: 5, tinyVersion: 'Step outside for 1 minute', priority: 'core', order: 2 },
      { name: 'Evening Release', minutes: 5, tinyVersion: 'Name one thing to let go of', priority: 'core', order: 3 },
      { name: 'Movement Break', minutes: 5, tinyVersion: 'Shake out your body', priority: 'enhancement', order: 4 },
      { name: 'Gratitude', minutes: 5, tinyVersion: 'One thing you\'re grateful for', priority: 'enhancement', order: 5 },
    ],
  },
  productivity_boost: {
    name: 'Productivity Boost Bundle',
    goal: 'Get more done with less stress',
    description: 'Habits that increase focus and reduce time waste',
    totalMinutes: 30,
    coreMinutes: 15,
    stackFormula: 'Plan → Focus block → Review',
    science: 'Planning and intentional focus dramatically outperform reactive work.',
    habits: [
      { name: 'Daily Planning', minutes: 5, tinyVersion: 'Write top 1 priority', priority: 'core', order: 1 },
      { name: 'Focus Block', minutes: 25, tinyVersion: '5 minutes of uninterrupted work', priority: 'core', order: 2 },
      { name: 'Phone Boundary', minutes: 1, tinyVersion: 'Phone face-down while working', priority: 'core', order: 3 },
      { name: 'Weekly Review', minutes: 15, tinyVersion: 'What worked this week?', priority: 'enhancement', order: 4 },
      { name: 'Learning Time', minutes: 15, tinyVersion: 'Read one article', priority: 'enhancement', order: 5 },
    ],
  },
  mindfulness_starter: {
    name: 'Mindfulness Starter Bundle',
    goal: 'Develop present-moment awareness',
    description: 'Build a meditation practice and mindful living habits',
    totalMinutes: 20,
    coreMinutes: 8,
    stackFormula: 'Morning stillness → Mindful moments → Evening reflection',
    science: 'Regular mindfulness practice physically changes the brain, increasing gray matter in areas for focus and emotional regulation.',
    habits: [
      { name: 'Morning Stillness', minutes: 5, tinyVersion: '3 conscious breaths', priority: 'core', order: 1 },
      { name: 'Mindful Eating', minutes: 5, tinyVersion: 'First bite eaten with attention', priority: 'core', order: 2 },
      { name: 'Gratitude', minutes: 3, tinyVersion: 'Think of 1 thing you appreciate', priority: 'core', order: 3 },
      { name: 'Body Awareness', minutes: 5, tinyVersion: 'Notice 3 physical sensations', priority: 'enhancement', order: 4 },
      { name: 'Evening Meditation', minutes: 5, tinyVersion: 'Sit quietly for 1 minute', priority: 'enhancement', order: 5 },
    ],
  },
  financial_wellness: {
    name: 'Financial Wellness Bundle',
    goal: 'Build daily money awareness and healthy habits',
    description: 'Simple daily practices that transform your relationship with money',
    totalMinutes: 15,
    coreMinutes: 8,
    stackFormula: 'Morning check → Mindful spending → Evening review',
    science: 'Daily financial awareness reduces overspending by 20-30% without needing willpower.',
    habits: [
      { name: 'Morning Money Check', minutes: 3, tinyVersion: 'Glance at account balance', priority: 'core', order: 1 },
      { name: 'Spending Pause', minutes: 1, tinyVersion: 'Wait 10 seconds before non-essential purchase', priority: 'core', order: 2 },
      { name: 'Evening Review', minutes: 5, tinyVersion: 'Did I spend today? On what?', priority: 'core', order: 3 },
      { name: 'Weekly Planning', minutes: 10, tinyVersion: 'What big expenses this week?', priority: 'enhancement', order: 4 },
    ],
  },
  better_sleep: {
    name: 'Better Sleep Bundle',
    goal: 'Improve sleep quality and duration',
    description: 'Evening and morning habits that optimize your sleep',
    totalMinutes: 30,
    coreMinutes: 15,
    stackFormula: 'Consistent bedtime → Wind down → Sleep environment → Wake routine',
    science: 'Sleep consistency is more important than duration. Same bed/wake times train your circadian rhythm.',
    habits: [
      { name: 'Consistent Bedtime', minutes: 1, tinyVersion: 'Set bedtime alarm', priority: 'core', order: 1 },
      { name: 'Screens Off', minutes: 1, tinyVersion: 'Phone away 10 min before bed', priority: 'core', order: 2 },
      { name: 'Dark Room', minutes: 1, tinyVersion: 'Close one curtain', priority: 'core', order: 3 },
      { name: 'Cool Room', minutes: 1, tinyVersion: 'Adjust thermostat down', priority: 'core', order: 4 },
      { name: 'Morning Light', minutes: 5, tinyVersion: 'Open curtains immediately', priority: 'core', order: 5 },
      { name: 'Caffeine Cutoff', minutes: 1, tinyVersion: 'No caffeine after 2pm', priority: 'enhancement', order: 6 },
      { name: 'Wind Down Ritual', minutes: 15, tinyVersion: 'Read 1 page before bed', priority: 'enhancement', order: 7 },
    ],
  },
  energy_boost: {
    name: 'Energy Boost Bundle',
    goal: 'Increase natural energy throughout the day',
    description: 'Habits that create sustainable energy without caffeine dependency',
    totalMinutes: 25,
    coreMinutes: 12,
    stackFormula: 'Morning activation → Midday recharge → Energy protection',
    science: 'Energy comes from sleep, movement, nutrition, and stress management - not just caffeine.',
    habits: [
      { name: 'Morning Movement', minutes: 5, tinyVersion: '30-second stretch', priority: 'core', order: 1 },
      { name: 'Hydration', minutes: 2, tinyVersion: 'Glass of water before coffee', priority: 'core', order: 2 },
      { name: 'Light Exposure', minutes: 5, tinyVersion: 'Look at sky for 30 seconds', priority: 'core', order: 3 },
      { name: 'Midday Walk', minutes: 10, tinyVersion: 'Walk to window and back', priority: 'enhancement', order: 4 },
      { name: 'Power Nap', minutes: 20, tinyVersion: 'Close eyes for 5 minutes', priority: 'enhancement', order: 5 },
    ],
  },
  relationship_nurturing: {
    name: 'Relationship Nurturing Bundle',
    goal: 'Strengthen important relationships daily',
    description: 'Simple daily actions that maintain and deepen connections',
    totalMinutes: 20,
    coreMinutes: 10,
    stackFormula: 'Daily reach out → Quality presence → Appreciation expression',
    science: 'Relationships are the #1 predictor of happiness and longevity. Small daily investments compound.',
    habits: [
      { name: 'Daily Text', minutes: 2, tinyVersion: 'Send "thinking of you" to someone', priority: 'core', order: 1 },
      { name: 'Present Presence', minutes: 5, tinyVersion: 'Phone away during one conversation', priority: 'core', order: 2 },
      { name: 'Appreciation', minutes: 3, tinyVersion: 'Tell someone one thing you appreciate', priority: 'core', order: 3 },
      { name: 'Deep Question', minutes: 5, tinyVersion: 'Ask "How are you really doing?"', priority: 'enhancement', order: 4 },
      { name: 'Weekly Date', minutes: 60, tinyVersion: 'Put it on calendar', priority: 'enhancement', order: 5 },
    ],
  },
};

// ============================================================================
// HABIT TROUBLESHOOTING
// ============================================================================

interface HabitDiagnosis {
  issue: string;
  explanation: string;
  science: string;
  fixes: string[];
  reframe: string;
  nextStep: string;
}

function diagnoseHabitFailure(
  failurePoint: string,
  currentCue?: string,
  currentReward?: string
): HabitDiagnosis {
  const diagnoses: Record<string, HabitDiagnosis> = {
    never_start: {
      issue: 'Habit is too big or cue is too vague',
      explanation: 'When we never even start, it usually means the habit feels overwhelming or there\'s no clear trigger to remind us.',
      science: 'Behavior science shows that tiny habits (2 min or less) have dramatically higher success rates than ambitious ones.',
      fixes: [
        'Shrink it: Make the habit so small you can\'t say no',
        'Specify the cue: "After I [existing habit], I will [new habit]"',
        'Environment design: Put visual reminders where you\'ll see them',
        'Start with frequency: Do it at the same time/place daily',
      ],
      reframe: 'Instead of "I want to meditate", try "After I sit down with morning coffee, I will take 3 breaths"',
      nextStep: 'What\'s the 2-minute version of this habit? Let\'s start there.',
    },
    start_then_stop: {
      issue: 'Missing reward or the habit doesn\'t feel good yet',
      explanation: 'We start strong then stop because there\'s no immediate payoff. The long-term benefits don\'t motivate in the moment.',
      science: 'Habits form when there\'s an immediate reward. Without one, the brain doesn\'t encode the behavior as valuable.',
      fixes: [
        'Add a celebration: Do a tiny celebration immediately after (fist pump, smile, "yes!")',
        'Track visibly: Use a tracker where you can see progress',
        'Temptation bundle: Pair with something enjoyable',
        'Connect to identity: "I\'m becoming someone who..."',
      ],
      reframe: 'Add a celebration right after the habit. Even a mental "nice!" starts wiring the reward.',
      nextStep: 'How will you celebrate immediately after doing this? Make it specific.',
    },
    inconsistent: {
      issue: 'Cue is inconsistent or dependent on mood/motivation',
      explanation: 'Inconsistency usually means we\'re relying on motivation instead of systems. Motivation is unreliable.',
      science: 'The most successful habit builders don\'t rely on motivation - they rely on consistent cues and environment design.',
      fixes: [
        'Same time every day: Tie to a fixed daily event',
        'Remove decisions: Make the habit the default',
        'Environment design: Make the cue obvious, the habit easy',
        'If-then planning: "If [situation], then I will [habit]"',
      ],
      reframe: 'Find an "anchor moment" - something you do every day at the same time. Stack onto that.',
      nextStep: 'What do you do at the same time every single day? Let\'s attach the habit to that.',
    },
    hate_it: {
      issue: 'Wrong habit for you or approach doesn\'t fit',
      explanation: 'Not all habits work for all people. If you hate it, either the habit or the approach needs to change.',
      science: 'Sustainable habits come from finding the version that works FOR YOU, not forcing someone else\'s approach.',
      fixes: [
        'Find your version: Hate running? Try dancing, swimming, walking.',
        'Experiment with timing: Morning hater? Try evening.',
        'Change the context: Different location, different music, different approach',
        'Question the goal: Is this habit serving a goal you actually want?',
      ],
      reframe: 'You don\'t have to do the textbook version. What\'s a version of this you might actually enjoy?',
      nextStep: 'What would this habit look like if it were actually fun? Brainstorm 3 alternatives.',
    },
    forget: {
      issue: 'Cue is invisible or not connected to existing behavior',
      explanation: 'Forgetting means the habit isn\'t triggered by anything in your environment or routine.',
      science: 'The most reliable habits are anchored to existing behaviors or made visually obvious in the environment.',
      fixes: [
        'Visual cue: Put the habit trigger where you\'ll see it',
        'Habit stack: "After I [existing habit], I will [new habit]"',
        'Phone reminder: Set an alarm with the specific action',
        'Implementation intention: "At [time], in [place], I will [habit]"',
      ],
      reframe: 'Don\'t rely on memory. Make it impossible to forget by changing your environment.',
      nextStep: 'Where could you put a visual reminder that you\'d definitely see at the right time?',
    },
  };

  // Add cue/reward-specific advice
  const diagnosis = diagnoses[failurePoint] || diagnoses.inconsistent;
  
  if (!currentCue || currentCue.toLowerCase().includes('when i feel') || currentCue.toLowerCase().includes('when i want')) {
    diagnosis.fixes.unshift('Your cue depends on feeling motivated. Replace with a time-based or action-based cue.');
  }
  
  if (!currentReward) {
    diagnosis.fixes.push('You\'re missing an immediate reward. Add a tiny celebration right after.');
  }

  return diagnosis;
}

// ============================================================================
// MOOD/ENERGY TRACKING
// ============================================================================

export interface MoodLog {
  id: string;
  date: string;
  mood: 'great' | 'good' | 'okay' | 'low' | 'struggling';
  energy: 'high' | 'moderate' | 'low' | 'depleted';
  timeOfDay: string;
  habitsCompleted: string[];
  notes?: string;
}

interface MoodPatterns {
  insights: string[];
  habitCorrelations: Record<string, string>;
}

function analyzeMoodPatterns(logs: MoodLog[]): MoodPatterns {
  if (logs.length < 5) {
    return {
      insights: [],
      habitCorrelations: {},
    };
  }

  const insights: string[] = [];
  const habitCorrelations: Record<string, string> = {};

  // Analyze time of day patterns
  const morningMoods = logs.filter(l => l.timeOfDay === 'morning');
  const eveningMoods = logs.filter(l => l.timeOfDay === 'evening');
  
  const morningPositive = morningMoods.filter(l => ['great', 'good'].includes(l.mood)).length / (morningMoods.length || 1);
  const eveningPositive = eveningMoods.filter(l => ['great', 'good'].includes(l.mood)).length / (eveningMoods.length || 1);
  
  if (morningPositive > eveningPositive + 0.2) {
    insights.push('You tend to feel better in mornings. Consider scheduling important tasks then.');
  } else if (eveningPositive > morningPositive + 0.2) {
    insights.push('You tend to feel better in evenings. You might be a night owl.');
  }

  // Analyze habit correlations
  const logsWithHabits = logs.filter(l => l.habitsCompleted.length > 0);
  const logsWithoutHabits = logs.filter(l => l.habitsCompleted.length === 0);
  
  const withHabitsPositive = logsWithHabits.filter(l => ['great', 'good'].includes(l.mood)).length / (logsWithHabits.length || 1);
  const withoutHabitsPositive = logsWithoutHabits.filter(l => ['great', 'good'].includes(l.mood)).length / (logsWithoutHabits.length || 1);
  
  if (withHabitsPositive > withoutHabitsPositive + 0.15) {
    insights.push('Your mood tends to be better on days you complete habits. The habits are working!');
    habitCorrelations['habits_overall'] = 'positive correlation with mood';
  }

  return { insights, habitCorrelations };
}

function getMoodBasedTip(mood: string, energy: string, timeOfDay: string): string {
  if (mood === 'struggling' || mood === 'low') {
    return 'Low days happen. Be gentle with yourself. What\'s one tiny thing you could do to feel slightly better?';
  }
  if (energy === 'depleted' && timeOfDay === 'morning') {
    return 'Depleted energy in the morning often points to sleep or stress. How was your sleep?';
  }
  if (energy === 'depleted' && timeOfDay === 'afternoon') {
    return 'Afternoon energy dips are normal. Try a 10-minute walk or some water before reaching for caffeine.';
  }
  if (mood === 'great' && energy === 'high') {
    return 'You\'re feeling great! This is a perfect time for challenging work or important conversations.';
  }
  return 'Thanks for checking in. Awareness is the first step to optimization.';
}

// ============================================================================
// LIFE TRANSITION SUPPORT
// ============================================================================

interface LifeTransitionSupport {
  name: string;
  validation: string;
  expectations: string[];
  habitsToProtect: string[];
  habitsToPause: string[];
  habitsToAdd: string[];
  priorityOrder: string[];
  adjustmentPeriod: string;
  selfCareNote: string;
}

export const LIFE_TRANSITION_SUPPORT: Record<string, LifeTransitionSupport> = {
  new_job: {
    name: 'New Job',
    validation: 'Starting a new job is exciting AND exhausting. Your routines will be disrupted, and that\'s okay.',
    expectations: [
      'First 90 days will feel chaotic',
      'Energy will be depleted from learning',
      'Old habits may slip temporarily',
      'New environment = new habit opportunities',
    ],
    habitsToProtect: ['Sleep', 'One keystone habit', 'Connection with loved ones'],
    habitsToPause: ['Ambitious habits', 'Side projects', 'Anything exhausting'],
    habitsToAdd: ['Daily decompression', 'New routine exploration', 'Celebration of small wins'],
    priorityOrder: ['Sleep', 'Basic self-care', 'One anchor habit', 'Everything else'],
    adjustmentPeriod: '3-6 months for full habit reset',
    selfCareNote: 'Learning a new job IS the work right now. Don\'t add pressure to maintain every habit perfectly.',
  },
  job_loss: {
    name: 'Job Loss',
    validation: 'Losing a job is one of life\'s biggest stressors. However you\'re feeling is valid.',
    expectations: [
      'Grief, anger, relief, fear - all normal',
      'Structure will disappear without effort',
      'Identity may feel shaken',
      'This is temporary',
    ],
    habitsToProtect: ['Sleep schedule', 'Getting dressed daily', 'Social connection', 'One physical movement'],
    habitsToPause: ['Expensive habits', 'Work-related routines'],
    habitsToAdd: ['Daily structure', 'Job search routine', 'Support system check-ins', 'Free stress relief (walks, library)'],
    priorityOrder: ['Basic self-care', 'Daily structure', 'Social support', 'Job search', 'Everything else'],
    adjustmentPeriod: 'Allow yourself 1-2 weeks to adjust before building new routine',
    selfCareNote: 'Your worth is not your job. Take care of yourself first, then tackle the search.',
  },
  new_baby: {
    name: 'New Baby',
    validation: 'A new baby changes EVERYTHING. Survival mode is not only acceptable, it\'s necessary.',
    expectations: [
      'Sleep will be destroyed (temporarily)',
      'All routines will change',
      'You\'ll forget who you were before',
      'This phase passes (really, it does)',
    ],
    habitsToProtect: ['Basic hygiene', 'One daily outdoor moment', 'Connection with partner'],
    habitsToPause: ['Everything that isn\'t essential', 'Ambitious fitness goals', 'Productivity habits'],
    habitsToAdd: ['Nap when possible', 'Accept help', 'One tiny self-care moment daily'],
    priorityOrder: ['Baby\'s needs', 'Your basic needs', 'Partner connection', 'Everything else later'],
    adjustmentPeriod: '4-6 months minimum, often 12 months for full routine reset',
    selfCareNote: 'You cannot pour from an empty cup. Meeting your basic needs is not selfish.',
  },
  new_relationship: {
    name: 'New Relationship',
    validation: 'New love is wonderful! It\'s also disruptive to routines. Balance is key.',
    expectations: [
      'Time will feel scarcer',
      'Your schedule will shift',
      'Old habits may slip for new ones',
      'NRE (new relationship energy) is temporary',
    ],
    habitsToProtect: ['Friendships', 'Personal hobbies', 'Self-care basics'],
    habitsToPause: ['Habits that can flex temporarily'],
    habitsToAdd: ['Relationship rituals', 'Communication habits', 'Individual time'],
    priorityOrder: ['Personal identity', 'Relationship time', 'Friend maintenance', 'Individual habits'],
    adjustmentPeriod: '3-6 months to find new balance',
    selfCareNote: 'Don\'t lose yourself. The best relationships allow both people to keep growing individually.',
  },
  breakup: {
    name: 'Breakup',
    validation: 'Breakups hurt, even when they\'re right. Your feelings are valid, whatever they are.',
    expectations: [
      'Grief comes in waves',
      'Routines tied to them will hurt',
      'Energy and motivation will fluctuate',
      'You will feel okay again',
    ],
    habitsToProtect: ['Social connection (not isolation)', 'Basic self-care', 'Sleep'],
    habitsToPause: ['Shared habits that hurt', 'Dating apps (for now)'],
    habitsToAdd: ['Processing time (journal, therapy)', 'Rediscovery activities', 'Friend time'],
    priorityOrder: ['Self-compassion', 'Basic needs', 'Social support', 'New identity building'],
    adjustmentPeriod: '1-3 months for acute phase, longer for full adjustment',
    selfCareNote: 'Healing isn\'t linear. Be patient with yourself on hard days.',
  },
  moving: {
    name: 'Moving',
    validation: 'Moving is in the top 5 most stressful life events. It disrupts everything, including habits.',
    expectations: [
      'Chaos before, during, and after',
      'All routines will be disrupted',
      'New environment = new habit cues needed',
      'It takes months to feel settled',
    ],
    habitsToProtect: ['Sleep', 'Basic nutrition', 'One grounding habit'],
    habitsToPause: ['Elaborate routines', 'Habits tied to old space'],
    habitsToAdd: ['Unpacking routine', 'New neighborhood exploration', 'New habit cues for new space'],
    priorityOrder: ['Basic living setup', 'Sleep space', 'Work capability', 'Routines rebuild'],
    adjustmentPeriod: '1-3 months to feel somewhat settled, 6 months for habits to fully reset',
    selfCareNote: 'Your old habits won\'t work in the new space. That\'s okay. You\'ll build new ones.',
  },
  empty_nest: {
    name: 'Empty Nest',
    validation: 'When kids leave, it\'s a huge identity shift. Grief and freedom can coexist.',
    expectations: [
      'Identity questions are normal',
      'Relationship dynamics will shift',
      'More time, but maybe less structure',
      'This is an opportunity for reinvention',
    ],
    habitsToProtect: ['Partner connection', 'Social network', 'Purpose-giving activities'],
    habitsToPause: ['Parent-identity habits'],
    habitsToAdd: ['New hobbies', 'Couple rituals', 'Personal rediscovery', 'Health focus'],
    priorityOrder: ['Relationship with partner', 'Personal identity', 'New interests', 'Staying connected with kids'],
    adjustmentPeriod: '6-12 months for major adjustment',
    selfCareNote: 'You\'ve earned this time. Reinventing yourself now isn\'t selfish, it\'s healthy.',
  },
  retirement: {
    name: 'Retirement',
    validation: 'Retirement is a massive transition. The loss of structure can be disorienting.',
    expectations: [
      'Identity shift from "doing" to "being"',
      'Days without structure can feel empty',
      'Health becomes primary focus',
      'This is a chance to live intentionally',
    ],
    habitsToProtect: ['Daily structure', 'Social connection', 'Physical activity', 'Mental stimulation'],
    habitsToPause: ['Work habits (obviously)'],
    habitsToAdd: ['Morning routine', 'Social calendar', 'Health appointments', 'Purpose projects'],
    priorityOrder: ['Health', 'Relationships', 'Purpose', 'Fun'],
    adjustmentPeriod: '1-2 years for full adjustment to retired identity',
    selfCareNote: 'Create structure intentionally. Without it, days can blur together.',
  },
  health_diagnosis: {
    name: 'Health Diagnosis',
    validation: 'A health diagnosis changes everything. Whatever you\'re feeling is completely valid.',
    expectations: [
      'Overwhelm is normal',
      'Priorities will shift dramatically',
      'Some habits become essential, others irrelevant',
      'One day at a time',
    ],
    habitsToProtect: ['Medical adherence', 'Rest', 'Support system'],
    habitsToPause: ['Strenuous habits', 'Non-essential commitments'],
    habitsToAdd: ['Medical routine', 'Stress management', 'Support check-ins'],
    priorityOrder: ['Medical needs', 'Rest and recovery', 'Support system', 'Everything else when ready'],
    adjustmentPeriod: 'Varies widely by diagnosis',
    selfCareNote: 'Your only job right now is to take care of yourself. Everything else can wait.',
  },
  loss_grief: {
    name: 'Loss & Grief',
    validation: 'Loss changes you forever. There\'s no timeline for grief, and no wrong way to feel.',
    expectations: [
      'Grief comes in waves',
      'Energy and motivation will vary wildly',
      'Habits may feel meaningless temporarily',
      'Slowly, you\'ll find new normal',
    ],
    habitsToProtect: ['Basic self-care', 'Connection with supporters', 'Sleep when possible'],
    habitsToPause: ['Ambitious goals', 'Anything that feels heavy'],
    habitsToAdd: ['Grief processing (therapy, journaling, rituals)', 'Gentle movement', 'Support check-ins'],
    priorityOrder: ['Basic survival', 'Processing grief', 'Support network', 'Everything else later'],
    adjustmentPeriod: 'Grief has no timeline. Be patient with yourself.',
    selfCareNote: 'There\'s no "getting over it." There\'s growing around it. Take all the time you need.',
  },
  graduation: {
    name: 'Graduation',
    validation: 'Graduation is exciting and terrifying. Suddenly, structure disappears.',
    expectations: [
      'Loss of built-in structure',
      'Identity in flux',
      'Comparison trap is real',
      'Building your own life takes time',
    ],
    habitsToProtect: ['Morning routine', 'Social connection', 'Physical health'],
    habitsToPause: ['School-related habits'],
    habitsToAdd: ['Daily structure', 'Job search routine', 'Financial awareness', 'Adult life skills'],
    priorityOrder: ['Basic structure', 'Next step (job, grad school)', 'Relationships', 'Personal development'],
    adjustmentPeriod: '6-12 months for post-graduation adjustment',
    selfCareNote: 'Everyone\'s path looks different. Focus on your own journey.',
  },
  promotion: {
    name: 'Promotion',
    validation: 'Congrats on the promotion! New responsibility = new capacity demands.',
    expectations: [
      'Learning curve ahead',
      'More demands on time and energy',
      'Imposter syndrome is normal',
      'Old routines may need to evolve',
    ],
    habitsToProtect: ['Recovery time', 'Relationships', 'Health basics'],
    habitsToPause: ['Time-intensive side projects'],
    habitsToAdd: ['Leadership development', 'Delegation skills', 'Boundary setting'],
    priorityOrder: ['Mastering new role', 'Health', 'Relationships', 'Personal growth'],
    adjustmentPeriod: '3-6 months to feel comfortable in new role',
    selfCareNote: 'You were promoted because you\'re capable. Trust yourself.',
  },
};

// ============================================================================
// MOTIVATION ON DEMAND
// ============================================================================

interface MotivationalContent {
  message: string;
  source?: string;
  action: string;
  followUp: string;
}

function getMotivationalContent(
  type: string,
  context?: string,
  struggle?: string
): MotivationalContent {
  const content: Record<string, MotivationalContent[]> = {
    science_fact: [
      {
        message: 'Your brain physically changes when you build habits. Every time you do the habit, you strengthen the neural pathway. After about 66 days, the pathway is so strong the habit becomes automatic.',
        source: 'Phillippa Lally, University College London',
        action: 'You\'re literally building your brain right now.',
        followUp: 'What\'s the tiniest version of your habit you could do right now?',
      },
      {
        message: 'Studies show that people who write down their goals are 42% more likely to achieve them. And people who share their goals with someone are even more successful.',
        source: 'Dr. Gail Matthews, Dominican University',
        action: 'Write down what you\'re working on. Tell me about it.',
        followUp: 'Would you like to share your goal with me?',
      },
      {
        message: 'The "fresh start effect" is real: people are more successful at habit change after temporal landmarks (Monday, the 1st, birthdays). But here\'s the secret - you can create your own fresh start any moment.',
        source: 'Katherine Milkman, Wharton',
        action: 'Right now can be your fresh start.',
        followUp: 'What if this moment was your new beginning?',
      },
    ],
    success_story: [
      {
        message: 'There\'s a guy who started with 1 pushup a day. Just one. He said it felt ridiculous. A year later, he could do 100. He didn\'t get there through heroic willpower - he got there by making the habit so small he couldn\'t say no.',
        source: 'Tiny Habits approach',
        action: 'What\'s your one pushup?',
        followUp: 'What\'s a version of your habit so small it feels almost silly?',
      },
      {
        message: 'A woman I know wanted to read more. She committed to one page a day. ONE PAGE. Most days she read more, but the commitment was just one. She read 30 books that year.',
        source: 'Real story',
        action: 'The tiny version unlocks the bigger version.',
        followUp: 'What if you only had to do the smallest possible version?',
      },
    ],
    pep_talk: [
      {
        message: 'Listen to me. You showing up, even on the hard days? That\'s not common. Most people quit. Most people don\'t even try. You\'re here, thinking about your habits, wanting to be better. That makes you exceptional.',
        action: 'You\'re already ahead of most people.',
        followUp: 'What\'s one tiny thing you could do right now to prove to yourself you\'re serious?',
      },
      {
        message: 'I know it feels like you\'re not making progress. But change is like bamboo - it grows underground for years, invisible, building roots. Then it shoots up 90 feet in 6 weeks. You\'re in the root-building phase. Don\'t stop.',
        action: 'Your progress is happening, even if you can\'t see it yet.',
        followUp: 'Can you think of one small sign that things are shifting?',
      },
    ],
    reframe: [
      {
        message: 'You didn\'t "fail at your habit." You gathered data about what doesn\'t work. Edison didn\'t fail 10,000 times - he found 10,000 ways that didn\'t work. Each attempt teaches you something.',
        action: 'This isn\'t failure. This is research.',
        followUp: 'What did this attempt teach you?',
      },
      {
        message: 'You\'re not "starting over." Your brain still has all the neural pathways from before. They\'re just a bit rusty. You\'re not at zero - you\'re at a head start.',
        action: 'Starting again is faster than starting fresh.',
        followUp: 'What did you learn from your previous attempts?',
      },
    ],
    why_reminder: [
      {
        message: 'Remember why you started this. Not the surface reason - the REAL reason. The deeper thing you\'re trying to prove, become, or create. That reason is still valid.',
        action: 'Connect to your deeper why.',
        followUp: 'Why did you want to change this in the first place?',
      },
    ],
    future_self: [
      {
        message: 'Close your eyes. Picture yourself one year from now, having stuck with this habit. How do you feel? What\'s different? That person is possible. Every small action today votes for that future.',
        action: 'Your future self is counting on today.',
        followUp: 'What would your future self thank you for doing today?',
      },
      {
        message: 'Every action is a vote for the type of person you want to become. One pushup isn\'t much exercise. But it\'s a vote for "I\'m someone who exercises." Those votes add up to identity.',
        source: 'James Clear, Atomic Habits',
        action: 'Cast one vote right now.',
        followUp: 'What identity are you voting for?',
      },
    ],
  };

  const options = content[type] || content.pep_talk;
  const selected = options[Math.floor(Math.random() * options.length)];
  
  // Personalize if context provided
  if (context) {
    selected.followUp = `When it comes to ${context}, ${selected.followUp.toLowerCase()}`;
  }
  
  return selected;
}

// ============================================================================
// GLIDEPATH LEVELS - Progression system
// ============================================================================

export interface GlidepathLevel {
  level: number;
  name: string;
  description: string;
  duration: string; // How long to stay at this level
  intensity: number; // 0-100%
  focus: string;
}

export const GLIDEPATH_LEVELS: GlidepathLevel[] = [
  {
    level: 1,
    name: 'Tiny Start',
    description: 'So small you can\'t say no. 2 minutes or less.',
    duration: '1-2 weeks',
    intensity: 10,
    focus: 'Just showing up. Building the neural pathway.',
  },
  {
    level: 2,
    name: 'Mini Habit',
    description: 'Slightly expanded. 5-10 minutes.',
    duration: '2-3 weeks',
    intensity: 25,
    focus: 'Consistency over intensity. Chain building.',
  },
  {
    level: 3,
    name: 'Emerging Practice',
    description: 'Building momentum. 15-20 minutes.',
    duration: '3-4 weeks',
    intensity: 50,
    focus: 'Starting to feel natural. Identity shift beginning.',
  },
  {
    level: 4,
    name: 'Established Habit',
    description: 'Part of your routine. 20-30 minutes.',
    duration: '4-6 weeks',
    intensity: 75,
    focus: 'Automatic. Missing it feels wrong.',
  },
  {
    level: 5,
    name: 'Lifestyle Integration',
    description: 'Fully integrated. Flexible duration.',
    duration: 'Ongoing',
    intensity: 100,
    focus: 'Part of who you are. Teaching others.',
  },
];

// ============================================================================
// HABIT SCIENCE FRAMEWORK
// ============================================================================

export interface HabitLoop {
  cue: {
    type: 'time' | 'location' | 'emotion' | 'preceding_action' | 'other_people';
    description: string;
    specificity: string; // "After I pour my morning coffee"
  };
  routine: {
    behavior: string;
    duration: number; // minutes
    difficulty: 'tiny' | 'easy' | 'medium' | 'challenging';
  };
  reward: {
    intrinsic: string; // How it makes you feel
    extrinsic?: string; // External reward if any
    celebration: string; // Immediate micro-celebration
  };
}

export interface HabitStack {
  id: string;
  name: string;
  description: string;
  anchorHabit: string; // Existing habit to stack onto
  newHabits: string[];
  totalDuration: number;
  bestTimeOfDay: 'morning' | 'afternoon' | 'evening' | 'anytime';
}

export interface KeystoneHabit {
  habitId: string;
  cascadeEffects: string[]; // Other areas it positively impacts
  multiplierScore: number; // How much impact (1-10)
  evidence: string; // Why this is a keystone
}

// ============================================================================
// ENHANCED HABIT TYPE
// ============================================================================

export interface EnhancedHabit {
  id: string;
  userId: string;
  
  // Basic info
  name: string;
  description?: string;
  domain: LifeDomain;
  subdomain?: string;
  
  // Glidepath
  currentLevel: number;
  targetLevel: number;
  levelStartDate: Date;
  levelHistory: Array<{ level: number; achievedAt: Date }>;
  
  // Habit loop (behavior science)
  habitLoop: HabitLoop;
  
  // Stacking
  stackedOnto?: string; // ID of anchor habit
  isAnchorFor?: string[]; // IDs of habits stacked onto this
  
  // Keystone analysis
  isKeystone: boolean;
  keystoneScore?: number;
  cascadeEffects?: string[];
  
  // Tracking
  frequency: 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'custom';
  customDays?: number[];
  targetPerDay: number;
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  successRate: number; // 0-100
  
  // Timing
  reminderTime?: string;
  bestPerformanceTime?: string; // Learned from data
  
  // Status
  isActive: boolean;
  isPaused: boolean;
  pauseReason?: string;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  notes?: string;
}

// ============================================================================
// HABIT TEMPLATES - Pre-built habits for common goals
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
  habitLoop: HabitLoop;
  
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
      cue: { type: 'preceding_action', description: 'After getting out of bed', specificity: 'Feet hit the floor' },
      routine: { behavior: 'Gentle stretching or movement', duration: 15, difficulty: 'easy' },
      reward: { intrinsic: 'Energized and awake feeling', celebration: 'Say "I\'m awake and alive!"' },
    },
    benefits: ['More energy', 'Better mood', 'Improved flexibility', 'Mental clarity'],
    cascadeEffects: ['Better sleep', 'Healthier eating', 'More productive mornings'],
    isKeystone: true,
    stacksWellWith: ['morning-hydration', 'morning-meditation'],
    stacksWellAfter: ['wake-up'],
    bestForStages: ['student', 'early_career', 'mid_career', 'retirement'],
    scienceNote: 'Morning exercise increases cortisol at the right time and improves circadian rhythm',
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
      cue: { type: 'location', description: 'Entering the kitchen', specificity: 'See the water glass I set out' },
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
    description: 'Note things you\'re grateful for to shift perspective',
    goal: 'Better mood, perspective, resilience',
    difficulty: 'beginner',
    timeRequired: 5,
    tinyVersion: 'Think of one thing you\'re grateful for',
    miniVersion: 'Write down 3 gratitudes',
    fullVersion: 'Gratitude journaling with reflection',
    habitLoop: {
      cue: { type: 'time', description: 'Morning coffee/tea time', specificity: 'While the coffee brews' },
      routine: { behavior: 'Write gratitudes', duration: 5, difficulty: 'easy' },
      reward: { intrinsic: 'Warm, appreciative feeling', celebration: 'Take a deep breath and smile' },
    },
    benefits: ['Improved mood', 'Better sleep', 'Increased resilience', 'Stronger relationships'],
    cascadeEffects: ['More optimism', 'Better stress handling', 'Improved relationships'],
    isKeystone: true,
    stacksWellWith: ['morning-journaling', 'meditation'],
    stacksWellAfter: ['morning-coffee'],
    bestForStages: ['early_career', 'mid_career', 'new_parent', 'transition', 'retirement'],
    scienceNote: 'Gratitude practice rewires the brain toward positivity and has been shown to improve wellbeing',
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
      cue: { type: 'preceding_action', description: 'After morning routine', specificity: 'Sit in meditation spot' },
      routine: { behavior: 'Meditation practice', duration: 15, difficulty: 'medium' },
      reward: { intrinsic: 'Calm, centered feeling', celebration: 'Gentle smile, hands on heart' },
    },
    benefits: ['Reduced stress', 'Better focus', 'Emotional regulation', 'Improved sleep'],
    cascadeEffects: ['Better decisions', 'Improved relationships', 'More patience'],
    isKeystone: true,
    stacksWellWith: ['morning-movement', 'daily-gratitude'],
    stacksWellAfter: ['morning-movement'],
    bestForStages: ['early_career', 'mid_career', 'new_parent', 'pre_retirement', 'retirement', 'transition'],
    scienceNote: 'Regular meditation physically changes brain structure, increasing gray matter in areas related to focus and emotional regulation',
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
      cue: { type: 'time', description: 'Lunch break or commute', specificity: 'When I sit down for lunch' },
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
    miniVersion: 'Review yesterday\'s transactions',
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
      cue: { type: 'time', description: 'Evening wind-down', specificity: 'After dinner, in reading chair' },
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
      cue: { type: 'preceding_action', description: 'After dinner cleanup', specificity: 'Kitchen clean, ready to relax' },
      routine: { behavior: 'Quick tidy', duration: 10, difficulty: 'easy' },
      reward: { intrinsic: 'Calm, orderly feeling', celebration: 'Look around and appreciate the space' },
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
// STORAGE - Uses ProductivityStore for persistence
// ============================================================================

interface UserHabitCoachData {
  userId: string;
  lifeStage: LifeStage;
  domainPriorities: LifeDomain[];
  enhancedHabits: EnhancedHabit[];
  habitStacks: HabitStack[];
  keystoneHabits: string[]; // IDs
  currentFocus: {
    domain: LifeDomain;
    goal: string;
    startDate: Date;
    habits: string[];
  } | null;
}

// In-memory cache that syncs with ProductivityStore
const userCoachDataCache: Map<string, UserHabitCoachData> = new Map();

/**
 * Get user's habit coach data - loads from ProductivityStore and caches
 */
function getUserCoachData(userId: string): UserHabitCoachData {
  // Check cache first
  if (userCoachDataCache.has(userId)) {
    return userCoachDataCache.get(userId)!;
  }

  const store = getProductivityStore();
  const profile = store.getHabitCoachProfile(userId);
  const enhancedHabits = store.getUserEnhancedHabits(userId);
  const habitStacks = store.getUserHabitStacks(userId);

  // Convert stored data to runtime format
  const data: UserHabitCoachData = {
    userId,
    lifeStage: (profile?.lifeStage || 'early_career') as LifeStage,
    domainPriorities: (profile?.domainPriorities || ['health', 'career', 'finance', 'relationships']) as LifeDomain[],
    enhancedHabits: enhancedHabits.map(h => storedHabitToRuntime(h)),
    habitStacks: habitStacks.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      anchorHabit: s.anchorHabit,
      newHabits: s.newHabits,
      totalDuration: s.totalDuration,
      bestTimeOfDay: s.bestTimeOfDay as 'morning' | 'afternoon' | 'evening' | 'anytime',
    })),
    keystoneHabits: profile?.keystoneHabits || [],
    currentFocus: profile?.currentFocus ? {
      domain: profile.currentFocus.domain as LifeDomain,
      goal: profile.currentFocus.goal,
      startDate: new Date(profile.currentFocus.startDate),
      habits: profile.currentFocus.habits,
    } : null,
  };

  userCoachDataCache.set(userId, data);
  return data;
}

/**
 * Save user's habit coach profile to ProductivityStore
 */
function saveUserCoachProfile(userId: string, data: UserHabitCoachData): void {
  const store = getProductivityStore();
  
  const profile: HabitCoachProfileData = {
    lifeStage: data.lifeStage,
    domainPriorities: data.domainPriorities,
    keystoneHabits: data.keystoneHabits,
    currentFocus: data.currentFocus ? {
      domain: data.currentFocus.domain,
      goal: data.currentFocus.goal,
      startDate: data.currentFocus.startDate.toISOString(),
      habits: data.currentFocus.habits,
    } : null,
    assessmentHistory: [], // Stored separately in weekly reflections
  };

  store.setHabitCoachProfile(userId, profile);
  getLogger().debug({ userId }, 'Saved habit coach profile');
}

/**
 * Save an enhanced habit to ProductivityStore
 */
function saveEnhancedHabit(userId: string, habit: EnhancedHabit): void {
  const store = getProductivityStore();
  store.setEnhancedHabit(userId, runtimeHabitToStored(habit));
}

/**
 * Save a habit stack to ProductivityStore
 */
function saveHabitStack(userId: string, stack: HabitStack): void {
  const store = getProductivityStore();
  const stackData: HabitStackData = {
    id: stack.id,
    name: stack.name,
    description: stack.description,
    anchorHabit: stack.anchorHabit,
    newHabits: stack.newHabits,
    totalDuration: stack.totalDuration,
    bestTimeOfDay: stack.bestTimeOfDay,
  };
  store.setHabitStack(userId, stackData);
}

/**
 * Save a weekly reflection to ProductivityStore
 */
function saveWeeklyReflection(userId: string, reflection: {
  wins: string[];
  challenges: string[];
  insights: string[];
  adjustments: string[];
}): void {
  const store = getProductivityStore();
  const reflectionData: WeeklyReflectionData = {
    id: `reflection_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    date: new Date().toISOString(),
    wins: reflection.wins,
    challenges: reflection.challenges,
    insights: reflection.insights,
    adjustments: reflection.adjustments,
  };
  store.addWeeklyReflection(userId, reflectionData);
}

/**
 * Convert stored habit data to runtime format
 */
function storedHabitToRuntime(stored: EnhancedHabitData): EnhancedHabit {
  return {
    id: stored.id,
    userId: (stored as EnhancedHabitData & { userId?: string }).userId || '',
    name: stored.name,
    description: stored.description,
    domain: stored.domain as LifeDomain,
    subdomain: stored.subdomain,
    currentLevel: stored.currentLevel,
    targetLevel: stored.targetLevel,
    levelStartDate: new Date(stored.levelStartDate),
    levelHistory: stored.levelHistory.map(l => ({
      level: l.level,
      achievedAt: new Date(l.achievedAt),
    })),
    habitLoop: stored.habitLoop as HabitLoop,
    stackedOnto: stored.stackedOnto,
    isAnchorFor: stored.isAnchorFor,
    isKeystone: stored.isKeystone,
    keystoneScore: stored.keystoneScore,
    cascadeEffects: stored.cascadeEffects,
    frequency: stored.frequency as EnhancedHabit['frequency'],
    customDays: stored.customDays,
    targetPerDay: stored.targetPerDay,
    currentStreak: stored.currentStreak,
    longestStreak: stored.longestStreak,
    totalCompletions: stored.totalCompletions,
    successRate: stored.successRate,
    reminderTime: stored.reminderTime,
    bestPerformanceTime: stored.bestPerformanceTime,
    isActive: stored.isActive,
    isPaused: stored.isPaused,
    pauseReason: stored.pauseReason,
    createdAt: new Date(stored.createdAt),
    updatedAt: new Date(stored.updatedAt),
    tags: stored.tags,
    notes: stored.notes,
  };
}

/**
 * Convert runtime habit to stored format
 */
function runtimeHabitToStored(habit: EnhancedHabit): EnhancedHabitData {
  return {
    id: habit.id,
    name: habit.name,
    description: habit.description,
    domain: habit.domain,
    subdomain: habit.subdomain,
    currentLevel: habit.currentLevel,
    targetLevel: habit.targetLevel,
    levelStartDate: habit.levelStartDate.toISOString(),
    levelHistory: habit.levelHistory.map(l => ({
      level: l.level,
      achievedAt: l.achievedAt.toISOString(),
    })),
    habitLoop: habit.habitLoop,
    stackedOnto: habit.stackedOnto,
    isAnchorFor: habit.isAnchorFor,
    isKeystone: habit.isKeystone,
    keystoneScore: habit.keystoneScore,
    cascadeEffects: habit.cascadeEffects,
    frequency: habit.frequency,
    customDays: habit.customDays,
    targetPerDay: habit.targetPerDay,
    currentStreak: habit.currentStreak,
    longestStreak: habit.longestStreak,
    totalCompletions: habit.totalCompletions,
    successRate: habit.successRate,
    reminderTime: habit.reminderTime,
    bestPerformanceTime: habit.bestPerformanceTime,
    isActive: habit.isActive,
    isPaused: habit.isPaused,
    pauseReason: habit.pauseReason,
    createdAt: habit.createdAt.toISOString(),
    updatedAt: habit.updatedAt.toISOString(),
    tags: habit.tags,
    notes: habit.notes,
  };
}

// ============================================================================
// MAYA'S HABIT COACHING TOOLS
// ============================================================================

/**
 * Create habit coaching tools
 * @returns Object containing all habit coaching LLM tools
 */
export function createHabitCoachingTools() {
  return {
    /**
     * Life assessment - understand where user is
     */
    assessLifeDomains: llm.tool({
      description: `Assess user's satisfaction across life domains to identify priorities.
Use when:
- First meeting a user for habit coaching
- User wants to improve their life but isn't sure where to start
- Periodic check-in on overall life satisfaction`,
      parameters: z.object({
        lifeStage: z.enum(['student', 'early_career', 'new_parent', 'mid_career', 'empty_nester', 'pre_retirement', 'retirement', 'transition'])
          .optional()
          .describe('User\'s current life stage'),
        domainScores: z.record(z.string(), z.number().min(0).max(10))
          .optional()
          .describe('Satisfaction scores (0-10) for each domain discussed'),
        notes: z.string().optional().describe('Key observations from the conversation'),
      }),
      execute: async ({ lifeStage, domainScores, notes }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const data = getUserCoachData(userId);

        if (lifeStage) {
          data.lifeStage = lifeStage;
        }

        if (domainScores) {
          // Update priorities based on lowest scores
          const sorted = Object.entries(domainScores)
            .sort(([, a], [, b]) => a - b)
            .map(([domain]) => domain as LifeDomain);
          data.domainPriorities = sorted.slice(0, 4);

          // Save assessment as a weekly reflection for tracking
          saveWeeklyReflection(userId, {
            wins: [],
            challenges: [],
            insights: [`Domain scores assessed: ${Object.entries(domainScores).map(([d, s]) => `${d}: ${s}`).join(', ')}`],
            adjustments: notes ? [notes] : [],
          });
        }

        // Persist profile changes
        saveUserCoachProfile(userId, data);

        const stage = LIFE_STAGES[data.lifeStage];
        const lowDomains = data.domainPriorities.slice(0, 2);
        
        getLogger().info({ userId, lifeStage: data.lifeStage, priorities: data.domainPriorities }, '🎯 Life assessment completed');

        return {
          summary: `Life stage: ${stage.name}. Priority areas: ${lowDomains.map(d => LIFE_DOMAINS[d].name).join(', ')}.`,
          recommendations: stage.priorities.slice(0, 3).map(p => LIFE_DOMAINS[p as LifeDomain].name),
          challenges: stage.challenges,
          opportunities: stage.opportunities,
          suggestedFocus: lowDomains[0],
        };
      },
    }),

    /**
     * Recommend habits based on goals and life stage
     */
    recommendHabits: llm.tool({
      description: `Recommend habits based on user's goals, life stage, and current priorities.
Use when:
- User wants suggestions for new habits
- User has identified an area to improve
- Starting fresh with habit building`,
      parameters: z.object({
        domain: z.enum(['health', 'mind', 'relationships', 'career', 'learning', 'finance', 'home', 'selfCare'])
          .describe('Life domain to get recommendations for'),
        goal: z.string().optional().describe('Specific goal within the domain'),
        difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional()
          .describe('User\'s experience level'),
      }),
      execute: async ({ domain, goal, difficulty = 'beginner' }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const data = getUserCoachData(userId);

        // Filter templates by domain and difficulty
        const relevant = HABIT_TEMPLATES.filter(t => 
          t.domain === domain && 
          t.difficulty === difficulty &&
          t.bestForStages.includes(data.lifeStage)
        );

        // Prioritize keystone habits
        const sorted = relevant.sort((a, b) => 
          (b.isKeystone ? 1 : 0) - (a.isKeystone ? 1 : 0)
        );

        const recommendations = sorted.slice(0, 3).map(t => ({
          id: t.id,
          name: t.name,
          description: t.description,
          tinyVersion: t.tinyVersion,
          benefits: t.benefits.slice(0, 3),
          isKeystone: t.isKeystone,
          timeRequired: `${t.timeRequired} min at full level, just ${t.habitLoop.routine.duration} min to start`,
        }));

        getLogger().info({ userId, domain, recommendations: recommendations.length }, '💡 Habit recommendations generated');

        return {
          domain: LIFE_DOMAINS[domain].name,
          recommendations,
          tip: 'Start with the tiny version! Success builds momentum.',
        };
      },
    }),

    /**
     * Create a new enhanced habit with glidepath
     */
    createEnhancedHabit: llm.tool({
      description: `Create a new habit with a glidepath progression system.
Use when:
- User decides to start a new habit
- Setting up habit with proper behavior science framework`,
      parameters: z.object({
        templateId: z.string().optional().describe('ID of habit template to use'),
        name: z.string().describe('Name of the habit'),
        domain: z.enum(['health', 'mind', 'relationships', 'career', 'learning', 'finance', 'home', 'selfCare'])
          .describe('Life domain'),
        tinyVersion: z.string().describe('The smallest possible version (2 min or less)'),
        cue: z.string().describe('When/where this habit happens'),
        celebration: z.string().describe('How to celebrate after (tiny celebration)'),
        frequency: z.enum(['daily', 'weekdays', 'weekends', 'weekly']).optional(),
      }),
      execute: async ({ templateId, name, domain, tinyVersion, cue, celebration, frequency = 'daily' }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const data = getUserCoachData(userId);

        // Get template if provided
        const template = templateId ? HABIT_TEMPLATES.find(t => t.id === templateId) : null;

        const habit: EnhancedHabit = {
          id: `habit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          userId,
          name,
          description: template?.description,
          domain,
          currentLevel: 1, // Start at tiny
          targetLevel: 5,
          levelStartDate: new Date(),
          levelHistory: [{ level: 1, achievedAt: new Date() }],
          habitLoop: {
            cue: { type: 'preceding_action', description: cue, specificity: cue },
            routine: { behavior: tinyVersion, duration: 2, difficulty: 'tiny' },
            reward: { intrinsic: 'Sense of accomplishment', celebration },
          },
          isKeystone: template?.isKeystone || false,
          keystoneScore: template?.isKeystone ? 7 : undefined,
          cascadeEffects: template?.cascadeEffects,
          frequency,
          targetPerDay: 1,
          currentStreak: 0,
          longestStreak: 0,
          totalCompletions: 0,
          successRate: 0,
          isActive: true,
          isPaused: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          tags: [domain],
        };

        data.enhancedHabits.push(habit);

        if (habit.isKeystone) {
          data.keystoneHabits.push(habit.id);
        }

        // Persist to database
        saveEnhancedHabit(userId, habit);
        saveUserCoachProfile(userId, data);

        getLogger().info({ userId, habitId: habit.id, name, level: 1 }, '✨ Enhanced habit created');

        const level = GLIDEPATH_LEVELS[0];
        return {
          habitId: habit.id,
          name,
          level: level.name,
          instruction: level.description,
          yourVersion: tinyVersion,
          cue,
          celebration,
          nextStep: `Just do this for ${level.duration}. The goal is showing up, not perfection.`,
          tip: 'Remember: the habit is the practice, not the result. Even 30 seconds counts!',
        };
      },
    }),

    /**
     * Log habit completion
     */
    logHabitCompletion: llm.tool({
      description: `Log completion of a habit and track progress.
Use when:
- User reports doing their habit
- Daily check-in on habits`,
      parameters: z.object({
        habitId: z.string().describe('ID of the habit'),
        completed: z.boolean().describe('Whether habit was completed'),
        notes: z.string().optional().describe('Any notes about the completion'),
        feelingAfter: z.enum(['great', 'good', 'neutral', 'struggled']).optional(),
      }),
      execute: async ({ habitId, completed, notes, feelingAfter }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const data = getUserCoachData(userId);

        const habit = data.enhancedHabits.find(h => h.id === habitId);
        if (!habit) {
          return { error: 'Habit not found' };
        }

        habit.totalCompletions += completed ? 1 : 0;
        habit.currentStreak = completed ? habit.currentStreak + 1 : 0;
        habit.longestStreak = Math.max(habit.longestStreak, habit.currentStreak);
        habit.updatedAt = new Date();

        // Check for level up
        let leveledUp = false;
        const currentLevel = GLIDEPATH_LEVELS[habit.currentLevel - 1];
        const daysAtLevel = Math.floor((Date.now() - habit.levelStartDate.getTime()) / (1000 * 60 * 60 * 24));
        const minDaysForLevel = parseInt(currentLevel.duration.split('-')[0]) * 7;

        if (habit.currentStreak >= 14 && daysAtLevel >= minDaysForLevel && habit.currentLevel < 5) {
          habit.currentLevel++;
          habit.levelStartDate = new Date();
          habit.levelHistory.push({ level: habit.currentLevel, achievedAt: new Date() });
          leveledUp = true;
        }

        // Persist updated habit to database
        saveEnhancedHabit(userId, habit);

        getLogger().info({ userId, habitId, completed, streak: habit.currentStreak, leveledUp }, '📊 Habit logged');

        const response: Record<string, unknown> = {
          streak: habit.currentStreak,
          longestStreak: habit.longestStreak,
          level: habit.currentLevel,
          levelName: GLIDEPATH_LEVELS[habit.currentLevel - 1].name,
        };

        if (leveledUp) {
          const newLevel = GLIDEPATH_LEVELS[habit.currentLevel - 1];
          response.levelUp = {
            newLevel: newLevel.name,
            message: `🎉 You've leveled up to ${newLevel.name}! ${newLevel.description}`,
            newFocus: newLevel.focus,
          };
        }

        if (habit.currentStreak === 7) {
          response.milestone = '🔥 One week streak! You\'re building something real.';
        } else if (habit.currentStreak === 21) {
          response.milestone = '⭐ Three weeks! This is becoming who you are.';
        } else if (habit.currentStreak === 66) {
          response.milestone = '🏆 66 days! Research says this is when habits become automatic.';
        }

        return response;
      },
    }),

    /**
     * Create a habit stack
     */
    createHabitStack: llm.tool({
      description: `Create a habit stack - chaining multiple habits together.
Use when:
- User wants to combine habits for efficiency
- Building a morning or evening routine
- Leveraging existing habits as anchors`,
      parameters: z.object({
        name: z.string().describe('Name for this habit stack'),
        anchorHabit: z.string().describe('Existing habit or action to build on'),
        newHabits: z.array(z.string()).describe('New habits to stack (in order)'),
        timeOfDay: z.enum(['morning', 'afternoon', 'evening', 'anytime']),
      }),
      execute: async ({ name, anchorHabit, newHabits, timeOfDay }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const data = getUserCoachData(userId);

        const stack: HabitStack = {
          id: `stack_${Date.now()}`,
          name,
          description: `After ${anchorHabit}, I will ${newHabits.join(', then ')}`,
          anchorHabit,
          newHabits,
          totalDuration: newHabits.length * 5, // Estimate
          bestTimeOfDay: timeOfDay,
        };

        data.habitStacks.push(stack);

        // Persist to database
        saveHabitStack(userId, stack);

        getLogger().info({ userId, stackId: stack.id, habits: newHabits.length }, '📚 Habit stack created');

        return {
          stackId: stack.id,
          name,
          formula: stack.description,
          tip: 'Start with just the first habit in the stack. Add one at a time.',
          science: 'Habit stacking uses existing neural pathways to build new behaviors.',
        };
      },
    }),

    /**
     * Weekly reflection
     */
    weeklyReflection: llm.tool({
      description: `Conduct a weekly habit reflection session.
Use when:
- Weekly check-in with user
- User wants to review progress
- End of week reflection`,
      parameters: z.object({
        wins: z.array(z.string()).describe('What went well this week'),
        challenges: z.array(z.string()).describe('What was difficult'),
        insights: z.array(z.string()).describe('What user learned'),
        adjustments: z.array(z.string()).optional().describe('Changes to make next week'),
      }),
      execute: async ({ wins, challenges, insights, adjustments = [] }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const data = getUserCoachData(userId);

        // Persist to database
        saveWeeklyReflection(userId, { wins, challenges, insights, adjustments });

        // Calculate stats
        const activeHabits = data.enhancedHabits.filter(h => h.isActive);
        const avgStreak = activeHabits.reduce((sum, h) => sum + h.currentStreak, 0) / (activeHabits.length || 1);
        const keystoneProgress = data.keystoneHabits.length > 0 
          ? data.enhancedHabits.filter(h => data.keystoneHabits.includes(h.id) && h.currentStreak > 0).length / data.keystoneHabits.length
          : 0;

        getLogger().info({ userId, wins: wins.length, avgStreak }, '📝 Weekly reflection saved');

        return {
          summary: {
            activeHabits: activeHabits.length,
            avgStreak: Math.round(avgStreak),
            keystoneProgress: Math.round(keystoneProgress * 100) + '%',
          },
          wins,
          topChallenge: challenges[0],
          keyInsight: insights[0],
          nextWeekFocus: adjustments[0] || 'Keep building on your wins!',
          encouragement: getEncouragement(avgStreak, wins.length),
        };
      },
    }),

    /**
     * Get personalized encouragement
     */
    getEncouragement: llm.tool({
      description: `Get personalized encouragement based on habit progress.
Use when:
- User needs motivation
- Celebrating progress
- User is struggling`,
      parameters: z.object({
        situation: z.enum(['struggling', 'doing_well', 'broke_streak', 'milestone', 'starting_fresh'])
          .describe('User\'s current situation'),
      }),
      execute: async ({ situation }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const data = getUserCoachData(userId);

        const messages: Record<string, string[]> = {
          struggling: [
            "Remember: every expert was once a beginner. The fact that you're trying matters.",
            "Habits aren't about perfection—they're about direction. You're pointed the right way.",
            "A bad day doesn't erase your progress. Rest if you need to, then begin again.",
            "The two-minute version still counts. What's the smallest step you can take today?",
          ],
          doing_well: [
            "You're building something real here. Your future self is going to thank you.",
            "This consistency is shaping who you're becoming. Keep going!",
            "You're proving to yourself what's possible. That's powerful.",
            "These small daily choices are adding up to big changes.",
          ],
          broke_streak: [
            "Streaks are tools, not goals. What matters is starting again right now.",
            "Missing once is an accident. Missing twice starts a new pattern. Get back today.",
            "Your streak ended, but your identity as someone who does this didn't.",
            "The best time to start was yesterday. The second best time is now.",
          ],
          milestone: [
            "You did it! This milestone is proof that you can do hard things.",
            "Look how far you've come. Remember when this felt impossible?",
            "This is what showing up every day creates. Celebrate this!",
            "You've just proven something to yourself that no one can take away.",
          ],
          starting_fresh: [
            "Every journey starts with a single step. Today is day one of something amazing.",
            "You don't have to be great to start. But you have to start to be great.",
            "Start so small it feels ridiculous. That's the secret.",
            "The you of tomorrow is being built by what you do today. Let's begin.",
          ],
        };

        const options = messages[situation];
        const message = options[Math.floor(Math.random() * options.length)];

        getLogger().info({ userId, situation }, '💬 Encouragement provided');

        return {
          message,
          tip: situation === 'struggling' 
            ? 'Focus on just today. Can you do the 2-minute version?'
            : 'Keep building! Small actions compound into extraordinary results.',
        };
      },
    }),

    /**
     * Set life stage and update recommendations
     */
    setLifeStage: llm.tool({
      description: `Set user's life stage to personalize habit recommendations.
Use when:
- User mentions their life situation
- Onboarding a new user
- User's life stage changes`,
      parameters: z.object({
        stage: z.enum(['student', 'early_career', 'new_parent', 'mid_career', 'empty_nester', 'pre_retirement', 'retirement', 'transition'])
          .describe('User\'s current life stage'),
      }),
      execute: async ({ stage }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const data = getUserCoachData(userId);

        data.lifeStage = stage;
        const stageInfo = LIFE_STAGES[stage];

        // Persist to database
        saveUserCoachProfile(userId, data);

        getLogger().info({ userId, stage }, '🎯 Life stage set');

        return {
          stage: stageInfo.name,
          priorities: stageInfo.priorities.map(p => LIFE_DOMAINS[p as LifeDomain].name),
          challenges: stageInfo.challenges,
          opportunities: stageInfo.opportunities,
          message: `Got it! As someone in the ${stageInfo.name} stage, I'll focus on what matters most to you right now.`,
        };
      },
    }),

    // ========================================================================
    // FOUR TENDENCIES - Gretchen Rubin's personality framework
    // ========================================================================
    
    /**
     * Assess user's tendency type for personalized habit strategies
     */
    assessFourTendencies: llm.tool({
      description: `Determine user's personality tendency (from Gretchen Rubin's framework) to personalize habit strategies.
The Four Tendencies determine how people respond to expectations:
- UPHOLDER: Meets outer AND inner expectations. Loves rules, schedules, to-do lists.
- QUESTIONER: Meets inner expectations, resists outer. Needs reasons and logic.
- OBLIGER: Meets outer expectations, struggles with inner. Needs accountability.
- REBEL: Resists ALL expectations. Needs freedom, identity, choice.

Use when:
- First habit coaching session
- User is struggling with consistency despite wanting to change
- Tailoring motivation strategies`,
      parameters: z.object({
        tendency: z.enum(['upholder', 'questioner', 'obliger', 'rebel'])
          .describe('User\'s identified tendency based on conversation'),
        evidence: z.string().optional()
          .describe('What in the conversation revealed this tendency'),
      }),
      execute: async ({ tendency, evidence }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const data = getUserCoachData(userId);

        // Store tendency in user profile
        const store = getProductivityStore();
        store.setUserPreference(userId, 'fourTendency', tendency);
        if (evidence) {
          store.setUserPreference(userId, 'fourTendencyEvidence', evidence);
        }

        const strategies = FOUR_TENDENCIES_STRATEGIES[tendency];

        getLogger().info({ userId, tendency }, '🎭 Four Tendencies assessed');

        return {
          tendency: strategies.name,
          description: strategies.description,
          habitStrategies: strategies.habitStrategies,
          avoidances: strategies.avoid,
          motivationTip: strategies.motivationTip,
          message: `Understanding that you're a ${strategies.name} is huge! This tells me exactly how to help you build habits that stick.`,
        };
      },
    }),

    // ========================================================================
    // IDENTITY-BASED HABITS - James Clear's identity transformation
    // ========================================================================

    /**
     * Transform habits through identity shift
     */
    createIdentityShift: llm.tool({
      description: `Help user shift their identity to support their habits (from James Clear's Atomic Habits).
The most powerful habit change comes from changing WHO you believe you are.
Instead of "I want to quit smoking" → "I am a non-smoker"
Instead of "I want to exercise" → "I am an athlete/active person"

Use when:
- User keeps failing at the same habit
- User says "I'm not the type of person who..."
- Building long-term sustainable change
- User needs deeper motivation than willpower`,
      parameters: z.object({
        currentBelief: z.string()
          .describe('User\'s current identity belief (e.g., "I\'m not a morning person")'),
        desiredIdentity: z.string()
          .describe('New identity to adopt (e.g., "I am someone who honors my mornings")'),
        domain: z.enum(['health', 'mind', 'relationships', 'career', 'learning', 'finance', 'home', 'selfCare'])
          .describe('Life domain this identity relates to'),
        smallProofs: z.array(z.string())
          .describe('Tiny actions that prove this new identity (even once counts)'),
      }),
      execute: async ({ currentBelief, desiredIdentity, domain, smallProofs }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const store = getProductivityStore();
        
        // Store identity shift for tracking
        const identityShifts = store.getUserPreference(userId, 'identityShifts') as IdentityShift[] || [];
        const newShift: IdentityShift = {
          id: `identity_${Date.now()}`,
          from: currentBelief,
          to: desiredIdentity,
          domain,
          proofs: smallProofs,
          createdAt: new Date().toISOString(),
          evidenceLog: [],
        };
        identityShifts.push(newShift);
        store.setUserPreference(userId, 'identityShifts', identityShifts);

        getLogger().info({ userId, from: currentBelief, to: desiredIdentity }, '🦋 Identity shift created');

        return {
          transformation: {
            from: currentBelief,
            to: desiredIdentity,
          },
          mantra: `Every time you ${smallProofs[0]}, you cast a vote for being "${desiredIdentity}"`,
          proofActions: smallProofs,
          science: 'Identity change works because every action is a vote for the type of person you want to become. Habits are not about HAVING something, they\'re about BECOMING someone.',
          nextStep: `This week, try to do "${smallProofs[0]}" just once. That one action is evidence for your new identity.`,
        };
      },
    }),

    // ========================================================================
    // BAD HABIT BREAKING - The Golden Rule of Habit Change
    // ========================================================================

    /**
     * Break bad habits using substitution
     */
    breakBadHabit: llm.tool({
      description: `Help user break a bad habit using the Golden Rule of Habit Change.
You cannot eliminate a bad habit, you can only REPLACE it.
Keep the same CUE and REWARD, but change the ROUTINE.

Use when:
- User wants to stop a bad habit (smoking, snacking, scrolling, etc.)
- User keeps relapsing into old behavior
- User asks "how do I stop..."`,
      parameters: z.object({
        badHabit: z.string()
          .describe('The bad habit to break'),
        currentCue: z.string()
          .describe('What triggers this habit (stress, boredom, specific time, etc.)'),
        actualReward: z.string()
          .describe('The REAL reward they get (not the surface behavior) - e.g., stress relief, connection, stimulation'),
        replacementRoutine: z.string()
          .describe('New healthy routine that provides the same reward'),
        frictionStrategies: z.array(z.string()).optional()
          .describe('Ways to add friction to the bad habit'),
      }),
      execute: async ({ badHabit, currentCue, actualReward, replacementRoutine, frictionStrategies = [] }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const store = getProductivityStore();
        
        // Store habit break attempt
        const habitBreaks = store.getUserPreference(userId, 'habitBreaks') as HabitBreakPlan[] || [];
        const plan: HabitBreakPlan = {
          id: `break_${Date.now()}`,
          badHabit,
          cue: currentCue,
          actualReward,
          replacement: replacementRoutine,
          frictionAdded: frictionStrategies,
          startDate: new Date().toISOString(),
          relapseLog: [],
          successStreak: 0,
        };
        habitBreaks.push(plan);
        store.setUserPreference(userId, 'habitBreaks', habitBreaks);

        getLogger().info({ userId, badHabit, replacement: replacementRoutine }, '🔄 Bad habit break plan created');

        return {
          plan: {
            habit: badHabit,
            trigger: currentCue,
            realNeed: actualReward,
            newResponse: replacementRoutine,
          },
          goldenRule: `When ${currentCue}, instead of ${badHabit}, I will ${replacementRoutine} because I really need ${actualReward}.`,
          frictionTips: frictionStrategies.length > 0 
            ? frictionStrategies 
            : generateFrictionTips(badHabit),
          science: 'Bad habits are hard to break because they serve a real purpose. The secret is finding a healthier way to meet the same need.',
          compassionReminder: 'If you slip, that\'s data not failure. Ask: "What was I really needing in that moment?"',
        };
      },
    }),

    // ========================================================================
    // ENVIRONMENT DESIGN - Setting up for success
    // ========================================================================

    /**
     * Design environment to support habits
     */
    designEnvironment: llm.tool({
      description: `Help user design their environment to make good habits easy and bad habits hard.
Environment is the invisible hand that shapes behavior.
Make the CUE obvious for good habits, invisible for bad habits.
Reduce friction for good habits, increase it for bad habits.

Use when:
- User struggles with willpower
- Setting up new habit for success
- User fails despite motivation
- "I always forget to..."`,
      parameters: z.object({
        habit: z.string()
          .describe('The habit to support'),
        habitType: z.enum(['build', 'break'])
          .describe('Whether building a good habit or breaking a bad one'),
        currentEnvironment: z.string()
          .describe('Current environment/setup'),
        suggestedChanges: z.array(z.string())
          .describe('Environmental changes to make'),
      }),
      execute: async ({ habit, habitType, currentEnvironment, suggestedChanges }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const store = getProductivityStore();
        
        // Store environment design
        const envDesigns = store.getUserPreference(userId, 'environmentDesigns') as EnvironmentDesign[] || [];
        const design: EnvironmentDesign = {
          id: `env_${Date.now()}`,
          habit,
          type: habitType,
          currentSetup: currentEnvironment,
          changes: suggestedChanges,
          implemented: [],
          createdAt: new Date().toISOString(),
        };
        envDesigns.push(design);
        store.setUserPreference(userId, 'environmentDesigns', envDesigns);

        const strategies = habitType === 'build' 
          ? ENVIRONMENT_BUILD_STRATEGIES 
          : ENVIRONMENT_BREAK_STRATEGIES;

        getLogger().info({ userId, habit, type: habitType }, '🏠 Environment design created');

        return {
          habit,
          designType: habitType === 'build' ? 'Make it easy' : 'Make it hard',
          changes: suggestedChanges,
          principles: strategies,
          science: 'We don\'t rise to the level of our goals, we fall to the level of our systems. Your environment IS your system.',
          oneThingToday: suggestedChanges[0],
        };
      },
    }),

    // ========================================================================
    // TEMPTATION BUNDLING - Pair pleasure with purpose
    // ========================================================================

    /**
     * Create temptation bundles
     */
    createTemptationBundle: llm.tool({
      description: `Create temptation bundles - pair something you NEED to do with something you WANT to do.
This makes habits more attractive by linking them to immediate pleasure.
Example: "I will only watch my favorite show while on the treadmill"

Use when:
- User lacks motivation for important habit
- User has guilty pleasures they want to limit
- Making unpleasant tasks more bearable`,
      parameters: z.object({
        needToDo: z.string()
          .describe('The habit or task user needs to do but struggles with'),
        wantToDo: z.string()
          .describe('The pleasurable activity user enjoys'),
        bundleRule: z.string()
          .describe('The rule linking them (e.g., "Only X while doing Y")'),
      }),
      execute: async ({ needToDo, wantToDo, bundleRule }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const store = getProductivityStore();
        
        // Store temptation bundle
        const bundles = store.getUserPreference(userId, 'temptationBundles') as TemptationBundle[] || [];
        const bundle: TemptationBundle = {
          id: `bundle_${Date.now()}`,
          needToDo,
          wantToDo,
          rule: bundleRule,
          createdAt: new Date().toISOString(),
          usageLog: [],
        };
        bundles.push(bundle);
        store.setUserPreference(userId, 'temptationBundles', bundles);

        getLogger().info({ userId, needToDo, wantToDo }, '🎁 Temptation bundle created');

        return {
          bundle: {
            task: needToDo,
            reward: wantToDo,
            rule: bundleRule,
          },
          formula: `"I will only [${wantToDo}] while [${needToDo}]"`,
          science: 'Temptation bundling works by creating a real-time reward for behaviors with delayed benefits. Your brain starts associating the hard thing with pleasure.',
          tip: 'The key is being strict about the rule. The guilty pleasure ONLY happens with the habit.',
        };
      },
    }),

    // ========================================================================
    // SELF-COMPASSION RECOVERY - Handling setbacks
    // ========================================================================

    /**
     * Process setbacks with self-compassion
     */
    processSetback: llm.tool({
      description: `Help user recover from a habit setback with self-compassion.
Research shows self-compassion (not self-criticism) leads to faster recovery and better long-term results.
The "what-the-hell effect" makes people who feel guilt spiral further.

Use when:
- User broke their streak
- User is being hard on themselves
- User says "I failed" or expresses shame
- User wants to give up after a setback`,
      parameters: z.object({
        habit: z.string()
          .describe('The habit they struggled with'),
        whatHappened: z.string()
          .describe('What triggered the setback'),
        currentFeeling: z.enum(['ashamed', 'frustrated', 'disappointed', 'hopeless', 'angry'])
          .describe('How user is feeling'),
        lessonsLearned: z.string().optional()
          .describe('What user can learn from this'),
      }),
      execute: async ({ habit, whatHappened, currentFeeling, lessonsLearned }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const store = getProductivityStore();
        
        // Log setback for pattern recognition
        const setbacks = store.getUserPreference(userId, 'setbackLog') as SetbackLog[] || [];
        const setback: SetbackLog = {
          id: `setback_${Date.now()}`,
          habit,
          trigger: whatHappened,
          feeling: currentFeeling,
          lesson: lessonsLearned,
          date: new Date().toISOString(),
        };
        setbacks.push(setback);
        store.setUserPreference(userId, 'setbackLog', setbacks);

        // Detect patterns
        const recentSetbacks = setbacks.filter(s => 
          s.habit === habit && 
          Date.now() - new Date(s.date).getTime() < 30 * 24 * 60 * 60 * 1000
        );
        const pattern = detectSetbackPattern(recentSetbacks);

        getLogger().info({ userId, habit, feeling: currentFeeling }, '💝 Setback processed with compassion');

        return {
          compassionMessage: SELF_COMPASSION_MESSAGES[currentFeeling],
          reframe: {
            from: 'I failed',
            to: 'I gathered data about what doesn\'t work for me',
          },
          science: 'Research shows self-compassion leads to faster behavior change than self-criticism. Shame spirals into more unwanted behavior.',
          lesson: lessonsLearned || 'Every setback reveals something about our triggers and needs.',
          pattern: pattern ? `I notice this tends to happen when: ${pattern}` : null,
          nextStep: 'The most important thing now is the NEXT action, not the last one. What\'s one tiny step forward?',
          reminder: 'Missing once is an accident. Missing twice starts a new pattern. Focus on getting back TODAY.',
        };
      },
    }),

    // ========================================================================
    // CIRCLE OF INFLUENCE - Seven Habits of Highly Effective People
    // ========================================================================

    /**
     * Assess circle of influence vs. concern
     */
    assessCircleOfInfluence: llm.tool({
      description: `Help user focus on their Circle of Influence (what they can control) vs. Circle of Concern (what they worry about but can't control).
From Stephen Covey's 7 Habits of Highly Effective People.
Proactive people focus on what they can change. Reactive people drain energy on what they can't.

Use when:
- User feels overwhelmed or helpless
- User is focused on things outside their control
- User needs to prioritize energy
- Building proactive habits`,
      parameters: z.object({
        concern: z.string()
          .describe('What the user is worried or stressed about'),
        influenceAspects: z.array(z.string())
          .describe('Aspects within user\'s control or influence'),
        outsideControl: z.array(z.string())
          .describe('Aspects outside user\'s control'),
        actionableSteps: z.array(z.string())
          .describe('Specific actions user CAN take'),
      }),
      execute: async ({ concern, influenceAspects, outsideControl, actionableSteps }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        getLogger().info({ userId, concern }, '🎯 Circle of influence assessed');

        return {
          concern,
          analysis: {
            withinInfluence: influenceAspects,
            outsideControl: outsideControl,
          },
          recommendation: `Focus your energy on: ${influenceAspects.slice(0, 2).join(' and ')}`,
          letGo: `Release worry about: ${outsideControl.slice(0, 2).join(' and ')}`,
          actions: actionableSteps,
          coveyWisdom: '"I am not a product of my circumstances. I am a product of my decisions." - Stephen Covey',
          energyTip: 'Every hour spent worrying about things you can\'t change is an hour stolen from things you CAN change.',
        };
      },
    }),

    // ========================================================================
    // ACCOUNTABILITY PARTNER - Social support for habits
    // ========================================================================

    /**
     * Set up accountability system
     */
    setupAccountability: llm.tool({
      description: `Help user set up an accountability system for their habits.
External accountability is especially powerful for Obligers (from Four Tendencies).
Social commitment dramatically increases follow-through.

Use when:
- User is an Obliger tendency
- User struggles with self-accountability
- User has support system they can leverage
- Setting up habit success system`,
      parameters: z.object({
        habit: z.string()
          .describe('The habit to be accountable for'),
        accountabilityType: z.enum(['partner', 'group', 'public', 'coach', 'app'])
          .describe('Type of accountability system'),
        partnerName: z.string().optional()
          .describe('Name of accountability partner if applicable'),
        checkInSchedule: z.string()
          .describe('How often to check in (daily, weekly, etc.)'),
        consequences: z.string().optional()
          .describe('Stakes or consequences if applicable'),
      }),
      execute: async ({ habit, accountabilityType, partnerName, checkInSchedule, consequences }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const store = getProductivityStore();
        
        // Store accountability setup
        const accountability = store.getUserPreference(userId, 'accountabilitySystems') as AccountabilitySystem[] || [];
        const system: AccountabilitySystem = {
          id: `accountability_${Date.now()}`,
          habit,
          type: accountabilityType,
          partner: partnerName,
          schedule: checkInSchedule,
          consequences,
          createdAt: new Date().toISOString(),
        };
        accountability.push(system);
        store.setUserPreference(userId, 'accountabilitySystems', accountability);

        getLogger().info({ userId, habit, type: accountabilityType }, '🤝 Accountability system created');

        return {
          system: {
            habit,
            type: accountabilityType,
            partner: partnerName,
            checkIn: checkInSchedule,
          },
          tips: ACCOUNTABILITY_TIPS[accountabilityType],
          science: 'Public commitment increases follow-through by 65%. We\'re wired to keep promises to others even when we break them to ourselves.',
          messageTemplate: partnerName 
            ? `"Hey ${partnerName}, I'm working on ${habit}. Can you check in with me ${checkInSchedule}? It would really help me stay on track."`
            : null,
        };
      },
    }),

    // ========================================================================
    // HABIT AUDIT - Comprehensive habit inventory
    // ========================================================================

    /**
     * Conduct a habit audit
     */
    conductHabitAudit: llm.tool({
      description: `Conduct a comprehensive audit of user's current habits (both good and bad).
Based on James Clear's Habit Scorecard - awareness must come before change.
Identifies keystone habits, habit stacks, and areas for improvement.

Use when:
- Starting fresh with habit work
- User wants big-picture view
- Annual or quarterly review
- User says "I don't know where to start"`,
      parameters: z.object({
        currentHabits: z.array(z.object({
          name: z.string(),
          category: z.enum(['good', 'bad', 'neutral']),
          frequency: z.string(),
          impact: z.enum(['high', 'medium', 'low']),
        })).describe('List of user\'s current habits'),
        morningRoutine: z.string().optional()
          .describe('Current morning routine'),
        eveningRoutine: z.string().optional()
          .describe('Current evening routine'),
      }),
      execute: async ({ currentHabits, morningRoutine, eveningRoutine }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const store = getProductivityStore();
        
        // Store audit
        store.setUserPreference(userId, 'lastHabitAudit', {
          date: new Date().toISOString(),
          habits: currentHabits,
          morningRoutine,
          eveningRoutine,
        });

        // Analyze
        const goodHabits = currentHabits.filter(h => h.category === 'good');
        const badHabits = currentHabits.filter(h => h.category === 'bad');
        const keystoneCandidates = goodHabits.filter(h => h.impact === 'high');
        
        getLogger().info({ userId, total: currentHabits.length, good: goodHabits.length, bad: badHabits.length }, '📋 Habit audit completed');

        return {
          summary: {
            totalHabits: currentHabits.length,
            goodHabits: goodHabits.length,
            badHabits: badHabits.length,
            neutralHabits: currentHabits.length - goodHabits.length - badHabits.length,
          },
          keystoneCandidates: keystoneCandidates.map(h => h.name),
          priorities: {
            protect: goodHabits.filter(h => h.impact === 'high').map(h => h.name),
            eliminate: badHabits.filter(h => h.impact === 'high').map(h => h.name),
            upgrade: currentHabits.filter(h => h.category === 'neutral' && h.impact === 'medium').map(h => h.name),
          },
          routineAnalysis: {
            morning: morningRoutine ? 'Has morning routine' : 'No set morning routine',
            evening: eveningRoutine ? 'Has evening routine' : 'No set evening routine',
            recommendation: !morningRoutine ? 'Start with a simple morning routine - it sets the tone for the day' : 
                           !eveningRoutine ? 'Add an evening wind-down routine to protect sleep' : 
                           'Great! Both bookend routines in place',
          },
          nextStep: badHabits.length > 0 && badHabits[0].impact === 'high'
            ? `Let's work on replacing "${badHabits[0].name}" - it's having the biggest negative impact`
            : goodHabits.length > 0 
            ? `Let's strengthen "${keystoneCandidates[0]?.name || goodHabits[0].name}" - it will cascade to other areas`
            : 'Let\'s pick one tiny habit to start building your foundation',
        };
      },
    }),

    // ========================================================================
    // 30-DAY CHALLENGES - Structured transformation programs
    // ========================================================================

    /**
     * Start a 30-day challenge
     */
    start30DayChallenge: llm.tool({
      description: `Start a structured 30-day challenge with daily guidance.
Challenges are pre-built programs that gradually build habits over 30 days.
Each day has specific actions and the difficulty increases progressively.

Use when:
- User wants structured guidance
- User says "I need a challenge"
- User wants to transform a specific area
- New Year's resolutions, fresh starts`,
      parameters: z.object({
        challengeType: z.enum([
          'morning_person', 
          'fitness_starter', 
          'mindfulness', 
          'financial_reset',
          'digital_detox',
          'sleep_optimization',
          'hydration',
          'gratitude',
          'declutter',
          'connection'
        ]).describe('Type of 30-day challenge'),
        startDate: z.string().optional().describe('When to start (defaults to tomorrow)'),
        intensity: z.enum(['gentle', 'moderate', 'intensive']).optional()
          .describe('How aggressive the challenge should be'),
      }),
      execute: async ({ challengeType, startDate, intensity = 'moderate' }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const store = getProductivityStore();
        const challenge = THIRTY_DAY_CHALLENGES[challengeType];
        
        const challengeData: ThirtyDayChallenge = {
          id: `challenge_${Date.now()}`,
          type: challengeType,
          name: challenge.name,
          startDate: startDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          currentDay: 0,
          intensity,
          completedDays: [],
          missedDays: [],
          notes: {},
        };
        
        store.setUserPreference(userId, `challenge_${challengeType}`, challengeData);
        store.setUserPreference(userId, 'activeChallenge', challengeData.id);

        getLogger().info({ userId, challengeType, intensity }, '🎯 30-day challenge started');

        return {
          challenge: challenge.name,
          description: challenge.description,
          startDate: challengeData.startDate,
          duration: '30 days',
          intensity,
          week1Preview: challenge.weeks[0].theme,
          day1Action: challenge.weeks[0].days[0],
          commitment: challenge.commitment,
          tip: 'The first week is about showing up. Don\'t worry about intensity yet.',
        };
      },
    }),

    /**
     * Get today's challenge action
     */
    getTodaysChallengeAction: llm.tool({
      description: `Get today's specific action for an active 30-day challenge.
Use when:
- User asks "what do I do today?"
- Daily check-in on challenge
- User wants guidance on current challenge`,
      parameters: z.object({
        challengeId: z.string().optional().describe('Specific challenge ID (uses active if not provided)'),
      }),
      execute: async ({ challengeId }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const store = getProductivityStore();
        const activeId = challengeId || store.getUserPreference(userId, 'activeChallenge') as string;
        
        if (!activeId) {
          return { error: 'No active challenge. Want to start one?' };
        }
        
        // Find the challenge
        const challenges = Object.keys(THIRTY_DAY_CHALLENGES);
        let challengeData: ThirtyDayChallenge | null = null;
        
        for (const type of challenges) {
          const data = store.getUserPreference(userId, `challenge_${type}`) as ThirtyDayChallenge;
          if (data && data.id === activeId) {
            challengeData = data;
            break;
          }
        }
        
        if (!challengeData) {
          return { error: 'Challenge not found' };
        }
        
        // Calculate current day
        const startDate = new Date(challengeData.startDate);
        const today = new Date();
        const dayNumber = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        
        if (dayNumber < 1) {
          return {
            message: `Your challenge starts ${challengeData.startDate}. Get excited!`,
            daysUntilStart: Math.abs(dayNumber) + 1,
          };
        }
        
        if (dayNumber > 30) {
          return {
            message: 'Challenge complete! 🎉 How do you feel?',
            completedDays: challengeData.completedDays.length,
            successRate: Math.round((challengeData.completedDays.length / 30) * 100) + '%',
          };
        }
        
        const challenge = THIRTY_DAY_CHALLENGES[challengeData.type as keyof typeof THIRTY_DAY_CHALLENGES];
        const weekIndex = Math.floor((dayNumber - 1) / 7);
        const dayIndex = (dayNumber - 1) % 7;
        const week = challenge.weeks[Math.min(weekIndex, 3)];
        const todayAction = week.days[Math.min(dayIndex, week.days.length - 1)];

        return {
          day: dayNumber,
          week: weekIndex + 1,
          weekTheme: week.theme,
          todayAction,
          intensityNote: week.intensityNote,
          encouragement: getChallengeDayEncouragement(dayNumber),
          completedSoFar: challengeData.completedDays.length,
        };
      },
    }),

    /**
     * Log challenge day completion
     */
    logChallengeDay: llm.tool({
      description: `Log completion of today's challenge action.
Use when:
- User reports doing their challenge action
- Daily check-in completion`,
      parameters: z.object({
        completed: z.boolean().describe('Whether the challenge action was completed'),
        notes: z.string().optional().describe('How it went, observations'),
        difficulty: z.enum(['easy', 'moderate', 'hard', 'struggled']).optional(),
      }),
      execute: async ({ completed, notes, difficulty }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const store = getProductivityStore();
        const activeId = store.getUserPreference(userId, 'activeChallenge') as string;
        
        if (!activeId) {
          return { error: 'No active challenge' };
        }
        
        // Find and update the challenge
        const challenges = Object.keys(THIRTY_DAY_CHALLENGES);
        for (const type of challenges) {
          const data = store.getUserPreference(userId, `challenge_${type}`) as ThirtyDayChallenge;
          if (data && data.id === activeId) {
            const startDate = new Date(data.startDate);
            const today = new Date();
            const dayNumber = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            
            if (completed) {
              data.completedDays.push(dayNumber);
            } else {
              data.missedDays.push(dayNumber);
            }
            
            if (notes) {
              data.notes[dayNumber] = { notes, difficulty, completed };
            }
            
            data.currentDay = dayNumber;
            store.setUserPreference(userId, `challenge_${type}`, data);

            getLogger().info({ userId, day: dayNumber, completed }, '📅 Challenge day logged');

            // Check for milestones
            const milestones = checkChallengeMilestones(dayNumber, data.completedDays.length);
            
            return {
              day: dayNumber,
              completed,
              totalCompleted: data.completedDays.length,
              successRate: Math.round((data.completedDays.length / dayNumber) * 100) + '%',
              milestone: milestones,
              encouragement: completed 
                ? getChallengeDayEncouragement(dayNumber)
                : 'Tomorrow is a new day. The streak matters less than showing up again.',
            };
          }
        }
        
        return { error: 'Challenge not found' };
      },
    }),

    // ========================================================================
    // HABIT BUNDLES/RECIPES - Pre-built habit stacks for common goals
    // ========================================================================

    /**
     * Get habit bundle recommendations
     */
    getHabitBundle: llm.tool({
      description: `Get a pre-built habit bundle (recipe) for a common goal.
Bundles are curated habit stacks that work well together.
They're based on what actually works for real people.

Use when:
- User has a goal but doesn't know where to start
- User wants a complete system, not just one habit
- "I want to become a morning person"
- "How do I get more fit?"`,
      parameters: z.object({
        bundleType: z.enum([
          'morning_person',
          'evening_wind_down', 
          'fitness_beginner',
          'stress_relief',
          'productivity_boost',
          'mindfulness_starter',
          'financial_wellness',
          'better_sleep',
          'energy_boost',
          'relationship_nurturing'
        ]).describe('Type of habit bundle'),
        currentWakeTime: z.string().optional().describe('Current wake time for morning bundles'),
        availableMinutes: z.number().optional().describe('Minutes available for the bundle'),
      }),
      execute: async ({ bundleType, currentWakeTime, availableMinutes }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const bundle = HABIT_BUNDLES[bundleType];
        
        // Adjust based on available time
        let selectedHabits = bundle.habits;
        if (availableMinutes && availableMinutes < bundle.totalMinutes) {
          selectedHabits = bundle.habits.filter(h => h.priority === 'core');
        }

        getLogger().info({ userId, bundleType, habits: selectedHabits.length }, '📦 Habit bundle retrieved');

        return {
          bundle: bundle.name,
          goal: bundle.goal,
          description: bundle.description,
          totalTime: `${bundle.totalMinutes} minutes (full) / ${bundle.coreMinutes} minutes (core only)`,
          habits: selectedHabits.map(h => ({
            name: h.name,
            duration: h.minutes + ' min',
            tinyVersion: h.tinyVersion,
            priority: h.priority,
            order: h.order,
          })),
          stackFormula: bundle.stackFormula,
          scienceNote: bundle.science,
          startTip: 'Start with just the CORE habits at their TINY version. Add more only when those feel easy.',
          firstWeek: `Week 1: Just do "${selectedHabits.find(h => h.priority === 'core')?.tinyVersion || selectedHabits[0].tinyVersion}"`,
        };
      },
    }),

    // ========================================================================
    // HABIT TROUBLESHOOTING - Diagnose why habits aren't working
    // ========================================================================

    /**
     * Diagnose why a habit isn't sticking
     */
    troubleshootHabit: llm.tool({
      description: `Diagnose why a habit isn't working and provide personalized fixes.
Uses behavior science to identify the root cause.
Common issues: too big, wrong cue, no reward, wrong time, no identity connection.

Use when:
- User says a habit isn't working
- User keeps failing at the same habit
- User asks "why can't I..."
- User is frustrated with lack of progress`,
      parameters: z.object({
        habit: z.string().describe('The habit that isn\'t working'),
        attempts: z.number().optional().describe('How many times they\'ve tried'),
        failurePoint: z.enum(['never_start', 'start_then_stop', 'inconsistent', 'hate_it', 'forget'])
          .describe('Where the habit breaks down'),
        currentCue: z.string().optional().describe('What triggers (or should trigger) the habit'),
        currentReward: z.string().optional().describe('What reward exists (if any)'),
        timeOfDay: z.string().optional().describe('When they try to do the habit'),
      }),
      execute: async ({ habit, attempts, failurePoint, currentCue, currentReward, timeOfDay }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const diagnosis = diagnoseHabitFailure(failurePoint, currentCue, currentReward);
        
        getLogger().info({ userId, habit, failurePoint, diagnosis: diagnosis.issue }, '🔍 Habit troubleshooting');

        return {
          habit,
          diagnosis: {
            likelyIssue: diagnosis.issue,
            explanation: diagnosis.explanation,
            behaviorScienceInsight: diagnosis.science,
          },
          fixes: diagnosis.fixes,
          reframedHabit: diagnosis.reframe,
          nextStep: diagnosis.nextStep,
          encouragement: attempts && attempts > 2 
            ? `You've tried ${attempts} times - that's not failure, that's data. Now we know what doesn't work.`
            : 'The fact that you\'re troubleshooting shows you\'re serious about this. Let\'s figure it out.',
        };
      },
    }),

    // ========================================================================
    // MOOD/ENERGY TRACKING - Connect habits to feelings
    // ========================================================================

    /**
     * Log mood and energy with habit context
     */
    logMoodEnergy: llm.tool({
      description: `Track mood and energy levels to find patterns with habits.
Over time, reveals which habits improve wellbeing.
Also helps identify best times of day for different activities.

Use when:
- User mentions how they're feeling
- Daily check-in
- User wants to understand their patterns
- "I feel tired/energized/stressed"`,
      parameters: z.object({
        mood: z.enum(['great', 'good', 'okay', 'low', 'struggling'])
          .describe('Current mood'),
        energy: z.enum(['high', 'moderate', 'low', 'depleted'])
          .describe('Current energy level'),
        timeOfDay: z.enum(['morning', 'midday', 'afternoon', 'evening', 'night'])
          .describe('Time of day'),
        habitsCompletedToday: z.array(z.string()).optional()
          .describe('Which habits were done today'),
        notes: z.string().optional()
          .describe('Any context (sleep, stress, events)'),
      }),
      execute: async ({ mood, energy, timeOfDay, habitsCompletedToday, notes }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const store = getProductivityStore();
        
        // Store mood log
        const moodLogs = store.getUserPreference(userId, 'moodLogs') as MoodLog[] || [];
        const log: MoodLog = {
          id: `mood_${Date.now()}`,
          date: new Date().toISOString(),
          mood,
          energy,
          timeOfDay,
          habitsCompleted: habitsCompletedToday || [],
          notes,
        };
        moodLogs.push(log);
        store.setUserPreference(userId, 'moodLogs', moodLogs);
        
        // Analyze patterns (last 14 days)
        const recentLogs = moodLogs.filter(l => 
          Date.now() - new Date(l.date).getTime() < 14 * 24 * 60 * 60 * 1000
        );
        const patterns = analyzeMoodPatterns(recentLogs);

        getLogger().info({ userId, mood, energy }, '😊 Mood/energy logged');

        return {
          logged: { mood, energy, time: timeOfDay },
          patterns: patterns.insights.length > 0 ? patterns : null,
          correlations: patterns.habitCorrelations,
          tip: getMoodBasedTip(mood, energy, timeOfDay),
        };
      },
    }),

    // ========================================================================
    // LIFE TRANSITION SUPPORT - Coaching through major changes
    // ========================================================================

    /**
     * Get support for a life transition
     */
    supportLifeTransition: llm.tool({
      description: `Provide coaching support during major life transitions.
Life changes disrupt habits. This tool helps adapt existing habits
and build new ones appropriate for the new situation.

Use when:
- User mentions a big life change
- User is struggling with transition
- User asks how to maintain habits during change
- New job, new baby, moving, divorce, retirement, loss`,
      parameters: z.object({
        transition: z.enum([
          'new_job',
          'job_loss',
          'new_baby',
          'new_relationship',
          'breakup',
          'moving',
          'empty_nest',
          'retirement',
          'health_diagnosis',
          'loss_grief',
          'graduation',
          'promotion'
        ]).describe('Type of life transition'),
        currentHabitStatus: z.enum(['maintaining', 'struggling', 'abandoned'])
          .describe('How their habits are doing during this transition'),
        biggestChallenge: z.string().optional()
          .describe('Main challenge they\'re facing'),
      }),
      execute: async ({ transition, currentHabitStatus, biggestChallenge }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const support = LIFE_TRANSITION_SUPPORT[transition];
        
        getLogger().info({ userId, transition, status: currentHabitStatus }, '🔄 Life transition support');

        return {
          transition: support.name,
          validation: support.validation,
          whatToExpect: support.expectations,
          habitAdvice: {
            protect: support.habitsToProtect,
            pause: support.habitsToPause,
            add: support.habitsToAdd,
          },
          priorityOrder: support.priorityOrder,
          timeframe: support.adjustmentPeriod,
          selfCareReminder: support.selfCareNote,
          encouragement: currentHabitStatus === 'abandoned' 
            ? 'Your habits aren\'t gone - they\'re on pause. When you\'re ready, we\'ll rebuild. No shame.'
            : currentHabitStatus === 'struggling'
            ? 'The fact that you\'re even thinking about habits during this shows incredible self-awareness.'
            : 'You\'re maintaining habits through a major change. That\'s extraordinary.',
        };
      },
    }),

    // ========================================================================
    // MOTIVATION ON DEMAND - Instant encouragement
    // ========================================================================

    /**
     * Get instant motivation/inspiration
     */
    getMotivation: llm.tool({
      description: `Provide instant motivation, inspiration, or a pep talk.
Draws from science, stories, and personalized encouragement.

Use when:
- User says "I need motivation"
- User is feeling unmotivated
- User needs a boost before starting
- User is about to give up`,
      parameters: z.object({
        motivationType: z.enum([
          'science_fact',
          'success_story', 
          'pep_talk',
          'reframe',
          'why_reminder',
          'future_self'
        ]).describe('Type of motivation needed'),
        context: z.string().optional()
          .describe('What they need motivation for'),
        currentStruggle: z.string().optional()
          .describe('What\'s making it hard'),
      }),
      execute: async ({ motivationType, context, currentStruggle }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        
        const motivation = getMotivationalContent(motivationType, context, currentStruggle);
        
        getLogger().info({ userId, type: motivationType }, '💪 Motivation delivered');

        return {
          type: motivationType,
          message: motivation.message,
          source: motivation.source,
          actionPrompt: motivation.action,
          followUp: motivation.followUp,
        };
      },
    }),
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getEncouragement(avgStreak: number, wins: number): string {
  if (avgStreak > 14 && wins >= 3) {
    return "You're on fire! This kind of consistency changes lives.";
  } else if (avgStreak > 7) {
    return "You're building real momentum. Keep showing up!";
  } else if (avgStreak > 0) {
    return "Every streak starts at one. You're on your way!";
  } else {
    return "This is where change begins. One day at a time.";
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { getUserCoachData };

// Legacy alias for backward compatibility
export const createMayaHabitCoachTools = createHabitCoachingTools;

export default createHabitCoachingTools;

