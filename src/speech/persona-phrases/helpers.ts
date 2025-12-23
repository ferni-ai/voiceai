/**
 * Persona Phrases - Helper Functions
 *
 * Utility functions for persona normalization and lookups.
 *
 * @module persona-phrases/helpers
 */

// ============================================================================
// PERSONA NORMALIZATION
// ============================================================================

const PERSONA_ALIASES: Record<string, string> = {
  'jack-b': 'ferni',
  maya: 'maya-santos',
  jordan: 'jordan-taylor',
  alex: 'alex-chen',
};

/**
 * Normalize persona ID to canonical form
 */
export function normalizePersonaId(personaId: string): string {
  return PERSONA_ALIASES[personaId] || personaId;
}

// ============================================================================
// ALIAS HELPERS
// ============================================================================

/**
 * Add backward compatibility aliases to a record
 */
export function addPersonaAliases<T>(record: Record<string, T>): void {
  record['jack-b'] = record.ferni;
  record.maya = record['maya-santos'];
  record.jordan = record['jordan-taylor'];
  record.alex = record['alex-chen'];
}
