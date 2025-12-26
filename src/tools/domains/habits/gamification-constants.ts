/**
 * Gamification Constants
 *
 * Badge definitions and title progression for the gamification system.
 * These constants are shared between gamification v1 (legacy) and v2.
 *
 * @module habits/gamification-constants
 */

// ============================================================================
// BADGE SYSTEM
// ============================================================================

export interface Badge {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: BadgeCategory;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  earnedAt?: Date;
  progress?: number; // 0-100 for in-progress badges
  requirement: string;
}

export type BadgeCategory =
  | 'streaks' // Consistency badges
  | 'milestones' // Achievement milestones
  | 'challenges' // Challenge completion
  | 'domains' // Life domain mastery
  | 'behavior_science' // Using the frameworks
  | 'comebacks' // Resilience badges
  | 'social' // Accountability & connection
  | 'special'; // Rare/seasonal badges

export const BADGE_DEFINITIONS: Badge[] = [
  // =========== STREAK BADGES ===========
  {
    id: 'first_streak',
    name: 'Streak Starter',
    emoji: '🔥',
    description: 'Complete your first 3-day streak',
    category: 'streaks',
    rarity: 'common',
    requirement: '3-day streak on any habit',
  },
  {
    id: 'week_warrior',
    name: 'Week Warrior',
    emoji: '⚔️',
    description: 'Complete a 7-day streak',
    category: 'streaks',
    rarity: 'common',
    requirement: '7-day streak on any habit',
  },
  {
    id: 'fortnight_fighter',
    name: 'Fortnight Fighter',
    emoji: '🛡️',
    description: 'Complete a 14-day streak',
    category: 'streaks',
    rarity: 'uncommon',
    requirement: '14-day streak on any habit',
  },
  {
    id: 'habit_former',
    name: 'Habit Former',
    emoji: '🧠',
    description: 'Complete a 21-day streak (habits are forming!)',
    category: 'streaks',
    rarity: 'uncommon',
    requirement: '21-day streak on any habit',
  },
  {
    id: 'monthly_master',
    name: 'Monthly Master',
    emoji: '📅',
    description: 'Complete a 30-day streak',
    category: 'streaks',
    rarity: 'rare',
    requirement: '30-day streak on any habit',
  },
  {
    id: 'automaticity_achieved',
    name: 'Automaticity Achieved',
    emoji: '⚡',
    description: '66 days - the habit is now automatic',
    category: 'streaks',
    rarity: 'epic',
    requirement: '66-day streak (research-backed automaticity)',
  },
  {
    id: 'century_club',
    name: 'Century Club',
    emoji: '💯',
    description: '100 days of consistency',
    category: 'streaks',
    rarity: 'epic',
    requirement: '100-day streak on any habit',
  },
  {
    id: 'year_of_showing_up',
    name: 'Year of Showing Up',
    emoji: '🏅',
    description: '365 days. One full year.',
    category: 'streaks',
    rarity: 'legendary',
    requirement: '365-day streak on any habit',
  },

  // =========== MILESTONE BADGES ===========
  {
    id: 'first_habit',
    name: 'First Steps',
    emoji: '👣',
    description: 'Create your first habit',
    category: 'milestones',
    rarity: 'common',
    requirement: 'Create first habit',
  },
  {
    id: 'habit_collector',
    name: 'Habit Collector',
    emoji: '📚',
    description: 'Create 5 different habits',
    category: 'milestones',
    rarity: 'uncommon',
    requirement: '5 habits created',
  },
  {
    id: 'habit_architect',
    name: 'Habit Architect',
    emoji: '🏗️',
    description: 'Create 10 different habits',
    category: 'milestones',
    rarity: 'rare',
    requirement: '10 habits created',
  },
  {
    id: 'level_up',
    name: 'Level Up!',
    emoji: '📈',
    description: 'Advance a habit to Level 2',
    category: 'milestones',
    rarity: 'uncommon',
    requirement: 'Reach Level 2 on any habit',
  },
  {
    id: 'established',
    name: 'Established',
    emoji: '🌳',
    description: 'Advance a habit to Level 4',
    category: 'milestones',
    rarity: 'rare',
    requirement: 'Reach Level 4 on any habit',
  },
  {
    id: 'lifestyle_integration',
    name: 'Lifestyle Integration',
    emoji: '✨',
    description: 'Reach Level 5 - full mastery',
    category: 'milestones',
    rarity: 'epic',
    requirement: 'Reach Level 5 on any habit',
  },
  {
    id: 'completionist',
    name: 'Completionist',
    emoji: '🎯',
    description: 'Complete 100 habit check-ins',
    category: 'milestones',
    rarity: 'uncommon',
    requirement: '100 total habit completions',
  },
  {
    id: 'thousand_club',
    name: 'Thousand Club',
    emoji: '🌟',
    description: 'Complete 1,000 habit check-ins',
    category: 'milestones',
    rarity: 'legendary',
    requirement: '1,000 total habit completions',
  },

  // =========== CHALLENGE BADGES ===========
  {
    id: 'challenger',
    name: 'Challenger',
    emoji: '🎪',
    description: 'Start your first 30-day challenge',
    category: 'challenges',
    rarity: 'common',
    requirement: 'Start a 30-day challenge',
  },
  {
    id: 'challenge_week_one',
    name: 'Week One Wonder',
    emoji: '🌱',
    description: 'Complete the first week of a challenge',
    category: 'challenges',
    rarity: 'common',
    requirement: 'Complete week 1 of any challenge',
  },
  {
    id: 'challenge_halfway',
    name: 'Halfway Hero',
    emoji: '⛰️',
    description: 'Reach day 15 of a challenge',
    category: 'challenges',
    rarity: 'uncommon',
    requirement: 'Reach halfway in any challenge',
  },
  {
    id: 'challenge_complete',
    name: 'Challenge Champion',
    emoji: '🏆',
    description: 'Complete a full 30-day challenge',
    category: 'challenges',
    rarity: 'rare',
    requirement: 'Complete any 30-day challenge',
  },
  {
    id: 'challenge_master',
    name: 'Challenge Master',
    emoji: '👑',
    description: 'Complete 3 different challenges',
    category: 'challenges',
    rarity: 'epic',
    requirement: 'Complete 3 different 30-day challenges',
  },
  {
    id: 'transformation_complete',
    name: 'Total Transformation',
    emoji: '🦋',
    description: 'Complete 5 different challenges',
    category: 'challenges',
    rarity: 'legendary',
    requirement: 'Complete 5 different 30-day challenges',
  },

  // =========== LIFE DOMAIN BADGES ===========
  {
    id: 'health_explorer',
    name: 'Health Explorer',
    emoji: '💪',
    description: 'Start a habit in the Health domain',
    category: 'domains',
    rarity: 'common',
    requirement: 'Create health domain habit',
  },
  {
    id: 'mind_explorer',
    name: 'Mind Explorer',
    emoji: '🧘',
    description: 'Start a habit in the Mind domain',
    category: 'domains',
    rarity: 'common',
    requirement: 'Create mind domain habit',
  },
  {
    id: 'relationship_builder',
    name: 'Relationship Builder',
    emoji: '❤️',
    description: 'Start a habit in the Relationships domain',
    category: 'domains',
    rarity: 'common',
    requirement: 'Create relationships domain habit',
  },
  {
    id: 'domain_dabbler',
    name: 'Domain Dabbler',
    emoji: '🎨',
    description: 'Have habits in 3 different life domains',
    category: 'domains',
    rarity: 'uncommon',
    requirement: 'Habits in 3 different domains',
  },
  {
    id: 'well_rounded',
    name: 'Well Rounded',
    emoji: '🌈',
    description: 'Have habits in 5 different life domains',
    category: 'domains',
    rarity: 'rare',
    requirement: 'Habits in 5 different domains',
  },
  {
    id: 'life_master',
    name: 'Life Master',
    emoji: '🌍',
    description: 'Have habits in all 8 life domains',
    category: 'domains',
    rarity: 'legendary',
    requirement: 'Habits in all 8 life domains',
  },

  // =========== BEHAVIOR SCIENCE BADGES ===========
  {
    id: 'tendency_aware',
    name: 'Know Thyself',
    emoji: '🎭',
    description: 'Discover your Four Tendencies type',
    category: 'behavior_science',
    rarity: 'uncommon',
    requirement: 'Complete Four Tendencies assessment',
  },
  {
    id: 'identity_shifter',
    name: 'Identity Shifter',
    emoji: '🦋',
    description: 'Create an identity shift',
    category: 'behavior_science',
    rarity: 'uncommon',
    requirement: 'Start an identity-based habit change',
  },
  {
    id: 'environment_architect',
    name: 'Environment Architect',
    emoji: '🏠',
    description: 'Design your environment for success',
    category: 'behavior_science',
    rarity: 'uncommon',
    requirement: 'Complete environment design',
  },
  {
    id: 'habit_stacker',
    name: 'Habit Stacker',
    emoji: '📚',
    description: 'Create your first habit stack',
    category: 'behavior_science',
    rarity: 'uncommon',
    requirement: 'Create a habit stack',
  },
  {
    id: 'temptation_tamer',
    name: 'Temptation Tamer',
    emoji: '🎁',
    description: 'Create a temptation bundle',
    category: 'behavior_science',
    rarity: 'uncommon',
    requirement: 'Create a temptation bundle',
  },
  {
    id: 'behavior_scientist',
    name: 'Behavior Scientist',
    emoji: '🔬',
    description: 'Use 5 different behavior science tools',
    category: 'behavior_science',
    rarity: 'rare',
    requirement: 'Use 5 behavior science tools',
  },
  {
    id: 'habit_hacker',
    name: 'Habit Hacker',
    emoji: '💻',
    description: 'Successfully break a bad habit',
    category: 'behavior_science',
    rarity: 'rare',
    requirement: 'Complete bad habit substitution',
  },

  // =========== COMEBACK BADGES ===========
  {
    id: 'the_return',
    name: 'The Return',
    emoji: '🔙',
    description: 'Come back after 7+ days away',
    category: 'comebacks',
    rarity: 'uncommon',
    requirement: 'Return after extended absence',
  },
  {
    id: 'streak_phoenix',
    name: 'Streak Phoenix',
    emoji: '🐦‍🔥',
    description: 'Rebuild a streak after breaking one',
    category: 'comebacks',
    rarity: 'uncommon',
    requirement: 'Rebuild a broken streak',
  },
  {
    id: 'never_give_up',
    name: 'Never Give Up',
    emoji: '💪',
    description: 'Restart a habit 3+ times',
    category: 'comebacks',
    rarity: 'rare',
    requirement: 'Restart same habit multiple times',
  },
  {
    id: 'resilience_master',
    name: 'Resilience Master',
    emoji: '🛡️',
    description: 'Successfully recover from 5 setbacks',
    category: 'comebacks',
    rarity: 'epic',
    requirement: 'Recover from 5 different setbacks',
  },

  // =========== SOCIAL BADGES ===========
  {
    id: 'accountable',
    name: 'Accountable',
    emoji: '🤝',
    description: 'Set up an accountability system',
    category: 'social',
    rarity: 'uncommon',
    requirement: 'Create accountability system',
  },
  {
    id: 'reflector',
    name: 'Reflector',
    emoji: '📝',
    description: 'Complete your first weekly reflection',
    category: 'social',
    rarity: 'common',
    requirement: 'Complete weekly reflection',
  },
  {
    id: 'consistent_reflector',
    name: 'Consistent Reflector',
    emoji: '📖',
    description: 'Complete 4 weekly reflections in a row',
    category: 'social',
    rarity: 'rare',
    requirement: '4 consecutive weekly reflections',
  },

  // =========== SPECIAL BADGES ===========
  {
    id: 'early_bird',
    name: 'Early Bird',
    emoji: '🌅',
    description: 'Complete a habit before 6am',
    category: 'special',
    rarity: 'uncommon',
    requirement: 'Complete habit before 6am',
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    emoji: '🦉',
    description: 'Complete a habit after 11pm',
    category: 'special',
    rarity: 'uncommon',
    requirement: 'Complete habit after 11pm',
  },
  {
    id: 'weekend_warrior',
    name: 'Weekend Warrior',
    emoji: '🎉',
    description: 'Maintain habits on 4 consecutive weekends',
    category: 'special',
    rarity: 'rare',
    requirement: 'Habits on 4 weekends in a row',
  },
  {
    id: 'new_year_new_you',
    name: 'New Year, New You',
    emoji: '🎆',
    description: 'Start a habit in January',
    category: 'special',
    rarity: 'uncommon',
    requirement: 'Create habit in January',
  },
  {
    id: 'fresh_start',
    name: 'Fresh Start',
    emoji: '🌱',
    description: 'Start a habit on a Monday',
    category: 'special',
    rarity: 'common',
    requirement: 'Create habit on Monday',
  },
];

