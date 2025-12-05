/**
 * Maya's Habit Coaching - 30-Day Challenges
 *
 * Pre-built challenge programs for common habit goals.
 */

import type { LifeDomain, ChallengeDefinition } from './types.js';

// ============================================================================
// 30-DAY CHALLENGES
// ============================================================================

export const THIRTY_DAY_CHALLENGES: Record<string, ChallengeDefinition> = {
  morning_person: {
    name: 'Become a Morning Person',
    description: 'Transform your mornings from chaotic to intentional, one day at a time',
    domain: 'health',
    difficulty: 'medium',
    dailyActions: [
      'Set alarm 15 min earlier',
      'Drink water immediately',
      'Open curtains/get light',
      'No phone first 10 min',
      'Movement for 5 min',
    ],
    weeklyMilestones: [
      'Week 1: Wake up on time consistently',
      'Week 2: Add morning movement',
      'Week 3: Add mindfulness practice',
      'Week 4: Full routine established',
    ],
    completionReward: 'You are now a morning person! Mornings feel intentional, not chaotic.',
  },
  fitness_starter: {
    name: 'Fitness Starter',
    description: 'Build a sustainable exercise habit from zero',
    domain: 'health',
    difficulty: 'easy',
    dailyActions: ['5-10 min of any movement', 'Track your activity', 'Celebrate showing up'],
    weeklyMilestones: [
      'Week 1: Move every day (5 min)',
      'Week 2: Build to 10 min',
      'Week 3: Add variety',
      'Week 4: 20+ min sessions',
    ],
    completionReward: 'You are now someone who exercises regularly!',
  },
  mindfulness: {
    name: 'Mindfulness Starter',
    description: 'Develop a sustainable meditation and presence practice',
    domain: 'mind',
    difficulty: 'easy',
    dailyActions: [
      'Take conscious breaths',
      'Sit quietly for a few minutes',
      'Notice without judgment',
    ],
    weeklyMilestones: [
      'Week 1: Breath awareness',
      'Week 2: Mindful moments',
      'Week 3: Longer sits',
      'Week 4: Integrated practice',
    ],
    completionReward: 'You have a new relationship with your mind. Presence is available to you.',
  },
  financial_reset: {
    name: 'Financial Reset',
    description: 'Build daily money awareness and healthy financial habits',
    domain: 'finance',
    difficulty: 'medium',
    dailyActions: ['Check account balances', 'Track spending', 'Review financial goals'],
    weeklyMilestones: [
      'Week 1: Awareness',
      'Week 2: Understanding patterns',
      'Week 3: Taking action',
      'Week 4: Habits established',
    ],
    completionReward: 'Financial awareness is now a habit. Money stress reduced.',
  },
  digital_detox: {
    name: 'Digital Detox',
    description: 'Reclaim your attention from screens',
    domain: 'mind',
    difficulty: 'hard',
    dailyActions: ['No phone first/last 30 min of day', 'Use app time limits', 'Phone-free zones'],
    weeklyMilestones: [
      'Week 1: Awareness of habits',
      'Week 2: Set boundaries',
      'Week 3: Find replacements',
      'Week 4: New normal',
    ],
    completionReward: 'Your attention is yours again. You control your devices, not vice versa.',
  },
  sleep_optimization: {
    name: 'Sleep Optimization',
    description: 'Build habits for better, more restorative sleep',
    domain: 'health',
    difficulty: 'medium',
    dailyActions: ['Consistent bedtime', 'Wind-down routine', 'Optimize sleep environment'],
    weeklyMilestones: [
      'Week 1: Track baseline',
      'Week 2: Consistency',
      'Week 3: Environment',
      'Week 4: Mastery',
    ],
    completionReward: 'Better sleep has transformed your energy and clarity.',
  },
  hydration: {
    name: 'Hydration Challenge',
    description: 'Build a consistent water drinking habit',
    domain: 'health',
    difficulty: 'easy',
    dailyActions: ['Drink water first thing', 'Water before meals', 'Track intake'],
    weeklyMilestones: [
      'Week 1: Baseline awareness',
      'Week 2: Build to 6 glasses',
      'Week 3: Optimize for you',
      'Week 4: Automatic habit',
    ],
    completionReward: 'Hydration is automatic. Your body thanks you.',
  },
  gratitude: {
    name: 'Gratitude Practice',
    description: 'Build a daily gratitude habit to shift perspective',
    domain: 'mind',
    difficulty: 'easy',
    dailyActions: ['Write 3 gratitudes', 'Express appreciation', 'Notice good things'],
    weeklyMilestones: [
      'Week 1: Simple gratitude',
      'Week 2: Specific gratitude',
      'Week 3: Express gratitude',
      'Week 4: Integrated practice',
    ],
    completionReward: 'Your perspective has shifted. You naturally notice the good.',
  },
  declutter: {
    name: 'Declutter Challenge',
    description: 'Clear your space, clear your mind - one area at a time',
    domain: 'home',
    difficulty: 'medium',
    dailyActions: ['Declutter one area', 'Donate/discard items', 'Maintain cleared spaces'],
    weeklyMilestones: [
      'Week 1: Quick wins',
      'Week 2: Digital declutter',
      'Week 3: Room by room',
      'Week 4: Maintenance system',
    ],
    completionReward: 'Your space is clear and your system keeps it that way.',
  },
  connection: {
    name: 'Connection Challenge',
    description: 'Strengthen relationships through daily connection',
    domain: 'relationships',
    difficulty: 'easy',
    dailyActions: ['Reach out to someone', 'Quality conversation', 'Express appreciation'],
    weeklyMilestones: [
      'Week 1: Reach out',
      'Week 2: Deepen quality',
      'Week 3: Build community',
      'Week 4: Create rituals',
    ],
    completionReward: 'Your relationships are stronger and more connected.',
  },
};

