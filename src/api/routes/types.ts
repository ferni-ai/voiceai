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
  learnedAt: string;
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
    'nayan-patel': 'Jack Bogle',
    'peter-john': 'Peter',
    'spend-save': 'Maya',
    'event-planner': 'Jordan',
    'comm-specialist': 'Alex',
  };
  return names[personaId || ''] || 'conversation';
}

export function mapMemoryTypeToUIType(memType: string): string {
  const typeMap: Record<string, string> = {
    fund: 'fact',
    stock: 'fact',
    company: 'fact',
    merchant: 'fact',
    bill: 'fact',
    date: 'fact',
    venue: 'fact',
    contact_note: 'fact',
    preference: 'preference',
    philosophy: 'preference',
    style: 'preference',
    music: 'preference',
    communication_preference: 'preference',
    destination: 'preference',
    savings_goal: 'goal',
    watchlist: 'goal',
    win: 'goal',
    trigger: 'pattern',
    category: 'pattern',
    allocation: 'pattern',
    scheduling_note: 'pattern',
    milestone: 'relationship',
    inside_joke: 'relationship',
    story: 'relationship',
    vendor: 'relationship',
  };
  return typeMap[memType] || 'fact';
}

export function formatMemoryContent(memory: AnyRecord): string {
  let content = (memory.name as string) || '';
  if (memory.details) content += `: ${memory.details}`;
  if (memory.ticker) content = `${memory.name} (${memory.ticker})`;
  if (memory.reason) content += ` - ${memory.reason}`;
  if (memory.amount) content += ` ($${memory.amount})`;
  if (memory.targetAmount) content += ` - Goal: $${memory.targetAmount}`;
  if (memory.date && memory.type === 'date') content += ` on ${memory.date}`;
  if (memory.person) content += ` (${memory.person})`;
  return content;
}

export function calculateConfidence(memory: AnyRecord): number {
  const referenceBoost = Math.min(0.3, ((memory.timesReferenced as number) || 0) * 0.05);
  const baseConfidence = 0.7 + referenceBoost;
  const sentimentBoost = memory.sentiment && memory.sentiment !== 'neutral' ? 0.05 : 0;
  return Math.min(0.99, baseConfidence + sentimentBoost);
}
