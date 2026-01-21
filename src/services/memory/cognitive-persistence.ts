/**
 * Cognitive Persistence Stub
 *
 * This module was removed during the memory architecture cleanup (Jan 2026).
 * These are stub exports to maintain backward compatibility.
 *
 * TODO: Migrate callers to use unified-memory-service.ts instead.
 */

export async function saveCognitiveState(
  _userId: string,
  _personaId: string,
  _state: unknown
): Promise<void> {
  // Stub - no-op
}

export async function loadCognitiveState(_userId: string, _personaId: string): Promise<null> {
  return null;
}
