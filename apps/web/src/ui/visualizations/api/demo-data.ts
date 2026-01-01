// TODO: Fix type errors - array indexing
/**
 * Demo Data for "Your Story" Dashboard
 *
 * Creates aspirational, warm demo data that shows new users
 * what their journey with Ferni could look like. This data
 * is designed to be inspiring but achievable - not perfect,
 * but full of possibility.
 *
 * @module visualizations/api/demo-data
 */

import type {
  VisualizationApiResponse,
  MoodCalendarData,
  MoodEntry,
  MoodType,
  BurnoutGaugeData,
  LifeTimelineData,
  TimelineChapter,
  GrowthRadarData,
  GrowthDimension,
  EmotionalArcsData,
  EmotionalArcPhase,
  PredictionsData,
  Prediction,
  RelationshipNetworkData,
  Relationship,
  OpenLoopsData,
  OpenLoop,
  EnergyRingsData,
} from '../types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Extended story data that includes analytics and milestones
 * from consolidated tabs.
 */
export interface YourStoryData extends VisualizationApiResponse {
  analytics: {
    daysTogether: number;
    conversations: number;
    streak: number;
  };
  stage: {
    name: string;
    progress: number;
    tagline: string;
  };
  milestones: Array<{
    id: string;
    name: string;
    celebratedAt: number;
    category: 'relationship' | 'team' | 'conversation' | 'discovery' | 'sweet';
  }>;
}

// ============================================================================
// DEMO DATA GENERATOR
// ============================================================================

/**
 * Create warm, aspirational demo data for new users.
 *
 * This data shows what the user's story could look like after
 * building a relationship with Ferni. It's designed to feel
 * achievable and inspiring.
 */
export function createDemoStoryData(userId: string): YourStoryData {
  const now = new Date();

  return {
    userId,
    timestamp: now.toISOString(),

    // Visualization data
    moodCalendar: createDemoMoodCalendar(now),
    burnoutGauge: createDemoBurnoutGauge(),
    lifeTimeline: createDemoLifeTimeline(now),
    growthRadar: createDemoGrowthRadar(),
    emotionalArcs: createDemoEmotionalArcs(),
    predictions: createDemoPredictions(),
    relationshipNetwork: createDemoRelationshipNetwork(),
    openLoops: createDemoOpenLoops(now),
    energyRings: createDemoEnergyRings(),

    // Consolidated analytics (from old Analytics tab)
    analytics: {
      daysTogether: 45,
      conversations: 127,
      streak: 12,
    },

    // Relationship stage (from old Journey tab)
    stage: {
      name: 'Building Trust',
      progress: 0.65,
      tagline: 'Deeper than small talk',
    },

    // Recent milestones (from old Journey tab)
    milestones: [
      {
        id: 'first-hello',
        name: 'First Hello',
        celebratedAt: Date.now() - 45 * 24 * 60 * 60 * 1000,
        category: 'relationship',
      },
      {
        id: 'week-together',
        name: 'One Week Together',
        celebratedAt: Date.now() - 38 * 24 * 60 * 60 * 1000,
        category: 'relationship',
      },
      {
        id: 'deep-dive',
        name: 'Deep Dive',
        celebratedAt: Date.now() - 20 * 24 * 60 * 60 * 1000,
        category: 'conversation',
      },
    ],
  };
}

// ============================================================================
// INDIVIDUAL DATA GENERATORS
// ============================================================================

/**
 * Demo mood calendar with varied but improving trend.
 */
