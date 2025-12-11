/**
 * Journey Service
 *
 * Business logic for user growth journey and seasonal milestones.
 * Extracted from monetization-routes.ts for clean architecture.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface JourneyMilestone {
  id: string;
  title: string;
  requirement: {
    type: 'conversations' | 'weeks-together' | 'goals-achieved';
    value: number;
  };
}

export interface Season {
  id: string;
  name: string;
  theme: string;
  description: string;
  startDate: string;
  endDate: string;
  companionPriceInCents: number;
  isActive: boolean;
}

export interface JourneyProgress {
  conversationCount: number;
  weeksTogetherCount: number;
  goalsAchievedCount: number;
}

// ============================================================================
// MILESTONE DEFINITIONS
// ============================================================================

export const JOURNEY_MILESTONES: readonly JourneyMilestone[] = [
  {
    id: 'first-chat',
    title: 'First Conversation',
    requirement: { type: 'conversations', value: 1 },
  },
  {
    id: 'five-chats',
    title: 'Five Conversations',
    requirement: { type: 'conversations', value: 5 },
  },
  {
    id: 'ten-chats',
    title: 'Ten Conversations',
    requirement: { type: 'conversations', value: 10 },
  },
  {
    id: 'twenty-chats',
    title: 'Twenty Conversations',
    requirement: { type: 'conversations', value: 20 },
  },
  {
    id: 'fifty-chats',
    title: 'Fifty Conversations',
    requirement: { type: 'conversations', value: 50 },
  },
  {
    id: 'week-one',
    title: 'One Week Together',
    requirement: { type: 'weeks-together', value: 1 },
  },
  {
    id: 'week-two',
    title: 'Two Weeks Together',
    requirement: { type: 'weeks-together', value: 2 },
  },
  {
    id: 'month-one',
    title: 'One Month Together',
    requirement: { type: 'weeks-together', value: 4 },
  },
  {
    id: 'first-goal',
    title: 'First Goal Achieved',
    requirement: { type: 'goals-achieved', value: 1 },
  },
  {
    id: 'three-goals',
    title: 'Three Goals Achieved',
    requirement: { type: 'goals-achieved', value: 3 },
  },
  {
    id: 'five-goals',
    title: 'Five Goals Achieved',
    requirement: { type: 'goals-achieved', value: 5 },
  },
] as const;

// ============================================================================
// BUSINESS LOGIC
// ============================================================================

/**
 * Get the current season based on date
 */
export function getCurrentSeason(): Season {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  let seasonName: string;
  let theme: string;
  let description: string;
  let startDate: string;
  let endDate: string;

  if (month >= 2 && month <= 4) {
    seasonName = 'Spring';
    theme = 'New Beginnings';
    description = 'A season for planting seeds and watching yourself grow.';
    startDate = `${year}-03-01`;
    endDate = `${year}-05-31`;
  } else if (month >= 5 && month <= 7) {
    seasonName = 'Summer';
    theme = 'Full Bloom';
    description = 'A season for flourishing and embracing the light.';
    startDate = `${year}-06-01`;
    endDate = `${year}-08-31`;
  } else if (month >= 8 && month <= 10) {
    seasonName = 'Fall';
    theme = 'Harvest';
    description = 'A season for gathering what you have grown.';
    startDate = `${year}-09-01`;
    endDate = `${year}-11-30`;
  } else {
    seasonName = 'Winter';
    theme = 'Rest & Reflection';
    description = 'A season for going inward and preparing for renewal.';
    const winterYear = month === 11 ? year : year - 1;
    startDate = `${winterYear}-12-01`;
    endDate = `${winterYear + 1}-02-28`;
  }

  const seasonId = `${seasonName.toLowerCase()}-${year}`;

  return {
    id: seasonId,
    name: seasonName,
    theme,
    description,
    startDate,
    endDate,
    companionPriceInCents: 499,
    isActive: true,
  };
}

/**
 * Check which milestones are newly achieved based on progress
 */
export function checkNewMilestones(
  progress: JourneyProgress,
  celebratedMilestones: string[]
): string[] {
  const newMilestones: string[] = [];

  for (const milestone of JOURNEY_MILESTONES) {
    if (celebratedMilestones.includes(milestone.id)) continue;

    let met = false;
    switch (milestone.requirement.type) {
      case 'conversations':
        met = progress.conversationCount >= milestone.requirement.value;
        break;
      case 'weeks-together':
        met = progress.weeksTogetherCount >= milestone.requirement.value;
        break;
      case 'goals-achieved':
        met = progress.goalsAchievedCount >= milestone.requirement.value;
        break;
    }

    if (met) {
      newMilestones.push(milestone.id);
    }
  }

  return newMilestones;
}

/**
 * Get a milestone by ID
 */
export function getMilestoneById(id: string): JourneyMilestone | undefined {
  return JOURNEY_MILESTONES.find((m) => m.id === id);
}

/**
 * Calculate weeks together from start date
 */
export function calculateWeeksTogether(startDate: Date): number {
  const now = new Date();
  const diffMs = now.getTime() - startDate.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks;
}
