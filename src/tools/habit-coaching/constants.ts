/**
 * Core constants for the Habit Coaching System
 *
 * Life Domains and Life Stages that form the foundation of habit coaching.
 *
 * @module habit-coaching/constants
 */

// ============================================================================
// LIFE DOMAINS - All areas the coach can help with
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
    subdomains: [
      'skills',
      'productivity',
      'leadership',
      'side_projects',
      'job_search',
      'mentorship',
    ],
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
// GLIDEPATH LEVELS - Progression system
// ============================================================================

export const GLIDEPATH_LEVELS = [
  {
    level: 1,
    name: 'Tiny Start',
    description: "So small you can't say no. 2 minutes or less.",
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
] as const;

// ============================================================================
// ENVIRONMENT DESIGN STRATEGIES
// ============================================================================

export const ENVIRONMENT_BUILD_STRATEGIES = [
  "Make cues obvious: Put visual reminders where you'll see them",
  'Reduce friction: Remove steps between you and the habit',
  'Prime your environment: Set up the night before',
  'Use habit stacking: Link to existing behaviors',
  'Create a dedicated space: Associate a location with the habit',
] as const;

export const ENVIRONMENT_BREAK_STRATEGIES = [
  'Make cues invisible: Remove triggers from sight',
  'Add friction: Put obstacles between you and the habit',
  'Change your environment: Break associations',
  'Avoid trigger situations: Know your weak moments',
  "Replace, don't remove: Fill the gap with something better",
] as const;

// ============================================================================
// ACCOUNTABILITY TIPS
// ============================================================================

export const ACCOUNTABILITY_TIPS: Record<string, string[]> = {
  partner: [
    'Check in at the same time each day/week',
    'Share both wins AND struggles honestly',
    "Celebrate each other's progress",
    "Be specific about what you're committing to",
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
    "Be specific about what you're doing",
    'Update even when you struggle - vulnerability builds connection',
  ],
  coach: [
    'Be completely honest with your coach',
    'Prepare for sessions with updates',
    'Implement suggestions before next session',
    'Track between sessions for data',
  ],
  app: [
    "Enable notifications and don't ignore them",
    'Use apps that share progress with others',
    'Review your stats regularly',
    'Combine app tracking with human accountability for best results',
  ],
};

// ============================================================================
// SELF-COMPASSION MESSAGES
// ============================================================================

export const SELF_COMPASSION_MESSAGES: Record<string, string> = {
  ashamed:
    "Hey, shame is the enemy of change. What happened doesn't define you - what you do next does. Everyone stumbles. EVERYONE. Let's focus on the next step, not the last one.",
  frustrated:
    "I hear you. Frustration means you care, and caring is step one. The path to any goal has setbacks built in. This isn't a detour - it's part of the journey.",
  disappointed:
    "Disappointment shows you had expectations of yourself - that's actually good! Now let's channel that into curiosity: what can we learn from this?",
  hopeless:
    "I know it feels like you can't do this. But that feeling is temporary, and it's lying to you. You've overcome hard things before. We'll take the tiniest step forward together.",
  angry:
    "Anger can be fuel if we channel it right. You're mad because you want better for yourself. Let's turn that energy into your next small action.",
};

