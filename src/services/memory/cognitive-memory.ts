/**
 * Cognitive Memory Stub
 *
 * This module was removed during the memory architecture cleanup (Jan 2026).
 * These are stub exports to maintain backward compatibility until all
 * callers are migrated.
 *
 * TODO: Migrate callers to use unified-memory-service.ts instead.
 */

import type { ReasoningStyle } from '../../personas/cognitive-types.js';
import type { UserProfile } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

export interface CognitiveSessionState {
  userId: string;
  personaId: string;
  userStyle: ReasoningStyle;
  userStyleConfidence: number;
  approachesUsed: Map<string, number>;
  topicsExplained: string[];
}

// In-memory session storage (stub)
const sessions = new Map<string, CognitiveSessionState>();

export async function initializeCognitiveSession(
  userId: string,
  personaId: string,
  _userProfile: UserProfile | null
): Promise<CognitiveSessionState> {
  const key = `${userId}-${personaId}`;
  const state: CognitiveSessionState = {
    userId,
    personaId,
    userStyle: 'analytical',
    userStyleConfidence: 0.5,
    approachesUsed: new Map(),
    topicsExplained: [],
  };
  sessions.set(key, state);
  return state;
}

export async function endCognitiveSession(
  userId: string,
  personaId: string
): Promise<{
  approachesUsed: number;
  topicsExplained: number;
  userStyle: ReasoningStyle; // Match what hooks expect
  finalStyle: ReasoningStyle; // Alias for compatibility
  finalConfidence: number;
} | null> {
  const key = `${userId}-${personaId}`;
  const session = sessions.get(key);
  if (!session) return null;

  sessions.delete(key);
  return {
    approachesUsed: session.approachesUsed.size,
    topicsExplained: session.topicsExplained.length,
    userStyle: session.userStyle,
    finalStyle: session.userStyle,
    finalConfidence: session.userStyleConfidence,
  };
}

export async function syncCognitiveToProfile(
  _userId: string,
  profile: UserProfile
): Promise<UserProfile> {
  // Stub - returns profile unchanged
  log.debug('syncCognitiveToProfile called (stub)');
  return profile;
}

export function loadCognitiveFromProfile(
  _userId: string,
  _personaId: string,
  _profile: UserProfile
): void {
  // Stub - no-op
  log.debug('loadCognitiveFromProfile called (stub)');
}

export function getCognitiveSession(
  userId: string,
  personaId: string
): CognitiveSessionState | null {
  return sessions.get(`${userId}-${personaId}`) || null;
}

// Additional stubs for services/di/setup.ts
export interface CognitiveMemoryItem {
  id: string;
  type: string;
  content: string;
  confidence: number;
  source: string;
  timestamp: Date;
}

export interface CognitiveMemoryService {
  getMemories(userId: string): Promise<CognitiveMemoryItem[]>;
  getProfile(userId: string): Promise<UserProfile | null>;
}

export function getCognitiveMemoryService(): CognitiveMemoryService {
  log.debug('getCognitiveMemoryService called (stub)');
  return {
    async getMemories(_userId: string) {
      return [];
    },
    async getProfile(_userId: string) {
      return null;
    },
  };
}
