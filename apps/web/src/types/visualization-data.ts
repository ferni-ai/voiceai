/**
 * Visualization data shapes: the cross-platform contract between the
 * /api/insights and Your Story endpoints, the web visualization builders,
 * and the native renderers. Re-exported by ui/visualizations/types.ts.
 *
 * @module types/visualization-data
 */

/**
 * Mood entry for calendar visualization.
 */
export interface MoodEntry {
  date: string; // ISO date (YYYY-MM-DD)
  mood: MoodType;
  intensity: number; // 0-1
  note?: string;
}

export type MoodType =
  | 'calm'
  | 'joyful'
  | 'anxious'
  | 'tired'
  | 'focused'
  | 'reflective'
  | 'stressed'
  | 'energized'
  | 'peaceful'
  | 'uncertain'
  // The mood words the server records (superhuman/mood-calendar)
  | 'content'
  | 'neutral'
  | 'sad'
  | 'frustrated'
  | 'overwhelmed'
  | 'exhausted'
  | 'hopeful';

/**
 * Mood calendar data.
 */
export interface MoodCalendarData {
  entries: MoodEntry[];
  summary: {
    dominantMood: MoodType;
    calmDays: number;
    /** Only when there are enough days to tell */
    trend?: 'improving' | 'stable' | 'declining';
  };
  period?: 'week' | 'month' | 'quarter';
}

/**
 * Burnout/capacity gauge data.
 */
export interface BurnoutGaugeData {
  /** Current capacity percentage (0-100) */
  capacity: number;
  /** Trend over time */
  trend: 'recovering' | 'stable' | 'declining';
  /** Status label */
  status: 'thriving' | 'balanced' | 'stretched' | 'depleted' | 'critical';
  /** Contributing factors */
  factors: {
    emotional: number;
    mental: number;
    physical: number;
  };
  /** When data was last updated */
  updatedAt: string;
}

/**
 * Life timeline chapter.
 */
export interface TimelineChapter {
  id: string;
  title: string;
  type: 'growth' | 'challenge' | 'transition' | 'celebration' | 'reflection';
  startDate: string;
  endDate?: string;
  isActive: boolean;
  /** 0-1, only when something measures it */
  progress?: number;
  summary?: string;
}

/**
 * Life timeline data.
 */
export interface LifeTimelineData {
  chapters: TimelineChapter[];
  currentChapter: TimelineChapter;
  totalChapters: number;
  narrativeSummary?: string;
}

/**
 * Growth radar dimension.
 */
export interface GrowthDimension {
  name: string;
  value: number; // 0-1
  previousValue?: number;
  trend: 'growing' | 'stable' | 'needs-attention';
}

/**
 * Growth radar data.
 */
export interface GrowthRadarData {
  dimensions: GrowthDimension[];
  overallGrowth: number;
  focusArea?: string;
}

/**
 * Emotional arc phase.
 */
export interface EmotionalArcPhase {
  name: string;
  position: number; // 0-1 along the arc
  intensity?: number; // 0-1, when measured
  description?: string;
}

/**
 * Emotional arcs data.
 */
export interface EmotionalArcsData {
  currentPhase: EmotionalArcPhase & { intensity: number };
  phases: EmotionalArcPhase[];
  /** What the arc is about, e.g. "work anxiety"; shown instead of arcType */
  theme?: string;
  arcType?: 'hero-journey' | 'growth' | 'recovery' | 'discovery';
}

/**
 * Prediction with confidence.
 */
export interface Prediction {
  metric: string;
  currentValue: number;
  predictedValue: number;
  confidence: number; // 0-1
  timeframe: string;
  /** 80% range around the predicted value */
  scenarios: {
    conservative: number;
    expected: number;
    optimistic: number;
  };
  /** How the forecast was worked out, in plain words */
  basis?: string;
}

/**
 * Predictions data.
 */
export interface PredictionsData {
  predictions: Prediction[];
  primaryPrediction: Prediction;
  /** Historical accuracy, only when past forecasts have actually been scored */
  accuracy?: number;
}

/**
 * Relationship in network.
 */
export interface Relationship {
  name: string;
  strength: number; // 0-1
  lastContact: string;
  category: 'family' | 'partner' | 'friend' | 'colleague' | 'mentor' | 'other';
  /** Only when something shows it */
  trend?: 'deepening' | 'stable' | 'fading';
}

/**
 * Relationship network data.
 */
export interface RelationshipNetworkData {
  relationships: Relationship[];
  totalConnections: number;
  activeConnections: number;
  needsAttention: string[];
}

/**
 * Open loop (unfinished thread).
 */
export interface OpenLoop {
  id: string;
  description: string;
  createdAt: string;
  priority: 'high' | 'medium' | 'low';
  category: 'commitment' | 'question' | 'intention' | 'follow-up';
  relatedPerson?: string;
}

/**
 * Open loops data.
 */
export interface OpenLoopsData {
  loops: OpenLoop[];
  totalOpen: number;
  oldestLoop?: OpenLoop;
  /** Only when closed loops are tracked */
  recentlyClosed?: number;
}

/**
 * Energy ring data: one overall score from the user's real energy readings.
 * Readings carry a single score, so there are no per-dimension values.
 */
export interface EnergyRingsData {
  overall: number; // 0-100
  /** Status label from the server (e.g. "Balanced") */
  label?: string;
  /** Recommendation from the user's own burnout assessment */
  recommendation?: string;
}
