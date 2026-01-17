/**
 * Memory Callback System
 * 
 * "Ferni remembered..." - The signature moment that defines the brand.
 * 
 * When Ferni references something the user said weeks or months ago,
 * it creates a profound moment of being truly seen and heard.
 * This is the primary signature moment per SIGNATURE-MOMENTS.md.
 * 
 * Types of callbacks:
 * - Quote callbacks ("You once said...")
 * - Pattern callbacks ("I've noticed you tend to...")
 * - Growth arc callbacks ("Remember when X felt impossible?")
 * - Anniversary callbacks ("A year ago today...")
 * - Prediction callbacks ("You mentioned wanting to...")
 * 
 * @module conversation/superhuman/memory-callbacks
 */

import { createLogger } from '../../utils/safe-logger.js';
import { seededPick, seededChance } from '../utils/random-generator.js';

const log = createLogger({ module: 'MemoryCallbacks' });

// ============================================================================
// TYPES
// ============================================================================

export interface MemoryCallback {
  id: string;
  type: MemoryCallbackType;
  content: MemoryContent;
  timing: CallbackTiming;
  impact: 'subtle' | 'significant' | 'profound';
}

export type MemoryCallbackType =
  | 'quote_callback'      // Direct quote from user
  | 'pattern_callback'    // Observed pattern over time
  | 'growth_arc'          // Progress since a past struggle
  | 'anniversary'         // Date-based memory
  | 'prediction'          // Something they said they'd do
  | 'relationship'        // Person they mentioned
  | 'dream_reminder'      // Goal or dream they shared
  | 'struggle_resolved'   // Past difficulty now overcome
  | 'preference_memory'   // Small detail remembered
  | 'emotional_echo';     // Similar emotional state recalled

export interface MemoryContent {
  originalQuote?: string;
  originalDate: Date;
  context: string;
  currentRelevance: string;
  suggestedCallback: string;
}

export interface CallbackTiming {
  minDaysAgo: number;
  maxDaysAgo: number;
  idealMoment: string; // Description of when to use
}

export interface UserMemoryBank {
  userId: string;
  quotes: StoredQuote[];
  patterns: StoredPattern[];
  milestones: StoredMilestone[];
  relationships: StoredRelationship[];
  dreams: StoredDream[];
  lastCallbackDate?: Date;
  callbackCount: number;
}

export interface StoredQuote {
  id: string;
  text: string;
  date: Date;
  context: string;
  emotion: string;
  usedInCallback: boolean;
}

export interface StoredPattern {
  id: string;
  pattern: string;
  firstObserved: Date;
  occurrences: number;
  lastOccurrence: Date;
}

export interface StoredMilestone {
  id: string;
  description: string;
  date: Date;
  significance: 'minor' | 'major' | 'transformative';
}

export interface StoredRelationship {
  id: string;
  name: string;
  relationship: string;
  firstMentioned: Date;
  lastMentioned: Date;
  context: string[];
}

export interface StoredDream {
  id: string;
  dream: string;
  date: Date;
  status: 'active' | 'achieved' | 'abandoned' | 'evolved';
  updates: Array<{ date: Date; note: string }>;
}

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

const memoryBanks = new Map<string, UserMemoryBank>();

function getMemoryBank(userId: string): UserMemoryBank {
  let bank = memoryBanks.get(userId);
  if (!bank) {
    bank = {
      userId,
      quotes: [],
      patterns: [],
      milestones: [],
      relationships: [],
      dreams: [],
      callbackCount: 0,
    };
    memoryBanks.set(userId, bank);
  }
  return bank;
}

// ============================================================================
// CALLBACK TEMPLATES
// ============================================================================

const QUOTE_CALLBACK_TEMPLATES = [
  'You know what I remembered? Back in {timeAgo}, you said "{quote}". {relevance}',
  'Something you said in {timeAgo} stuck with me: "{quote}". {relevance}',
  'I was thinking about something you mentioned {timeAgo}—"{quote}". {relevance}',
  'Remember when you told me "{quote}"? That was {timeAgo}. {relevance}',
];

const PATTERN_CALLBACK_TEMPLATES = [
  "I've noticed something. {pattern}. Does that resonate?",
  "There's a pattern I see in you: {pattern}. What do you think?",
  "Can I share an observation? {pattern}.",
  "Something I've noticed over our conversations: {pattern}.",
];

const GROWTH_ARC_TEMPLATES = [
  'Remember {timeAgo} when {struggle}? Look at you now. {growth}',
  "I was thinking about where you were {timeAgo}. {struggle}. And now? {growth}",
  "You've come so far. {timeAgo}: {struggle}. Today: {growth}",
  "Do you remember {timeAgo}? {struggle}. Look how much has changed. {growth}",
];

