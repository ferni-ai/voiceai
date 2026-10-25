/**
 * Shared Types for Engagement Routes
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRecord = Record<string, any>;

export interface Weather {
  primary: string;
  energy?: string;
  note?: string;
}

export interface Pattern {
  id: string;
  pattern: string;
  frequency: number;
  examples: string[];
  category: string;
}

export interface UIMemory {
  id: string;
  type: string;
  content: string;
  confidence: number;
  source: string;
  learnedAt?: string; // omitted when unknown - never invented
  personaId?: string;
  sourceType: string;
}

export const MILESTONES = [3, 7, 14, 21, 30, 60, 90, 100, 365];

export const MILESTONE_MESSAGES: Record<number, string> = {
  3: "Three days in a row. You're building something real.",
  7: 'One whole week. The habit is taking root.',
  14: 'Two weeks strong. This is becoming part of who you are.',
  21: 'Three weeks. Scientists say habits form around now.',
  30: "One month! You've proven you can stick with this.",
  60: 'Two months of consistency. Remarkable.',
  90: "90 days. This isn't a habit anymore—it's you.",
  100: 'Triple digits! 100 days of showing up for yourself.',
  365: 'One year. 365 days. Extraordinary commitment.',
};

export function getMilestoneMessage(streak: number): string {
  return MILESTONE_MESSAGES[streak] || `${streak} days and counting!`;
}

export function getPersonaName(personaId?: string): string {
  const names: Record<string, string> = {
    'jack-b': 'Ferni',
    'nayan-patel': 'Nayan',
    'peter-john': 'Peter',
    'spend-save': 'Maya',
    'event-planner': 'Jordan',
    'comm-specialist': 'Alex',
  };
  return names[personaId || ''] || 'conversation';
}
