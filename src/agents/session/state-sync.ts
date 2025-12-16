/**
 * State Sync Utility
 *
 * @deprecated This module is deprecated. Use `createUserDataProxy` from
 * `session/user-data-proxy.ts` instead, which provides automatic synchronization
 * via a Proxy pattern - no manual sync calls needed.
 *
 * Bidirectional synchronization between SessionStateManager and legacy UserData.
 * This was Phase 5 of the voice agent refactoring, now superseded by Phase 11's
 * Proxy approach which makes SessionStateManager the single source of truth.
 *
 * @module session/state-sync
 */

import type { SessionStateManager } from './session-state.js';
import type { UserData } from '../shared/types.js';
import { diag } from '../../services/diagnostic-logger.js';

// ============================================================================
// SYNC DIRECTION TYPES
// ============================================================================

/**
 * Direction of state sync
 */
export type SyncDirection = 'to_legacy' | 'from_legacy' | 'bidirectional';

/**
 * Fields to sync
 */
export interface SyncFields {
  turnCount?: boolean;
  topic?: boolean;
  emotion?: boolean;
  timing?: boolean;
  bundle?: boolean;
  themes?: boolean;
  memories?: boolean;
  all?: boolean;
}

// ============================================================================
// SYNC FROM SESSION STATE TO LEGACY USER DATA
// ============================================================================

/**
 * Sync SessionStateManager state to legacy UserData object.
 * Call this after updating SessionStateManager to keep userData in sync.
 */
export function syncToLegacy(
  sessionState: SessionStateManager,
  userData: UserData,
  fields: SyncFields = { all: true }
): void {
  const state = sessionState.getState();

  if (fields.all || fields.turnCount) {
    userData.turnCount = state.conversation.turnCount;
  }

  if (fields.all || fields.topic) {
    userData.lastTopic = state.conversation.lastTopic;
    userData.recentTopics = state.conversation.recentTopics;
  }

  if (fields.all || fields.emotion) {
    userData.lastEmotionAnalysis = state.emotional.lastEmotionAnalysis;
    userData.voiceEmotion = state.emotional.voiceEmotion;
    userData.emotionModulation = state.emotional.emotionModulation;
  }

  if (fields.all || fields.timing) {
    userData.userSpeakingStartTime = state.timing.userSpeakingStartTime;
    userData.userWentSilent = state.timing.userWentSilent;
  }

  if (fields.all || fields.bundle) {
    if (userData.bundleRuntimeState) {
      userData.bundleRuntimeState.relationshipTurns = state.bundle.relationshipTurns;
      userData.bundleRuntimeState.currentMode = state.bundle.currentMode as 'listening' | 'active';
      userData.bundleRuntimeState.storiesToldThisSession = state.bundle.storiesToldThisSession;
    }
  }

  if (fields.all || fields.themes) {
    // UserData.mentionedPersonalThemes is Set<string>
    userData.mentionedPersonalThemes = new Set(state.conversation.mentionedPersonalThemes);
  }

  if (fields.all || fields.memories) {
    userData.referencedMemories = Array.from(state.conversation.referencedMemories);
    userData.hasReferencedLastConversation = state.conversation.hasReferencedLastConversation;
  }

  diag.state('State synced to legacy userData', {
    turnCount: state.conversation.turnCount,
    fields: Object.keys(fields).filter((k) => fields[k as keyof SyncFields]),
  });
}

// ============================================================================
// SYNC FROM LEGACY USER DATA TO SESSION STATE
// ============================================================================

/**
 * Sync legacy UserData to SessionStateManager.
 * Call this when legacy code updates userData to keep SessionStateManager in sync.
 */
export function syncFromLegacy(
  userData: UserData,
  sessionState: SessionStateManager,
  fields: SyncFields = { all: true }
): void {
  if (fields.all || fields.turnCount) {
    // Set turn count (need to use internal method since incrementTurn() adds 1)
    const currentTurnCount = sessionState.getTurnCount();
    const legacyTurnCount = userData.turnCount || 0;
    if (legacyTurnCount > currentTurnCount) {
      // Increment to match
      for (let i = currentTurnCount; i < legacyTurnCount; i++) {
        sessionState.incrementTurn();
      }
    }
  }

  if (fields.all || fields.topic) {
    if (userData.lastTopic) {
      sessionState.setTopic(userData.lastTopic);
    }
  }

  if (fields.all || fields.emotion) {
    if (userData.lastEmotionAnalysis) {
      sessionState.setEmotionAnalysis(userData.lastEmotionAnalysis);
    }
    if (userData.voiceEmotion) {
      sessionState.setVoiceEmotion(userData.voiceEmotion);
    }
    if (userData.emotionModulation) {
      sessionState.setEmotionModulation(userData.emotionModulation);
    }
  }

  if (fields.all || fields.timing) {
    if (userData.userSpeakingStartTime) {
      sessionState.markUserSpeaking();
    }
    if (userData.userWentSilent) {
      sessionState.markUserSilent();
    }
  }

  if (fields.all || fields.bundle) {
    if (userData.bundleRuntimeState) {
      sessionState.updateBundleState({
        relationshipTurns: userData.bundleRuntimeState.relationshipTurns,
        currentMode: userData.bundleRuntimeState.currentMode,
        storiesToldThisSession: userData.bundleRuntimeState.storiesToldThisSession,
      });
    }
  }

  if (fields.all || fields.themes) {
    // Record themes from userData (will be deduplicated)
    const themes = userData.mentionedPersonalThemes || [];
    for (const theme of themes) {
      sessionState.recordThemesMentioned(theme);
    }
  }

  if (fields.all || fields.memories) {
    // Record memory references from userData
    const memories = userData.referencedMemories || [];
    for (const mem of memories) {
      sessionState.recordMemoryReferenced(mem);
    }
    if (userData.hasReferencedLastConversation) {
      sessionState.markLastConversationReferenced();
    }
  }

  diag.state('State synced from legacy userData', {
    turnCount: userData.turnCount,
    fields: Object.keys(fields).filter((k) => fields[k as keyof SyncFields]),
  });
}

