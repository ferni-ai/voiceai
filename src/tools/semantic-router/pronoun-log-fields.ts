/**
 * What the "Pronouns resolved" log may carry. The resolved values are text from
 * the caller's earlier turns (a person, a song, a place), and "the result" is the
 * last tool's whole output as JSON: log which pronouns resolved, and for "the
 * result" only its length.
 *
 * @module semantic-router/pronoun-log-fields
 */
export function pronounLogFields(
  resolvedPronouns: Record<string, string>,
  toolId: string
): { pronouns: string[]; resultLength: number | undefined; toolId: string } {
  return {
    pronouns: Object.keys(resolvedPronouns),
    resultLength: resolvedPronouns.result?.length,
    toolId,
  };
}
