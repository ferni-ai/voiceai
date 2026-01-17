/**
 * Meaningful Silence System - Micro Stories Helpers
 *
 * Helper functions for working with persona-specific micro-stories.
 * The actual MICRO_STORIES content is in content.ts.
 *
 * @module personas/meaningful-silence/micro-stories
 */

import { MICRO_STORIES } from './content.js';

// Re-export for backward compatibility
export { MICRO_STORIES };

// ============================================================================
// ALIAS MAPPINGS
// ============================================================================

/**
 * Legacy alias mappings for backward compatibility
 */
export const MICRO_STORIES_ALIASES: Record<string, string> = {
  'jack-b': 'jackB',
  ferni: 'jackB',
  'peter-john': 'peterLynch',
  'peter-lynch': 'peterLynch',
  'alex-chen': 'alex',
  'maya-santos': 'maya',
  'jordan-taylor': 'jordan',
  'nayan-patel': 'nayan',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get micro-stories for a persona with alias resolution
 */
export function getMicroStoriesForPersona(personaId: string): string[] {
  const normalizedId = MICRO_STORIES_ALIASES[personaId] || personaId;
  return MICRO_STORIES[normalizedId as keyof typeof MICRO_STORIES] || MICRO_STORIES.jackB || [];
}