function createDemoMoodCalendar(now: Date): MoodCalendarData {
  const entries: MoodEntry[] = [];
  const moods: MoodType[] = ['calm', 'joyful', 'focused', 'reflective', 'peaceful', 'energized'];

  // Generate 4 weeks of mood data with improving trend
  for (let i = 27; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    // Later days more likely to be positive
    const positiveWeight = 0.5 + (27 - i) / 54; // 0.5 → 1.0 over 4 weeks
    const isPositive = Math.random() < positiveWeight;

    const negativeMoods: MoodType[] = ['tired', 'anxious', 'uncertain'];
    const mood = isPositive
      ? (moods[Math.floor(Math.random() * moods.length)] ?? 'calm')
      : (negativeMoods[Math.floor(Math.random() * 3)] ?? 'tired');

    entries.push({
      date: date.toISOString().split('T')[0] ?? '',
      mood,
      intensity: 0.5 + Math.random() * 0.4,
      note: i === 0 ? 'Feeling grounded today' : undefined,
    });
  }

  return {
    entries,
    summary: {
      dominantMood: 'calm',
      calmDays: entries.filter(e => e.mood === 'calm' || e.mood === 'peaceful').length,
      trend: 'improving',
    },
    period: 'month',
  };
}

/**
 * Demo burnout gauge showing healthy but realistic capacity.
 */