// ============================================================================
// TITLE SYSTEM - Evolving titles based on progress
// ============================================================================

export interface UserTitle {
  id: string;
  name: string;
  emoji: string;
  description: string;
  requirement: string;
  tier: number; // 1-10, higher = more prestigious
}

export const TITLE_PROGRESSION: UserTitle[] = [
  {
    id: 'newcomer',
    name: 'Newcomer',
    emoji: '🌱',
    description: 'Just starting the journey',
    requirement: 'Start using Maya',
    tier: 1,
  },
  {
    id: 'habit_seeker',
    name: 'Habit Seeker',
    emoji: '🔍',
    description: 'Exploring what habits to build',
    requirement: 'Create first habit',
    tier: 2,
  },
  {
    id: 'habit_starter',
    name: 'Habit Starter',
    emoji: '🚀',
    description: 'Beginning to build habits',
    requirement: '7-day streak on any habit',
    tier: 3,
  },
  {
    id: 'habit_builder',
    name: 'Habit Builder',
    emoji: '🏗️',
    description: 'Actively building new habits',
    requirement: '21-day streak or 3 habits',
    tier: 4,
  },
  {
    id: 'habit_practitioner',
    name: 'Habit Practitioner',
    emoji: '🎯',
    description: 'Practicing the art of habits',
    requirement: '30-day streak or habit at Level 3',
    tier: 5,
  },
  {
    id: 'habit_journeyman',
    name: 'Habit Journeyman',
    emoji: '🛤️',
    description: 'Well on the path',
    requirement: '66-day streak or 2 habits at Level 4',
    tier: 6,
  },
  {
    id: 'habit_expert',
    name: 'Habit Expert',
    emoji: '⭐',
    description: 'Deep understanding of habits',
    requirement: 'Complete a challenge + habit at Level 5',
    tier: 7,
  },
  {
    id: 'habit_master',
    name: 'Habit Master',
    emoji: '🏆',
    description: 'Mastered the art of habit building',
    requirement: '100-day streak + 3 challenges completed',
    tier: 8,
  },
  {
    id: 'habit_sage',
    name: 'Habit Sage',
    emoji: '🧙',
    description: 'Wise in the ways of behavior change',
    requirement: '365-day streak or 5 habits at Level 5',
    tier: 9,
  },
  {
    id: 'habit_legend',
    name: 'Habit Legend',
    emoji: '👑',
    description: 'A true legend of habit mastery',
    requirement: 'All domains covered + multiple year-long habits',
    tier: 10,
  },
];
