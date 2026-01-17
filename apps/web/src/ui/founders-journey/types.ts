/**
 * Founders Journey - Types
 *
 * TypeScript interfaces used throughout the founders journey UI.
 */

import type {
  Founder,
  FounderStats,
  FounderStory,
  CommunityMilestone,
  PersonalImpact,
} from '../../services/founders.service.js';

// Re-export for convenience
export type { Founder, FounderStats, FounderStory, CommunityMilestone, PersonalImpact };

/**
 * Journey milestone for the timeline
 */
export interface JourneyMilestone {
  id: string;
  date: string;
  title: string;
  description: string;
  type: 'past' | 'present' | 'future';
  icon: string;
}

/**
 * Section types for tab navigation
 */
export type SectionType = 'vision' | 'now' | 'future' | 'impact' | 'founders';

/**
 * Cached data from API calls
 */
export interface CachedFoundersData {
  stats: FounderStats | null;
  founders: Founder[];
  stories: FounderStory[];
  milestones: CommunityMilestone[];
  personalImpact: PersonalImpact | null;
}

