/**
 * Maya's Habit Coaching - Life Domains & Stages
 *
 * Defines the domains of life Maya can help with and life stage contexts.
 */

import type {
  LifeDomain,
  LifeStage,
  FourTendency,
  DomainDefinition,
  StageDefinition,
  TendencyStrategy,
} from './types.js';

// ============================================================================
// LIFE DOMAINS - All areas Maya can help with
// ============================================================================

export const LIFE_DOMAINS: Record<LifeDomain, DomainDefinition> = {
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
  relationships: {
    name: 'Relationships',
    icon: '❤️',
    description: 'Family, friends, romantic, community connections',
    subdomains: ['family', 'friends', 'romantic', 'community', 'networking', 'communication'],
  },
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
  finance: {
    name: 'Financial Wellness',
    icon: '💰',
    description: 'Money habits, saving, investing, spending',
    subdomains: ['saving', 'budgeting', 'investing', 'debt', 'income', 'generosity'],
  },
  home: {
    name: 'Home & Environment',
    icon: '🏠',
    description: 'Living space, organization, sustainability',
    subdomains: ['cleaning', 'organization', 'maintenance', 'sustainability', 'cooking', 'garden'],
  },
  selfCare: {
    name: 'Self Care & Joy',
    icon: '✨',
    description: 'Rest, hobbies, fun, personal time',
    subdomains: ['rest', 'hobbies', 'entertainment', 'boundaries', 'self_compassion', 'adventure'],
  },
};

// ============================================================================
// LIFE STAGES - Different needs at different times
// ============================================================================

export const LIFE_STAGES: Record<LifeStage, StageDefinition> = {
  student: {
    name: 'Student',
    description: 'Focused on education and building foundations',
    priorities: ['learning', 'career', 'finance', 'relationships'],
    constraints: ['time_management', 'focus', 'budget_constraints', 'stress'],
    opportunities: ['habit_foundation', 'learning_capacity', 'flexibility'],
    keyHabits: ['study routine', 'budget tracking', 'sleep schedule', 'exercise'],
  },
  young_professional: {
    name: 'Young Professional',
    description: 'Building career and financial independence',
    priorities: ['career', 'finance', 'relationships', 'health'],
    constraints: ['work_life_balance', 'financial_foundation', 'identity'],
    opportunities: ['income_growth', 'skill_building', 'networking'],
    keyHabits: ['morning routine', 'savings automation', 'networking', 'learning'],
  },
  new_parent: {
    name: 'New Parent',
    description: 'Adapting to family life while maintaining self',
    priorities: ['relationships', 'health', 'selfCare', 'home'],
    constraints: ['sleep_deprivation', 'time_scarcity', 'identity_shift'],
    opportunities: ['family_bonding', 'perspective_shift', 'resilience'],
    keyHabits: ['micro-habits', 'self-care moments', 'partner check-ins', 'flexible routines'],
  },
  established_career: {
    name: 'Established Career',
    description: 'Peak earning years with growing responsibilities',
    priorities: ['career', 'finance', 'health', 'relationships'],
    constraints: ['burnout', 'stagnation', 'sandwich_generation'],
    opportunities: ['peak_earning', 'leadership', 'mentoring'],
    keyHabits: ['stress management', 'wealth building', 'health maintenance', 'delegation'],
  },
  caregiver: {
    name: 'Caregiver',
    description: 'Supporting others while maintaining yourself',
    priorities: ['relationships', 'selfCare', 'health', 'mind'],
    constraints: ['time_scarcity', 'emotional_load', 'isolation'],
    opportunities: ['purpose', 'deep_connection', 'resilience'],
    keyHabits: ['boundary setting', 'respite planning', 'support network', 'self-compassion'],
  },
  pre_retirement: {
    name: 'Pre-Retirement',
    description: 'Planning for the next chapter',
    priorities: ['finance', 'health', 'relationships', 'selfCare'],
    constraints: ['retirement_planning', 'health_optimization', 'meaning'],
    opportunities: ['wealth_building', 'legacy', 'bucket_list'],
    keyHabits: [
      'health optimization',
      'financial review',
      'hobby cultivation',
      'social investment',
    ],
  },
  retired: {
    name: 'Retired',
    description: 'Freedom to focus on what matters most',
    priorities: ['health', 'relationships', 'selfCare', 'learning'],
    constraints: ['structure', 'purpose', 'health_management', 'social'],
    opportunities: ['freedom', 'grandparenting', 'giving_back', 'travel'],
    keyHabits: ['daily structure', 'social engagement', 'health routines', 'purpose activities'],
  },
  life_transition: {
    name: 'Life Transition',
    description: 'Navigating major change',
    priorities: ['mind', 'selfCare', 'relationships', 'career'],
    constraints: ['uncertainty', 'stress', 'identity', 'planning'],
    opportunities: ['reinvention', 'fresh_start', 'clarity'],
    keyHabits: ['grounding practices', 'support seeking', 'small wins', 'self-compassion'],
  },
};