// ============================================================================
// BIDIRECTIONAL SYNC HELPERS
// ============================================================================

/**
 * Create a sync wrapper that automatically syncs state after mutations.
 * Returns proxied methods that sync after each operation.
 */
export function createSyncedStateManager(
  sessionState: SessionStateManager,
  userData: UserData
): SyncedStateManager {
  return {
    sessionState,
    userData,

    // Wrapped methods that sync to legacy after mutation
    incrementTurn: () => {
      sessionState.incrementTurn();
      syncToLegacy(sessionState, userData, { turnCount: true });
    },

    setTopic: (topic: string) => {
      sessionState.setTopic(topic);
      syncToLegacy(sessionState, userData, { topic: true });
    },

    setEmotionAnalysis: (analysis: Parameters<typeof sessionState.setEmotionAnalysis>[0]) => {
      sessionState.setEmotionAnalysis(analysis);
      syncToLegacy(sessionState, userData, { emotion: true });
    },

    setVoiceEmotion: (emotion: Parameters<typeof sessionState.setVoiceEmotion>[0]) => {
      sessionState.setVoiceEmotion(emotion);
      syncToLegacy(sessionState, userData, { emotion: true });
    },

    markUserSpeaking: () => {
      sessionState.markUserSpeaking();
      syncToLegacy(sessionState, userData, { timing: true });
    },

    markUserSilent: () => {
      sessionState.markUserSilent();
      syncToLegacy(sessionState, userData, { timing: true });
    },

    recordThemesMentioned: (content: string) => {
      sessionState.recordThemesMentioned(content);
      syncToLegacy(sessionState, userData, { themes: true });
    },

    recordMemoryReferenced: (memoryKey: string) => {
      sessionState.recordMemoryReferenced(memoryKey);
      syncToLegacy(sessionState, userData, { memories: true });
    },

    // Read-only methods (no sync needed)
    getState: () => sessionState.getState(),
    getTurnCount: () => sessionState.getTurnCount(),
    getUserId: () => sessionState.getUserId(),
    getUserName: () => sessionState.getUserName(),
    isReturningUser: () => sessionState.isReturningUser(),
    hasThemeBeenMentioned: (content: string) => sessionState.hasThemeBeenMentioned(content),
    hasReferencedMemory: (key: string) => sessionState.hasReferencedMemory(key),
    wasThemeMentioned: (theme: Parameters<typeof sessionState.wasThemeMentioned>[0]) =>
      sessionState.wasThemeMentioned(theme),
    getMentionedThemes: () => sessionState.getMentionedThemes(),
    getSessionDuration: () => sessionState.getSessionDuration(),
  };
}

/**
 * Interface for synced state manager (subset of SessionStateManager methods)
 */
export interface SyncedStateManager {
  sessionState: SessionStateManager;
  userData: UserData;

  // Mutation methods (sync after)
  incrementTurn: () => void;
  setTopic: (topic: string) => void;
  setEmotionAnalysis: (analysis: {
    primary: string;
    intensity: number;
    distressLevel?: number;
  }) => void;
  setVoiceEmotion: (emotion: Parameters<SessionStateManager['setVoiceEmotion']>[0]) => void;
  markUserSpeaking: () => void;
  markUserSilent: () => void;
  recordThemesMentioned: (content: string) => void;
  recordMemoryReferenced: (memoryKey: string) => void;

  // Read-only methods
  getState: () => ReturnType<SessionStateManager['getState']>;
  getTurnCount: () => number;
  getUserId: () => string | undefined;
  getUserName: () => string | undefined;
  isReturningUser: () => boolean;
  hasThemeBeenMentioned: (content: string) => boolean;
  hasReferencedMemory: (key: string) => boolean;
  wasThemeMentioned: (theme: Parameters<SessionStateManager['wasThemeMentioned']>[0]) => boolean;
  getMentionedThemes: () => ReturnType<SessionStateManager['getMentionedThemes']>;
  getSessionDuration: () => number;
}