function createDemoBurnoutGauge(): BurnoutGaugeData {
  return {
    capacity: 72,
    trend: 'recovering',
    status: 'balanced',
    factors: {
      emotional: 75,
      mental: 68,
      physical: 73,
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Demo life timeline with meaningful chapters.
 */
function createDemoLifeTimeline(now: Date): LifeTimelineData {
  const chapters: TimelineChapter[] = [
    {
      id: 'chapter-1',
      title: 'Finding My Footing',
      type: 'transition',
      startDate: new Date(now.getFullYear() - 2, 0, 1).toISOString(),
      endDate: new Date(now.getFullYear() - 1, 5, 30).toISOString(),
      isActive: false,
      progress: 1,
      summary: 'A season of change and adaptation',
    },
    {
      id: 'chapter-2',
      title: 'Building Bridges',
      type: 'growth',
      startDate: new Date(now.getFullYear() - 1, 6, 1).toISOString(),
      endDate: new Date(now.getFullYear(), 0, 31).toISOString(),
      isActive: false,
      progress: 1,
      summary: 'Deepening connections and learning to trust',
    },
    {
      id: 'chapter-3',
      title: 'Intentional Living',
      type: 'growth',
      startDate: new Date(now.getFullYear(), 1, 1).toISOString(),
      isActive: true,
      progress: 0.6,
      summary: "You're making deliberate choices about what matters",
    },
  ];

  return {
    chapters,
    currentChapter: chapters[2] ?? chapters[0]!,
    totalChapters: 3,
    narrativeSummary: "From surviving to thriving - you're writing a new chapter",
  };
}

/**
 * Demo growth radar with realistic dimensions.
 */
function createDemoGrowthRadar(): GrowthRadarData {
  const dimensions: GrowthDimension[] = [
    { name: 'Self-Awareness', value: 0.75, previousValue: 0.6, trend: 'growing' },
    { name: 'Emotional Range', value: 0.68, previousValue: 0.55, trend: 'growing' },
    { name: 'Boundaries', value: 0.6, previousValue: 0.45, trend: 'growing' },
    { name: 'Connection', value: 0.72, previousValue: 0.7, trend: 'stable' },
    { name: 'Purpose', value: 0.58, previousValue: 0.5, trend: 'growing' },
    { name: 'Resilience', value: 0.65, previousValue: 0.55, trend: 'growing' },
  ];

  return {
    dimensions,
    overallGrowth: 0.66,
    focusArea: 'Purpose',
  };
}

/**
 * Demo emotional arcs showing a recovery journey.
 */
function createDemoEmotionalArcs(): EmotionalArcsData {
  const phases: EmotionalArcPhase[] = [
    { name: 'The Call', position: 0, intensity: 0.3, description: 'Something needed to change' },
    { name: 'The Descent', position: 0.25, intensity: 0.7, description: 'Facing what was hard' },
    { name: 'The Depths', position: 0.4, intensity: 0.9, description: 'Rock bottom became foundation' },
    { name: 'The Turn', position: 0.55, intensity: 0.6, description: 'A shift in perspective' },
    { name: 'The Rise', position: 0.75, intensity: 0.4, description: 'Building something new' },
    { name: 'Integration', position: 1, intensity: 0.2, description: 'Wisdom from the journey' },
  ];

  return {
    currentPhase: phases[4] ?? phases[0]!, // "The Rise"
    phases,
    arcType: 'recovery',
  };
}

/**
 * Demo predictions showing positive trajectories.
 */
function createDemoPredictions(): PredictionsData {
  const predictions: Prediction[] = [
    {
      metric: 'Emotional Wellbeing',
      currentValue: 68,
      predictedValue: 78,
      confidence: 0.82,
      timeframe: '3 months',
      scenarios: { conservative: 72, expected: 78, optimistic: 85 },
    },
    {
      metric: 'Stress Management',
      currentValue: 55,
      predictedValue: 70,
      confidence: 0.75,
      timeframe: '3 months',
      scenarios: { conservative: 62, expected: 70, optimistic: 78 },
    },
    {
      metric: 'Connection Quality',
      currentValue: 72,
      predictedValue: 80,
      confidence: 0.88,
      timeframe: '3 months',
      scenarios: { conservative: 75, expected: 80, optimistic: 86 },
    },
  ];

  return {
    predictions,
    primaryPrediction: predictions[0]!,
    accuracy: 0.84,
  };
}

/**
 * Demo relationship network with meaningful connections.
 */
function createDemoRelationshipNetwork(): RelationshipNetworkData {
  const relationships: Relationship[] = [
    {
      name: 'Partner',
      strength: 0.9,
      lastContact: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      category: 'family',
      trend: 'stable',
    },
    {
      name: 'Best Friend',
      strength: 0.85,
      lastContact: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      category: 'friend',
      trend: 'deepening',
    },
    {
      name: 'Mom',
      strength: 0.75,
      lastContact: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      category: 'family',
      trend: 'stable',
    },
    {
      name: 'Work Mentor',
      strength: 0.6,
      lastContact: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      category: 'mentor',
      trend: 'deepening',
    },
    {
      name: 'College Friend',
      strength: 0.5,
      lastContact: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      category: 'friend',
      trend: 'fading',
    },
  ];

  return {
    relationships,
    totalConnections: 24,
    activeConnections: 12,
    needsAttention: ['College Friend'],
  };
}

/**
 * Demo open loops with realistic commitments.
 */
function createDemoOpenLoops(now: Date): OpenLoopsData {
  const loops: OpenLoop[] = [
    {
      id: 'loop-1',
      description: 'Call Mom this weekend',
      createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      priority: 'high',
      category: 'commitment',
      relatedPerson: 'Mom',
    },
    {
      id: 'loop-2',
      description: 'Think about what I really want from this job',
      createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      priority: 'medium',
      category: 'intention',
    },
    {
      id: 'loop-3',
      description: 'Follow up with Jake about coffee',
      createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      priority: 'low',
      category: 'follow-up',
      relatedPerson: 'Jake',
    },
  ];

  return {
    loops,
    totalOpen: 3,
    oldestLoop: loops[2],
    recentlyClosed: 5,
  };
}

/**
 * Demo energy rings showing healthy levels.
 */
function createDemoEnergyRings(): EnergyRingsData {
  return {
    emotional: 75,
    mental: 68,
    physical: 72,
    overall: 72,
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Check if visualization data has any real content.
 * Returns false if all visualizations are undefined/empty.
 */
export function hasAnyVisualizationData(data: VisualizationApiResponse): boolean {
  return !!(
    data.moodCalendar?.entries?.length ||
    data.burnoutGauge ||
    data.lifeTimeline?.chapters?.length ||
    data.growthRadar?.dimensions?.length ||
    data.emotionalArcs?.phases?.length ||
    data.predictions?.predictions?.length ||
    data.relationshipNetwork?.relationships?.length ||
    data.openLoops?.loops?.length ||
    data.energyRings
  );
}
