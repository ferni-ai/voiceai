/**
 * Outreach API route helpers. Extracted from outreach.routes.ts.
 */

// Helper to get persona display name
export function getPersonaName(personaId: string): string {
  const names: Record<string, string> = {
    ferni: 'Ferni',
    maya: 'Maya Santos',
    peter: 'Peter John',
    alex: 'Alex Chen',
    jordan: 'Jordan Taylor',
    nayan: 'Nayan Patel',
  };
  return names[personaId] || 'Ferni';
}
