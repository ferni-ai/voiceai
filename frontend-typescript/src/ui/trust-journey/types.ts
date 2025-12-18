/**
 * Trust Journey Types
 *
 * Type definitions for the Trust Journey UI feature.
 */

/**
 * Growth pattern data from the backend
 * Note: Backend sends `significance`, we map it to `count` for display
 */
export interface GrowthPattern {
  type: string;
  count: number;
  significance?: string;
  // Legacy fields (kept for backwards compatibility)
  mostRecent?: string | null;
  examples?: string[];
}

export interface GrowthReflection {
  id: string;
  date: string;
  type: string;
  observation: string;
  surfacedToUser: boolean;
}

export interface InsideJoke {
  id: string;
  type: string;
  hint: string;
  firstMentioned?: string;
  timesReferenced?: number;
  callbackCount?: number;
}

export interface Win {
  id: string;
  date?: string;
  type: string;
  whatHappened?: string;
  description?: string;
  celebrationUsed?: string | null;
  celebrated?: boolean;
}

export interface TimelineItem {
  date: string;
  type: 'growth' | 'boundary' | 'win' | 'callback' | 'outreach';
  title: string;
  description: string;
}

export interface TrustJourneyData {
  userId: string;
  generatedAt: string;
  summary: {
    relationshipStrength: number;
    trustSignalsDetected: number;
    boundariesRespected: number;
    growthMomentsNoticed: number;
    sharedMomentsCount: number;
    winsCelebrated: number;
    proactiveOutreach: number;
  };
  growth: {
    patterns: GrowthPattern[];
    reflections?: GrowthReflection[];
  };
  boundaries: {
    totalBoundaries: number;
    typeCounts: Record<string, number>;
    message: string;
  };
  sharedHistory: {
    insideJokes: InsideJoke[];
    runningGags: number;
  };
  celebrations: {
    wins: Win[];
    intentionsTracked: number;
  };
  timeline: TimelineItem[];
}

export type TimelineFilterType = 'all' | 'growth' | 'win' | 'callback' | 'boundary' | 'outreach';

export interface TrustJourneyState {
  isInitialized: boolean;
  journeyPanel: HTMLElement | null;
  styleElement: HTMLStyleElement | null;
  cachedData: TrustJourneyData | null;
  isLoading: boolean;
  error: string | null;
  timelineOffset: number;
  timelineFilter: TimelineFilterType;
  focusCleanup: (() => void) | null;
}

