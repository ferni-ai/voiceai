/**
 * Proactive Date Awareness
 *
 * "Happy birthday!" / "I know this week is hard..."
 *
 * @module superhuman-memory/date-awareness
 */

import type { HumanMemory, ImportantDate } from '../../types/human-memory.js';
import type { ProactiveInsight } from './types.js';

/**
 * Check for upcoming important dates
 */
export function checkUpcomingDates(
  humanMemory: Partial<HumanMemory> | undefined,
  daysAhead = 7
): ProactiveInsight[] {
  if (!humanMemory?.importantDates?.length) {
    return [];
  }

  const insights: ProactiveInsight[] = [];
  const now = new Date();
  // Normalize to start of day for accurate comparisons
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (const date of humanMemory.importantDates) {
    // Skip if user doesn't want acknowledgment
    if (!date.wantsAcknowledgment && date.sentiment === 'sensitive') {
      continue;
    }

    // Calculate days until this date occurs this year
    const thisYearDate = new Date(now.getFullYear(), date.month - 1, date.day);

    // If date has passed this year (not today), check next year
    if (thisYearDate.getTime() < todayStart.getTime()) {
      thisYearDate.setFullYear(thisYearDate.getFullYear() + 1);
    }

    const daysUntil = Math.floor(
      (thisYearDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Check if within window
    if (daysUntil <= daysAhead && daysUntil >= 0) {
      const insight = generateDateInsight(date, daysUntil);
      if (insight) {
        insights.push(insight);
      }
    }
  }

  // Sort by priority and days until
  insights.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  return insights;
}

/**
 * Generate a natural insight for an upcoming date
 */
function generateDateInsight(date: ImportantDate, daysUntil: number): ProactiveInsight | null {
  const isToday = daysUntil === 0;
  const isTomorrow = daysUntil === 1;

  let naturalPhrase: string;
  let tone: ProactiveInsight['context']['tone'];
  let priority: ProactiveInsight['priority'];

  switch (date.type) {
    case 'birthday':
      if (isToday) {
        naturalPhrase = date.relatedPerson
          ? `Happy birthday to ${date.relatedPerson}! I hope you're celebrating together.`
          : `Happy birthday! I hope your day is wonderful.`;
        priority = 'high';
      } else if (isTomorrow) {
        naturalPhrase = date.relatedPerson
          ? `${date.relatedPerson}'s birthday is tomorrow! Any special plans?`
          : `Your birthday is tomorrow! Anything special planned?`;
        priority = 'high';
      } else {
        naturalPhrase = date.relatedPerson
          ? `${date.relatedPerson}'s birthday is coming up in ${daysUntil} days.`
          : `Your birthday is coming up in ${daysUntil} days!`;
        priority = 'medium';
      }
      tone = 'celebratory';
      break;

    case 'anniversary':
      if (isToday) {
        naturalPhrase = `Happy anniversary! What a special day.`;
        priority = 'high';
      } else if (daysUntil <= 3) {
        naturalPhrase = `Your anniversary is ${isToday ? 'today' : isTomorrow ? 'tomorrow' : `in ${daysUntil} days`}!`;
        priority = 'high';
      } else {
        naturalPhrase = `Your anniversary is coming up on the ${date.day}th.`;
        priority = 'medium';
      }
      tone = 'celebratory';
      break;

    case 'loss_anniversary':
      // Handle with extra care
      if (isToday) {
        naturalPhrase = date.relatedPerson
          ? `I know today marks the anniversary of losing ${date.relatedPerson}. I'm here if you want to talk, or we can talk about something else entirely.`
          : `I know this is a difficult day. I'm here for you.`;
        priority = 'high';
        tone = 'gentle';
      } else if (daysUntil <= 3) {
        naturalPhrase = `I know this week might be hard${date.relatedPerson ? ` with the anniversary of ${date.relatedPerson}'s passing` : ''}. Just wanted you to know I'm here.`;
        priority = 'medium';
        tone = 'gentle';
      } else {
        // Don't mention too far in advance
        return null;
      }
      break;

    case 'milestone':
      if (isToday) {
        naturalPhrase = `Today marks ${date.label}! That's something to be proud of.`;
        priority = 'high';
      } else {
        naturalPhrase = `${date.label} is coming up in ${daysUntil} days.`;
        priority = 'medium';
      }
      tone = 'celebratory';
      break;

    default:
      naturalPhrase = `${date.label} is ${isToday ? 'today' : isTomorrow ? 'tomorrow' : `in ${daysUntil} days`}.`;
      priority = 'medium';
      tone = 'warm';
  }

  return {
    id: `date_${date.id}_${Date.now()}`,
    type: 'date_reminder',
    priority,
    content: `Upcoming: ${date.label} (${date.type})`,
    naturalPhrase,
    context: {
      timing: isToday ? 'greeting' : 'when_relevant',
      tone,
      oneTime: true,
    },
    generatedAt: new Date(),
    sourceId: date.id,
  };
}
