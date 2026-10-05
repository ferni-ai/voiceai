/**
 * Your Story sections: the stated methods in src/api/your-story-sections.ts,
 * over mocked stores (the shapes the real stores persist).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  moods: [] as Array<{ mood: string; intensity: number; timestamp: number }>,
  arcs: [] as Array<Record<string, unknown>>,
}));
vi.mock('../services/superhuman/mood-calendar.js', () => ({
  loadMoodEntries: async () => store.moods,
}));
vi.mock('../services/superhuman/semantic-intelligence/emotional-trajectories.js', () => ({
  getActiveArcs: async () => store.arcs,
}));

const { fetchMoodCalendar, fetchEmotionalArc } = await import('../api/your-story-sections.js');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const days = (moods: string[]) =>
  moods.map((mood, i) => ({ mood, intensity: 0.5, timestamp: NOW - (moods.length - 1 - i) * DAY }));

describe('fetchMoodCalendar', () => {
  beforeEach(() => {
    store.moods = [];
  });

  it('is null with no entries', async () => {
    expect(await fetchMoodCalendar('u1')).toBeNull();
  });

  it('keeps each day once (its latest entry) and counts calm/content days', async () => {
    store.moods = [
      { mood: 'anxious', intensity: 0.8, timestamp: NOW - 2 * DAY },
      { mood: 'calm', intensity: 0.4, timestamp: NOW - 2 * DAY + 3600_000 },
      { mood: 'content', intensity: 0.5, timestamp: NOW - DAY },
      { mood: 'sad', intensity: 0.6, timestamp: NOW },
    ];
    const cal = (await fetchMoodCalendar('u1'))!;
    expect(cal.days.map((d) => d.mood)).toEqual(['calm', 'content', 'sad']);
    expect(cal.summary.calmDays).toBe(2);
  });

  it('has no trend with fewer than 6 days', async () => {
    store.moods = days(['sad', 'sad', 'calm', 'joyful', 'joyful']);
    expect((await fetchMoodCalendar('u1'))!.summary.trend).toBeNull();
  });

  it('improving / declining / stable from the good-mood share of later vs earlier days', async () => {
    store.moods = days(['sad', 'anxious', 'sad', 'calm', 'joyful', 'hopeful']);
    expect((await fetchMoodCalendar('u1'))!.summary.trend).toBe('improving');
    store.moods = days(['joyful', 'calm', 'content', 'sad', 'anxious', 'exhausted']);
    expect((await fetchMoodCalendar('u1'))!.summary.trend).toBe('declining');
    store.moods = days(['calm', 'sad', 'calm', 'calm', 'sad', 'calm']); // 2/3 good in each half
    expect((await fetchMoodCalendar('u1'))!.summary.trend).toBe('stable');
  });
});

describe('fetchEmotionalArc', () => {
  it('picks the most recently updated arc that has waypoints, oldest waypoint first', async () => {
    store.arcs = [
      {
        theme: 'old',
        phase: 'peak',
        trend: 'stable',
        narrative: '',
        lastUpdated: NOW - 9 * DAY,
        waypoints: [{ timestamp: NOW - 9 * DAY, emotion: 'x', intensity: 0.2 }],
      },
      {
        theme: 'no points',
        phase: 'peak',
        trend: 'stable',
        narrative: '',
        lastUpdated: NOW,
        waypoints: [],
      },
      {
        theme: 'work anxiety',
        phase: 'resolving',
        trend: 'falling',
        narrative: 'easing',
        lastUpdated: NOW - DAY,
        waypoints: [
          { timestamp: NOW - DAY, emotion: 'relief', intensity: 0.3 },
          { timestamp: NOW - 4 * DAY, emotion: 'dread', intensity: 0.9 },
        ],
      },
    ];
    const arc = (await fetchEmotionalArc('u1'))!;
    expect(arc.theme).toBe('work anxiety');
    expect(arc.waypoints.map((w) => w.emotion)).toEqual(['dread', 'relief']);
  });

  it('is null when no arc has waypoints', async () => {
    store.arcs = [
      {
        theme: 't',
        phase: 'peak',
        trend: 'stable',
        narrative: '',
        lastUpdated: NOW,
        waypoints: [],
      },
    ];
    expect(await fetchEmotionalArc('u1')).toBeNull();
  });
});
