/**
 * Team Coordination Helpers
 *
 * Validation and utility functions for team coordination.
 */

import { getLifeDataStore, type TeamContext } from '../../../services/stores/life-data-store.js';
import { sanitizePlainText, parseAmount, isValidAmount } from '../../validation.js';
import {
  TEAM_CAPABILITIES,
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_AMOUNT,
  type TeamMember,
} from './types.js';

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function validateProjectName(name: unknown): {
  valid: boolean;
  sanitized?: string;
  error?: string;
} {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Project name is required' };
  }
  const sanitized = sanitizePlainText(name, MAX_NAME_LENGTH);
  if (sanitized.length < 2) {
    return { valid: false, error: 'Project name must be at least 2 characters' };
  }
  return { valid: true, sanitized };
}

export function validateAmountField(
  amount: unknown,
  fieldName = 'amount'
): { valid: boolean; sanitized?: number; error?: string } {
  if (amount === undefined || amount === null) {
    return { valid: true }; // Optional
  }
  const parsed = parseAmount(amount as string | number);
  if (parsed === null || !isValidAmount(parsed, 0, MAX_AMOUNT)) {
    return {
      valid: false,
      error: `Invalid ${fieldName}: must be between $0 and $${MAX_AMOUNT.toLocaleString()}`,
    };
  }
  return { valid: true, sanitized: parsed };
}

export function validateNotes(notes: unknown): {
  valid: boolean;
  sanitized?: string;
  error?: string;
} {
  if (!notes) {
    return { valid: true, sanitized: '' };
  }
  if (typeof notes !== 'string') {
    return { valid: false, error: 'Notes must be a string' };
  }
  return { valid: true, sanitized: sanitizePlainText(notes, MAX_NOTES_LENGTH) };
}

// ============================================================================
// TEAM HELPERS
// ============================================================================

/**
 * Get or create team context for a user
 */
export async function getOrCreateTeamContext(userId: string): Promise<TeamContext> {
  const store = getLifeDataStore();
  return store.getOrCreateTeamContext(userId);
}

/**
 * Find the best team member based on the user's need
 */
export function findBestTeamMember(need: string): TeamMember {
  const needLower = need.toLowerCase();

  // Check keywords
  const memberKeywords: Record<TeamMember, string[]> = {
    jordan: [
      'goal',
      'plan',
      'milestone',
      'event',
      'retire',
      'life',
      'vision',
      'timeline',
      'checklist',
    ],
    maya: [
      'budget',
      'save',
      'spend',
      'money',
      'debt',
      'subscription',
      'expense',
      'cost',
      'financial',
    ],
    alex: ['schedule', 'remind', 'email', 'call', 'calendar', 'follow', 'communicate', 'message'],
    'nayan-patel': ['invest', 'index', 'fund', 'portfolio', '401k', 'ira', 'retirement account'],
    'peter-john': ['stock', 'company', 'research', 'market', 'pick', 'growth'],
  };

  for (const [member, keywords] of Object.entries(memberKeywords)) {
    if (keywords.some((k) => needLower.includes(k))) {
      return member as TeamMember;
    }
  }

  return 'jordan'; // Default to Jordan as the life coordinator
}

/**
 * Get team member info
 */
export function getTeamMemberInfo(member: TeamMember) {
  return TEAM_CAPABILITIES[member];
}
