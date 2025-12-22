/**
 * Music Dashboard - Modular Components
 *
 * This module provides the building blocks for the Musical You dashboard.
 * The main dashboard UI is in the parent directory (music-dashboard.ui.ts)
 * and imports from these modules.
 */

// Types
export type {
  PersonalitySummary,
  AffinityDisplay,
  MilestoneDisplay,
  MemorableMoment,
  JourneyStats,
  PersonaPlayStats,
  MusicInsights,
  DailyChallenge,
  DailyChallengeProgress,
  TimeMachineEntry,
  LeaderboardRank,
  SocialStats,
  MusicSource,
  MusicSources,
  MusicalYouProfile,
  MusicDashboardUICallbacks,
  MusicKitType,
} from './types.js';

// Icons
export { ICONS } from './icons.js';

// Re-export the main dashboard from parent directory for backward compatibility
// Usage: import { musicDashboard, showMusicDashboard } from './music-dashboard/index.js';
// Or: import { musicDashboard } from './music-dashboard.ui.js'; (original path)

