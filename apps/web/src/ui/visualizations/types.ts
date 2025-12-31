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
// COLOR TOKENS (for native apps and canvas/SVG rendering)
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
  priority: {
    high: string;
    medium: string;
    low: string;
  };
  chapter: {
    growth: string;
    challenge: string;
    transition: string;
    celebration: string;
    reflection: string;
  };
}

/**
 * Default color tokens (matches design system).
 * These are fallback values for canvas/SVG rendering where CSS variables aren't available.
 * @design-tokens-ignore - Canvas rendering requires literal color values
 *
 * IMPORTANT: These colors are aligned with design-system/tokens/colors.json
 * and the CSS variables defined in visualization.css.ts
 */
export const DEFAULT_COLORS: VisualizationColors = {
  // Core palette - zen theme aligned
  accent: '#3D5A45',           // --color-accent
  accentSecondary: '#4a6741',  // --color-accent-hover
  background: '#faf8f5',       // --color-bg-primary
  backgroundElevated: '#FFFDFB', // --color-bg-elevated
  textPrimary: '#2C2520',      // --color-text-primary (Natural Ink)
  textSecondary: '#5c544a',    // --color-text-secondary
  textMuted: '#756a5e',        // --color-text-muted
  borderSubtle: 'rgba(44, 37, 32, 0.06)', // --color-border-subtle

  // Mood colors - warm, earthy palette aligned with personas
  moods: {
    calm: '#3D5A45',      // Ferni sage - grounded calm
    joyful: '#c4956a',    // Warm amber - genuine joy
    anxious: '#b5453a',   // Muted red - concern without alarm
    tired: '#756a5e',     // Soft gray-brown - gentle fatigue
    focused: '#3a6b73',   // Peter teal - deep concentration
    reflective: '#7a6a8a', // Soft purple - thoughtful
    stressed: '#a54545',  // Deeper red - pressure
    energized: '#4a7a52', // Brighter sage - vitality
    peaceful: '#5a8a73',  // Soft teal-green - serenity
    uncertain: '#6a6a6a', // Neutral gray - ambiguity
  },

  // Energy ring colors - persona-aligned
  energy: {
    emotional: '#a67a6a', // Maya terracotta - heart energy
    mental: '#3a6b73',    // Peter teal - mind energy
    physical: '#4a6741',  // Ferni sage - body energy
  },

  // Status colors - semantic and warm
  status: {
    thriving: '#3d7a52',  // Vibrant green - flourishing
    balanced: '#3D5A45',  // Sage green - harmony
    stretched: '#a67c35', // Warm amber - caution
    depleted: '#c67840',  // Burnt orange - low energy
    critical: '#b5453a',  // Warm red - urgent attention
  },

  // Priority colors - semantic
  priority: {
    high: '#b5453a',      // Warm red - urgent
    medium: '#a67c35',    // Amber - moderate
    low: '#756a5e',       // Muted - can wait
  },

  // Life chapter colors - narrative types
  chapter: {
    growth: '#3D5A45',    // Sage - expansion
    challenge: '#b5453a', // Warm red - difficulty
    transition: '#c4956a', // Amber - change
    celebration: '#4a7a52', // Green - achievement
    reflection: '#7a6a8a', // Purple - contemplation
  },
};

/**
 * CSS variable names for colors that can be used in DOM elements.
 * Use these when setting styles on HTML elements.
 */
export const CSS_COLOR_VARS = {
  accent: 'var(--color-accent, #3D5A45)',
  accentGlow: 'var(--color-accent-glow, rgba(61, 90, 69, 0.15))',
  background: 'var(--color-bg-primary, #faf8f5)',
  backgroundElevated: 'var(--color-bg-elevated, #FFFDFB)',
  textPrimary: 'var(--color-text-primary, #2C2520)',
  textSecondary: 'var(--color-text-secondary, #5c544a)',
  textMuted: 'var(--color-text-muted, #756a5e)',
  borderSubtle: 'var(--color-border-subtle, rgba(44, 37, 32, 0.06))',

  // Energy
  energyEmotional: 'var(--viz-energy-emotional, #a67a6a)',
  energyMental: 'var(--viz-energy-mental, #3a6b73)',
  energyPhysical: 'var(--viz-energy-physical, #4a6741)',

  // Status
  statusThriving: 'var(--viz-status-thriving, #3d7a52)',
  statusBalanced: 'var(--viz-status-balanced, #3D5A45)',
  statusStretched: 'var(--viz-status-stretched, #a67c35)',
  statusDepleted: 'var(--viz-status-depleted, #c67840)',
  statusCritical: 'var(--viz-status-critical, #b5453a)',

  // Priority
  priorityHigh: 'var(--viz-priority-high, #b5453a)',
  priorityMedium: 'var(--viz-priority-medium, #a67c35)',
  priorityLow: 'var(--viz-priority-low, #756a5e)',
} as const;
