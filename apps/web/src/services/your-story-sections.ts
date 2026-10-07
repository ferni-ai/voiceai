/**
 * Your Story sections: the API's real section data, mapped to exactly what
 * each visualization component reads.
 *
 * Every mapper returns undefined when the server had nothing real for that
 * section; the dashboard then leaves the section out. Nothing here invents a
 * value the server didn't send: fields with no source stay unset, and the
 * components skip them.
 *
 * @module services/your-story-sections
 */

import type {
  EmotionalArcPhase,
  EmotionalArcsData,
  LifeTimelineData,
  MoodCalendarData,
  MoodType,
  OpenLoop,
  OpenLoopsData,
  Prediction,
  PredictionsData,
  Relationship,
  RelationshipNetworkData,
  TimelineChapter,
} from '../types/visualization-data.js';

// ============================================================================
// API SHAPES (mirror src/api/your-story-prediction.ts and your-story-sections.ts)
// ============================================================================

export interface ApiPrediction {
  metric: string;
  currentValue: number;
  predictedValue: number;
  confidence: number; // 0-1
  timeframe: string;
  range: { conservative: number; expected: number; optimistic: number };
  basis: string;
  readings: number;
  days: number;
}

export interface ApiMoodCalendar {
  days: Array<{ date: string; mood: string; intensity: number }>;
  summary: {
    calmDays: number;
    dominantMood: string;
    trend: 'improving' | 'stable' | 'declining' | null;
  };
}

export interface ApiLifeChapter {
  id: string;
  title: string;
  summary: string;
  type: string;
  startDate: string;
  endDate?: string;
  isActive: boolean;
}

export interface ApiEmotionalArc {
  theme: string;
  phase: string;
  trend: string;
  narrative: string;
  waypoints: Array<{ timestamp: string; emotion: string; intensity: number }>;
}

export interface ApiYourWorld {
  totalConnections: number;
  activeConnections: number;
  needsAttention: string[];
  people: Array<{
    name: string;
    type: string;
    strength: number;
    lastMentioned: string;
    daysSinceMention: number;
  }>;
}

export interface ApiOpenLoops {
  total: number;
  items: Array<{
    id: string;
    type: string;
    content: string;
    createdAt: string;
    priority: 'high' | 'medium' | 'low';
    relatedPerson?: string;
  }>;
}

// ============================================================================
// MAPPERS
// ============================================================================

/** Forecast card: one real prediction, no track record (none is kept). */
export function toPredictions(api: ApiPrediction | null | undefined): PredictionsData | undefined {
  if (!api) return undefined;
  const prediction: Prediction = {
    metric: api.metric,
    currentValue: api.currentValue,
    predictedValue: api.predictedValue,
    confidence: api.confidence,
    timeframe: api.timeframe,
    scenarios: api.range,
    basis: api.basis,
  };
  return { predictions: [prediction], primaryPrediction: prediction };
}

const MOODS: ReadonlySet<string> = new Set<MoodType>([
  'calm',
  'joyful',
  'anxious',
  'tired',
  'focused',
  'reflective',
  'stressed',
  'energized',
  'peaceful',
  'uncertain',
  'content',
  'neutral',
  'sad',
  'frustrated',
  'overwhelmed',
  'exhausted',
  'hopeful',
]);
/** The server's mood word, if the calendar has a color for it. */
const asMood = (mood: string): MoodType | undefined =>
  MOODS.has(mood.toLowerCase()) ? (mood.toLowerCase() as MoodType) : undefined;

export function toMoodCalendar(
  api: ApiMoodCalendar | null | undefined
): MoodCalendarData | undefined {
  const dominantMood = api ? asMood(api.summary.dominantMood) : undefined;
  if (!api || !dominantMood) return undefined;
  const entries = api.days.flatMap((d) => {
    const mood = asMood(d.mood);
    return mood ? [{ date: d.date, mood, intensity: d.intensity }] : [];
  });
  if (entries.length === 0) return undefined;
  return {
    entries,
    summary: {
      dominantMood,
      calmDays: api.summary.calmDays,
      ...(api.summary.trend ? { trend: api.summary.trend } : {}),
    },
  };
}

