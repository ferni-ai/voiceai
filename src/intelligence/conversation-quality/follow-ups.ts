/**
 * Follow-Up Scheduling Module
 *
 * Extracts and manages follow-up items from conversations
 * to enable proactive future engagement.
 *
 * @module conversation-quality/follow-ups
 */

import type { FollowUpItem } from './types.js';

/**
 * Extract potential follow-up items from conversation
 */
export function extractFollowUps(
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  topics: string[]
): FollowUpItem[] {
  const followUps: FollowUpItem[] = [];
  const now = new Date();

  // Look for time-based references
  const fullConvo = conversationHistory.map((m) => m.content).join(' ');

  // "Next week", "next month", etc.
  if (/\b(next week|in a week)\b/i.test(fullConvo)) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    followUps.push({
      topic: 'Check in',
      suggestedDate: nextWeek,
      priority: 'medium',
      reason: 'User mentioned "next week"',
    });
  }

  if (/\b(next month|in a month)\b/i.test(fullConvo)) {
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    followUps.push({
      topic: 'Follow up',
      suggestedDate: nextMonth,
      priority: 'medium',
      reason: 'User mentioned "next month"',
    });
  }

  // Specific events that need follow-up
  if (/\b(retirement|retiring|retire)\b/i.test(fullConvo) && topics.includes('retirement')) {
    const twoWeeks = new Date(now);
    twoWeeks.setDate(twoWeeks.getDate() + 14);
    followUps.push({
      topic: 'Retirement planning progress',
      suggestedDate: twoWeeks,
      priority: 'high',
      reason: 'Discussed retirement planning',
    });
  }

  // Tax season follow-up
  const month = now.getMonth();
  if (month >= 0 && month <= 3 && /\b(tax|taxes|filing)\b/i.test(fullConvo)) {
    const april15 = new Date(now.getFullYear(), 3, 10); // A few days before deadline
    if (april15 > now) {
      followUps.push({
        topic: 'Tax preparation check-in',
        suggestedDate: april15,
        priority: 'high',
        reason: 'Tax season discussion',
      });
    }
  }

  // Year-end follow-up
  if (month >= 10 && /\b(contribution|max|401k|ira)\b/i.test(fullConvo)) {
    const yearEnd = new Date(now.getFullYear(), 11, 20);
    if (yearEnd > now) {
      followUps.push({
        topic: 'Year-end contribution reminder',
        suggestedDate: yearEnd,
        priority: 'high',
        reason: 'Discussed retirement contributions near year end',
      });
    }
  }

  return followUps;
}

/**
 * Generate a follow-up suggestion
 */
export function getFollowUpSuggestion(followUp: FollowUpItem): string {
  const daysUntil = Math.ceil(
    (followUp.suggestedDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntil <= 7) {
    return `Let's touch base about ${followUp.topic} in a few days.`;
  } else if (daysUntil <= 14) {
    return `I'd like to check in with you about ${followUp.topic} in a couple weeks.`;
  } else if (daysUntil <= 30) {
    return `Let's talk again about ${followUp.topic} next month.`;
  } else {
    return `We should revisit ${followUp.topic} when the time comes.`;
  }
}