const DREAM_CALLBACK_TEMPLATES = [
  'You mentioned wanting to {dream} back in {timeAgo}. How\'s that going?',
  'I remember you talking about {dream}. That was {timeAgo}. Any progress?',
  '{timeAgo} you said you wanted to {dream}. I haven\'t forgotten. Have you?',
];

const RELATIONSHIP_CALLBACK_TEMPLATES = [
  'How\'s {name}? You mentioned them {timeAgo}.',
  'I was thinking about what you said about {name}. {context}. How are things?',
  'You haven\'t mentioned {name} in a while. Everything okay there?',
];

// ============================================================================
// MEMORY STORAGE FUNCTIONS
// ============================================================================

/**
 * Store a memorable quote from the user
 */
export function storeQuote(
  userId: string,
  quote: string,
  context: string,
  emotion: string
): void {
  const bank = getMemoryBank(userId);
  
  // Don't store duplicates or very short quotes
  if (quote.length < 20) return;
  if (bank.quotes.some(q => q.text === quote)) return;
  
  bank.quotes.push({
    id: `quote_${Date.now()}`,
    text: quote,
    date: new Date(),
    context,
    emotion,
    usedInCallback: false,
  });
  
  // Keep only the 50 most recent quotes
  if (bank.quotes.length > 50) {
    bank.quotes = bank.quotes.slice(-50);
  }
  
  log.debug({ userId, quoteLength: quote.length }, '💭 Quote stored for memory callback');
}

/**
 * Store an observed pattern
 */
export function storePattern(
  userId: string,
  pattern: string
): void {
  const bank = getMemoryBank(userId);
  
  const existing = bank.patterns.find(p => p.pattern === pattern);
  if (existing) {
    existing.occurrences++;
    existing.lastOccurrence = new Date();
  } else {
    bank.patterns.push({
      id: `pattern_${Date.now()}`,
      pattern,
      firstObserved: new Date(),
      occurrences: 1,
      lastOccurrence: new Date(),
    });
  }
}

/**
 * Store a milestone
 */
export function storeMilestone(
  userId: string,
  description: string,
  significance: 'minor' | 'major' | 'transformative'
): void {
  const bank = getMemoryBank(userId);
  
  bank.milestones.push({
    id: `milestone_${Date.now()}`,
    description,
    date: new Date(),
    significance,
  });
  
  log.info({ userId, significance }, '🎯 Milestone stored');
}

/**
 * Store a mentioned relationship
 */
export function storeRelationship(
  userId: string,
  name: string,
  relationship: string,
  context: string
): void {
  const bank = getMemoryBank(userId);
  
  const existing = bank.relationships.find(r => r.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.lastMentioned = new Date();
    if (!existing.context.includes(context)) {
      existing.context.push(context);
    }
  } else {
    bank.relationships.push({
      id: `rel_${Date.now()}`,
      name,
      relationship,
      firstMentioned: new Date(),
      lastMentioned: new Date(),
      context: [context],
    });
  }
}

/**
 * Store a dream or goal
 */
export function storeDream(
  userId: string,
  dream: string
): void {
  const bank = getMemoryBank(userId);
  
  bank.dreams.push({
    id: `dream_${Date.now()}`,
    dream,
    date: new Date(),
    status: 'active',
    updates: [],
  });
  
  log.info({ userId }, '✨ Dream stored for future callback');
}

// ============================================================================
// CALLBACK GENERATION
// ============================================================================

/**
 * Generate a memory callback if conditions are right
 */
export function generateMemoryCallback(
  userId: string,
  currentContext: string
): MemoryCallback | null {
  const bank = getMemoryBank(userId);
  
  // Rate limiting: max 1 callback per 3 days
  if (bank.lastCallbackDate) {
    const daysSinceLastCallback = Math.floor(
      (Date.now() - bank.lastCallbackDate.getTime()) / (24 * 60 * 60 * 1000)
    );
    if (daysSinceLastCallback < 3) {
      return null;
    }
  }
  
  // Probability: 15% chance per eligible conversation
  if (!seededChance(`${Date.now()}:callback`, 0.15)) {
    return null;
  }
  
  // Try different callback types in order of impact
  const callback = 
    tryQuoteCallback(bank, currentContext) ||
    tryGrowthArcCallback(bank, currentContext) ||
    tryDreamCallback(bank, currentContext) ||
    tryPatternCallback(bank, currentContext) ||
    tryRelationshipCallback(bank, currentContext);
  
  if (callback) {
    bank.lastCallbackDate = new Date();
    bank.callbackCount++;
    log.info({ userId, type: callback.type, count: bank.callbackCount }, '🔮 Memory callback generated');
  }
  
  return callback;
}