const CHAPTER_TYPES: Record<string, TimelineChapter['type']> = {
  growth: 'growth',
  struggle: 'challenge',
  loss: 'challenge',
  triumph: 'celebration',
  connection: 'celebration',
  transition: 'transition',
  decision: 'transition',
  discovery: 'reflection',
};

export function toLifeTimeline(
  api: ApiLifeChapter[] | null | undefined
): LifeTimelineData | undefined {
  if (!api || api.length === 0) return undefined;
  const chapters: TimelineChapter[] = api.map((c) => ({
    id: c.id,
    title: c.title,
    type: CHAPTER_TYPES[c.type] ?? 'reflection',
    startDate: c.startDate,
    ...(c.endDate ? { endDate: c.endDate } : {}),
    isActive: c.isActive,
    ...(c.summary ? { summary: c.summary } : {}),
  }));
  const current = [...chapters].reverse().find((c) => c.isActive) ?? chapters[chapters.length - 1]!;
  return { chapters, currentChapter: current, totalChapters: chapters.length };
}

/** An arc's lifecycle (semantic-intelligence ArcPhase), in order. */
const ARC_STAGES = ['emerging', 'building', 'peak', 'resolving', 'resolved'] as const;
const stageName = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function toEmotionalArcs(
  api: ApiEmotionalArc | null | undefined
): EmotionalArcsData | undefined {
  const latest = api?.waypoints[api.waypoints.length - 1];
  if (!api || !latest) return undefined;
  // "recurring" sits where "building" would: the pattern is back and growing.
  const stages = ARC_STAGES.map((s) =>
    s === 'building' && api.phase === 'recurring' ? 'recurring' : s
  );
  const at = Math.max(0, stages.indexOf(api.phase as (typeof stages)[number]));
  const phases: EmotionalArcPhase[] = stages.map((s, i) => ({
    name: stageName(s),
    position: i / (stages.length - 1),
  }));
  return {
    theme: api.theme,
    phases,
    currentPhase: {
      name: stageName(stages[at]!),
      position: at / (stages.length - 1),
      intensity: latest.intensity,
      ...(api.narrative ? { description: api.narrative } : {}),
    },
  };
}

const CATEGORIES: Record<string, Relationship['category']> = {
  family: 'family',
  partner: 'partner',
  friend: 'friend',
  colleague: 'colleague',
  mentor: 'mentor',
};

export function toRelationshipNetwork(
  api: ApiYourWorld | null | undefined
): RelationshipNetworkData | undefined {
  if (!api || api.people.length === 0) return undefined;
  return {
    relationships: api.people.map((p) => ({
      name: p.name,
      strength: p.strength,
      lastContact: p.lastMentioned,
      category: CATEGORIES[p.type] ?? 'other',
      // Only "fading" has a source: not mentioned for 30+ days.
      ...(p.daysSinceMention >= 30 ? { trend: 'fading' as const } : {}),
    })),
    totalConnections: api.totalConnections,
    activeConnections: api.activeConnections,
    needsAttention: api.needsAttention,
  };
}

const LOOP_CATEGORIES: Record<string, OpenLoop['category']> = {
  commitment: 'commitment',
  intention: 'intention',
  question: 'question',
};

export function toOpenLoops(api: ApiOpenLoops | null | undefined): OpenLoopsData | undefined {
  if (!api || api.items.length === 0) return undefined;
  const loops: OpenLoop[] = api.items.map((l) => ({
    id: l.id,
    description: l.content,
    createdAt: l.createdAt,
    priority: l.priority,
    // advice, emotional peaks, life events, concerns: things to check back on
    category: LOOP_CATEGORIES[l.type] ?? 'follow-up',
    ...(l.relatedPerson ? { relatedPerson: l.relatedPerson } : {}),
  }));
  const oldestLoop = [...loops].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  return { loops, totalOpen: api.total, ...(oldestLoop ? { oldestLoop } : {}) };
}
