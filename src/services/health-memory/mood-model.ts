/**
 * Pure helpers for the mood timeline: how light or heavy a detected emotion
 * is, how a conversation felt overall, and a gentle trend across
 * conversations. No clinical labels, no diagnoses: just "lighter", "heavier",
 * "steady".
 *
 * @module services/health-memory/mood-model
 */

import type { MoodArc, MoodConversation, MoodSample } from './types.js';

const LIGHT =
  /^(happy|joy|joyful|excited|grateful|content|calm|relaxed|hopeful|proud|playful|amused|loving|peaceful|optimistic|relieved|curious|confident|energetic|enthusiastic|delighted|cheerful)/;
const HEAVY =
  /^(sad|anxious|angry|frustrated|stressed|overwhelmed|lonely|afraid|fear|scared|worried|nervous|hurt|grief|grieving|depressed|hopeless|ashamed|guilty|irritated|annoyed|disappointed|tired|exhausted|upset|distressed|down)/;

/** -1 (heavy) … 1 (light) for a detected emotion label at an intensity (0-1). */
export function valenceFor(mood: string, intensity: number, distress = 0): number {
  const m = (mood || 'neutral').toLowerCase();
  const strength = Math.min(1, Math.max(0.2, Number.isFinite(intensity) ? intensity : 0.5));
  let v = 0;
  if (LIGHT.test(m)) v = strength;
  else if (HEAVY.test(m)) v = -strength;
  if (distress > 0.5) v = Math.min(v, -distress);
  return Math.round(Math.max(-1, Math.min(1, v)) * 100) / 100;
}

/** Keep at most `max` samples, evenly spread, always keeping first and last. */
export function downsample<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  const out: T[] = [];
  const step = (items.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)] as T);
  return out;
}

export interface MoodSummary {
  readonly dominantMood: string;
  readonly averageValence: number;
  readonly arc: MoodArc;
}

/** How a conversation felt: most common mood, average lightness, and its arc. */
export function summarizeSamples(samples: readonly MoodSample[]): MoodSummary {
  if (samples.length === 0) return { dominantMood: 'neutral', averageValence: 0, arc: 'steady' };
  const counts = new Map<string, number>();
  for (const s of samples) counts.set(s.mood, (counts.get(s.mood) ?? 0) + 1);
  const dominantMood = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'neutral';
  const avg = samples.reduce((sum, s) => sum + s.valence, 0) / samples.length;
  const third = Math.max(1, Math.floor(samples.length / 3));
  const mean = (xs: readonly MoodSample[]) => xs.reduce((a, s) => a + s.valence, 0) / xs.length;
  const start = mean(samples.slice(0, third));
  const end = mean(samples.slice(-third));
  const spread =
    Math.max(...samples.map((s) => s.valence)) - Math.min(...samples.map((s) => s.valence));
  let arc: MoodArc = 'steady';
  if (end - start >= 0.3) arc = 'lifting';
  else if (start - end >= 0.3) arc = 'heavier';
  else if (spread >= 1.2) arc = 'mixed';
  return { dominantMood, averageValence: Math.round(avg * 100) / 100, arc };
}

const DAY = 86_400_000;

export type InsightAudience = 'persona' | 'user';

const LINES: Readonly<Record<string, Readonly<Record<InsightAudience, string>>>> = {
  lighter: {
    persona: "They've seemed lighter this week than the weeks before.",
    user: "You've seemed lighter this week than the weeks before.",
  },
  heavier: {
    persona:
      'The last few conversations have felt heavier than before. Be a little gentler; let them bring it up.',
    user: 'The last few conversations have felt a bit heavier than before.',
  },
  goodSpirits: {
    persona: "They've seemed in good spirits lately.",
    user: "You've seemed in good spirits lately.",
  },
  heavyStretch: {
    persona: "They've had a heavier stretch lately. Lead with warmth, not questions.",
    user: "It's been a heavier stretch lately. I'm here whenever you want to talk.",
  },
  lifting: {
    persona: 'Lately your talks have tended to leave them feeling lighter.',
    user: 'Lately our talks have tended to leave you feeling lighter.',
  },
};

/**
 * A gentle, non-clinical line about how the user has seemed lately, or null
 * when there isn't enough to say anything honest. Compares the last 7 days
 * with the 3 weeks before. `persona` lines guide the persona (session-start
 * block); `user` lines are shown to the user on the memory page.
 */
export function buildMoodInsight(
  timeline: readonly MoodConversation[],
  now: Date = new Date(),
  audience: InsightAudience = 'persona'
): string | null {
  const t = now.getTime();
  const age = (c: MoodConversation) => t - Date.parse(c.endedAt || c.startedAt);
  const recent = timeline.filter((c) => age(c) >= 0 && age(c) <= 7 * DAY);
  const before = timeline.filter((c) => age(c) > 7 * DAY && age(c) <= 28 * DAY);
  if (recent.length < 2) return null;
  const avg = (xs: readonly MoodConversation[]) =>
    xs.reduce((sum, c) => sum + c.averageValence, 0) / xs.length;
  const now7 = avg(recent);
  const say = (key: string) => LINES[key]?.[audience] ?? null;
  if (before.length >= 2) {
    const diff = now7 - avg(before);
    if (diff >= 0.25) return say('lighter');
    if (diff <= -0.25) return say('heavier');
  }
  if (now7 >= 0.35) return say('goodSpirits');
  if (now7 <= -0.35) return say('heavyStretch');
  if (recent.filter((c) => c.arc === 'lifting').length >= 2) return say('lifting');
  return null;
}
