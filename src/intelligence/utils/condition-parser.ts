/**
 * Safe Condition Parser
 *
 * Replaces unsafe eval()/new Function() with a safe condition evaluator.
 * Supports simple equality conditions for persona adjustments.
 *
 * Supported syntax:
 * - `true` - Always matches
 * - `userEmotion === 'anxious'` - Simple equality
 * - `topic === 'retirement' && relationshipStage === 'trusted'` - AND conditions
 * - `userEmotion === 'happy' || userEmotion === 'joy'` - OR conditions
 *
 * NOT supported (by design):
 * - Function calls
 * - Arithmetic
 * - Property access beyond first level
 * - Any code execution
 */

import { getLogger } from '../../utils/safe-logger.js';

export interface ConditionContext {
  userEmotion?: string;
  topic?: string;
  relationshipStage?: string;
  [key: string]: string | undefined;
}

/**
 * Parse and evaluate a condition string safely
 */
export function evaluateCondition(condition: string, context: ConditionContext): boolean {
  // Handle trivial cases
  const trimmed = condition.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === '') return true;

  // Handle OR conditions (split by ||)
  if (trimmed.includes('||')) {
    const parts = trimmed.split('||').map((p) => p.trim());
    return parts.some((part) => evaluateCondition(part, context));
  }

  // Handle AND conditions (split by &&)
  if (trimmed.includes('&&')) {
    const parts = trimmed.split('&&').map((p) => p.trim());
    return parts.every((part) => evaluateCondition(part, context));
  }

  // Handle single comparison
  return evaluateSingleCondition(trimmed, context);
}

/**
 * Evaluate a single comparison condition
 * Supports: variable === 'value' or variable !== 'value'
 */
function evaluateSingleCondition(condition: string, context: ConditionContext): boolean {
  // Match patterns like: userEmotion === 'anxious' or userEmotion !== 'happy'
  const equalityMatch = condition.match(/^(\w+)\s*===\s*['"]([^'"]+)['"]$/);
  if (equalityMatch) {
    const [, variable, value] = equalityMatch;
    return context[variable] === value;
  }

  const inequalityMatch = condition.match(/^(\w+)\s*!==\s*['"]([^'"]+)['"]$/);
  if (inequalityMatch) {
    const [, variable, value] = inequalityMatch;
    return context[variable] !== value;
  }

  // Match patterns like: userEmotion == 'anxious' (also support single =)
  const looseEqualityMatch = condition.match(/^(\w+)\s*={1,2}\s*['"]([^'"]+)['"]$/);
  if (looseEqualityMatch) {
    const [, variable, value] = looseEqualityMatch;
    return context[variable] === value;
  }

  // Check for variable existence (truthy check)
  const variableMatch = condition.match(/^(\w+)$/);
  if (variableMatch) {
    const [, variable] = variableMatch;
    return !!context[variable];
  }

  // Check for negated variable (!variable)
  const negatedMatch = condition.match(/^!(\w+)$/);
  if (negatedMatch) {
    const [, variable] = negatedMatch;
    return !context[variable];
  }

  // Invalid condition - log warning and return false (fail safe)
  getLogger().warn({ condition }, 'Invalid condition syntax');
  return false;
}

/**
 * Build a condition string from context (for creating new conditions)
 */
export function buildConditionFromContext(context: {
  userEmotion?: string;
  topic?: string;
  relationshipStage?: string;
}): string {
  const conditions: string[] = [];

  if (context.userEmotion) {
    conditions.push(`userEmotion === '${context.userEmotion}'`);
  }
  if (context.topic) {
    conditions.push(`topic === '${context.topic}'`);
  }
  if (context.relationshipStage) {
    conditions.push(`relationshipStage === '${context.relationshipStage}'`);
  }

  return conditions.length > 0 ? conditions.join(' && ') : 'true';
}

/**
 * Describe a condition in human-readable format
 */
export function describeCondition(context: {
  userEmotion?: string;
  topic?: string;
  relationshipStage?: string;
}): string {
  const parts: string[] = [];

  if (context.userEmotion) {
    parts.push(`user feels ${context.userEmotion}`);
  }
  if (context.topic) {
    parts.push(`discussing ${context.topic}`);
  }
  if (context.relationshipStage) {
    parts.push(`at ${context.relationshipStage} stage`);
  }

  return parts.length > 0 ? parts.join(', ') : 'any context';
}

export default {
  evaluateCondition,
  buildConditionFromContext,
  describeCondition,
};