// ============================================================================
// FOUR TENDENCIES - Gretchen Rubin's personality framework
// ============================================================================

export const FOUR_TENDENCIES: Record<FourTendency, TendencyStrategy> = {
  upholder: {
    description:
      'You meet both outer expectations (from others) and inner expectations (from yourself). You love schedules, to-do lists, and clear rules.',
    motivators: ['Clear expectations', 'Rules and systems', 'Schedules', 'Self-discipline'],
    strategies: [
      'Set clear rules and schedules for yourself',
      'Create detailed to-do lists and check them off',
      'Use habit tracking apps religiously',
      'Set personal deadlines and honor them',
      'Create routines and stick to them',
    ],
    pitfalls: [
      "Don't be too rigid - allow for flexibility",
      'Watch out for "tightening" - making rules stricter over time',
      'Remember that rest and fun are also "productive"',
    ],
    habitApproach:
      'You respond to clear expectations. Put your habits on your calendar and treat them as non-negotiable appointments.',
    accountabilityStyle: 'Self-accountability works well; tracking and schedules are your friends.',
  },
  questioner: {
    description:
      'You question all expectations and only follow through if you have good reasons. You need to understand WHY before you commit.',
    motivators: ['Logic and reason', 'Research and data', 'Efficiency', 'Personal goals'],
    strategies: [
      'Research the science behind habits before starting',
      'Understand exactly WHY this habit matters',
      'Set your own goals based on your reasoning',
      'Question advice and customize to fit your logic',
      'Track data to prove the habit is working',
    ],
    pitfalls: [
      'Analysis paralysis - at some point, just start',
      'Questioning to the point of decision fatigue',
      "Rejecting good advice just because you didn't come up with it",
    ],
    habitApproach:
      "You need to buy into the WHY. Once you truly believe a habit serves your goals, you'll follow through. Do the research first.",
    accountabilityStyle:
      'Self-directed with data; external accountability only if it makes sense to you.',
  },
  obliger: {
    description:
      'You meet outer expectations (for others) but struggle with inner expectations (for yourself). You need external accountability.',
    motivators: [
      'Others depending on you',
      'Appointments and commitments',
      'Not letting people down',
      'Team membership',
    ],
    strategies: [
      'Get an accountability partner or coach',
      'Join a group or class with attendance expectations',
      "Make appointments you can't cancel",
      'Tell others about your goals publicly',
      'Set up external consequences (like charitable donations if you miss)',
    ],
    pitfalls: [
      'Obliger rebellion - pushing yourself too hard until you snap',
      "Saying yes to everyone else's needs before your own",
      'Feeling guilty for needing external accountability',
    ],
    habitApproach:
      "Your superpower is following through for others. Harness this by creating external accountability structures. This isn't weakness - it's self-knowledge.",
    accountabilityStyle:
      'External accountability is essential - partners, groups, coaches, public commitments.',
  },
  rebel: {
    description:
      'You resist ALL expectations, both outer and inner. You want to act from freedom and choice, doing things your way.',
    motivators: ['Freedom and choice', 'Identity', 'Challenge', 'Defying limitations'],
    strategies: [
      'Frame habits as choices, not rules ("I can" not "I must")',
      'Connect habits to your identity ("I\'m someone who...")',
      'Maintain freedom and options within the habit',
      'Challenge yourself to prove you CAN do it',
      'Make the habit feel like defiance of limitation',
    ],
    pitfalls: [
      "Don't set rigid rules - they'll trigger resistance",
      'Avoid tracking streaks - they feel like obligations',
      "Don't let others tell you what to do",
    ],
    habitApproach:
      'Frame every habit as YOUR choice that expresses who you are. "I\'m the kind of person who..." works better than any rule. You do things because you WANT to, not because you should.',
    accountabilityStyle:
      'Identity-based motivation; avoid external pressure which triggers resistance.',
  },
};

// ============================================================================
// GLIDEPATH LEVELS - Gradual habit building
// ============================================================================

export const GLIDEPATH_LEVELS = [
  {
    level: 1,
    name: 'Tiny',
    description: "2-minute version - so easy you can't say no",
    durationWeeks: 2,
    dailyCommitmentMinutes: 2,
  },
  {
    level: 2,
    name: 'Small',
    description: '5-minute version - building consistency',
    durationWeeks: 2,
    dailyCommitmentMinutes: 5,
  },
  {
    level: 3,
    name: 'Standard',
    description: '15-minute version - real practice',
    durationWeeks: 2,
    dailyCommitmentMinutes: 15,
  },
  {
    level: 4,
    name: 'Expanded',
    description: '30-minute version - full engagement',
    durationWeeks: 2,
    dailyCommitmentMinutes: 30,
  },
  {
    level: 5,
    name: 'Mastery',
    description: 'Full practice - habit is established',
    durationWeeks: 0, // ongoing
    dailyCommitmentMinutes: 30,
  },
];