function tryQuoteCallback(bank: UserMemoryBank, currentContext: string): MemoryCallback | null {
  // Find quotes that are at least 14 days old and haven't been used
  const eligibleQuotes = bank.quotes.filter(q => {
    const daysAgo = Math.floor((Date.now() - q.date.getTime()) / (24 * 60 * 60 * 1000));
    return daysAgo >= 14 && !q.usedInCallback;
  });
  
  if (eligibleQuotes.length === 0) return null;
  
  // Pick the oldest unused quote
  const quote = eligibleQuotes[0];
  const daysAgo = Math.floor((Date.now() - quote.date.getTime()) / (24 * 60 * 60 * 1000));
  const timeAgo = formatTimeAgo(daysAgo);
  
  const template = seededPick(`${Date.now()}:quote`, QUOTE_CALLBACK_TEMPLATES) ?? QUOTE_CALLBACK_TEMPLATES[0];
  const suggestedCallback = template
    .replace('{timeAgo}', timeAgo)
    .replace('{quote}', quote.text)
    .replace('{relevance}', 'I think about that sometimes.');
  
  quote.usedInCallback = true;
  
  return {
    id: `callback_${Date.now()}`,
    type: 'quote_callback',
    content: {
      originalQuote: quote.text,
      originalDate: quote.date,
      context: quote.context,
      currentRelevance: 'User has returned after time away',
      suggestedCallback,
    },
    timing: {
      minDaysAgo: 14,
      maxDaysAgo: 365,
      idealMoment: 'When conversation naturally touches on related topic',
    },
    impact: daysAgo > 90 ? 'profound' : daysAgo > 30 ? 'significant' : 'subtle',
  };
}

function tryGrowthArcCallback(bank: UserMemoryBank, currentContext: string): MemoryCallback | null {
  // Find transformative milestones from at least 30 days ago
  const eligibleMilestones = bank.milestones.filter(m => {
    const daysAgo = Math.floor((Date.now() - m.date.getTime()) / (24 * 60 * 60 * 1000));
    return daysAgo >= 30 && m.significance !== 'minor';
  });
  
  if (eligibleMilestones.length === 0) return null;
  
  const milestone = eligibleMilestones[0];
  const daysAgo = Math.floor((Date.now() - milestone.date.getTime()) / (24 * 60 * 60 * 1000));
  const timeAgo = formatTimeAgo(daysAgo);
  
  const template = seededPick(`${Date.now()}:growth`, GROWTH_ARC_TEMPLATES) ?? GROWTH_ARC_TEMPLATES[0];
  const suggestedCallback = template
    .replace('{timeAgo}', timeAgo)
    .replace('{struggle}', milestone.description)
    .replace('{growth}', 'Look how far you\'ve come.');
  
  return {
    id: `callback_${Date.now()}`,
    type: 'growth_arc',
    content: {
      originalDate: milestone.date,
      context: milestone.description,
      currentRelevance: 'User has grown since this moment',
      suggestedCallback,
    },
    timing: {
      minDaysAgo: 30,
      maxDaysAgo: 365,
      idealMoment: 'When user expresses doubt or mentions related topic',
    },
    impact: 'profound',
  };
}

function tryDreamCallback(bank: UserMemoryBank, currentContext: string): MemoryCallback | null {
  // Find active dreams from at least 30 days ago
  const eligibleDreams = bank.dreams.filter(d => {
    const daysAgo = Math.floor((Date.now() - d.date.getTime()) / (24 * 60 * 60 * 1000));
    return daysAgo >= 30 && d.status === 'active';
  });
  
  if (eligibleDreams.length === 0) return null;
  
  const dream = eligibleDreams[0];
  const daysAgo = Math.floor((Date.now() - dream.date.getTime()) / (24 * 60 * 60 * 1000));
  const timeAgo = formatTimeAgo(daysAgo);
  
  const template = seededPick(`${Date.now()}:dream`, DREAM_CALLBACK_TEMPLATES) ?? DREAM_CALLBACK_TEMPLATES[0];
  const suggestedCallback = template
    .replace('{timeAgo}', timeAgo)
    .replace('{dream}', dream.dream);
  
  return {
    id: `callback_${Date.now()}`,
    type: 'dream_reminder',
    content: {
      originalDate: dream.date,
      context: dream.dream,
      currentRelevance: 'Checking in on a stated goal',
      suggestedCallback,
    },
    timing: {
      minDaysAgo: 30,
      maxDaysAgo: 180,
      idealMoment: 'When conversation is reflective or future-focused',
    },
    impact: 'significant',
  };
}

