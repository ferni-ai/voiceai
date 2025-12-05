/**
 * Maya Habit Coach - Life Domains & Life Stages
 *
 * Defines all life domains Maya can help with and life stage configurations.
 */

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
// DOMAIN HELPERS
// ============================================================================

/**
 * Get domain by name
 */
export function getDomain(domain: LifeDomain) {
  return LIFE_DOMAINS[domain];
}

/**
 * Get stage by name
 */
export function getStage(stage: LifeStage) {
  return LIFE_STAGES[stage];
}

/**
 * Get all domain keys
 */
export function getAllDomains(): LifeDomain[] {
  return Object.keys(LIFE_DOMAINS) as LifeDomain[];
}

/**
 * Get all stage keys
 */
export function getAllStages(): LifeStage[] {
  return Object.keys(LIFE_STAGES) as LifeStage[];
}
