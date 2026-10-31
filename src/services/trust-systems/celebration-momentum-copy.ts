/**
 * What celebration momentum says: streak, theme and win-type wording, and its SSML (moved from
 * celebration-momentum.ts unchanged).
 *
 * @module services/trust-systems/celebration-momentum-copy
 */
import type { WinStreak, WinType } from './celebration-momentum.js';

/**
 * Generate streak message
 */
export function getStreakMessage(streak: WinStreak): string {
  const messages: Record<number, string[]> = {
    3: ["Three in a row! You're on a roll.", "That's three! Momentum is building."],
    5: ["Five wins! You're really getting somewhere.", "A five-win streak - that's no accident."],
    7: ["A full week of wins! That's incredible.", "Seven! You're making this a habit."],
    10: [
      'Double digits! This is becoming who you are.',
      'Ten wins in a row - you should be proud.',
    ],
    14: [
      'Two weeks of wins! This is transformation.',
      "Fourteen! You're not the same person you were.",
    ],
    21: [
      'Three weeks! They say it takes 21 days to build a habit.',
      "Twenty-one. This isn't a streak anymore - it's you.",
    ],
    30: ["A whole month! You've changed.", "Thirty days. Look how far you've come."],
  };

  const options = messages[streak.count] || [`${streak.count} wins! That's remarkable.`];

  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Generate theme message
 */
export function getThemeMessage(type: WinType, count: number): string {
  const messages: Record<WinType, string> = {
    followed_through: `${count} times you've followed through. You're becoming someone people can count on.`,
    courage_moment: `${count} moments of courage. You're braver than you know.`,
    self_care: `${count} acts of self-care. You're learning to take care of you.`,
    boundary_held: `${count} boundaries held. You're protecting your peace.`,
    hard_conversation: `${count} hard conversations. You're not avoiding the difficult anymore.`,
    showed_up: `${count} times you showed up when it was hard. That's character.`,
    tried_new_thing: `${count} new things tried. You're expanding your world.`,
    asked_for_help: `${count} times you asked for help. That's strength, not weakness.`,
    effort_made: `${count} times you gave it your all. Effort is everything.`,
    consistency: `${count} days of consistency. You're building something real.`,
    breakthrough: `${count} breakthroughs. You're transforming.`,
  };

  return messages[type] || `${count} wins of this type. You're making progress.`;
}

/**
 * Generate SSML
 */
export function generateSSML(text: string, mood: 'excited' | 'warm' | 'caring'): string {
  const prosody = {
    excited: { rate: '105%', pitch: '+5%' },
    warm: { rate: '95%', pitch: '-2%' },
    caring: { rate: '90%', pitch: '-3%' },
  };

  const p = prosody[mood];

  return `<speak>
    <prosody rate="${p.rate}" pitch="${p.pitch}">
      ${text}
    </prosody>
  </speak>`;
}

/**
 * Format win type for display
 */
export function formatWinType(type: WinType): string {
  const labels: Record<WinType, string> = {
    followed_through: 'follow-through',
    courage_moment: 'courage',
    self_care: 'self-care',
    boundary_held: 'boundaries',
    hard_conversation: 'hard conversations',
    showed_up: 'showing up',
    tried_new_thing: 'trying new things',
    asked_for_help: 'asking for help',
    effort_made: 'effort',
    consistency: 'consistency',
    breakthrough: 'breakthroughs',
  };
  return labels[type] || type;
}
