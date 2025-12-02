/**
 * Persona Expressions - Meaningful emoji morphs for each agent
 * 
 * Each persona has signature expressions that convey their domain expertise.
 * These are pushed from the backend when contextually appropriate.
 */

import type { PersonaId } from '../types/persona.js';

// ============================================================================
// TYPES
// ============================================================================

export interface Expression {
  emoji: string;
  meaning: string;        // What this expression conveys
  triggerPhrases: string[]; // Backend phrases that might trigger this
}

export interface PersonaExpressions {
  signature: string;      // The persona's main/default expression
  expressions: Expression[];
}

// ============================================================================
// PERSONA EXPRESSION CONFIGS
// ============================================================================

export const PERSONA_EXPRESSIONS: Record<PersonaId, PersonaExpressions> = {
  // Ferni - The warm, welcoming life coach
  'jack-b': {
    signature: '☕',
    expressions: [
      { emoji: '☕', meaning: 'Welcome, let\'s chat', triggerPhrases: ['welcome', 'hello', 'let\'s talk', 'good morning'] },
      { emoji: '💡', meaning: 'Great idea!', triggerPhrases: ['idea', 'thought', 'consider', 'what if'] },
      { emoji: '🎯', meaning: 'Goal setting', triggerPhrases: ['goal', 'target', 'aim', 'objective'] },
      { emoji: '🤝', meaning: 'Let\'s work together', triggerPhrases: ['help', 'assist', 'together', 'team'] },
      { emoji: '⭐', meaning: 'Great job!', triggerPhrases: ['excellent', 'great', 'wonderful', 'amazing'] },
      { emoji: '🌟', meaning: 'You\'re making progress', triggerPhrases: ['progress', 'growing', 'improving', 'better'] },
    ],
  },

  // Jack Bogle - Index fund wisdom
  'jack-bogle': {
    signature: '📈',
    expressions: [
      { emoji: '📈', meaning: 'Growth over time', triggerPhrases: ['growth', 'compound', 'long-term', 'returns'] },
      { emoji: '🏦', meaning: 'Building wealth', triggerPhrases: ['save', 'wealth', 'accumulate', 'build'] },
      { emoji: '📊', meaning: 'Let\'s look at the data', triggerPhrases: ['data', 'chart', 'numbers', 'statistics'] },
      { emoji: '🐢', meaning: 'Slow and steady wins', triggerPhrases: ['patience', 'steady', 'consistent', 'time'] },
      { emoji: '💎', meaning: 'Valuable insight', triggerPhrases: ['important', 'key', 'crucial', 'valuable'] },
      { emoji: '🎓', meaning: 'Learning moment', triggerPhrases: ['learn', 'understand', 'education', 'know'] },
    ],
  },

  // Peter Lynch - Stock picking energy
  'peter-lynch': {
    signature: '🔥',
    expressions: [
      { emoji: '🔥', meaning: 'Hot opportunity!', triggerPhrases: ['opportunity', 'chance', 'potential', 'exciting'] },
      { emoji: '🎯', meaning: 'Targeting this stock', triggerPhrases: ['target', 'pick', 'choose', 'select'] },
      { emoji: '💎', meaning: 'Hidden gem', triggerPhrases: ['gem', 'diamond', 'find', 'discover'] },
      { emoji: '🚀', meaning: 'Growth potential', triggerPhrases: ['rocket', 'moon', 'sky', 'soar', 'growth'] },
      { emoji: '🔍', meaning: 'Do your research', triggerPhrases: ['research', 'investigate', 'look', 'analyze'] },
      { emoji: '🏆', meaning: 'Winner!', triggerPhrases: ['winner', 'success', 'beat', 'outperform'] },
    ],
  },

  // Alex - Communication specialist
  'comm-specialist': {
    signature: '📧',
    expressions: [
      { emoji: '📧', meaning: 'Email ready', triggerPhrases: ['email', 'message', 'send', 'draft'] },
      { emoji: '📅', meaning: 'Scheduled!', triggerPhrases: ['schedule', 'calendar', 'meeting', 'appointment'] },
      { emoji: '📱', meaning: 'Call queued', triggerPhrases: ['call', 'phone', 'ring', 'contact'] },
      { emoji: '✅', meaning: 'Done!', triggerPhrases: ['done', 'complete', 'finished', 'sent'] },
      { emoji: '🔔', meaning: 'Reminder set', triggerPhrases: ['reminder', 'notify', 'alert', 'remember'] },
      { emoji: '💬', meaning: 'Message sent', triggerPhrases: ['text', 'sms', 'chat', 'message'] },
    ],
  },

  // Maya - Spend & save specialist
  'spend-save': {
    signature: '💰',
    expressions: [
      { emoji: '💰', meaning: 'Money talk', triggerPhrases: ['money', 'cash', 'funds', 'dollars'] },
      { emoji: '🐷', meaning: 'Saving up!', triggerPhrases: ['save', 'piggy', 'put away', 'savings'] },
      { emoji: '💳', meaning: 'Spending check', triggerPhrases: ['spend', 'purchase', 'buy', 'card'] },
      { emoji: '📉', meaning: 'Cutting costs', triggerPhrases: ['cut', 'reduce', 'lower', 'less'] },
      { emoji: '🎯', meaning: 'Budget goal', triggerPhrases: ['budget', 'goal', 'target', 'plan'] },
      { emoji: '🌱', meaning: 'Growing savings', triggerPhrases: ['grow', 'increase', 'more', 'building'] },
    ],
  },

  // Jordan - Life & event planner
  'event-planner': {
    signature: '🎉',
    expressions: [
      { emoji: '🎉', meaning: 'Celebration time!', triggerPhrases: ['celebrate', 'party', 'event', 'occasion'] },
      { emoji: '✈️', meaning: 'Travel plans', triggerPhrases: ['travel', 'trip', 'vacation', 'flight'] },
      { emoji: '🏠', meaning: 'Home goals', triggerPhrases: ['home', 'house', 'property', 'real estate'] },
      { emoji: '🚗', meaning: 'Car plans', triggerPhrases: ['car', 'vehicle', 'auto', 'drive'] },
      { emoji: '📆', meaning: 'Planning ahead', triggerPhrases: ['plan', 'schedule', 'year', 'future'] },
      { emoji: '🎁', meaning: 'Special moment', triggerPhrases: ['gift', 'present', 'surprise', 'special'] },
    ],
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the signature expression for a persona.
 */
export function getSignatureExpression(personaId: PersonaId): string {
  return PERSONA_EXPRESSIONS[personaId]?.signature ?? '✨';
}

/**
 * Get all expressions for a persona.
 */
export function getPersonaExpressions(personaId: PersonaId): Expression[] {
  return PERSONA_EXPRESSIONS[personaId]?.expressions ?? [];
}

/**
 * Find a matching expression based on text content.
 * Returns the emoji if a trigger phrase is found.
 */
export function findExpressionForText(personaId: PersonaId, text: string): string | null {
  const expressions = getPersonaExpressions(personaId);
  const lowerText = text.toLowerCase();
  
  for (const expr of expressions) {
    for (const phrase of expr.triggerPhrases) {
      if (lowerText.includes(phrase.toLowerCase())) {
        return expr.emoji;
      }
    }
  }
  
  return null;
}

/**
 * Get a random expression for variety.
 */
export function getRandomExpression(personaId: PersonaId): string {
  const expressions = getPersonaExpressions(personaId);
  if (expressions.length === 0) return '✨';
  
  const randomIndex = Math.floor(Math.random() * expressions.length);
  return expressions[randomIndex]?.emoji ?? '✨';
}

