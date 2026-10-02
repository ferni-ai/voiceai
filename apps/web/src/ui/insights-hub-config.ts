/**
 * Insights hub - tab data types and icons. Extracted from insights-hub.ui.ts.
 */

import type {
  SeasonData,
  ConversationTopic,
  MirrorInsight,
  EnergyNode,
  EnergyFlow,
  GrowthRing,
  ValueAlignment,
  UnfinishedStory,
  RippleEffect,
} from './storytelling-visualizations.js';

export type InsightTab =
  | 'journey'
  | 'analytics'
  | 'predictions'
  | 'wellbeing'
  | 'team'
  | 'context'
  | 'stories';

export interface InsightsHubCallbacks {
  onClose?: () => void;
}

// Journey API response
export interface JourneyData {
  presence?: {
    weather: string;
    energy: 'high' | 'medium' | 'low';
    note?: string;
  };
  noticing?: Array<{
    type: 'pattern' | 'growth' | 'concern' | 'celebration' | 'memory';
    insight: string;
    evidence?: string;
  }>;
  chapter?: {
    title: string;
    type: string;
    duration?: string;
  };
  holding?: {
    commitments?: Array<{ text: string; daysAgo: number }>;
    dreams?: Array<{ dream: string; status: string }>;
    upcomingDates?: Array<{ name: string; daysUntil: number }>;
  };
  growth?: {
    message: string;
    details?: string;
  };
  relationship?: {
    daysTogether: number;
    conversations: number;
    milestone?: string;
  };
}

// Analytics API response
export interface AnalyticsData {
  totalDays: number;
  totalRituals: number;
  currentLongestStreak: number;
  averageMood: number;
  predictionAccuracy: number | null;
  moodTrends: Array<{ date: string; mood: string; energy: string }>;
  bestDay: string | null;
  mostConsistentRitual: string | null;
  improvementAreas: string[];
}

// Predictions API response
export interface PredictionsData {
  insights: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    suggestion?: string;
    priority: string;
    confidence?: number;
  }>;
  count: number;
}

// Wellbeing API response
export interface WellbeingData {
  currentState: {
    mood: number;
    energy: number;
    anxiety: number;
    connection: number;
    purpose: number;
    sleep: number;
    lastUpdated: string;
  };
  trends: {
    direction: 'improving' | 'stable' | 'declining';
    changedDimensions: string[];
  };
  insights: Array<{
    type: string;
    message: string;
    dimension?: string;
  }>;
  streaks: {
    currentDays: number;
    bestDays: number;
  };
}

// Team Insights API response
export interface TeamInsightsData {
  insights: Array<{
    id: string;
    source: string;
    category: string;
    summary: string;
    content: string;
    priority: string;
    isNew?: boolean;
  }>;
  teamStatus: {
    financialHealth?: { budgetOnTrack: boolean; savingsProgress: number };
    habitHealth?: { activeHabits: number; totalStreakDays: number };
    goalHealth?: { activeGoals: number; nearingCompletion: number };
  };
}

// Stories tab data - aggregates data for storytelling visualizations
// Note: These interfaces match the visualization component expectations
export interface StoriesData {
  lifeSeasons: SeasonData[] | null;
  conversationRiver: ConversationTopic[] | null;
  mirror: MirrorInsight[] | null;
  energyFlow: { nodes: EnergyNode[]; flows: EnergyFlow[] } | null;
  growthRings: GrowthRing[] | null;
  valuesAlignment: ValueAlignment[] | null;
  unfinishedStories: UnfinishedStory[] | null;
  rippleEffects: RippleEffect | null;
}

// Tab data cache
export interface TabDataCache {
  journey?: JourneyData;
  analytics?: AnalyticsData;
  predictions?: PredictionsData;
  wellbeing?: WellbeingData;
  team?: TeamInsightsData;
  context?: Record<string, unknown>;
  stories?: StoriesData;
}

// ============================================================================
// ICONS
// ============================================================================

export const ICONS = {
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  journey:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  analytics:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M7 16c0-4 1-8 4-10s5 2 6 6c1 4 2 4 4 4"/></svg>',
  predictions:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  wellbeing:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
  context:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 12-8.58 3.91a2 2 0 0 1-1.66 0L2.18 12"/><path d="m22 17-8.58 3.91a2 2 0 0 1-1.66 0L2.18 17"/></svg>',
  // Stories icon - represents narrative/book for storytelling visualizations
  stories:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8"/><path d="M8 11h6"/></svg>',
};
