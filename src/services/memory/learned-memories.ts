/**
 * Learned Memories Stub
 *
 * This module was removed during the memory architecture cleanup (Jan 2026).
 * These are stub exports to maintain backward compatibility.
 *
 * TODO: Migrate callers to use unified-memory-service.ts instead.
 */

export interface LearnedMemory {
  id: string;
  userId: string;
  content: string;
  type: string;
  category: string;
  timestamp: Date;
}

export interface LearnedPattern {
  id: string;
  pattern: string;
  confidence: number;
  observationCount: number;
}

export async function getLearnedMemories(_userId: string): Promise<LearnedMemory[]> {
  return [];
}

export async function getLearnedPatterns(_userId: string): Promise<LearnedPattern[]> {
  return [];
}

export async function saveLearnedMemory(
  _userId: string,
  _memory: Partial<LearnedMemory>
): Promise<void> {
  // Stub - no-op
}

// Additional stubs for API routes and DI setup
// Note: Callers pass either userId (string) or profile object - we accept both
export async function extractLearnedMemories(_userIdOrProfile: string | unknown): Promise<{
  memories: LearnedMemory[];
  patterns: LearnedPattern[];
}> {
  return { memories: [], patterns: [] };
}

export function getLearnedMemoriesService(): null {
  return null;
}