// ============================================================================
// CHALLENGE HELPER FUNCTIONS
// ============================================================================

export function getChallengeDayEncouragement(day: number): string {
  if (day === 1) return 'Day 1! The hardest part is starting. You did it!';
  if (day === 7) return "ONE WEEK! Most people don't make it this far. You're different.";
  if (day === 14) return "Two weeks! You're building something real now.";
  if (day === 21) return 'THREE WEEKS! Research says this is when habits start to stick.';
  if (day === 30) return '30 DAYS! You did it! You transformed yourself!';
  if (day % 7 === 0) return `Week ${day / 7} complete! Keep going!`;
  return "Another day, another vote for who you're becoming.";
}

export function checkChallengeMilestones(day: number, completedDays: number): string | null {
  if (day === 7 && completedDays >= 5) return '🌟 First Week Champion! 5+ days completed!';
  if (day === 14 && completedDays >= 10) return '⭐ Two Week Warrior! 10+ days completed!';
  if (day === 21 && completedDays >= 15) return '🏆 Three Week Titan! Habit forming!';
  if (day === 30 && completedDays >= 25) return '🎉 30-Day Master! 25+ days! Incredible!';
  if (completedDays === 7) return '🔥 7-day completion streak!';
  if (completedDays === 14) return '🔥🔥 14-day completion streak!';
  if (completedDays === 21) return "🔥🔥🔥 21-day streak! You're unstoppable!";
  return null;
}

export function getChallengeProgress(
  challengeId: string,
  currentDay: number,
  completedDays: number[]
): string {
  const challenge = THIRTY_DAY_CHALLENGES[challengeId];
  if (!challenge) return 'Challenge not found.';

  const completionRate = Math.round((completedDays.length / currentDay) * 100);
  const weekNumber = Math.ceil(currentDay / 7);
  const milestone = challenge.weeklyMilestones[weekNumber - 1] || challenge.weeklyMilestones[3];

  return `
📊 **${challenge.name}** - Day ${currentDay}/30

**Progress:** ${completedDays.length} days completed (${completionRate}%)
**Current Focus:** ${milestone}
**Streak:** ${getStreakCount(completedDays, currentDay)} days

${getChallengeDayEncouragement(currentDay)}
${checkChallengeMilestones(currentDay, completedDays.length) || ''}
  `.trim();
}

function getStreakCount(completedDays: number[], currentDay: number): number {
  let streak = 0;
  for (let i = currentDay - 1; i >= 0; i--) {
    if (completedDays.includes(i + 1)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}
