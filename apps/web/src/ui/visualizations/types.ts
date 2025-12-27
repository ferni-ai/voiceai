/**
 * Visualization Types
 *
 * Shared types for cross-platform visualizations.
 * These types define the data contract between:
 * - Backend API (/api/insights)
 * - Web visualization builders
 * - iOS native renderers (SwiftUI)
 * - Android native renderers (Compose)
 *
 * @module visualizations/types
 */

// ============================================================================
// DEVICE TYPES
// ============================================================================

/**
 * Target device for rendering.
 * Each device has different constraints and optimal rendering strategies.
 */
export type DeviceType = 'watch' | 'mobile' | 'tablet' | 'desktop' | 'tv';

/**
 * Platform for native-specific adaptations.
 */
export type Platform = 'ios' | 'android' | 'web';

/**
 * Device context for adaptive rendering.
 */
export interface DeviceContext {
  type: DeviceType;
  platform: Platform;
  /** Screen width in logical pixels */
  width: number;
  /** Screen height in logical pixels */
  height: number;
  /** Whether reduced motion is preferred */
  prefersReducedMotion: boolean;
  /** Whether dark mode is active */
  isDarkMode: boolean;
}

// ============================================================================
// VISUALIZATION TYPES
// ============================================================================

/**
 * All available visualization types.
 */
export type VisualizationType =
  | 'mood-calendar'
  | 'burnout-gauge'
  | 'life-timeline'
  | 'growth-radar'
  | 'emotional-arcs'
  | 'predictions'
  | 'relationship-network'
  | 'open-loops'
  | 'energy-rings'
  | 'values-compass'
  | 'seasons'
  | 'river'
  | 'stories'
  | 'trajectories'
  | 'silence'
  | 'correlations'
  | 'fingerprint'
  | 'contradictions';

// ============================================================================
// DATA TYPES - Shared across platforms
// ============================================================================

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
  | 'uncertain';

/**
 * Mood calendar data.
 */
export interface MoodCalendarData {
  entries: MoodEntry[];
  summary: {
    dominantMood: MoodType;
    calmDays: number;
    trend: 'improving' | 'stable' | 'declining';
  };
  period: 'week' | 'month' | 'quarter';
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
  progress: number; // 0-1
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
  intensity: number; // 0-1
  description?: string;
}

/**
 * Emotional arcs data.
 */
export interface EmotionalArcsData {
  currentPhase: EmotionalArcPhase;
  phases: EmotionalArcPhase[];
  arcType: 'hero-journey' | 'growth' | 'recovery' | 'discovery';
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
  scenarios: {
    conservative: number;
    expected: number;
    optimistic: number;
  };
}

/**
 * Predictions data.
 */
export interface PredictionsData {
  predictions: Prediction[];
  primaryPrediction: Prediction;
  accuracy: number; // historical accuracy
}

/**
 * Relationship in network.
 */
export interface Relationship {
  name: string;
  strength: number; // 0-1
  lastContact: string;
  category: 'family' | 'friend' | 'colleague' | 'mentor' | 'other';
  trend: 'deepening' | 'stable' | 'fading';
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
  recentlyClosed: number;
}

/**
 * Energy ring data (for watch).
 */
export interface EnergyRingsData {
  emotional: number; // 0-100
  mental: number; // 0-100
  physical: number; // 0-100
  overall: number; // 0-100
}

// ============================================================================
// VISUALIZATION RENDER RESULT
// ============================================================================

/**
 * Result from a visualization builder.
 * Contains both the rendered element and metadata.
 */
export interface VisualizationResult {
  /** The rendered DOM element */
  element: HTMLElement;
  /** Visualization type */
  type: VisualizationType;
  /** Device it was rendered for */
  device: DeviceType;
  /** Cleanup function to remove event listeners */
  cleanup?: () => void;
  /** Accessibility label */
  ariaLabel: string;
}

// ============================================================================
// BUILDER FUNCTION TYPE
// ============================================================================

/**
 * Visualization builder function signature.
 * All builders follow this pattern for consistency.
 */
export type VisualizationBuilder<T> = (
  container: HTMLElement,
  data: T,
  context: DeviceContext
) => VisualizationResult;

// ============================================================================
// API RESPONSE TYPE
// ============================================================================

/**
 * Combined visualization data from API.
 * Matches the structure returned by /api/insights/:userId
 */
export interface VisualizationApiResponse {
  userId: string;
  timestamp: string;
  moodCalendar?: MoodCalendarData;
  burnoutGauge?: BurnoutGaugeData;
  lifeTimeline?: LifeTimelineData;
  growthRadar?: GrowthRadarData;
  emotionalArcs?: EmotionalArcsData;
  predictions?: PredictionsData;
  relationshipNetwork?: RelationshipNetworkData;
  openLoops?: OpenLoopsData;
  energyRings?: EnergyRingsData;
}

// ============================================================================
// COLOR TOKENS (for native apps)
// ============================================================================

/**
 * Color tokens for consistent theming across platforms.
 * Native apps should map these to their color systems.
 */
export interface VisualizationColors {
  accent: string;
  accentSecondary: string;
  background: string;
  backgroundElevated: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  borderSubtle: string;
  moods: Record<MoodType, string>;
  energy: {
    emotional: string;
    mental: string;
    physical: string;
  };
  status: {
    thriving: string;
    balanced: string;
    stretched: string;
    depleted: string;
    critical: string;
  };
}

/**
 * Default color tokens (matches design system).
 * These are fallback values for canvas/SVG rendering where CSS variables aren't available.
 * @design-tokens-ignore - Canvas rendering requires literal color values
 */
export const DEFAULT_COLORS: VisualizationColors = {
  accent: '#3D5A45',
  accentSecondary: '#4a6741',
  background: '#fffdfb',
  backgroundElevated: '#ffffff',
  textPrimary: '#2C2520',
  textSecondary: '#5c544a',
  textMuted: '#9a8f85',
  borderSubtle: 'rgba(44, 37, 32, 0.08)',
  moods: {
    calm: '#3D5A45',
    joyful: '#f5a623',
    anxious: '#e74c3c',
    tired: '#9a8f85',
    focused: '#3a6b73',
    reflective: '#8a7a9a',
    stressed: '#c0392b',
    energized: '#27ae60',
    peaceful: '#5a8b73',
    uncertain: '#7f8c8d',
  },
  energy: {
    emotional: '#a67a6a',
    mental: '#3a6b73',
    physical: '#4a6741',
  },
  status: {
    thriving: '#27ae60',
    balanced: '#3D5A45',
    stretched: '#f5a623',
    depleted: '#e67e22',
    critical: '#e74c3c',
  },
};
