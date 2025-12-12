/**
 * ContextManager registry (per-session singleton instances).
 */

import { createSessionId, type SessionId } from '../types/branded.js';
import type { UserProfile } from '../types/user-profile.js';

import { ContextManager } from './context-manager.class.js';

const contextManagers = new Map<SessionId, ContextManager>();

export function getContextManager(
  sessionId: string | SessionId,
  userProfile?: UserProfile
): ContextManager {
  const brandedId = typeof sessionId === 'string' ? createSessionId(sessionId) : sessionId;

  let manager = contextManagers.get(brandedId);

  if (!manager) {
    manager = new ContextManager(brandedId, userProfile);
    contextManagers.set(brandedId, manager);
  } else if (userProfile) {
    manager.setUserProfile(userProfile);
  }

  return manager;
}

export function hasContextManager(sessionId: string | SessionId): boolean {
  const brandedId = typeof sessionId === 'string' ? createSessionId(sessionId) : sessionId;
  return contextManagers.has(brandedId);
}

export function removeContextManager(sessionId: string | SessionId): void {
  const brandedId = typeof sessionId === 'string' ? createSessionId(sessionId) : sessionId;
  contextManagers.delete(brandedId);
}

export function getContextManagerCount(): number {
  return contextManagers.size;
}

export function clearAllContextManagers(): void {
  contextManagers.clear();
}
