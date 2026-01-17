// TODO: Fix type errors - entry array indexing
/**
 * Journal Stats
 *
 * Calculate statistics from journal entries.
 *
 * @module voice-journal/stats
 */

import type { JournalStats, CustomAgentMemory } from './types.js';
import { getMoodScore } from './mood-icons.js';

// ============================================================================
// STATS CALCULATION
// ============================================================================

export function calculateStats(journalEntries: CustomAgentMemory[]): JournalStats {
  if (journalEntries.length === 0) {
    return {
      totalEntries: 0,
      currentStreak: 0,
      longestStreak: 0,
      avgMoodScore: 0,
      topMoods: [],
      entriesByWeek: [0, 0, 0, 0],
    };
  }

  // Sort by date
  const sorted = [...journalEntries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Calculate streak
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  const entriesByDate = new Map<string, CustomAgentMemory[]>();
  sorted.forEach((entry) => {
    const dateKey = new Date(entry.createdAt).toDateString();
    if (!entriesByDate.has(dateKey)) {
      entriesByDate.set(dateKey, []);
    }
    entriesByDate.get(dateKey)!.push(entry);
  });

  // Calculate streaks
  const dates = Array.from(entriesByDate.keys()).map((d) => new Date(d));
  dates.sort((a, b) => b.getTime() - a.getTime());

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    if (!date) continue;
    if (i === 0) {
      const diffFromToday = Math.floor(
        (today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffFromToday <= 1) {
        tempStreak = 1;
      }
    } else {
      const prevDate = dates[i - 1];
      if (!prevDate) continue;
      const diff = Math.floor(
        (prevDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diff === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        if (i === dates.length - 1 || tempStreak === 0) {
          break;
        }
        tempStreak = 1;
      }
    }
    if (i < 30) {
      // Only count recent for current streak
      currentStreak = tempStreak;
    }
  }
  longestStreak = Math.max(longestStreak, tempStreak);

  // Mood stats
  const moodCounts = new Map<string, number>();
  let totalMoodScore = 0;
  let moodCount = 0;

  sorted.forEach((entry) => {
    if (entry.mood) {
      moodCounts.set(entry.mood, (moodCounts.get(entry.mood) || 0) + 1);
      totalMoodScore += getMoodScore(entry.mood);
      moodCount++;
    }
  });

  const topMoods = Array.from(moodCounts.entries())
    .map(([mood, count]) => ({ mood, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // Entries by week (last 4 weeks)
  const entriesByWeek: number[] = [0, 0, 0, 0];
  const now = Date.now();
  sorted.forEach((entry) => {
    const age = now - new Date(entry.createdAt).getTime();
    const weekIndex = Math.floor(age / (7 * 24 * 60 * 60 * 1000));
    if (weekIndex >= 0 && weekIndex < 4) {
      const current = entriesByWeek[weekIndex] ?? 0;
      entriesByWeek[weekIndex] = current + 1;
    }
  });

  return {
    totalEntries: journalEntries.length,
    currentStreak,
    longestStreak,
    avgMoodScore: moodCount > 0 ? totalMoodScore / moodCount : 0,
    topMoods,
    entriesByWeek,
  };
}

