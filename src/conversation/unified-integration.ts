/**
 * Unified Conversation Integration
 *
 * Session lifecycle for conversation humanization in the voice agent. Creating a
 * session starts the humanization and advanced-humanization session state that
 * the pre-LLM turn reads; ending it cleans that state up.
 *
 * Usage:
 * ```typescript
 * // At session start
 * const session = createConversationSession({ sessionId, userId, personaId });
 *
 * // At session end
 * endConversationSession(sessionId);
 * ```
 *
 * @module @ferni/conversation/unified-integration
 */

import { createLogger } from '../utils/safe-logger.js';

// Session lifecycle management
import {
  onSessionStart as startHumanizationSession,
  onSessionEnd as endHumanizationSession,
  recordComfortEvent,
  getSessionState,
} from './humanization/voice-agent-integration.js';

// Advanced humanization (10 deep capabilities)
import {
  initAdvancedHumanization,
  cleanupAdvancedHumanization,
  getAdvancedHumanizationState,
} from './advanced-humanization-integration.js';

// Signal emitter for frontend EQ
import { humanizationSignalEmitter } from '../services/humanization/humanization-signal-emitter.js';

const log = createLogger({ module: 'UnifiedConversation' });

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationSessionConfig {
  personaId: string;
  sessionId: string;
  userId: string;
  sessionCount?: number;
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
}

export interface ConversationSession {
  // Session info
  sessionId: string;
  userId: string;
  personaId: string;

  // State accessors
  getState: () => SessionState;
  getTurnCount: () => number;
  getComfortLevel: () => number;

  // Event recording
  recordVulnerability: () => void;
  recordLaughter: () => void;
  recordBreakthrough: () => void;

  // Lifecycle
  end: () => void;
}

interface SessionState {
  turnCount: number;
  sessionMinutes: number;
  comfortLevel: number;
  relationshipStage: string;
  recentTopics: string[];
  mood: {
    energy: number;
    engagement: number;
    emotionalLoad: number;
  };
}

// ============================================================================
// SESSION FACTORY
// ============================================================================

const activeSessions = new Map<string, ConversationSessionImpl>();

class ConversationSessionImpl implements ConversationSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly personaId: string;

  private startTime: number;
  private turnCount = 0;
  private comfortLevel = 0.25;
  private recentTopics: string[] = [];
  private sessionCount: number;
  private relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

  constructor(config: ConversationSessionConfig) {
    this.sessionId = config.sessionId;
    this.userId = config.userId;
    this.personaId = config.personaId;
    this.sessionCount = config.sessionCount ?? 0;
    this.relationshipStage = config.relationshipStage ?? 'acquaintance';
    this.startTime = Date.now();

    // Initialize humanization session
    startHumanizationSession(this.sessionId, this.userId, this.personaId, {
      relationshipStage: this.relationshipStage,
      enableAdvancedHumanization: true,
    });

    // Initialize advanced humanization
    initAdvancedHumanization({
      sessionId: this.sessionId,
      userId: this.userId,
      relationshipDepth: this.mapRelationshipDepth(this.relationshipStage),
    });

    log.info(
      { sessionId: this.sessionId, userId: this.userId, personaId: this.personaId },
      '🎭 Unified conversation session started'
    );
  }

  getState(): SessionState {
    const humanizationState = getSessionState(this.sessionId);
    const advancedState = getAdvancedHumanizationState(this.sessionId);

    // Safely access aftercare from orchestratorState if it exists
    const orchestratorState = advancedState?.orchestratorState;
    const emotionalDebt = orchestratorState?.aftercare?.emotionalDebt ?? 0;

    return {
      turnCount: this.turnCount,
      sessionMinutes: Math.floor((Date.now() - this.startTime) / 60000),
      comfortLevel: humanizationState?.comfortLevel ?? this.comfortLevel,
      relationshipStage: this.relationshipStage,
      recentTopics: this.recentTopics,
      mood: {
        energy: 1 - emotionalDebt, // High debt = low energy
        engagement: 0.7,
        emotionalLoad: emotionalDebt,
      },
    };
  }

  getTurnCount(): number {
    return this.turnCount;
  }

  getComfortLevel(): number {
    return getSessionState(this.sessionId)?.comfortLevel ?? this.comfortLevel;
  }

  recordVulnerability(): void {
    recordComfortEvent(this.sessionId, 'user_shared_vulnerability');
    void humanizationSignalEmitter.vulnerability(0.8);
  }

  recordLaughter(): void {
    recordComfortEvent(this.sessionId, 'shared_laughter');
  }

  recordBreakthrough(): void {
    void humanizationSignalEmitter.breakthrough(0.9);
  }

  end(): void {
    // Cleanup
    endHumanizationSession(this.sessionId);
    cleanupAdvancedHumanization(this.sessionId);
    activeSessions.delete(this.sessionId);

    log.info({ sessionId: this.sessionId, turns: this.turnCount }, '🎭 Session ended');
  }

  private mapRelationshipDepth(stage: string): 'new' | 'developing' | 'established' | 'deep' {
    const map: Record<string, 'new' | 'developing' | 'established' | 'deep'> = {
      stranger: 'new',
      acquaintance: 'developing',
      friend: 'established',
      trusted_advisor: 'deep',
    };
    return map[stage] ?? 'developing';
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Create a new conversation session
 * This is the SINGLE entry point for all conversation humanization
 */
export function createConversationSession(config: ConversationSessionConfig): ConversationSession {
  // Check for existing session
  if (activeSessions.has(config.sessionId)) {
    log.warn({ sessionId: config.sessionId }, 'Session already exists, returning existing');
    return activeSessions.get(config.sessionId)!;
  }

  const session = new ConversationSessionImpl(config);
  activeSessions.set(config.sessionId, session);
  return session;
}

/**
 * Get an existing session
 */
export function getConversationSession(sessionId: string): ConversationSession | null {
  return activeSessions.get(sessionId) ?? null;
}

/**
 * End and cleanup a session
 */
export function endConversationSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.end();
  }
}

/**
 * Get all active sessions (for debugging)
 */
export function getActiveSessions(): string[] {
  return Array.from(activeSessions.keys());
}
