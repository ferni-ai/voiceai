/**
 * Engagement Demo Data Service
 *
 * Provides sample data for testing engagement panels when not connected to backend.
 * This allows the UI to be demonstrated and tested without a live conversation.
 */

import type { EngagementData, RitualStreakData, EmotionalWeatherData } from '../ui/engagement.ui.js';
import type { PredictionData } from './engagement.service.js';
import type { TeamHuddleData, TeamHuddleParticipant } from '../ui/team-huddle.ui.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('DemoData');

// ============================================================================
// DEMO RITUAL STREAKS
// ============================================================================

export const DEMO_RITUAL_STREAKS: RitualStreakData[] = [
  {
    ritualId: 'morning-sky',
    ritualName: 'Morning Sky Check',
    personaId: 'ferni',
    currentStreak: 12,
    longestStreak: 18,
    lastCompletedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // yesterday
    dueToday: true,
  },
  {
    ritualId: 'daily-priority',
    ritualName: 'Daily Priority',
    personaId: 'alex-chen',
    currentStreak: 7,
    longestStreak: 14,
    lastCompletedAt: new Date().toISOString(),
    dueToday: false,
  },
  {
    ritualId: 'tiny-habit',
    ritualName: 'Two-Minute Tiny Habit',
    personaId: 'maya-santos',
    currentStreak: 21,
    longestStreak: 21,
    lastCompletedAt: new Date().toISOString(),
    dueToday: false,
  },
  {
    ritualId: 'presence-pause',
    ritualName: 'Presence Pause',
    personaId: 'nayan-patel',
    currentStreak: 3,
    longestStreak: 8,
    lastCompletedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    dueToday: true,
  },
  {
    ritualId: 'pattern-detective',
    ritualName: 'Daily Pattern Detective',
    personaId: 'peter-john',
    currentStreak: 0,
    longestStreak: 5,
    lastCompletedAt: null,
    dueToday: true,
  },
];

// ============================================================================
// DEMO EMOTIONAL WEATHER
// ============================================================================