function tryPatternCallback(bank: UserMemoryBank, currentContext: string): MemoryCallback | null {
  // Find patterns observed at least 3 times
  const eligiblePatterns = bank.patterns.filter(p => p.occurrences >= 3);
  
  if (eligiblePatterns.length === 0) return null;
  
  const pattern = eligiblePatterns[0];
  
  const template = seededPick(`${Date.now()}:pattern`, PATTERN_CALLBACK_TEMPLATES) ?? PATTERN_CALLBACK_TEMPLATES[0];
  const suggestedCallback = template.replace('{pattern}', pattern.pattern);
  
  return {
    id: `callback_${Date.now()}`,
    type: 'pattern_callback',
    content: {
      originalDate: pattern.firstObserved,
      context: `Observed ${pattern.occurrences} times`,
      currentRelevance: 'Recurring pattern worth surfacing',
      suggestedCallback,
    },
    timing: {
      minDaysAgo: 7,
      maxDaysAgo: 90,
      idealMoment: 'When pattern appears again',
    },
    impact: 'subtle',
  };
}

function tryRelationshipCallback(bank: UserMemoryBank, currentContext: string): MemoryCallback | null {
  // Find relationships not mentioned in over 30 days
  const eligibleRelationships = bank.relationships.filter(r => {
    const daysSinceLastMention = Math.floor(
      (Date.now() - r.lastMentioned.getTime()) / (24 * 60 * 60 * 1000)
    );
    return daysSinceLastMention >= 30;
  });
  
  if (eligibleRelationships.length === 0) return null;
  
  const rel = eligibleRelationships[0];
  const daysSinceFirstMention = Math.floor(
    (Date.now() - rel.firstMentioned.getTime()) / (24 * 60 * 60 * 1000)
  );
  const timeAgo = formatTimeAgo(daysSinceFirstMention);
  
  const template = seededPick(`${Date.now()}:rel`, RELATIONSHIP_CALLBACK_TEMPLATES) ?? RELATIONSHIP_CALLBACK_TEMPLATES[0];
  const suggestedCallback = template
    .replace('{name}', rel.name)
    .replace('{timeAgo}', timeAgo)
    .replace('{context}', rel.context[0] || '');
  
  return {
    id: `callback_${Date.now()}`,
    type: 'relationship',
    content: {
      originalDate: rel.firstMentioned,
      context: `${rel.name} (${rel.relationship})`,
      currentRelevance: 'Relationship check-in',
      suggestedCallback,
    },
    timing: {
      minDaysAgo: 30,
      maxDaysAgo: 180,
      idealMoment: 'Natural pause in conversation',
    },
    impact: 'subtle',
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTimeAgo(days: number): string {
  if (days < 7) return 'a few days ago';
  if (days < 14) return 'about a week ago';
  if (days < 30) return 'a few weeks ago';
  if (days < 60) return 'about a month ago';
  if (days < 90) return 'a couple months ago';
  if (days < 180) return 'a few months ago';
  if (days < 365) return 'several months ago';
  return 'about a year ago';
}

/**
 * Format memory callback for prompt injection
 */
export function formatMemoryCallbackForPrompt(callback: MemoryCallback): string {
  const lines = [
    '[🔮 MEMORY CALLBACK OPPORTUNITY]',
    '',
    `Type: ${callback.type}`,
    `Impact: ${callback.impact}`,
    '',
    `Suggested delivery: "${callback.content.suggestedCallback}"`,
    '',
    `Original context: ${callback.content.context}`,
    `Time since: ${formatTimeAgo(Math.floor((Date.now() - callback.content.originalDate.getTime()) / (24 * 60 * 60 * 1000)))}`,
    '',
    'Deliver this naturally. Don\'t announce "I remember..."—just weave it in.',
    'This is THE signature Ferni moment. Make it land.',
  ];
  
  return lines.join('\n');
}

/**
 * Get user's memory callback stats
 */
export function getMemoryCallbackStats(userId: string): {
  totalQuotes: number;
  totalPatterns: number;
  totalCallbacks: number;
  oldestMemory: Date | null;
} {
  const bank = getMemoryBank(userId);
  
  const allDates = [
    ...bank.quotes.map(q => q.date),
    ...bank.milestones.map(m => m.date),
    ...bank.dreams.map(d => d.date),
  ];
  
  const oldestMemory = allDates.length > 0
    ? new Date(Math.min(...allDates.map(d => d.getTime())))
    : null;
  
  return {
    totalQuotes: bank.quotes.length,
    totalPatterns: bank.patterns.length,
    totalCallbacks: bank.callbackCount,
    oldestMemory,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  storeQuote,
  storePattern,
  storeMilestone,
  storeRelationship,
  storeDream,
  generateMemoryCallback,
  formatMemoryCallbackForPrompt,
  getMemoryCallbackStats,
};