export const DEMO_WEATHER_HISTORY: EmotionalWeatherData[] = [
  {
    primary: 'sunny',
    energy: 'high',
    note: 'Great morning energy, ready to tackle the day',
    recordedAt: new Date().toISOString(),
  },
  {
    primary: 'partly-cloudy',
    energy: 'medium',
    note: 'Feeling okay, some anxiety about upcoming meeting',
    recordedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    primary: 'cloudy',
    energy: 'low',
    note: 'Tired from late night, need to rest more',
    recordedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    primary: 'sunny',
    energy: 'high',
    note: 'Weekend vibes, feeling refreshed',
    recordedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    primary: 'partly-cloudy',
    energy: 'medium',
    note: 'Normal day, productive morning',
    recordedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    primary: 'rainy',
    energy: 'low',
    note: 'Difficult conversation yesterday, processing',
    recordedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    primary: 'sunny',
    energy: 'medium',
    note: 'Steady day, making progress',
    recordedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// ============================================================================
// DEMO PREDICTIONS
// ============================================================================

export const DEMO_PREDICTIONS: PredictionData[] = [
  {
    id: 'pred-001',
    category: 'wellbeing',
    question: 'How confident will I feel after completing the presentation?',
    userPrediction: 75,
    actualOutcome: 85,
    status: 'resolved',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    resolvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'pred-002',
    category: 'habits',
    question: 'Will I maintain my morning routine this week?',
    userPrediction: 60,
    actualOutcome: 70,
    status: 'resolved',
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    resolvedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'pred-003',
    category: 'relationships',
    question: 'How will the difficult conversation with my manager go?',
    userPrediction: 50,
    status: 'pending',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'pred-004',
    category: 'career',
    question: 'Will I finish the project milestone on time?',
    userPrediction: 80,
    status: 'pending',
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'pred-005',
    category: 'wellbeing',
    question: 'How rested will I feel after implementing better sleep habits?',
    userPrediction: 70,
    actualOutcome: 60,
    status: 'resolved',
    createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
    resolvedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// ============================================================================
// DEMO ENGAGEMENT DATA (COMBINED)
// ============================================================================

export function getDemoEngagementData(): EngagementData {
  return {
    ritualStreaks: DEMO_RITUAL_STREAKS,
    weatherHistory: DEMO_WEATHER_HISTORY,
    stats: {
      totalRitualDays: 43,
      longestOverallStreak: 21,
      currentActiveStreaks: 3,
      predictionAccuracy: 78,
      teamHuddlesAttended: 4,
    },
    lastEngagementAt: new Date().toISOString(),
  };
}

export function getDemoPredictions(): PredictionData[] {
  return DEMO_PREDICTIONS;
}

/**
 * Calculate prediction accuracy from demo data
 */
export function calculateDemoPredictionAccuracy(): number | null {
  const resolved = DEMO_PREDICTIONS.filter(p => p.status === 'resolved' && p.actualOutcome !== undefined);
  if (resolved.length === 0) return null;

  let totalError = 0;
  for (const pred of resolved) {
    totalError += Math.abs(pred.userPrediction - (pred.actualOutcome || 0));
  }

  const avgError = totalError / resolved.length;
  return Math.max(0, Math.round(100 - avgError));
}

// ============================================================================
// DEMO TEAM HUDDLES
// ============================================================================

const DEMO_TEAM_HUDDLE_PARTICIPANTS: TeamHuddleParticipant[] = [
  {
    personaId: 'ferni',
    name: 'Ferni',
    initials: 'F',
    comment: "I've watched you grow. The person I'm talking to now has more confidence than a month ago.",
    avatarColor: '#3d5a35',
  },
  {
    personaId: 'alex-chen',
    name: 'Alex Chen',
    initials: 'AC',
    comment: 'Your calendar discipline has improved. I see fewer scattered meetings.',
    avatarColor: '#4a6b8a',
  },
  {
    personaId: 'maya-santos',
    name: 'Maya Santos',
    initials: 'MS',
    comment: 'Compound and Interest are proud. Your habit consistency is up this week.',
    avatarColor: '#8b6b5a',
  },
];

export const DEMO_TEAM_HUDDLES: TeamHuddleData[] = [
  {
    id: 'demo-huddle-weekly',
    title: 'Weekly Team Check-in',
    intro: "The team wanted to check in on your week. Here's what they're noticing about your progress:",
    participants: DEMO_TEAM_HUDDLE_PARTICIPANTS,
    outro: "That's the team's take. What stands out to you?",
    scheduledAt: new Date().toISOString(),
    type: 'weekly',
  },
  {
    id: 'demo-huddle-milestone',
    title: 'Milestone Celebration',
    intro: "We noticed something worth celebrating. The whole team wanted to acknowledge your progress:",
    participants: [
      {
        personaId: 'ferni',
        name: 'Ferni',
        initials: 'F',
        comment: "21 days of showing up. That's not luck—that's character.",
        avatarColor: '#3d5a35',
      },
      {
        personaId: 'jordan-taylor',
        name: 'Jordan Taylor',
        initials: 'JT',
        comment: "Looking at your life arc—you're in a growth chapter. Lean into it.",
        avatarColor: '#7a5a5a',
      },
      {
        personaId: 'peter-john',
        name: 'Peter John',
        initials: 'PJ',
        comment: "The data tells a story: your energy correlates with your morning routine quality.",
        avatarColor: '#4a7a7a',
      },
    ],
    outro: "Milestones matter. Take a moment to acknowledge how far you've come.",
    scheduledAt: new Date().toISOString(),
    type: 'milestone',
  },
];

/**
 * Get a demo team huddle (weekly check-in by default)
 */
export function getDemoTeamHuddle(type: 'weekly' | 'milestone' | 'special' = 'weekly'): TeamHuddleData {
  const huddle = DEMO_TEAM_HUDDLES.find(h => h.type === type) ?? DEMO_TEAM_HUDDLES[0];
  // Assert non-null since we have a fallback
  const baseHuddle = huddle as TeamHuddleData;
  return {
    id: baseHuddle.id,
    title: baseHuddle.title,
    intro: baseHuddle.intro,
    participants: baseHuddle.participants,
    outro: baseHuddle.outro,
    type: baseHuddle.type,
    scheduledAt: new Date().toISOString(),
  };
}

/**
 * Get all demo team huddles
 */
export function getDemoTeamHuddles(): TeamHuddleData[] {
  return DEMO_TEAM_HUDDLES.map(h => ({
    ...h,
    scheduledAt: new Date().toISOString(),
  }));
}

// ============================================================================
// DEMO DATA LOADER
// ============================================================================

let useDemoData = false;

/**
 * Enable demo data mode (for testing without backend)
 */
export function enableDemoData(): void {
  useDemoData = true;
  log.debug('[EngagementDemo] Demo data mode enabled');
}

/**
 * Disable demo data mode
 */
export function disableDemoData(): void {
  useDemoData = false;
  log.debug('[EngagementDemo] Demo data mode disabled');
}

/**
 * Check if demo data mode is enabled
 */
export function isDemoDataEnabled(): boolean {
  return useDemoData;
}

export default {
  getDemoEngagementData,
  getDemoPredictions,
  calculateDemoPredictionAccuracy,
  getDemoTeamHuddle,
  getDemoTeamHuddles,
  enableDemoData,
  disableDemoData,
  isDemoDataEnabled,
};

